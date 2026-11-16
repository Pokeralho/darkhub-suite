#include "instance_context.hh"

#include "layer_context.hh"

#include <cassert>
#include <string_view>
#include <unordered_set>
#include <utility>

namespace low_latency {

static bool check_known_decoupled_simulation(const VkInstanceCreateInfo& info) {
    // List of applications which are known to have bad behaviour where
    // simulation is allowed to run ahead of render despite the use of
    // reflex/anti-lag.
    // Right now there's only one and I consider it a bug on their part. Reflex
    // or anti_lag extensions should imply 1:1 sim/render.
    static const auto decoupled_simulation_apps =
        std::unordered_set<std::string_view>{"Marvel-Win64-Shipping.exe"};

    if (!info.pApplicationInfo || !info.pApplicationInfo->pApplicationName) {
        return false;
    }

    return decoupled_simulation_apps.contains(
        info.pApplicationInfo->pApplicationName);
}

InstanceContext::InstanceContext(const LayerContext& parent_context,
                                 const VkInstance& instance,
                                 const VkInstanceCreateInfo& create_info,
                                 VkuInstanceDispatchTable&& vtable)
    : layer(parent_context), instance(instance), vtable(std::move(vtable)),
      is_simulation_decoupled(parent_context.should_force_decoupled ||
                              check_known_decoupled_simulation(create_info)) {}

InstanceContext::~InstanceContext() {}

} // namespace low_latency