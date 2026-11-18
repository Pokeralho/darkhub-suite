#include "layer.hh"

#include <algorithm>
#include <array>
#include <iterator>
#include <ranges>
#include <span>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

#include <vulkan/utility/vk_dispatch_table.h>
#include <vulkan/utility/vk_safe_struct.hpp>
#include <vulkan/utility/vk_struct_helper.hpp>
#include <vulkan/vk_layer.h>
#include <vulkan/vk_platform.h>
#include <vulkan/vulkan.h>
#include <vulkan/vulkan.hpp>
#include <vulkan/vulkan_core.h>

#include "device_clock.hh"
#include "device_context.hh"
#include "instance_context.hh"
#include "layer_context.hh"
#include "queue_context.hh"
#include "strategies/anti_lag/device_strategy.hh"
#include "strategies/low_latency2/device_strategy.hh"
#include "strategies/low_latency2/queue_strategy.hh"
#include "timestamp_pool.hh"

namespace low_latency {

namespace {

LayerContext layer_context;

// The loader's dispatch key: the first pointer-sized word of every
// dispatchable handle. Physical devices share their instance's key and queues
// share their device's key, which lets us find a parent we never saw.
template <typename T> void* dispatch_key(const T handle) noexcept {
    return *reinterpret_cast<void* const*>(handle);
}

// Registers physical devices handed out by the next layer. Never throws: a
// device whose context cannot be built is simply left unregistered (lookups
// for it then pass straight through).
void register_physical_devices(
    InstanceContext& instance,
    const std::span<const VkPhysicalDevice> devices) noexcept {

    try {
        const auto lock = std::scoped_lock{layer_context.mutex};
        for (const auto& device : devices) {
            if (!device) {
                continue;
            }
            try {
                const auto key = layer_context.get_key(device);
                auto iter = layer_context.contexts.find(key);
                if (iter == std::end(layer_context.contexts) || !iter->second) {
                    // Build it first so a failure leaves no null entry behind.
                    auto context =
                        std::make_shared<PhysicalDeviceContext>(instance, device);
                    iter = layer_context.contexts.insert_or_assign(
                        key, std::move(context)).first;
                }

                if (const auto context =
                        std::dynamic_pointer_cast<PhysicalDeviceContext>(
                            iter->second);
                    context) {
                    instance.physical_devices.emplace(key, context);
                }
            } catch (...) {
            }
        }
    } catch (...) {
    }
}

std::shared_ptr<InstanceContext>
find_instance_by_dispatch_key(void* const key) noexcept {
    try {
        const auto lock = std::shared_lock{layer_context.mutex};
        for (const auto& [_, context] : layer_context.contexts) {
            const auto instance =
                std::dynamic_pointer_cast<InstanceContext>(context);
            if (instance && dispatch_key(instance->instance) == key) {
                return instance;
            }
        }
    } catch (...) {
    }
    return nullptr;
}

std::shared_ptr<DeviceContext> find_device_for_queue(const VkQueue queue) noexcept {
    if (!queue) {
        return nullptr;
    }
    try {
        const auto key = dispatch_key(queue);
        const auto lock = std::shared_lock{layer_context.mutex};
        for (const auto& [_, context] : layer_context.contexts) {
            const auto device = std::dynamic_pointer_cast<DeviceContext>(context);
            if (device && dispatch_key(device->device) == key) {
                return device;
            }
        }
    } catch (...) {
    }
    return nullptr;
}

struct PhysicalDeviceLookup {
    // May be null even when instance is not (the device's context could not
    // be built): then just forward through instance->vtable.
    std::shared_ptr<PhysicalDeviceContext> context;
    std::shared_ptr<InstanceContext> instance;
};

// Finds the physical device's context, registering it on the fly if the app
// obtained it some way we did not see (VK_INCOMPLETE enumerations from older
// builds, device groups, multiple instances...).
PhysicalDeviceLookup
lookup_physical_device(const VkPhysicalDevice physical_device) noexcept {
    if (!physical_device) {
        return {};
    }

    if (auto context = layer_context.get_context(physical_device); context) {
        auto instance = layer_context.get_context(context->instance.instance);
        return {std::move(context), std::move(instance)};
    }

    auto instance = find_instance_by_dispatch_key(dispatch_key(physical_device));
    if (!instance) {
        return {};
    }
    register_physical_devices(*instance, std::span{&physical_device, 1});
    return {layer_context.get_context(physical_device), std::move(instance)};
}

} // namespace

static VKAPI_ATTR VkResult VKAPI_CALL CreateInstance(
    const VkInstanceCreateInfo* pCreateInfo,
    const VkAllocationCallbacks* pAllocator, VkInstance* pInstance) noexcept {

    const auto link_info = [&]() -> auto {
        for (auto i = static_cast<const VkBaseInStructure*>(pCreateInfo->pNext);
             i; i = i->pNext) {
            if (i->sType != VK_STRUCTURE_TYPE_LOADER_INSTANCE_CREATE_INFO) {
                continue;
            }

            const auto info =
                reinterpret_cast<const VkLayerInstanceCreateInfo*>(i);
            if (info->function != VK_LAYER_LINK_INFO) {
                continue;
            }
            return info;
        }
        return static_cast<const VkLayerInstanceCreateInfo*>(nullptr);
    }();

    if (!link_info || !link_info->u.pLayerInfo) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    // Store our get instance proc addr function and pop it off our list +
    // advance the list so future layers know what to call.
    const auto gipa = link_info->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    if (!gipa) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    const_cast<VkLayerInstanceCreateInfo*>(link_info)->u.pLayerInfo =
        link_info->u.pLayerInfo->pNext;

    // Call our create instance func, and store vkDestroyInstance, and
    // vkCreateDevice as well.
    const auto create_instance = reinterpret_cast<PFN_vkCreateInstance>(
        gipa(VK_NULL_HANDLE, "vkCreateInstance"));
    if (!create_instance) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    if (const auto result = create_instance(pCreateInfo, pAllocator, pInstance);
        result != VK_SUCCESS) {

        return result;
    }

    try {
        auto vtable = VkuInstanceDispatchTable{};
        vkuInitInstanceDispatchTable(*pInstance, &vtable, gipa);

        const auto key = layer_context.get_key(*pInstance);
        auto context = std::make_shared<InstanceContext>(
            layer_context, *pInstance, *pCreateInfo, std::move(vtable));

        const auto lock = std::scoped_lock{layer_context.mutex};
        layer_context.contexts.insert_or_assign(key, std::move(context));
    } catch (...) {
        // Without a context every later call on this instance would fail, so
        // undo the creation. No exception may cross this C ABI boundary.
        if (const auto destroy_instance = reinterpret_cast<PFN_vkDestroyInstance>(
                gipa(*pInstance, "vkDestroyInstance"));
            destroy_instance) {
            destroy_instance(*pInstance, pAllocator);
        }
        *pInstance = VK_NULL_HANDLE;
        return VK_ERROR_OUT_OF_HOST_MEMORY;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL DestroyInstance(
    VkInstance instance, const VkAllocationCallbacks* allocator) noexcept {
    // These requires special care because multiple threads might create a race
    // condition by being given the same VkInstance dispatchable handle.
    if (!instance) {
        return;
    }
    const auto destroy_instance = [&]() -> PFN_vkDestroyInstance {
        const auto lock = std::scoped_lock{layer_context.mutex};

        const auto key = layer_context.get_key(instance);
        const auto iter = layer_context.contexts.find(key);
        if (iter == std::end(layer_context.contexts)) {
            return nullptr;
        }
        auto context = std::dynamic_pointer_cast<InstanceContext>(iter->second);
        if (!context) {
            return nullptr;
        }

        // Erase our physical devices owned by this instance from the global
        // context.
        for (const auto& [key, _] : context->physical_devices) {
            layer_context.contexts.erase(key);
        }

        // Should be the last context here, so when we leave scope its
        // destructor is called.
        layer_context.contexts.erase(iter);
        assert(context.unique());
        return context->vtable.DestroyInstance;
    }();

    if (destroy_instance) {
        destroy_instance(instance, allocator);
    }
}

static VKAPI_ATTR VkResult VKAPI_CALL
EnumeratePhysicalDevices(VkInstance instance, std::uint32_t* count,
                         VkPhysicalDevice* devices) noexcept {
    const auto context = layer_context.get_context(instance);
    if (!context || !context->vtable.EnumeratePhysicalDevices) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const auto result =
        context->vtable.EnumeratePhysicalDevices(instance, count, devices);

    // VK_INCOMPLETE is routine (an app asking for just one GPU on a hybrid
    // laptop): the devices that were written are still valid and must be
    // registered, or later calls on them would find no context.
    if (!devices || !count ||
        (result != VK_SUCCESS && result != VK_INCOMPLETE)) {
        return result;
    }

    register_physical_devices(*context, std::span{devices, *count});
    return result;
}

static VKAPI_ATTR VkResult VKAPI_CALL EnumeratePhysicalDeviceGroupsImpl(
    VkInstance instance, std::uint32_t* count,
    VkPhysicalDeviceGroupProperties* groups,
    const bool should_use_khr) noexcept {

    const auto context = layer_context.get_context(instance);
    if (!context) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const auto enumerate = should_use_khr
                               ? context->vtable.EnumeratePhysicalDeviceGroupsKHR
                               : context->vtable.EnumeratePhysicalDeviceGroups;
    if (!enumerate) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const auto result = enumerate(instance, count, groups);
    if (!groups || !count ||
        (result != VK_SUCCESS && result != VK_INCOMPLETE)) {
        return result;
    }

    // Apps that only use device groups never call vkEnumeratePhysicalDevices,
    // so register the members here too.
    for (const auto& group : std::span{groups, *count}) {
        const auto member_count = std::min<std::uint32_t>(
            group.physicalDeviceCount, VK_MAX_DEVICE_GROUP_SIZE);
        register_physical_devices(
            *context, std::span{group.physicalDevices, member_count});
    }

    return result;
}

static VKAPI_ATTR VkResult VKAPI_CALL EnumeratePhysicalDeviceGroups(
    VkInstance instance, std::uint32_t* count,
    VkPhysicalDeviceGroupProperties* groups) noexcept {
    return EnumeratePhysicalDeviceGroupsImpl(instance, count, groups, false);
}

static VKAPI_ATTR VkResult VKAPI_CALL EnumeratePhysicalDeviceGroupsKHR(
    VkInstance instance, std::uint32_t* count,
    VkPhysicalDeviceGroupProperties* groups) noexcept {
    return EnumeratePhysicalDeviceGroupsImpl(instance, count, groups, true);
}

// Function-try-block: everything that can throw before the device exists
// (allocations, safe-struct copies) maps to an error instead of crossing the C
// ABI (which would std::terminate the game). The post-creation part has its
// own handler that also destroys the new device.
static VKAPI_ATTR VkResult VKAPI_CALL CreateDevice(
    VkPhysicalDevice physical_device, const VkDeviceCreateInfo* pCreateInfo,
    const VkAllocationCallbacks* pAllocator, VkDevice* pDevice) noexcept try {

    const auto enabled_extensions =
        std::span{pCreateInfo->ppEnabledExtensionNames,
                  pCreateInfo->enabledExtensionCount};

    const auto requested = std::unordered_set<std::string_view>(
        std::begin(enabled_extensions), std::end(enabled_extensions));

    const auto was_layer_enabled =
        requested.contains(!layer_context.should_expose_reflex
                               ? VK_AMD_ANTI_LAG_EXTENSION_NAME
                               : VK_NV_LOW_LATENCY_2_EXTENSION_NAME);

    const auto context = lookup_physical_device(physical_device).context;
    if (!context) {
        // We can't track a device whose physical device we know nothing about.
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    if (was_layer_enabled && !context->supports_required_extensions) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const auto create_info = [&]() -> auto {
        for (auto i = static_cast<const VkBaseInStructure*>(pCreateInfo->pNext);
             i; i = i->pNext) {
            if (i->sType != VK_STRUCTURE_TYPE_LOADER_DEVICE_CREATE_INFO) {
                continue;
            }

            const auto info =
                reinterpret_cast<const VkLayerDeviceCreateInfo*>(i);
            if (info->function != VK_LAYER_LINK_INFO) {
                continue;
            }
            return info;
        }
        return static_cast<const VkLayerDeviceCreateInfo*>(nullptr);
    }();
    if (!create_info || !create_info->u.pLayerInfo) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const auto gipa = create_info->u.pLayerInfo->pfnNextGetInstanceProcAddr;
    const auto gdpa = create_info->u.pLayerInfo->pfnNextGetDeviceProcAddr;
    if (!gdpa || !gipa) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    const_cast<VkLayerDeviceCreateInfo*>(create_info)->u.pLayerInfo =
        create_info->u.pLayerInfo->pNext;

    // Build a next extensions vector from what they have requested.
    const auto next_extensions = [&]() -> std::vector<const char*> {
        auto next_extensions = std::vector(std::begin(enabled_extensions),
                                           std::end(enabled_extensions));

        // Only append the extra extension if it wasn't already asked for.
        if (was_layer_enabled) {
            std::ranges::copy_if(PhysicalDeviceContext::required_extensions,
                                 std::back_inserter(next_extensions),
                                 [&requested](const auto& wanted) {
                                     return !requested.contains(wanted);
                                 });
        }

        return next_extensions;
    }();

    const auto next_create_info = [&]() -> auto {
        // Give vku's CreateInfo a patched copy so its own deep copy is correct.
        auto create_info_copy = *pCreateInfo;
        create_info_copy.ppEnabledExtensionNames = std::data(next_extensions);
        create_info_copy.enabledExtensionCount =
            static_cast<std::uint32_t>(std::size(next_extensions));

        auto next_create_info = vku::safe_VkDeviceCreateInfo{&create_info_copy};
        if (!was_layer_enabled) {
            return next_create_info;
        }

        // Sync2 lives in 1.3 features first. If that doesn't exist look for
        // sync2 features or append it.
        if (const auto vk13 =
                vku::FindStructInPNextChain<VkPhysicalDeviceVulkan13Features>(
                    const_cast<void*>(next_create_info.pNext));
            vk13) {

            vk13->synchronization2 = VK_TRUE;
        } else if (const auto s2f = vku::FindStructInPNextChain<
                       VkPhysicalDeviceSynchronization2Features>(
                       const_cast<void*>(next_create_info.pNext));
                   s2f) {

            s2f->synchronization2 = VK_TRUE;
        } else {
            vku::AddToPnext(
                next_create_info,
                VkPhysicalDeviceSynchronization2Features{
                    .sType =
                        VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_SYNCHRONIZATION_2_FEATURES,
                    .synchronization2 = VK_TRUE,
                });
        }

        // HQR and timeline semaphores are in 1.2 features first - then same
        // idea as sync2. The timestamp pool signals a timeline semaphore to
        // know when its command buffers may be reset.
        if (const auto vk12 =
                vku::FindStructInPNextChain<VkPhysicalDeviceVulkan12Features>(
                    const_cast<void*>(next_create_info.pNext));
            vk12) {

            vk12->hostQueryReset = VK_TRUE;
            vk12->timelineSemaphore = VK_TRUE;
        } else {
            if (const auto hqrf = vku::FindStructInPNextChain<
                    VkPhysicalDeviceHostQueryResetFeatures>(
                    const_cast<void*>(next_create_info.pNext));
                hqrf) {

                hqrf->hostQueryReset = VK_TRUE;
            } else {
                vku::AddToPnext(
                    next_create_info,
                    VkPhysicalDeviceHostQueryResetFeatures{
                        .sType =
                            VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_HOST_QUERY_RESET_FEATURES,
                        .hostQueryReset = VK_TRUE,
                    });
            }

            if (const auto tsf = vku::FindStructInPNextChain<
                    VkPhysicalDeviceTimelineSemaphoreFeatures>(
                    const_cast<void*>(next_create_info.pNext));
                tsf) {

                tsf->timelineSemaphore = VK_TRUE;
            } else {
                vku::AddToPnext(
                    next_create_info,
                    VkPhysicalDeviceTimelineSemaphoreFeatures{
                        .sType =
                            VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_TIMELINE_SEMAPHORE_FEATURES,
                        .timelineSemaphore = VK_TRUE,
                    });
            }
        }

        return next_create_info;
    }();

    const auto create_device = reinterpret_cast<PFN_vkCreateDevice>(
        gipa(VK_NULL_HANDLE, "vkCreateDevice"));
    if (!create_device) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    if (const auto result = create_device(
            physical_device, next_create_info.ptr(), pAllocator, pDevice);
        result != VK_SUCCESS) {

        return result;
    }

    try {
        auto vtable = VkuDeviceDispatchTable{};
        vkuInitDeviceDispatchTable(*pDevice, &vtable, gdpa);

        const auto key = layer_context.get_key(*pDevice);
        // DeviceContext's constructor talks to the driver (clock calibration)
        // and may throw; build it before touching the map.
        auto device_context = std::make_shared<DeviceContext>(
            context->instance, *context, *pDevice, was_layer_enabled,
            std::move(vtable));

        const auto lock = std::scoped_lock{layer_context.mutex};
        layer_context.contexts.insert_or_assign(key, std::move(device_context));
    } catch (...) {
        if (const auto destroy_device = reinterpret_cast<PFN_vkDestroyDevice>(
                gdpa(*pDevice, "vkDestroyDevice"));
            destroy_device) {
            destroy_device(*pDevice, pAllocator);
        }
        *pDevice = VK_NULL_HANDLE;
        return VK_ERROR_INITIALIZATION_FAILED;
    }

    return VK_SUCCESS;
} catch (...) {
    return VK_ERROR_INITIALIZATION_FAILED;
}

static VKAPI_ATTR void VKAPI_CALL DestroyDevice(
    VkDevice device, const VkAllocationCallbacks* allocator) noexcept {
    // Similarly to DestroyInstance, this needs to be done carefully to avoid a
    // race.
    if (!device) {
        return;
    }
    const auto destroy_device = [&]() -> PFN_vkDestroyDevice {
        const auto lock = std::scoped_lock{layer_context.mutex};

        const auto key = layer_context.get_key(device);
        const auto iter = layer_context.contexts.find(key);
        if (iter == std::end(layer_context.contexts)) {
            return nullptr;
        }
        auto context = std::dynamic_pointer_cast<DeviceContext>(iter->second);
        if (!context) {
            return nullptr;
        }

        // Remove all owned queues from our global context pool.
        for (const auto& [queue, _] : context->queues) {
            layer_context.contexts.erase(layer_context.get_key(queue));
        }

        // Should be the last shared ptr now, similar to DestroyInstance.
        layer_context.contexts.erase(iter);
        assert(context.unique());
        return context->vtable.DestroyDevice;
    }();

    if (destroy_device) {
        destroy_device(device, allocator);
    }
}

// Registers a queue returned by vkGetDeviceQueue(2). Never throws: if the
// queue's context cannot be built it stays unregistered and its submits and
// presents pass straight through (see find_device_for_queue).
static void register_queue(DeviceContext& context, const VkQueue queue,
                           const std::uint32_t queue_family_index) noexcept {
    try {
        // Look in our layer context, which has everything. The queue may
        // already be there: vkGetDeviceQueue can return the same handle again.
        const auto key = layer_context.get_key(queue);
        const auto layer_lock = std::scoped_lock{layer_context.mutex};
        auto it = layer_context.contexts.find(key);
        const auto inserted = it == std::end(layer_context.contexts);
        if (inserted) {
            // Build first so a throwing constructor leaves no null entry.
            auto queue_context = std::make_shared<QueueContext>(
                context, queue, queue_family_index);
            it = layer_context.contexts.emplace(key, std::move(queue_context))
                     .first;
        }

        const auto ptr = std::dynamic_pointer_cast<QueueContext>(it->second);
        if (!ptr) {
            return;
        }
        try {
            const auto device_lock = std::scoped_lock{context.mutex};
            context.queues.emplace(queue, ptr);
        } catch (...) {
            // Not owned by the device means DestroyDevice would never erase
            // it: don't leave a context that would outlive its device.
            if (inserted) {
                layer_context.contexts.erase(key);
            }
        }
    } catch (...) {
    }
}

static VKAPI_ATTR void VKAPI_CALL
GetDeviceQueue(VkDevice device, std::uint32_t queue_family_index,
               std::uint32_t queue_index, VkQueue* queue) noexcept {
    const auto context = layer_context.get_context(device);
    if (!context) {
        if (queue) {
            *queue = VK_NULL_HANDLE;
        }
        return;
    }

    // Get device queue, unlike CreateDevice or CreateInstance, can be
    // called multiple times to return the same queue object. register_queue
    // accounts for this.
    context->vtable.GetDeviceQueue(device, queue_family_index, queue_index,
                                   queue);
    if (!queue || !*queue) {
        return;
    }

    register_queue(*context, *queue, queue_family_index);
}

// Identical logic to gdq1.
static VKAPI_ATTR void VKAPI_CALL GetDeviceQueue2(
    VkDevice device, const VkDeviceQueueInfo2* info, VkQueue* queue) noexcept {

    const auto context = layer_context.get_context(device);
    if (!context) {
        if (queue) {
            *queue = VK_NULL_HANDLE;
        }
        return;
    }

    context->vtable.GetDeviceQueue2(device, info, queue);
    if (!queue || !*queue || !info) {
        return;
    }

    register_queue(*context, *queue, info->queueFamilyIndex);
}

static VKAPI_ATTR VkResult VKAPI_CALL
QueueSubmit(VkQueue queue, std::uint32_t submit_count,
            const VkSubmitInfo* submit_infos, VkFence fence) noexcept {
    const auto context = layer_context.get_context(queue);
    if (!context) {
        // Unknown queue: pass straight through via its device.
        const auto device = find_device_for_queue(queue);
        if (!device || !device->vtable.QueueSubmit) {
            return VK_ERROR_DEVICE_LOST;
        }
        return device->vtable.QueueSubmit(queue, submit_count, submit_infos,
                                          fence);
    }
    const auto& vtable = context->device.vtable;

    if (!submit_count || !context->should_inject_timestamps()) {
        return vtable.QueueSubmit(queue, submit_count, submit_infos, fence);
    }

    // We are making a modest modification to all vkQueueSubmits where we inject
    // a start and end timestamp query command buffer that writes when the GPU
    // started and finished work for each submission. We can wait on the
    // completion of these queue submissions through this mechanism.

    using cbs_t = std::vector<VkCommandBuffer>;
    auto next_submits = std::vector<VkSubmitInfo>{};

    // We're making modifications to multiple vkQueueSubmits. These have raw
    // pointers to our command buffer arrays - of which the position in memory
    // of can change on vector reallocation. So we use unique_ptrs here.
    auto next_cbs = std::vector<std::unique_ptr<cbs_t>>{};
    auto handles = std::vector<std::shared_ptr<TimestampPool::Handle>>{};

    const auto submit_span = std::span{submit_infos, submit_count};

    // Trailing empty batch that signals our timeline semaphore. Semaphore
    // signal operations include all earlier work in submission order, so
    // once it is reached our timestamp command buffers are no longer pending
    // and the pool may reset them.
    const auto& timeline_semaphore =
        context->timestamp_pool->get_timeline_semaphore();
    const auto timeline_value = context->timestamp_pool->next_timeline_value();
    const auto timeline_info = VkTimelineSemaphoreSubmitInfo{
        .sType = VK_STRUCTURE_TYPE_TIMELINE_SEMAPHORE_SUBMIT_INFO,
        .signalSemaphoreValueCount = 1,
        .pSignalSemaphoreValues = &timeline_value,
    };

    // Acquiring handles records command buffers and can throw (Vulkan error,
    // out of memory). If it does, submit the app's work untouched; the
    // unsubmitted handles are recycled without waiting.
    try {
        std::ranges::transform(
            submit_span, std::back_inserter(next_submits),
            [&](const auto& submit) {
                const auto handle = context->timestamp_pool->acquire();
                handle->completion_value = timeline_value;
                handles.push_back(handle);

                next_cbs.emplace_back([&]() -> auto {
                    auto cbs = std::make_unique<cbs_t>();
                    cbs->push_back(handle->get_start_buffer());
                    std::ranges::copy(std::span{submit.pCommandBuffers,
                                                submit.commandBufferCount},
                                      std::back_inserter(*cbs));
                    cbs->push_back(handle->get_end_buffer());
                    return cbs;
                }());

                auto next_submit = submit;
                next_submit.pCommandBuffers = std::data(*next_cbs.back());
                next_submit.commandBufferCount =
                    static_cast<std::uint32_t>(std::size(*next_cbs.back()));
                return next_submit;
            });

        next_submits.push_back(VkSubmitInfo{
            .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
            .pNext = &timeline_info,
            .signalSemaphoreCount = 1,
            .pSignalSemaphores = &timeline_semaphore,
        });
    } catch (...) {
        handles.clear();
        return vtable.QueueSubmit(queue, submit_count, submit_infos, fence);
    }

    if (const auto result = vtable.QueueSubmit(
            queue, static_cast<std::uint32_t>(std::size(next_submits)),
            std::data(next_submits), fence);
        result != VK_SUCCESS) {

        return result;
    }

    // We have to notify after we submit - otherwise we have a race where we
    // wait for work that wasn't submitted.
    for (const auto& handle : handles) {
        handle->was_submitted.store(true, std::memory_order_release);
    }
    try {
        for (auto&& [submit, handle] : std::views::zip(submit_span, handles)) {
            context->strategy->notify_submit(submit, std::move(handle));
        }
    } catch (...) {
        // The work is already on the GPU; losing pacing data for one frame
        // is fine, crossing the C ABI with an exception is not.
    }

    return VK_SUCCESS;
}

// The logic for this function is identical to vkSubmitInfo.
static VKAPI_ATTR VkResult VKAPI_CALL
QueueSubmit2Impl(VkQueue queue, std::uint32_t submit_count,
                 const VkSubmitInfo2* submit_infos, VkFence fence,
                 const bool should_use_khr) noexcept {
    const auto context = layer_context.get_context(queue);
    if (!context) {
        const auto device = find_device_for_queue(queue);
        if (!device) {
            return VK_ERROR_DEVICE_LOST;
        }
        const auto submit = should_use_khr ? device->vtable.QueueSubmit2KHR
                                           : device->vtable.QueueSubmit2;
        if (!submit) {
            return VK_ERROR_DEVICE_LOST;
        }
        return submit(queue, submit_count, submit_infos, fence);
    }
    const auto& vtable = context->device.vtable;
    const auto& queue_submit_func =
        should_use_khr ? vtable.QueueSubmit2KHR : vtable.QueueSubmit2;

    if (!submit_count || !context->should_inject_timestamps()) {
        return queue_submit_func(queue, submit_count, submit_infos, fence);
    }

    using cbs_t = std::vector<VkCommandBufferSubmitInfo>;
    auto next_submits = std::vector<VkSubmitInfo2>{};
    auto next_cbs = std::vector<std::unique_ptr<cbs_t>>{};
    auto handles = std::vector<std::shared_ptr<TimestampPool::Handle>>{};

    const auto submit_span = std::span{submit_infos, submit_count};

    // Same trailing timeline signal as in QueueSubmit.
    const auto timeline_value = context->timestamp_pool->next_timeline_value();
    const auto timeline_signal = VkSemaphoreSubmitInfo{
        .sType = VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO,
        .semaphore = context->timestamp_pool->get_timeline_semaphore(),
        .value = timeline_value,
        .stageMask = VK_PIPELINE_STAGE_2_ALL_COMMANDS_BIT,
    };

    try {
        std::ranges::transform(
            submit_span, std::back_inserter(next_submits),
            [&](const auto& submit) {
                const auto handle = context->timestamp_pool->acquire();
                handle->completion_value = timeline_value;
                handles.push_back(handle);

                next_cbs.emplace_back([&]() -> auto {
                    auto cbs = std::make_unique<cbs_t>();
                    cbs->push_back(VkCommandBufferSubmitInfo{
                        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO,
                        .commandBuffer = handle->get_start_buffer(),
                    });
                    std::ranges::copy(std::span{submit.pCommandBufferInfos,
                                                submit.commandBufferInfoCount},
                                      std::back_inserter(*cbs));
                    cbs->push_back(VkCommandBufferSubmitInfo{
                        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO,
                        .commandBuffer = handle->get_end_buffer(),
                    });
                    return cbs;
                }());

                auto next_submit = submit;
                next_submit.pCommandBufferInfos = std::data(*next_cbs.back());
                next_submit.commandBufferInfoCount =
                    static_cast<std::uint32_t>(std::size(*next_cbs.back()));
                return next_submit;
            });

        next_submits.push_back(VkSubmitInfo2{
            .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO_2,
            .signalSemaphoreInfoCount = 1,
            .pSignalSemaphoreInfos = &timeline_signal,
        });
    } catch (...) {
        handles.clear();
        return queue_submit_func(queue, submit_count, submit_infos, fence);
    }

    if (const auto result = queue_submit_func(
            queue, static_cast<std::uint32_t>(std::size(next_submits)),
            std::data(next_submits), fence);
        result != VK_SUCCESS) {

        return result;
    }

    for (const auto& handle : handles) {
        handle->was_submitted.store(true, std::memory_order_release);
    }
    try {
        for (auto&& [submit, handle] : std::views::zip(submit_span, handles)) {
            context->strategy->notify_submit(submit, std::move(handle));
        }
    } catch (...) {
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR VkResult VKAPI_CALL
QueueSubmit2(VkQueue queue, std::uint32_t submit_count,
             const VkSubmitInfo2* submit_info, VkFence fence) noexcept {
    return QueueSubmit2Impl(queue, submit_count, submit_info, fence, false);
}

static VKAPI_ATTR VkResult VKAPI_CALL
QueueSubmit2KHR(VkQueue queue, std::uint32_t submit_count,
                const VkSubmitInfo2* submit_info, VkFence fence) noexcept {
    return QueueSubmit2Impl(queue, submit_count, submit_info, fence, true);
}

static VKAPI_ATTR VkResult VKAPI_CALL
QueuePresentKHR(VkQueue queue, const VkPresentInfoKHR* present_info) noexcept {
    const auto context = layer_context.get_context(queue);
    if (!context) {
        const auto device = find_device_for_queue(queue);
        if (!device || !device->vtable.QueuePresentKHR) {
            return VK_ERROR_DEVICE_LOST;
        }
        return device->vtable.QueuePresentKHR(queue, present_info);
    }
    const auto& vtable = context->device.vtable;

    const auto result = vtable.QueuePresentKHR(queue, present_info);

    // We must *ALWAYS* notify_present regardless of the error here.
    if (context->strategy && present_info) {
        try {
            context->strategy->notify_present(*present_info);
        } catch (...) {
        }
    }

    return result;
}

static VKAPI_ATTR VkResult VKAPI_CALL EnumerateDeviceExtensionProperties(
    VkPhysicalDevice physical_device, const char* pLayerName,
    std::uint32_t* pPropertyCount,
    VkExtensionProperties* pProperties) noexcept try {

    const auto lookup = lookup_physical_device(physical_device);
    const auto& context = lookup.context;
    const auto& instance = lookup.instance;
    if (!instance) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    const auto& vtable = instance->vtable;
    if (!context) {
        return vtable.EnumerateDeviceExtensionProperties(
            physical_device, pLayerName, pPropertyCount, pProperties);
    }

    // This used to be a bit less complicated because we could rely on the
    // loader mashing everything together provided we gave our anti lag
    // extension in our JSON manifest. We now try to spoof nvidia and what we
    // provide is dynamic. The JSON isn't dynamic. So we can't use that anymore!

    // Simplest case, they're not asking about us so we can happily forward it.
    if (pLayerName && std::string_view{pLayerName} != LAYER_NAME) {
        return vtable.EnumerateDeviceExtensionProperties(
            physical_device, pLayerName, pPropertyCount, pProperties);
    }

    // If we're exposing reflex we want to provide that extension instead.
    const auto extension_properties = [&]() -> VkExtensionProperties {
        if (context->instance.layer.should_expose_reflex) {
            return {.extensionName = VK_NV_LOW_LATENCY_2_EXTENSION_NAME,
                    .specVersion = VK_NV_LOW_LATENCY_2_SPEC_VERSION};
        }
        return {.extensionName = VK_AMD_ANTI_LAG_EXTENSION_NAME,
                .specVersion = VK_AMD_ANTI_LAG_SPEC_VERSION};
    }();

    if (pLayerName) {
        // This query is for our layer specifically.
        if (!pProperties) {
            *pPropertyCount = 1;
            return VK_SUCCESS;
        }

        if (!*pPropertyCount) {
            return VK_INCOMPLETE;
        }

        pProperties[0] = extension_properties;
        *pPropertyCount = 1;

        return VK_SUCCESS;
    }

    auto underlying_count = std::uint32_t{0};
    if (const auto result = vtable.EnumerateDeviceExtensionProperties(
            physical_device, nullptr, &underlying_count, nullptr);
        result != VK_SUCCESS) {

        return result;
    }

    // We have to fill this on our side because we need to know if it's already
    // supported as to avoid inserting a duplicate.
    auto underlying = std::vector<VkExtensionProperties>(underlying_count);
    if (const auto result = vtable.EnumerateDeviceExtensionProperties(
            physical_device, nullptr, &underlying_count, std::data(underlying));
        result != VK_SUCCESS) {

        return result;
    }

    const auto requires_insert =
        std::ranges::none_of(underlying, [&](const auto& ep) {
            return std::string_view{ep.extensionName} ==
                   extension_properties.extensionName;
        });

    const auto target_count = underlying_count + requires_insert;
    if (!pProperties) {
        *pPropertyCount = target_count;
        return VK_SUCCESS;
    }

    std::ranges::copy_n(std::begin(underlying),
                        std::min(underlying_count, *pPropertyCount),
                        pProperties);

    const auto written_count = std::min(target_count, *pPropertyCount);
    *pPropertyCount = written_count;

    if (written_count < target_count) {
        return VK_INCOMPLETE;
    }

    if (requires_insert) {
        pProperties[target_count - 1] = extension_properties;
    }

    return VK_SUCCESS;
} catch (...) {
    return VK_ERROR_OUT_OF_HOST_MEMORY;
}

static VKAPI_ATTR void VKAPI_CALL GetPhysicalDeviceFeatures2Impl(
    VkPhysicalDevice physical_device, VkPhysicalDeviceFeatures2* pFeatures,
    const bool should_use_khr) noexcept {

    const auto lookup = lookup_physical_device(physical_device);
    const auto& context = lookup.context;
    const auto& instance = lookup.instance;
    if (!instance) {
        return;
    }
    const auto& vtable = instance->vtable;

    if (should_use_khr) {
        vtable.GetPhysicalDeviceFeatures2KHR(physical_device, pFeatures);
    } else {
        vtable.GetPhysicalDeviceFeatures2(physical_device, pFeatures);
    }

    if (!context || !pFeatures) {
        return;
    }

    // Don't provide AntiLag if we're exposing reflex - VK_NV_low_latency2 uses
    // VkSurfaceCapabilities2KHR to determine if a surface is capable of reflex
    // instead of AMD's physical device switch found here.
    if (context->instance.layer.should_expose_reflex) {
        return;
    }

    if (const auto alf =
            vku::FindStructInPNextChain<VkPhysicalDeviceAntiLagFeaturesAMD>(
                pFeatures->pNext);
        alf) {

        alf->antiLag = context->supports_required_extensions;
    }
}

static VKAPI_ATTR void VKAPI_CALL
GetPhysicalDeviceFeatures2(VkPhysicalDevice physical_device,
                           VkPhysicalDeviceFeatures2* pFeatures) noexcept {

    GetPhysicalDeviceFeatures2Impl(physical_device, pFeatures, false);
}

static VKAPI_ATTR void VKAPI_CALL GetPhysicalDeviceFeatures2KHR(
    VkPhysicalDevice physical_device,
    VkPhysicalDeviceFeatures2KHR* pFeatures) noexcept {

    GetPhysicalDeviceFeatures2Impl(physical_device, pFeatures, true);
}

static VKAPI_ATTR void VKAPI_CALL
GetPhysicalDeviceProperties(VkPhysicalDevice physical_device,
                            VkPhysicalDeviceProperties* pProperties) noexcept {

    const auto instance = lookup_physical_device(physical_device).instance;
    if (!instance) {
        return;
    }
    const auto& vtable = instance->vtable;

    vtable.GetPhysicalDeviceProperties(physical_device, pProperties);

    if (layer_context.should_spoof_nvidia && pProperties) {
        pProperties->vendorID = LayerContext::NVIDIA_VENDOR_ID;
        pProperties->deviceID = LayerContext::NVIDIA_DEVICE_ID;

        // Most games seem happy without doing this, but I don't see why we
        // shouldn't. I could see an application checking this.
        std::strncpy(pProperties->deviceName, LayerContext::NVIDIA_DEVICE_NAME,
                     VK_MAX_PHYSICAL_DEVICE_NAME_SIZE);
    }
}

static VKAPI_ATTR void VKAPI_CALL GetPhysicalDeviceProperties2Impl(
    VkPhysicalDevice physical_device, VkPhysicalDeviceProperties2* pProperties,
    const bool should_use_khr) noexcept {

    const auto instance = lookup_physical_device(physical_device).instance;
    if (!instance) {
        return;
    }
    const auto& vtable = instance->vtable;

    if (should_use_khr) {
        vtable.GetPhysicalDeviceProperties2KHR(physical_device, pProperties);
    } else {
        vtable.GetPhysicalDeviceProperties2(physical_device, pProperties);
    }

    if (layer_context.should_spoof_nvidia && pProperties) {
        pProperties->properties.vendorID = LayerContext::NVIDIA_VENDOR_ID;
        pProperties->properties.deviceID = LayerContext::NVIDIA_DEVICE_ID;
        std::strncpy(pProperties->properties.deviceName,
                     LayerContext::NVIDIA_DEVICE_NAME,
                     VK_MAX_PHYSICAL_DEVICE_NAME_SIZE);
    }
}

// Identical logic to GetPhysicalDeviceProperties.
static VKAPI_ATTR void VKAPI_CALL GetPhysicalDeviceProperties2(
    VkPhysicalDevice physical_device,
    VkPhysicalDeviceProperties2* pProperties) noexcept {

    GetPhysicalDeviceProperties2Impl(physical_device, pProperties, false);
}

static VKAPI_ATTR void VKAPI_CALL GetPhysicalDeviceProperties2KHR(
    VkPhysicalDevice physical_device,
    VkPhysicalDeviceProperties2* pProperties) noexcept {

    GetPhysicalDeviceProperties2Impl(physical_device, pProperties, true);
}

static VKAPI_ATTR VkResult VKAPI_CALL GetPhysicalDeviceSurfaceCapabilities2KHR(
    VkPhysicalDevice physical_device,
    const VkPhysicalDeviceSurfaceInfo2KHR* pSurfaceInfo,
    VkSurfaceCapabilities2KHR* pSurfaceCapabilities) noexcept {

    const auto instance = lookup_physical_device(physical_device).instance;
    if (!instance) {
        return VK_ERROR_INITIALIZATION_FAILED;
    }
    const auto& vtable = instance->vtable;

    if (const auto result = vtable.GetPhysicalDeviceSurfaceCapabilities2KHR(
            physical_device, pSurfaceInfo, pSurfaceCapabilities);
        result != VK_SUCCESS) {

        return result;
    }

    // Don't do this unless we're spoofing nvidia.
    if (!instance->layer.should_expose_reflex || !pSurfaceCapabilities) {
        return VK_SUCCESS;
    }

    const auto lsc =
        vku::FindStructInPNextChain<VkLatencySurfaceCapabilitiesNV>(
            pSurfaceCapabilities->pNext);
    if (!lsc) {
        return VK_SUCCESS;
    }

    // I eyeballed these - there might be more that we can support.
    constexpr auto supported_modes = std::array<VkPresentModeKHR, 3>{
        VK_PRESENT_MODE_IMMEDIATE_KHR,
        VK_PRESENT_MODE_MAILBOX_KHR,
        VK_PRESENT_MODE_FIFO_KHR,
    };
    const auto num_supported_modes =
        static_cast<std::uint32_t>(std::size(supported_modes));

    // They're asking how many we want to return.
    if (!lsc->pPresentModes) {
        lsc->presentModeCount = num_supported_modes;
        return VK_SUCCESS;
    }

    // Finally we can write what surfaces are capable.
    const auto num_to_write =
        std::min(lsc->presentModeCount, num_supported_modes);

    std::ranges::copy_n(std::begin(supported_modes), num_to_write,
                        lsc->pPresentModes);

    lsc->presentModeCount = num_to_write;
    return VK_SUCCESS;
}

static VKAPI_ATTR VkResult VKAPI_CALL
CreateSwapchainKHR(VkDevice device, const VkSwapchainCreateInfoKHR* pCreateInfo,
                   const VkAllocationCallbacks* pAllocator,
                   VkSwapchainKHR* pSwapchain) noexcept {
    const auto context = layer_context.get_context(device);
    if (!context) {
        return VK_ERROR_DEVICE_LOST;
    }
    if (const auto result = context->vtable.CreateSwapchainKHR(
            device, pCreateInfo, pAllocator, pSwapchain);
        result != VK_SUCCESS) {

        return result;
    }

    if (context->strategy && pCreateInfo) {
        // Starting the swapchain monitor can throw (thread creation, memory).
        // The swapchain itself is fine; it just won't be paced.
        try {
            context->strategy->notify_create_swapchain(*pSwapchain,
                                                       *pCreateInfo);
        } catch (...) {
        }
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL
DestroySwapchainKHR(VkDevice device, VkSwapchainKHR swapchain,
                    const VkAllocationCallbacks* pAllocator) noexcept {
    const auto context = layer_context.get_context(device);
    if (!context) {
        return;
    }
    if (context->strategy) {
        try {
            context->strategy->notify_destroy_swapchain(swapchain);
        } catch (...) {
        }
    }
    context->vtable.DestroySwapchainKHR(device, swapchain, pAllocator);
}

static VKAPI_ATTR void VKAPI_CALL
AntiLagUpdateAMD(VkDevice device, const VkAntiLagDataAMD* pData) noexcept {

    const auto context = layer_context.get_context(device);
    if (!context) {
        return;
    }

    // GetDeviceProcAddr only hands this hook out in anti-lag mode on devices
    // that enabled the extension, but stay safe if we get here anyway.
    const auto strategy =
        dynamic_cast<AntiLagDeviceStrategy*>(context->strategy.get());
    if (layer_context.should_expose_reflex || !strategy) {
        if (context->vtable.AntiLagUpdateAMD) {
            context->vtable.AntiLagUpdateAMD(device, pData);
        }
        return;
    }

    if (!pData) {
        return;
    }
    // Waits on GPU timestamps, which throws on device loss.
    try {
        strategy->notify_update(*pData);
    } catch (...) {
    }
}

static VKAPI_ATTR VkResult VKAPI_CALL
LatencySleepNV(VkDevice device, VkSwapchainKHR swapchain,
               const VkLatencySleepInfoNV* pSleepInfo) noexcept {
    const auto context = layer_context.get_context(device);
    if (!context) {
        return VK_ERROR_DEVICE_LOST;
    }
    const auto strategy =
        dynamic_cast<LowLatency2DeviceStrategy*>(context->strategy.get());
    if (!layer_context.should_expose_reflex || !strategy) {
        if (!context->vtable.LatencySleepNV) {
            return VK_ERROR_EXTENSION_NOT_PRESENT;
        }
        return context->vtable.LatencySleepNV(device, swapchain, pSleepInfo);
    }

    if (!pSleepInfo) {
        return VK_SUCCESS;
    }
    try {
        strategy->notify_latency_sleep_nv(swapchain, *pSleepInfo);
    } catch (const VkResult result) {
        return result;
    } catch (...) {
        return VK_ERROR_OUT_OF_HOST_MEMORY;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL QueueNotifyOutOfBandNV(
    VkQueue queue, const VkOutOfBandQueueTypeInfoNV* pQueueTypeInfo) noexcept {

    const auto context = layer_context.get_context(queue);
    if (!context) {
        const auto device = find_device_for_queue(queue);
        if (device && device->vtable.QueueNotifyOutOfBandNV) {
            device->vtable.QueueNotifyOutOfBandNV(queue, pQueueTypeInfo);
        }
        return;
    }

    // Kind of interesting how you can't turn it back on once it's turned off.
    const auto strategy =
        dynamic_cast<LowLatency2QueueStrategy*>(context->strategy.get());
    if (!layer_context.should_expose_reflex || !strategy) {
        if (context->device.vtable.QueueNotifyOutOfBandNV) {
            context->device.vtable.QueueNotifyOutOfBandNV(queue,
                                                          pQueueTypeInfo);
        }
        return;
    }
    strategy->notify_out_of_band();
}

static VKAPI_ATTR VkResult VKAPI_CALL
SetLatencySleepModeNV(VkDevice device, VkSwapchainKHR swapchain,
                      const VkLatencySleepModeInfoNV* pSleepModeInfo) noexcept {
    const auto context = layer_context.get_context(device);
    if (!context) {
        return VK_ERROR_DEVICE_LOST;
    }
    const auto strategy =
        dynamic_cast<LowLatency2DeviceStrategy*>(context->strategy.get());
    if (!layer_context.should_expose_reflex || !strategy) {
        if (!context->vtable.SetLatencySleepModeNV) {
            return VK_ERROR_EXTENSION_NOT_PRESENT;
        }
        return context->vtable.SetLatencySleepModeNV(device, swapchain,
                                                     pSleepModeInfo);
    }

    try {
        strategy->notify_latency_sleep_mode(swapchain, pSleepModeInfo);
    } catch (...) {
        return VK_ERROR_OUT_OF_HOST_MEMORY;
    }

    return VK_SUCCESS;
}

static VKAPI_ATTR void VKAPI_CALL
SetLatencyMarkerNV(VkDevice device, VkSwapchainKHR swapchain,
                   const VkSetLatencyMarkerInfoNV* info) noexcept {
    if (!layer_context.should_expose_reflex) {
        const auto context = layer_context.get_context(device);
        if (context && context->vtable.SetLatencyMarkerNV) {
            context->vtable.SetLatencyMarkerNV(device, swapchain, info);
        }
        return;
    }
}

static VKAPI_ATTR void VKAPI_CALL
GetLatencyTimingsNV(VkDevice device, VkSwapchainKHR swapchain,
                    VkGetLatencyMarkerInfoNV* timings) noexcept {
    if (!layer_context.should_expose_reflex) {
        const auto context = layer_context.get_context(device);
        if (context && context->vtable.GetLatencyTimingsNV) {
            context->vtable.GetLatencyTimingsNV(device, swapchain, timings);
        }
        return;
    }

    // We don't do anything here but the caller still expects us to change
    // timings->timingCount to the amount we wrote - so set it to zero.
    if (timings) {
        timings->timingCount = 0;
    }
}

} // namespace low_latency

#define HOOK_ENTRY(vk_name_literal, fn_sym)                                    \
    {vk_name_literal, reinterpret_cast<PFN_vkVoidFunction>(fn_sym)}

using func_map_t = std::unordered_map<std::string_view, PFN_vkVoidFunction>;
static const auto instance_functions = func_map_t{
    HOOK_ENTRY("vkCreateDevice", low_latency::CreateDevice),

    HOOK_ENTRY("vkGetInstanceProcAddr", LowLatency_GetInstanceProcAddr),
    HOOK_ENTRY("vkGetDeviceProcAddr", LowLatency_GetDeviceProcAddr),

    HOOK_ENTRY("vkEnumeratePhysicalDevices",
               low_latency::EnumeratePhysicalDevices),
    HOOK_ENTRY("vkEnumeratePhysicalDeviceGroups",
               low_latency::EnumeratePhysicalDeviceGroups),
    HOOK_ENTRY("vkEnumeratePhysicalDeviceGroupsKHR",
               low_latency::EnumeratePhysicalDeviceGroupsKHR),

    HOOK_ENTRY("vkCreateInstance", low_latency::CreateInstance),
    HOOK_ENTRY("vkDestroyInstance", low_latency::DestroyInstance),

    HOOK_ENTRY("vkEnumerateDeviceExtensionProperties",
               low_latency::EnumerateDeviceExtensionProperties),

    HOOK_ENTRY("vkGetPhysicalDeviceFeatures2",
               low_latency::GetPhysicalDeviceFeatures2),
    HOOK_ENTRY("vkGetPhysicalDeviceFeatures2KHR",
               low_latency::GetPhysicalDeviceFeatures2KHR),

    HOOK_ENTRY("vkGetPhysicalDeviceProperties",
               low_latency::GetPhysicalDeviceProperties),
    HOOK_ENTRY("vkGetPhysicalDeviceProperties2KHR",
               low_latency::GetPhysicalDeviceProperties2KHR),
    HOOK_ENTRY("vkGetPhysicalDeviceProperties2",
               low_latency::GetPhysicalDeviceProperties2),

    HOOK_ENTRY("vkGetPhysicalDeviceSurfaceCapabilities2KHR",
               low_latency::GetPhysicalDeviceSurfaceCapabilities2KHR),
};

static const auto device_functions = func_map_t{
    HOOK_ENTRY("vkGetDeviceProcAddr", LowLatency_GetDeviceProcAddr),

    HOOK_ENTRY("vkDestroyDevice", low_latency::DestroyDevice),

    HOOK_ENTRY("vkGetDeviceQueue", low_latency::GetDeviceQueue),
    HOOK_ENTRY("vkGetDeviceQueue2", low_latency::GetDeviceQueue2),

    HOOK_ENTRY("vkQueueSubmit", low_latency::QueueSubmit),
    HOOK_ENTRY("vkQueueSubmit2", low_latency::QueueSubmit2),
    HOOK_ENTRY("vkQueueSubmit2KHR", low_latency::QueueSubmit2KHR),

    HOOK_ENTRY("vkQueuePresentKHR", low_latency::QueuePresentKHR),

    HOOK_ENTRY("vkCreateSwapchainKHR", low_latency::CreateSwapchainKHR),
    HOOK_ENTRY("vkDestroySwapchainKHR", low_latency::DestroySwapchainKHR),
};

// Only handed out when the device actually runs in anti-lag mode (the app
// enabled the extension and reflex is not being exposed). Otherwise the next
// layer/driver answers, so the app never gets a hook that calls through a
// null dispatch entry.
static const auto anti_lag_functions = func_map_t{
    HOOK_ENTRY("vkAntiLagUpdateAMD", low_latency::AntiLagUpdateAMD),
};

// Same, for VK_NV_low_latency2 (reflex mode).
static const auto low_latency2_functions = func_map_t{
    HOOK_ENTRY("vkGetLatencyTimingsNV", low_latency::GetLatencyTimingsNV),
    HOOK_ENTRY("vkLatencySleepNV", low_latency::LatencySleepNV),
    HOOK_ENTRY("vkQueueNotifyOutOfBandNV", low_latency::QueueNotifyOutOfBandNV),
    HOOK_ENTRY("vkSetLatencyMarkerNV", low_latency::SetLatencyMarkerNV),
    HOOK_ENTRY("vkSetLatencySleepModeNV", low_latency::SetLatencySleepModeNV),
};
#undef HOOK_ENTRY

VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL LowLatency_GetDeviceProcAddr(
    VkDevice device, const char* const pName) noexcept {

    if (!pName || !device) {
        return nullptr;
    }

    if (const auto it = device_functions.find(pName);
        it != std::end(device_functions)) {

        return it->second;
    }

    const auto context = low_latency::layer_context.get_context(device);
    if (!context) {
        return nullptr;
    }

    // was_layer_enabled means the app enabled the extension we expose for the
    // current mode (see CreateDevice), so the matching strategy exists.
    const auto is_reflex = low_latency::layer_context.should_expose_reflex;
    const auto& mode_functions =
        is_reflex ? low_latency2_functions : anti_lag_functions;
    if (context->was_layer_enabled) {
        if (const auto it = mode_functions.find(pName);
            it != std::end(mode_functions)) {

            return it->second;
        }
    }

    if (!context->vtable.GetDeviceProcAddr) {
        return nullptr;
    }
    return context->vtable.GetDeviceProcAddr(device, pName);
}

VKAPI_ATTR PFN_vkVoidFunction VKAPI_CALL LowLatency_GetInstanceProcAddr(
    VkInstance instance, const char* const pName) noexcept {

    if (!pName) {
        return nullptr;
    }

    if (const auto it = instance_functions.find(pName);
        it != std::end(instance_functions)) {

        return it->second;
    }

    if (!instance) {
        return nullptr;
    }

    const auto context = low_latency::layer_context.get_context(instance);
    if (!context || !context->vtable.GetInstanceProcAddr) {
        return nullptr;
    }
    return context->vtable.GetInstanceProcAddr(instance, pName);
}
