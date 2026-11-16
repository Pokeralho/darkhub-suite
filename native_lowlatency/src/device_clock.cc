#include "device_clock.hh"
#include "device_context.hh"
#include "helper.hh"

#include <vulkan/vulkan_core.h>

#include <cassert>
#include <functional>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <time.h>
#endif

namespace low_latency {

#ifdef _WIN32
// DarkHub port: Windows has no CLOCK_MONOTONIC. The host time domain the
// driver can calibrate against is QueryPerformanceCounter, so the whole layer
// works in QPC time converted to nanoseconds.
static std::int64_t qpc_frequency() {
    static const auto frequency = [] {
        auto f = LARGE_INTEGER{};
        QueryPerformanceFrequency(&f);
        return f.QuadPart;
    }();
    return frequency;
}

static std::uint64_t qpc_to_ns(const std::uint64_t ticks) {
    const auto freq = static_cast<std::uint64_t>(qpc_frequency());
    const auto seconds = ticks / freq;
    const auto remainder = ticks % freq;
    return seconds * 1'000'000'000ull + (remainder * 1'000'000'000ull) / freq;
}
static constexpr auto HOST_TIME_DOMAIN =
    VK_TIME_DOMAIN_QUERY_PERFORMANCE_COUNTER_KHR;
#else
static constexpr auto HOST_TIME_DOMAIN = VK_TIME_DOMAIN_CLOCK_MONOTONIC_EXT;
#endif

DeviceClock::DeviceClock(const DeviceContext& context) : device(context) {
    this->calibrate();
    this->calibration_thread =
        std::jthread{std::bind_front(&DeviceClock::do_calibration, this)};
}

DeviceClock::~DeviceClock() {
    calibration_thread.request_stop();
    cv.notify_one();
}

void DeviceClock::calibrate() {
    const auto infos = std::vector<VkCalibratedTimestampInfoKHR>{
        {VK_STRUCTURE_TYPE_CALIBRATED_TIMESTAMP_INFO_EXT, nullptr,
         VK_TIME_DOMAIN_DEVICE_EXT},
        {VK_STRUCTURE_TYPE_CALIBRATED_TIMESTAMP_INFO_EXT, nullptr,
         HOST_TIME_DOMAIN}};

    struct CalibratedResult {
        std::uint64_t device;
        std::uint64_t host;
    };
    auto calibrated_result = CalibratedResult{};

    // Don't write directly to error bound here, we haven't locked yet.
    auto local_error_bound = std::uint64_t{};
    THROW_NOT_VKSUCCESS(device.vtable.GetCalibratedTimestampsKHR(
        device.device, 2, std::data(infos), &calibrated_result.device,
        &local_error_bound));

    const auto lock = std::scoped_lock{this->mutex};
    this->device_ticks = calibrated_result.device;
#ifdef _WIN32
    this->host_ns = qpc_to_ns(calibrated_result.host);
#else
    this->host_ns = calibrated_result.host;
#endif
    this->error_bound = local_error_bound;
}

void DeviceClock::do_calibration(const std::stop_token stoken) {
    while (!stoken.stop_requested()) {
        this->calibrate();
        auto lock = std::shared_lock{this->mutex};
        this->cv.wait_for(lock, stoken, CALIBRATION_PERIOD,
                          [&] { return stoken.stop_requested(); });
    }
}

DeviceClock::time_point DeviceClock::now() {
#ifdef _WIN32
    auto counter = LARGE_INTEGER{};
    QueryPerformanceCounter(&counter);
    return time_point{std::chrono::nanoseconds{static_cast<std::int64_t>(
        qpc_to_ns(static_cast<std::uint64_t>(counter.QuadPart)))}};
#else
    auto ts = timespec{};
    if (clock_gettime(CLOCK_MONOTONIC, &ts)) {
        throw errno;
    }

    return time_point{std::chrono::seconds{ts.tv_sec} +
                      std::chrono::nanoseconds{ts.tv_nsec}};
#endif
}

DeviceClock::time_point DeviceClock::ticks_to_time(const std::uint64_t& ticks) {
    const auto& pd = device.physical_device.properties;
    const auto ns_tick = static_cast<double>(pd->limits.timestampPeriod);

    const auto lock = std::shared_lock{this->mutex};

    const auto diff = [&]() -> auto {
        auto a = this->device_ticks;
        auto b = ticks;
        const auto is_negative = a > b;
        if (is_negative) {
            std::swap(a, b);
        }
        const auto abs_diff = b - a;
        assert(abs_diff <= std::numeric_limits<std::int64_t>::max());
        const auto signed_abs_diff = static_cast<std::int64_t>(abs_diff);
        return is_negative ? -signed_abs_diff : signed_abs_diff;
    }();

    const auto diff_nsec =
        static_cast<std::int64_t>(static_cast<double>(diff) * ns_tick + 0.5);
    const auto delta_ns = static_cast<std::int64_t>(this->host_ns) + diff_nsec;
    return time_point{std::chrono::nanoseconds(delta_ns)};
}

} // namespace low_latency