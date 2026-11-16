#include "physical_device_context.hh"
#include "helper.hh"

#include <vulkan/vulkan_core.h>

#include <ranges>
#include <string_view>
#include <unordered_set>
#include <vector>

namespace low_latency {

static bool
does_support_required_extensions(const PhysicalDeviceContext& context) {
    auto count = std::uint32_t{};
    THROW_NOT_VKSUCCESS(
        context.instance.vtable.EnumerateDeviceExtensionProperties(
            context.physical_device, nullptr, &count, nullptr));

    auto supported_extensions = std::vector<VkExtensionProperties>(count);
    THROW_NOT_VKSUCCESS(
        context.instance.vtable.EnumerateDeviceExtensionProperties(
            context.physical_device, nullptr, &count,
            std::data(supported_extensions)));

    const auto supported =
        supported_extensions | std::views::transform([](const auto& supported) {
            return supported.extensionName;
        }) |
        std::ranges::to<std::unordered_set<std::string_view>>();

    return std::ranges::all_of(PhysicalDeviceContext::required_extensions,
                               [&](const auto& required_extension) {
                                   return supported.contains(
                                       required_extension);
                               });
}

PhysicalDeviceContext::PhysicalDeviceContext(
    InstanceContext& instance_context, const VkPhysicalDevice& physical_device)
    : instance(instance_context), physical_device(physical_device),
      supports_required_extensions(does_support_required_extensions(*this)) {

    const auto& vtable = instance_context.vtable;

    this->properties = [&]() {
        auto props = VkPhysicalDeviceProperties{};
        vtable.GetPhysicalDeviceProperties(physical_device, &props);
        return std::make_unique<VkPhysicalDeviceProperties>(std::move(props));
    }();

    this->queue_properties = [&]() {
        auto count = std::uint32_t{};
        vtable.GetPhysicalDeviceQueueFamilyProperties(physical_device, &count,
                                                      nullptr);

        auto result = std::vector<VkQueueFamilyProperties>(
            count, VkQueueFamilyProperties{});
        vtable.GetPhysicalDeviceQueueFamilyProperties(physical_device, &count,
                                                      std::data(result));
        return std::make_unique<std::vector<VkQueueFamilyProperties>>(
            std::move(result));
    }();
}

PhysicalDeviceContext::~PhysicalDeviceContext() {}

} // namespace low_latency