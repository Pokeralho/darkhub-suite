cmake_minimum_required(VERSION 3.10)
project(low_latency_layer
    VERSION 0.02
    LANGUAGES CXX
)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

file(GLOB_RECURSE CXX_SOURCES src/*.cc)

set(LIBRARY_NAME VkLayer_KORTHOS_LowLatency)
add_library(${LIBRARY_NAME} SHARED
    ${CXX_SOURCES}
)

if(WIN32)
    # DarkHub port: no Vulkan SDK needed. The headers and the utility
    # libraries are fetched at pinned tags, and the layer never links the
    # loader (it only calls down the chain through its dispatch tables).
    include(FetchContent)
    set(DARKHUB_VULKAN_TAG v1.4.368)
    FetchContent_Declare(VulkanHeaders
        GIT_REPOSITORY https://github.com/KhronosGroup/Vulkan-Headers.git
        GIT_TAG ${DARKHUB_VULKAN_TAG} GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(VulkanHeaders)
    set(UPDATE_DEPS OFF CACHE BOOL "" FORCE)
    set(BUILD_TESTS OFF CACHE BOOL "" FORCE)
    FetchContent_Declare(VulkanUtilityLibraries
        GIT_REPOSITORY https://github.com/KhronosGroup/Vulkan-Utility-Libraries.git
        GIT_TAG ${DARKHUB_VULKAN_TAG} GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(VulkanUtilityLibraries)
    target_sources(${LIBRARY_NAME} PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/windows/low_latency_layer.def)
    target_link_libraries(${LIBRARY_NAME}
        Vulkan::Headers
        Vulkan::UtilityHeaders
        Vulkan::SafeStruct
    )
    set_property(TARGET ${LIBRARY_NAME} PROPERTY
        MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    set_property(TARGET VulkanSafeStruct PROPERTY
        MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    target_compile_definitions(${LIBRARY_NAME} PRIVATE
        VK_USE_PLATFORM_WIN32_KHR NOMINMAX WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
    target_include_directories(${LIBRARY_NAME} PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
    target_compile_options(${LIBRARY_NAME} PRIVATE /O2 /EHsc /W3 /utf-8 /permissive-)
    add_custom_command(TARGET ${LIBRARY_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            ${CMAKE_CURRENT_SOURCE_DIR}/windows/low_latency_layer.json
            $<TARGET_FILE_DIR:${LIBRARY_NAME}>/VkLayer_KORTHOS_LowLatency.json)
    return()
endif()

find_package(Vulkan REQUIRED)
find_package(VulkanUtilityLibraries REQUIRED)
target_link_libraries(${LIBRARY_NAME}
    Vulkan::Vulkan
    Vulkan::SafeStruct
)

target_include_directories(${LIBRARY_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

include(GNUInstallDirs)
# Prefix an absolute directory to our layer's json so the loader knows where the shared library is.
configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/low_latency_layer.json.in"
    "${CMAKE_CURRENT_BINARY_DIR}/low_latency_layer.json"
    @ONLY
)
install(TARGETS ${LIBRARY_NAME}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
install(FILES "${CMAKE_CURRENT_BINARY_DIR}/low_latency_layer.json"
    DESTINATION "${CMAKE_INSTALL_DATADIR}/vulkan/implicit_layer.d/"
)

target_compile_options(${LIBRARY_NAME} PRIVATE
    # Inherited from Mesa.
    -g
    -O2
    -D_GLIBCXX_ASSERTIONS
    -D__STDC_CONSTANT_MACROS
    -D__STDC_FORMAT_MACROS
    -D__STDC_LIMIT_MACROS

    -Wall
    -Wextra
    -Wno-sign-conversion
    -Wno-missing-field-initializers

    -Wundef
    -Wconversion
    -Wdouble-promotion
)
