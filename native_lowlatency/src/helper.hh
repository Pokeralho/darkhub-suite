#ifndef HELPER_HH_
#define HELPER_HH_

#include <vulkan/vk_layer.h>
#include <vulkan/vulkan.h>

namespace low_latency {

#define THROW_NOT_VKSUCCESS(x)                                                 \
    do {                                                                       \
        if (const auto result = x; result != VK_SUCCESS) {                     \
            throw result;                                                      \
        }                                                                      \
    } while (0)

} // namespace low_latency

#endif