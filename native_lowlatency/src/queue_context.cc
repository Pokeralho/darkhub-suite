#include "queue_context.hh"
#include "device_context.hh"
#include "helper.hh"
#include "layer_context.hh"
#include "strategies/anti_lag/queue_strategy.hh"
#include "strategies/low_latency2/queue_strategy.hh"
#include "timestamp_pool.hh"

#include <vulkan/vulkan_core.h>

namespace low_latency {

QueueContext::CommandPoolOwner::CommandPoolOwner(const QueueContext& queue)
    : queue(queue) {

    const auto& device_context = this->queue.device;

    const auto cpci = VkCommandPoolCreateInfo{
        .sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
        .flags = VK_COMMAND_POOL_CREATE_TRANSIENT_BIT |
                 VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT,
        .queueFamilyIndex = queue.family_index,
    };

    THROW_NOT_VKSUCCESS(device_context.vtable.CreateCommandPool(
        device_context.device, &cpci, nullptr, &this->command_pool));
}

QueueContext::CommandPoolOwner::~CommandPoolOwner() {
    const auto& device_context = this->queue.device;
    device_context.vtable.DestroyCommandPool(device_context.device,
                                             this->command_pool, nullptr);
}

QueueContext::QueueContext(DeviceContext& device, const VkQueue& queue,
                           const std::uint32_t& qfi)
    : device(device), queue(queue), family_index(qfi),
      properties((*device.physical_device.queue_properties)[qfi]) {

    assert(qfi < std::size(*device.physical_device.queue_properties));

    if (!this->device.was_layer_enabled) {
        return;
    }

    this->command_pool = std::make_unique<CommandPoolOwner>(*this);
    this->timestamp_pool = std::make_unique<TimestampPool>(*this);
    this->strategy = [&]() -> std::unique_ptr<QueueStrategy> {
        if (device.instance.layer.should_expose_reflex) {
            return std::make_unique<LowLatency2QueueStrategy>(*this);
        }
        return std::make_unique<AntiLagQueueStrategy>(*this);
    }();
}

QueueContext::~QueueContext() {}

bool QueueContext::should_inject_timestamps() const {
    if (!this->device.was_layer_enabled) {
        return false;
    }

    // Probably need at least 64, don't worry about it just yet and just ensure
    // it's not zero (because that will cause a crash if we inject). We don't
    // actually read timestamps anywhere yet so this is fine.
    return this->properties.timestampValidBits;
}

} // namespace low_latency