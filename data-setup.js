/* Concept data, part 1: root map + setup chapters.
   Node fields: title, api, level (1-4), group, summary, body (HTML), facts[], code (C), widget, chapter,
   diagram: { nodes: [[id, col, row]], edges: [[from, to, label]] } */
window.VK = window.VK || { nodes: {}, quiz: [] };
window.D = (id, o) => { VK.nodes[id] = Object.assign({ id }, o); };

D("root", {
  title: "Vulkan Application", api: "the whole object graph", level: 1, group: "setup",
  summary: "Every Vulkan program builds the same chain of objects before it can draw one triangle. Click a block to open it; blocks with a + hold their own diagram.",
  body: `<p>Vulkan gives you almost no defaults. You create an instance, pick a GPU, create a logical device, build a swap chain to show images in a window, describe a render pass and a pipeline, record command buffers, and finally submit them every frame with explicit synchronization.</p>
  <p>The map is laid out roughly in creation order, left to right. The bottom row holds the resources you add once the first triangle works: buffers, descriptors, textures and compute.</p>`,
  facts: [
    "Objects you <code>vkCreate*</code> or <code>vkAllocate*</code>, you must <code>vkDestroy*</code> or <code>vkFree*</code>, usually in reverse order.",
    "Almost every create function takes a <code>*CreateInfo</code> struct with an <code>sType</code> field.",
    "Drawing happens by recording commands into command buffers and submitting them to a queue.",
    "Synchronization between GPU work is explicit: semaphores between queue operations, fences for the CPU."
  ],
  code: `/* The initVulkan() order used by the tutorial, in C. */
static void initVulkan(App *app) {
    createInstance(app);
    setupDebugMessenger(app);
    createSurface(app);
    pickPhysicalDevice(app);
    createLogicalDevice(app);
    createSwapChain(app);
    createImageViews(app);
    createRenderPass(app);
    createDescriptorSetLayout(app);
    createGraphicsPipeline(app);
    createCommandPool(app);
    createColorResources(app);   /* MSAA target  */
    createDepthResources(app);
    createFramebuffers(app);
    createTextureImage(app);
    createTextureImageView(app);
    createTextureSampler(app);
    loadModel(app);
    createVertexBuffer(app);
    createIndexBuffer(app);
    createUniformBuffers(app);
    createDescriptorPool(app);
    createDescriptorSets(app);
    createCommandBuffers(app);
    createSyncObjects(app);
}`,
  chapter: "Overview: What it takes to draw a triangle",
  diagram: {
    nodes: [
      ["app", 0, 0.4], ["instance", 0, 1.55], ["validation", 0, 2.7],
      ["surface", 1, 0.4], ["physicalDevice", 1, 1.55], ["logicalDevice", 1, 2.7],
      ["swapchain", 2, 0.4], ["renderPass", 2, 1.55], ["pipeline", 2, 2.7],
      ["framebuffers", 3, 0.4], ["commands", 3, 1.55], ["sync", 3, 2.7],
      ["frameLoop", 4, 1.55], ["attachments", 4, 0.4],
      ["buffers", 1, 3.9], ["descriptors", 2, 3.9], ["textures", 3, 3.9], ["compute", 4, 3.9]
    ],
    edges: [
      ["app", "instance", "required extensions"], ["app", "surface", "window handle"],
      ["instance", "validation", "enables layers"], ["instance", "surface", "creates"],
      ["instance", "physicalDevice", "enumerates"], ["surface", "physicalDevice", "present support"],
      ["physicalDevice", "logicalDevice", "creates"], ["logicalDevice", "swapchain", "creates"],
      ["surface", "swapchain", "presents to"], ["swapchain", "framebuffers", "image views"],
      ["renderPass", "framebuffers", "compatible with"], ["renderPass", "pipeline", "subpass 0"],
      ["attachments", "framebuffers", "depth + MSAA"], ["framebuffers", "commands", "render target"],
      ["pipeline", "commands", "bound in"], ["commands", "frameLoop", "submitted"],
      ["sync", "frameLoop", "orders work"], ["swapchain", "frameLoop", "acquire / present"],
      ["buffers", "commands", "bind vertex/index"], ["buffers", "descriptors", "uniform buffer"],
      ["textures", "descriptors", "image + sampler"], ["descriptors", "pipeline", "set layout"],
      ["compute", "buffers", "writes SSBO"]
    ]
  }
});

/* ---------------- Your C program ---------------- */
D("app", {
  title: "Your C Program", api: "GLFW window + main loop", level: 1, group: "setup",
  summary: "A plain C program: create a GLFW window, initialize Vulkan, loop until the window closes, then clean up.",
  body: `<p>The tutorial wraps everything in a C++ class. In C the same structure works with a single <code>App</code> struct that holds every handle, passed by pointer to each <code>create*</code> function.</p>
  <p>GLFW creates the window and also tells you which instance extensions the platform needs to present to it.</p>`,
  facts: ["Tell GLFW not to create an OpenGL context: <code>GLFW_CLIENT_API = GLFW_NO_API</code>.", "Window size is in screen coordinates; the swap chain needs pixels (<code>glfwGetFramebufferSize</code>)."],
  code: `#define GLFW_INCLUDE_VULKAN
#include <GLFW/glfw3.h>
#include <stdio.h>
#include <stdlib.h>

#define WIDTH  800
#define HEIGHT 600

typedef struct App {
    GLFWwindow *window;
    VkInstance instance;
    /* ... every other handle lives here ... */
} App;

int main(void) {
    App app = {0};
    initWindow(&app);
    initVulkan(&app);
    mainLoop(&app);
    cleanup(&app);
    return EXIT_SUCCESS;
}`,
  chapter: "Drawing a triangle › Setup › Base code",
  diagram: {
    nodes: [["glfwSetup", 0, 0.5], ["vkCheck", 0, 1.7], ["mainLoop", 1, 0.5], ["resizeCallback", 1, 1.7], ["cleanupOrder", 2, 1.1]],
    edges: [["glfwSetup", "mainLoop", "then"], ["mainLoop", "cleanupOrder", "window closed"], ["glfwSetup", "resizeCallback", "registers"], ["vkCheck", "mainLoop", "used everywhere"]]
  }
});
D("glfwSetup", {
  title: "Window Creation", api: "glfwCreateWindow", level: 1, group: "setup",
  summary: "Initialize GLFW, ask for no OpenGL context, and open the window.",
  body: `<p>GLFW was built for OpenGL, so it creates a GL context unless you say otherwise. Vulkan does not need one.</p>`,
  code: `static void initWindow(App *app) {
    glfwInit();
    glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
    app->window = glfwCreateWindow(WIDTH, HEIGHT, "Vulkan", NULL, NULL);
    glfwSetWindowUserPointer(app->window, app);
    glfwSetFramebufferSizeCallback(app->window, framebufferResizeCallback);
}`,
  chapter: "Setup › Base code › Integrating GLFW"
});
D("vkCheck", {
  title: "Error Handling", api: "VkResult", level: 1, group: "setup",
  summary: "Nearly every Vulkan call returns a VkResult. These C snippets check it with one small macro.",
  body: `<p>The tutorial throws <code>std::runtime_error</code>. In C, print the failing call and exit. Every snippet on this site uses this macro.</p>
  <p>Without validation layers, Vulkan does almost no error checking: a bad parameter often crashes or silently misbehaves rather than returning an error.</p>`,
  facts: ["<code>VK_SUCCESS</code> is 0; errors are negative; <code>VK_SUBOPTIMAL_KHR</code> is a positive success code."],
  code: `#define VK_CHECK(call) do {                                   \\
    VkResult r_ = (call);                                         \\
    if (r_ != VK_SUCCESS) {                                       \\
        fprintf(stderr, "%s:%d: %s failed (%d)\\n",               \\
                __FILE__, __LINE__, #call, (int)r_);              \\
        exit(EXIT_FAILURE);                                       \\
    }                                                             \\
} while (0)

static void die(const char *msg) {
    fprintf(stderr, "fatal: %s\\n", msg);
    exit(EXIT_FAILURE);
}`,
  chapter: "Overview › API concepts › Coding conventions"
});
D("mainLoop", {
  title: "Main Loop", api: "glfwPollEvents + drawFrame", level: 1, group: "draw",
  summary: "Poll window events and draw a frame until the user closes the window, then wait for the GPU to go idle.",
  body: `<p>All the work in <code>drawFrame</code> runs asynchronously on the GPU. When the loop ends, frames may still be in flight, so wait with <code>vkDeviceWaitIdle</code> before destroying anything.</p>`,
  code: `static void mainLoop(App *app) {
    while (!glfwWindowShouldClose(app->window)) {
        glfwPollEvents();
        drawFrame(app);
    }
    vkDeviceWaitIdle(app->device);
}`,
  links: ["frameLoop"],
  chapter: "Drawing › Rendering and presentation"
});
D("resizeCallback", {
  title: "Resize Callback", api: "glfwSetFramebufferSizeCallback", level: 2, group: "present",
  summary: "Flag that the framebuffer changed size so the next frame recreates the swap chain.",
  body: `<p>Drivers usually report <code>VK_ERROR_OUT_OF_DATE_KHR</code> after a resize, but it is not guaranteed. A flag set by GLFW makes it explicit. The callback gets the window, so store your <code>App*</code> with <code>glfwSetWindowUserPointer</code>.</p>`,
  code: `static void framebufferResizeCallback(GLFWwindow *w, int width, int height) {
    (void)width; (void)height;
    App *app = (App *)glfwGetWindowUserPointer(w);
    app->framebufferResized = 1;
}`,
  links: ["recreateSwapchain"],
  chapter: "Swap chain recreation › Handling resizes explicitly"
});
D("cleanupOrder", {
  title: "Cleanup Order", api: "vkDestroy* in reverse", level: 2, group: "setup",
  summary: "Destroy child objects before their parents: device objects, then the device, then surface, messenger and instance.",
  body: `<p>Physical devices, queues, swap chain images, command buffers and descriptor sets are freed implicitly with their owner. Everything you explicitly created must be destroyed explicitly.</p>`,
  code: `static void cleanup(App *app) {
    cleanupSwapChain(app);
    vkDestroySampler(app->device, app->textureSampler, NULL);
    /* ... textures, buffers, descriptor pool/layout, pipeline ... */
    for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
        vkDestroySemaphore(app->device, app->renderFinished[i], NULL);
        vkDestroySemaphore(app->device, app->imageAvailable[i], NULL);
        vkDestroyFence(app->device, app->inFlight[i], NULL);
    }
    vkDestroyCommandPool(app->device, app->commandPool, NULL);
    vkDestroyDevice(app->device, NULL);
    if (enableValidationLayers)
        DestroyDebugUtilsMessengerEXT(app->instance, app->debugMessenger, NULL);
    vkDestroySurfaceKHR(app->instance, app->surface, NULL);
    vkDestroyInstance(app->instance, NULL);
    glfwDestroyWindow(app->window);
    glfwTerminate();
}`,
  chapter: "Swap chain recreation › Recreating the swap chain"
});

/* ---------------- Instance ---------------- */
D("instance", {
  title: "Instance", api: "VkInstance", level: 1, group: "setup",
  summary: "The connection between your application and the Vulkan library. Created first, destroyed last.",
  body: `<p>Creating an instance tells the driver about your application and which <em>global</em> extensions and layers you want. Global means they apply to the whole program, not to one GPU.</p>`,
  facts: ["Window-system integration is an instance extension, listed for you by <code>glfwGetRequiredInstanceExtensions</code>.", "Every other Vulkan object must be destroyed before <code>vkDestroyInstance</code>."],
  code: `static void createInstance(App *app) {
    if (enableValidationLayers && !checkValidationLayerSupport())
        die("validation layers requested, but not available");

    VkApplicationInfo appInfo = {
        .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
        .pApplicationName = "Hello Triangle",
        .applicationVersion = VK_MAKE_VERSION(1, 0, 0),
        .pEngineName = "No Engine",
        .engineVersion = VK_MAKE_VERSION(1, 0, 0),
        .apiVersion = VK_API_VERSION_1_0,
    };

    uint32_t extCount;
    const char **exts = getRequiredExtensions(&extCount);

    VkDebugUtilsMessengerCreateInfoEXT debugInfo;
    VkInstanceCreateInfo info = {
        .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
        .pApplicationInfo = &appInfo,
        .enabledExtensionCount = extCount,
        .ppEnabledExtensionNames = exts,
    };
    if (enableValidationLayers) {
        info.enabledLayerCount = VALIDATION_LAYER_COUNT;
        info.ppEnabledLayerNames = validationLayers;
        populateDebugMessengerCreateInfo(&debugInfo);
        info.pNext = &debugInfo;
    }
    VK_CHECK(vkCreateInstance(&info, NULL, &app->instance));
    free(exts);
}`,
  chapter: "Drawing a triangle › Setup › Instance",
  diagram: {
    nodes: [["appInfo", 0, 0], ["instExtensions", 0, 1.1], ["validation", 0, 2.2], ["instCreateInfo", 1.2, 1.1], ["portability", 1.2, 2.3], ["instHandle", 2.4, 1.1]],
    edges: [["appInfo", "instCreateInfo", "pApplicationInfo"], ["instExtensions", "instCreateInfo", "ppEnabledExtensionNames"], ["validation", "instCreateInfo", "ppEnabledLayerNames"], ["portability", "instCreateInfo", "flags (macOS)"], ["instCreateInfo", "instHandle", "vkCreateInstance"]]
  }
});
D("appInfo", {
  title: "Application Info", api: "VkApplicationInfo", level: 1, group: "setup",
  summary: "Optional description of your app and engine. Drivers may use it to apply engine-specific optimizations.",
  body: `<p>This is the first of many structs with an <code>sType</code> field and a <code>pNext</code> pointer for extensions. Designated initializers leave every field you do not name at zero, so <code>pNext</code> is <code>NULL</code>.</p>`,
  code: `VkApplicationInfo appInfo = {
    .sType = VK_STRUCTURE_TYPE_APPLICATION_INFO,
    .pApplicationName = "Hello Triangle",
    .applicationVersion = VK_MAKE_VERSION(1, 0, 0),
    .pEngineName = "No Engine",
    .engineVersion = VK_MAKE_VERSION(1, 0, 0),
    .apiVersion = VK_API_VERSION_1_0,
};`,
  chapter: "Setup › Instance › Creating an instance"
});
D("instExtensions", {
  title: "Instance Extensions", api: "vkEnumerateInstanceExtensionProperties", level: 1, group: "setup",
  summary: "GLFW lists the surface extensions it needs; validation adds VK_EXT_debug_utils.",
  body: `<p>Vulkan is platform agnostic, so even talking to a window is an extension (<code>VK_KHR_surface</code> plus a platform one such as <code>VK_KHR_win32_surface</code>). You can list what the loader supports with the classic two-call pattern: first get the count, then fill an array.</p>`,
  facts: ["The two-call pattern (count, then data) appears all over the API.", "Use the <code>VK_EXT_DEBUG_UTILS_EXTENSION_NAME</code> macro to avoid typos."],
  code: `static const char **getRequiredExtensions(uint32_t *count) {
    uint32_t glfwCount = 0;
    const char **glfwExts = glfwGetRequiredInstanceExtensions(&glfwCount);

    const char **exts = malloc((glfwCount + 1) * sizeof *exts);
    for (uint32_t i = 0; i < glfwCount; i++) exts[i] = glfwExts[i];
    *count = glfwCount;
    if (enableValidationLayers)
        exts[(*count)++] = VK_EXT_DEBUG_UTILS_EXTENSION_NAME;
    return exts;
}

/* Listing what is available: */
uint32_t n = 0;
vkEnumerateInstanceExtensionProperties(NULL, &n, NULL);
VkExtensionProperties *props = malloc(n * sizeof *props);
vkEnumerateInstanceExtensionProperties(NULL, &n, props);
for (uint32_t i = 0; i < n; i++) printf("\\t%s\\n", props[i].extensionName);
free(props);`,
  chapter: "Setup › Instance › Checking for extension support"
});
D("instCreateInfo", {
  title: "Instance Create Info", api: "VkInstanceCreateInfo", level: 1, group: "setup",
  summary: "Bundles the app info, extension names and layer names into the one struct vkCreateInstance needs.",
  body: `<p>The general creation pattern in Vulkan is: pointer to a create-info struct, pointer to allocator callbacks (always <code>NULL</code> here), pointer to where the new handle goes.</p>`,
  code: `VkInstanceCreateInfo info = {
    .sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO,
    .pApplicationInfo = &appInfo,
    .enabledExtensionCount = extCount,
    .ppEnabledExtensionNames = exts,
    .enabledLayerCount = 0,
};
VK_CHECK(vkCreateInstance(&info, NULL, &app->instance));`,
  chapter: "Setup › Instance"
});
D("portability", {
  title: "Portability (macOS)", api: "VK_KHR_portability_enumeration", level: 2, group: "setup",
  summary: "On MoltenVK (SDK 1.3.216+) vkCreateInstance returns VK_ERROR_INCOMPATIBLE_DRIVER unless you opt into portability devices.",
  body: `<p>MoltenVK translates Vulkan to Metal and is not fully conformant, so the loader hides it unless you set a flag and enable the portability enumeration extension.</p>`,
  code: `exts[extCount++] = VK_KHR_PORTABILITY_ENUMERATION_EXTENSION_NAME;
info.flags |= VK_INSTANCE_CREATE_ENUMERATE_PORTABILITY_BIT_KHR;
info.enabledExtensionCount = extCount;
info.ppEnabledExtensionNames = exts;`,
  chapter: "FAQ › vkCreateInstance fails with VK_ERROR_INCOMPATIBLE_DRIVER"
});
D("instHandle", {
  title: "VkInstance Handle", api: "vkCreateInstance / vkDestroyInstance", level: 1, group: "setup",
  summary: "The handle every instance-level call takes. Destroy it right before the program exits.",
  body: `<p>Children of the instance (surface, debug messenger, logical devices) must be destroyed first. Physical device handles are owned by the instance and need no cleanup.</p>`,
  code: `VK_CHECK(vkCreateInstance(&info, NULL, &app->instance));
/* ... the whole program ... */
vkDestroyInstance(app->instance, NULL);`,
  chapter: "Setup › Instance › Cleaning up"
});

/* ---------------- Validation ---------------- */
D("validation", {
  title: "Validation Layers", api: "VK_LAYER_KHRONOS_validation", level: 1, group: "setup",
  summary: "Optional layers that hook every Vulkan call to check parameters, track leaks and report misuse. Enable them in debug builds.",
  body: `<p>Vulkan skips error checking for speed. Validation layers sit between your app and the driver and catch mistakes the driver would let through. They are installed with the Vulkan SDK and you turn them off in release builds for zero overhead.</p>
  <p>To receive the messages in your own code you register a <em>debug messenger</em> with a callback.</p>`,
  facts: ["Device-specific layers are deprecated; set the same layer names on the device anyway for older drivers.", "A callback returning <code>VK_TRUE</code> aborts the call; always return <code>VK_FALSE</code>.", "Severity flags are ordered, so <code>severity >= WARNING</code> works."],
  code: `static const char *const validationLayers[] = { "VK_LAYER_KHRONOS_validation" };
#define VALIDATION_LAYER_COUNT 1

#ifdef NDEBUG
static const int enableValidationLayers = 0;
#else
static const int enableValidationLayers = 1;
#endif`,
  chapter: "Drawing a triangle › Setup › Validation layers",
  diagram: {
    nodes: [["layerSupport", 0, 0], ["debugCallback", 0, 1.3], ["messengerInfo", 1.2, 1.3], ["procAddr", 2.4, 0.4], ["messenger", 2.4, 1.6], ["pNextDebug", 1.2, 2.6]],
    edges: [["layerSupport", "messengerInfo", "layers present"], ["debugCallback", "messengerInfo", "pfnUserCallback"], ["procAddr", "messenger", "loads function"], ["messengerInfo", "messenger", "vkCreateDebugUtilsMessengerEXT"], ["messengerInfo", "pNextDebug", "reused in pNext"]]
  }
});
D("layerSupport", {
  title: "Layer Support Check", api: "vkEnumerateInstanceLayerProperties", level: 1, group: "setup",
  summary: "Make sure every requested layer is installed before enabling it.",
  code: `static int checkValidationLayerSupport(void) {
    uint32_t n;
    vkEnumerateInstanceLayerProperties(&n, NULL);
    VkLayerProperties *avail = malloc(n * sizeof *avail);
    vkEnumerateInstanceLayerProperties(&n, avail);

    for (int l = 0; l < VALIDATION_LAYER_COUNT; l++) {
        int found = 0;
        for (uint32_t i = 0; i < n && !found; i++)
            found = strcmp(validationLayers[l], avail[i].layerName) == 0;
        if (!found) { free(avail); return 0; }
    }
    free(avail);
    return 1;
}`,
  chapter: "Validation layers › Using validation layers"
});
D("debugCallback", {
  title: "Debug Callback", api: "PFN_vkDebugUtilsMessengerCallbackEXT", level: 2, group: "setup",
  summary: "Your function that receives each validation message with its severity, type and text.",
  body: `<p>Set a breakpoint here to see the call stack of whatever Vulkan call triggered the message. <code>pUserData</code> is any pointer you chose at setup, for example your <code>App*</code>.</p>`,
  facts: ["Severities: VERBOSE, INFO, WARNING, ERROR.", "Types: GENERAL, VALIDATION, PERFORMANCE."],
  code: `static VKAPI_ATTR VkBool32 VKAPI_CALL debugCallback(
        VkDebugUtilsMessageSeverityFlagBitsEXT severity,
        VkDebugUtilsMessageTypeFlagsEXT type,
        const VkDebugUtilsMessengerCallbackDataEXT *data,
        void *userData) {
    (void)type; (void)userData;
    if (severity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
        fprintf(stderr, "validation layer: %s\\n", data->pMessage);
    return VK_FALSE;   /* never abort the call */
}`,
  chapter: "Validation layers › Message callback"
});
D("messengerInfo", {
  title: "Messenger Create Info", api: "VkDebugUtilsMessengerCreateInfoEXT", level: 2, group: "setup",
  summary: "Chooses which severities and message types reach your callback.",
  code: `static void populateDebugMessengerCreateInfo(VkDebugUtilsMessengerCreateInfoEXT *ci) {
    *ci = (VkDebugUtilsMessengerCreateInfoEXT){
        .sType = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT,
        .messageSeverity = VK_DEBUG_UTILS_MESSAGE_SEVERITY_VERBOSE_BIT_EXT |
                           VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
                           VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT,
        .messageType = VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT |
                       VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT |
                       VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT,
        .pfnUserCallback = debugCallback,
    };
}`,
  chapter: "Validation layers › Message callback"
});
D("procAddr", {
  title: "Loading Extension Functions", api: "vkGetInstanceProcAddr", level: 2, group: "setup",
  summary: "Extension functions are not exported by the loader, so you look up their addresses at runtime.",
  body: `<p>Wrap the lookup in small proxy functions. <code>vkGetInstanceProcAddr</code> returns <code>NULL</code> when the function is unavailable.</p>`,
  code: `static VkResult CreateDebugUtilsMessengerEXT(VkInstance inst,
        const VkDebugUtilsMessengerCreateInfoEXT *ci,
        const VkAllocationCallbacks *alloc, VkDebugUtilsMessengerEXT *out) {
    PFN_vkCreateDebugUtilsMessengerEXT fn = (PFN_vkCreateDebugUtilsMessengerEXT)
        vkGetInstanceProcAddr(inst, "vkCreateDebugUtilsMessengerEXT");
    return fn ? fn(inst, ci, alloc, out) : VK_ERROR_EXTENSION_NOT_PRESENT;
}

static void DestroyDebugUtilsMessengerEXT(VkInstance inst,
        VkDebugUtilsMessengerEXT m, const VkAllocationCallbacks *alloc) {
    PFN_vkDestroyDebugUtilsMessengerEXT fn = (PFN_vkDestroyDebugUtilsMessengerEXT)
        vkGetInstanceProcAddr(inst, "vkDestroyDebugUtilsMessengerEXT");
    if (fn) fn(inst, m, alloc);
}`,
  chapter: "Validation layers › Message callback"
});
D("messenger", {
  title: "Debug Messenger", api: "VkDebugUtilsMessengerEXT", level: 2, group: "setup",
  summary: "A handle that keeps your callback registered. Like everything else, you create and destroy it explicitly.",
  code: `static void setupDebugMessenger(App *app) {
    if (!enableValidationLayers) return;
    VkDebugUtilsMessengerCreateInfoEXT ci;
    populateDebugMessengerCreateInfo(&ci);
    VK_CHECK(CreateDebugUtilsMessengerEXT(app->instance, &ci, NULL,
                                          &app->debugMessenger));
}`,
  chapter: "Validation layers › Message callback"
});
D("pNextDebug", {
  title: "Debugging Instance Creation", api: "VkInstanceCreateInfo.pNext", level: 3, group: "setup",
  summary: "A messenger needs an instance, so it misses errors inside vkCreateInstance itself. Chaining the create info into pNext covers that gap.",
  body: `<p>Pass the same create-info struct through the instance's <code>pNext</code> chain. The loader then creates a temporary messenger used only during <code>vkCreateInstance</code> and <code>vkDestroyInstance</code>. Keep the struct alive until the call returns.</p>`,
  code: `VkDebugUtilsMessengerCreateInfoEXT debugInfo;   /* outside the if! */
if (enableValidationLayers) {
    populateDebugMessengerCreateInfo(&debugInfo);
    info.pNext = &debugInfo;
}
VK_CHECK(vkCreateInstance(&info, NULL, &app->instance));`,
  chapter: "Validation layers › Debugging instance creation and destruction"
});

/* ---------------- Surface ---------------- */
D("surface", {
  title: "Window Surface", api: "VkSurfaceKHR", level: 1, group: "present",
  summary: "An abstract, platform-independent handle to the window you will present images to.",
  body: `<p>Surface creation needs platform details (an <code>HWND</code> on Windows), so it lives in a platform extension. <code>glfwCreateWindowSurface</code> hides those details. Create the surface right after the instance: it affects which GPU you can pick.</p>`,
  facts: ["Surfaces are optional; pure off-screen rendering needs no window at all.", "Destroy the surface before the instance."],
  code: `static void createSurface(App *app) {
    VK_CHECK(glfwCreateWindowSurface(app->instance, app->window, NULL,
                                     &app->surface));
}
/* cleanup: vkDestroySurfaceKHR(app->instance, app->surface, NULL); */`,
  chapter: "Drawing a triangle › Presentation › Window surface",
  diagram: {
    nodes: [["app", 0, 0.6], ["glfwSurface", 1.2, 0], ["win32Surface", 1.2, 1.3], ["presentSupport", 2.4, 0.6]],
    edges: [["app", "glfwSurface", "GLFWwindow*"], ["app", "win32Surface", "HWND + HINSTANCE"], ["glfwSurface", "presentSupport", "VkSurfaceKHR"], ["win32Surface", "presentSupport", "VkSurfaceKHR"]]
  }
});
D("glfwSurface", {
  title: "glfwCreateWindowSurface", api: "cross-platform path", level: 1, group: "present",
  summary: "One call that picks the right platform surface function for you.",
  code: `VK_CHECK(glfwCreateWindowSurface(app->instance, app->window, NULL, &app->surface));`,
  chapter: "Window surface › Window surface creation"
});
D("win32Surface", {
  title: "Win32 Surface", api: "vkCreateWin32SurfaceKHR", level: 2, group: "present",
  summary: "What GLFW does behind the scenes on Windows. You do not need this, but it shows what a surface is made of.",
  code: `#define VK_USE_PLATFORM_WIN32_KHR
#define GLFW_INCLUDE_VULKAN
#include <GLFW/glfw3.h>
#define GLFW_EXPOSE_NATIVE_WIN32
#include <GLFW/glfw3native.h>

VkWin32SurfaceCreateInfoKHR ci = {
    .sType = VK_STRUCTURE_TYPE_WIN32_SURFACE_CREATE_INFO_KHR,
    .hwnd = glfwGetWin32Window(app->window),
    .hinstance = GetModuleHandle(NULL),
};
VK_CHECK(vkCreateWin32SurfaceKHR(app->instance, &ci, NULL, &app->surface));`,
  chapter: "Window surface › Window surface creation"
});
D("presentSupport", {
  title: "Presentation Support", api: "vkGetPhysicalDeviceSurfaceSupportKHR", level: 2, group: "present",
  summary: "Asks whether a given queue family of a GPU can present to this surface.",
  body: `<p>Presenting is a queue-family capability. The family that draws and the family that presents might differ, so the tutorial tracks both indices. On most hardware they are the same family.</p>`,
  code: `VkBool32 presentSupport = VK_FALSE;
vkGetPhysicalDeviceSurfaceSupportKHR(device, i, app->surface, &presentSupport);
if (presentSupport) { idx.presentFamily = i; idx.hasPresent = 1; }`,
  links: ["queueFamilies"],
  chapter: "Window surface › Querying for presentation support"
});

/* ---------------- Physical device ---------------- */
D("physicalDevice", {
  title: "Physical Device", api: "VkPhysicalDevice", level: 1, group: "setup",
  summary: "A GPU in the system. You enumerate them, check each one for what you need, and pick one.",
  body: `<p>The handle is owned by the instance and needs no cleanup. Suitability checks grow through the tutorial: queue families, swap chain extension, adequate surface formats, and anisotropic filtering.</p>`,
  facts: ["You could use several GPUs at once; the tutorial uses the first suitable one.", "Scoring devices lets you prefer a discrete GPU but fall back to integrated."],
  code: `static void pickPhysicalDevice(App *app) {
    uint32_t n = 0;
    vkEnumeratePhysicalDevices(app->instance, &n, NULL);
    if (n == 0) die("failed to find GPUs with Vulkan support");
    VkPhysicalDevice *devs = malloc(n * sizeof *devs);
    vkEnumeratePhysicalDevices(app->instance, &n, devs);

    app->physicalDevice = VK_NULL_HANDLE;
    for (uint32_t i = 0; i < n; i++) {
        if (isDeviceSuitable(app, devs[i])) {
            app->physicalDevice = devs[i];
            app->msaaSamples = getMaxUsableSampleCount(devs[i]);
            break;
        }
    }
    free(devs);
    if (app->physicalDevice == VK_NULL_HANDLE) die("no suitable GPU");
}`,
  chapter: "Drawing a triangle › Setup › Physical devices and queue families",
  diagram: {
    nodes: [["enumDevices", 0, 1.1], ["devProps", 1.2, 0], ["queueFamilies", 1.2, 1.1], ["devExtSupport", 1.2, 2.2], ["swapSupport", 2.4, 2.2], ["suitability", 2.4, 1.1], ["msaaCount", 3.6, 1.1]],
    edges: [["enumDevices", "devProps", "each device"], ["enumDevices", "queueFamilies", "each device"], ["enumDevices", "devExtSupport", "each device"], ["devExtSupport", "swapSupport", "only if present"], ["devProps", "suitability", ""], ["queueFamilies", "suitability", "isComplete()"], ["swapSupport", "suitability", "adequate?"], ["suitability", "msaaCount", "chosen GPU"]]
  }
});
D("enumDevices", {
  title: "Enumerate GPUs", api: "vkEnumeratePhysicalDevices", level: 1, group: "setup",
  summary: "Count, allocate, fill: the same two-call pattern as extensions.",
  code: `uint32_t n = 0;
vkEnumeratePhysicalDevices(app->instance, &n, NULL);
VkPhysicalDevice *devs = malloc(n * sizeof *devs);
vkEnumeratePhysicalDevices(app->instance, &n, devs);`,
  chapter: "Physical devices › Selecting a physical device"
});
D("devProps", {
  title: "Properties & Features", api: "vkGetPhysicalDeviceProperties / Features", level: 1, group: "setup",
  summary: "Properties give name, type, limits and API version. Features list optional capabilities like geometry shaders or anisotropy.",
  body: `<p>An example scoring function: discrete GPUs get a bonus, larger max texture size scores higher, and a missing required feature scores zero.</p>`,
  code: `static int rateDeviceSuitability(VkPhysicalDevice dev) {
    VkPhysicalDeviceProperties p;
    VkPhysicalDeviceFeatures f;
    vkGetPhysicalDeviceProperties(dev, &p);
    vkGetPhysicalDeviceFeatures(dev, &f);

    int score = 0;
    if (p.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU) score += 1000;
    score += (int)p.limits.maxImageDimension2D;
    if (!f.geometryShader) return 0;
    return score;
}`,
  chapter: "Physical devices › Base device suitability checks"
});
D("queueFamilies", {
  title: "Queue Families", api: "VkQueueFamilyProperties", level: 2, group: "setup",
  summary: "Groups of queues that accept certain kinds of work: graphics, compute, transfer, presentation.",
  body: `<p>Any queue index, including 0, is valid, so you need a separate "found" flag. C has no <code>std::optional</code>; a pair of flags does the job.</p>
  <p>Any family with graphics or compute support implicitly supports transfer, even if it does not list the bit.</p>`,
  facts: ["The graphics and present family are usually the same.", "Vulkan guarantees at least one family that does both graphics and compute (if graphics exists)."],
  code: `typedef struct QueueFamilyIndices {
    uint32_t graphicsFamily, presentFamily;
    int hasGraphics, hasPresent;
} QueueFamilyIndices;

static QueueFamilyIndices findQueueFamilies(App *app, VkPhysicalDevice dev) {
    QueueFamilyIndices idx = {0};
    uint32_t n = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(dev, &n, NULL);
    VkQueueFamilyProperties *fams = malloc(n * sizeof *fams);
    vkGetPhysicalDeviceQueueFamilyProperties(dev, &n, fams);

    for (uint32_t i = 0; i < n; i++) {
        if (fams[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            idx.graphicsFamily = i; idx.hasGraphics = 1;
        }
        VkBool32 present = VK_FALSE;
        vkGetPhysicalDeviceSurfaceSupportKHR(dev, i, app->surface, &present);
        if (present) { idx.presentFamily = i; idx.hasPresent = 1; }
        if (idx.hasGraphics && idx.hasPresent) break;
    }
    free(fams);
    return idx;
}`,
  chapter: "Physical devices and queue families › Queue families"
});
D("devExtSupport", {
  title: "Device Extension Check", api: "vkEnumerateDeviceExtensionProperties", level: 2, group: "setup",
  summary: "Confirms the GPU supports VK_KHR_swapchain before you rely on it.",
  code: `static const char *const deviceExtensions[] = { VK_KHR_SWAPCHAIN_EXTENSION_NAME };
#define DEVICE_EXT_COUNT 1

static int checkDeviceExtensionSupport(VkPhysicalDevice dev) {
    uint32_t n;
    vkEnumerateDeviceExtensionProperties(dev, NULL, &n, NULL);
    VkExtensionProperties *avail = malloc(n * sizeof *avail);
    vkEnumerateDeviceExtensionProperties(dev, NULL, &n, avail);
    int ok = 1;
    for (int e = 0; e < DEVICE_EXT_COUNT && ok; e++) {
        int found = 0;
        for (uint32_t i = 0; i < n && !found; i++)
            found = strcmp(deviceExtensions[e], avail[i].extensionName) == 0;
        ok = found;
    }
    free(avail);
    return ok;
}`,
  chapter: "Swap chain › Checking for swap chain support"
});
D("swapSupport", {
  title: "Swap Chain Support Query", api: "vkGetPhysicalDeviceSurface*KHR", level: 2, group: "present",
  summary: "Surface capabilities, supported formats and present modes for this GPU and this window.",
  body: `<p>Having the extension is not enough: the swap chain must be compatible with your surface. The tutorial requires at least one format and one present mode.</p>`,
  code: `typedef struct SwapChainSupport {
    VkSurfaceCapabilitiesKHR caps;
    VkSurfaceFormatKHR *formats;  uint32_t formatCount;
    VkPresentModeKHR  *modes;     uint32_t modeCount;
} SwapChainSupport;

static SwapChainSupport querySwapChainSupport(App *app, VkPhysicalDevice dev) {
    SwapChainSupport s = {0};
    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(dev, app->surface, &s.caps);

    vkGetPhysicalDeviceSurfaceFormatsKHR(dev, app->surface, &s.formatCount, NULL);
    s.formats = malloc(s.formatCount * sizeof *s.formats);
    vkGetPhysicalDeviceSurfaceFormatsKHR(dev, app->surface, &s.formatCount, s.formats);

    vkGetPhysicalDeviceSurfacePresentModesKHR(dev, app->surface, &s.modeCount, NULL);
    s.modes = malloc(s.modeCount * sizeof *s.modes);
    vkGetPhysicalDeviceSurfacePresentModesKHR(dev, app->surface, &s.modeCount, s.modes);
    return s;
}`,
  chapter: "Swap chain › Querying details of swap chain support"
});
D("suitability", {
  title: "isDeviceSuitable", api: "the final verdict", level: 2, group: "setup",
  summary: "Combines every check the tutorial adds: complete queue families, swap chain extension, adequate swap chain, anisotropy.",
  code: `static int isDeviceSuitable(App *app, VkPhysicalDevice dev) {
    QueueFamilyIndices idx = findQueueFamilies(app, dev);
    int extOk = checkDeviceExtensionSupport(dev);

    int swapOk = 0;
    if (extOk) {
        SwapChainSupport s = querySwapChainSupport(app, dev);
        swapOk = s.formatCount > 0 && s.modeCount > 0;
        free(s.formats); free(s.modes);
    }
    VkPhysicalDeviceFeatures f;
    vkGetPhysicalDeviceFeatures(dev, &f);

    return idx.hasGraphics && idx.hasPresent && extOk && swapOk
        && f.samplerAnisotropy;
}`,
  chapter: "Physical devices › Base device suitability checks"
});

/* ---------------- Logical device ---------------- */
D("logicalDevice", {
  title: "Logical Device", api: "VkDevice", level: 1, group: "setup",
  summary: "Your interface to the chosen GPU. You declare which queues, features and device extensions you will use.",
  body: `<p>Most functions from here on take the <code>VkDevice</code> as their first argument. You can create several logical devices from one physical device if you need different setups.</p>`,
  facts: ["Queues are created together with the device and destroyed with it.", "Requesting an unsupported feature or extension makes creation fail."],
  code: `static void createLogicalDevice(App *app) {
    QueueFamilyIndices idx = findQueueFamilies(app, app->physicalDevice);

    uint32_t families[2] = { idx.graphicsFamily, idx.presentFamily };
    uint32_t famCount = (idx.graphicsFamily == idx.presentFamily) ? 1 : 2;
    float priority = 1.0f;
    VkDeviceQueueCreateInfo qci[2];
    for (uint32_t i = 0; i < famCount; i++) {
        qci[i] = (VkDeviceQueueCreateInfo){
            .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
            .queueFamilyIndex = families[i],
            .queueCount = 1,
            .pQueuePriorities = &priority,
        };
    }
    VkPhysicalDeviceFeatures features = { .samplerAnisotropy = VK_TRUE };

    VkDeviceCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
        .queueCreateInfoCount = famCount,
        .pQueueCreateInfos = qci,
        .pEnabledFeatures = &features,
        .enabledExtensionCount = DEVICE_EXT_COUNT,
        .ppEnabledExtensionNames = deviceExtensions,
    };
    if (enableValidationLayers) {   /* ignored by modern drivers */
        ci.enabledLayerCount = VALIDATION_LAYER_COUNT;
        ci.ppEnabledLayerNames = validationLayers;
    }
    VK_CHECK(vkCreateDevice(app->physicalDevice, &ci, NULL, &app->device));
    vkGetDeviceQueue(app->device, idx.graphicsFamily, 0, &app->graphicsQueue);
    vkGetDeviceQueue(app->device, idx.presentFamily, 0, &app->presentQueue);
}`,
  chapter: "Drawing a triangle › Setup › Logical device and queues",
  diagram: {
    nodes: [["queueCreateInfos", 0, 0], ["deviceFeatures", 0, 1.1], ["devExtensions", 0, 2.2], ["deviceCreateInfo", 1.2, 1.1], ["deviceHandle", 2.4, 1.1], ["queues", 3.6, 1.1]],
    edges: [["queueCreateInfos", "deviceCreateInfo", "pQueueCreateInfos"], ["deviceFeatures", "deviceCreateInfo", "pEnabledFeatures"], ["devExtensions", "deviceCreateInfo", "ppEnabledExtensionNames"], ["deviceCreateInfo", "deviceHandle", "vkCreateDevice"], ["deviceHandle", "queues", "vkGetDeviceQueue"]]
  }
});
D("queueCreateInfos", {
  title: "Queue Create Infos", api: "VkDeviceQueueCreateInfo", level: 2, group: "setup",
  summary: "One struct per unique queue family. Each lists how many queues to create and their priorities.",
  body: `<p>If graphics and present are the same family, pass it only once. One queue per family is enough: you can record command buffers on many threads and submit them together.</p>`,
  facts: ["Priorities range 0.0 to 1.0 and are required even for a single queue."],
  code: `float priority = 1.0f;
VkDeviceQueueCreateInfo qci = {
    .sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO,
    .queueFamilyIndex = idx.graphicsFamily,
    .queueCount = 1,
    .pQueuePriorities = &priority,
};`,
  chapter: "Logical device › Specifying the queues to be created"
});
D("deviceFeatures", {
  title: "Device Features", api: "VkPhysicalDeviceFeatures", level: 2, group: "setup",
  summary: "Opt in to optional GPU features you queried earlier. Everything left at VK_FALSE stays off.",
  body: `<p>The tutorial turns on <code>samplerAnisotropy</code> for texture filtering, and optionally <code>sampleRateShading</code> for better MSAA. Forgetting to enable a feature you use is a classic validation error.</p>`,
  code: `VkPhysicalDeviceFeatures features = {
    .samplerAnisotropy = VK_TRUE,
    .sampleRateShading = VK_TRUE,   /* optional, MSAA quality */
};`,
  chapter: "Logical device › Specifying used device features"
});
D("devExtensions", {
  title: "Device Extensions", api: "VK_KHR_swapchain", level: 2, group: "setup",
  summary: "Device-level extensions, such as the swap chain, must be enabled when the device is created.",
  code: `ci.enabledExtensionCount = DEVICE_EXT_COUNT;
ci.ppEnabledExtensionNames = deviceExtensions;   /* { VK_KHR_SWAPCHAIN_EXTENSION_NAME } */`,
  chapter: "Swap chain › Enabling device extensions"
});
D("deviceCreateInfo", {
  title: "Device Create Info", api: "VkDeviceCreateInfo", level: 1, group: "setup",
  summary: "Points at the queue infos, the feature struct, and the extension list.",
  code: `VkDeviceCreateInfo ci = {
    .sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO,
    .queueCreateInfoCount = famCount,
    .pQueueCreateInfos = qci,
    .pEnabledFeatures = &features,
    .enabledExtensionCount = DEVICE_EXT_COUNT,
    .ppEnabledExtensionNames = deviceExtensions,
};`,
  chapter: "Logical device › Creating the logical device"
});
D("deviceHandle", {
  title: "VkDevice Handle", api: "vkCreateDevice / vkDestroyDevice", level: 1, group: "setup",
  summary: "Created from the physical device; destroyed after every object created from it.",
  code: `VK_CHECK(vkCreateDevice(app->physicalDevice, &ci, NULL, &app->device));
/* ... */
vkDestroyDevice(app->device, NULL);`,
  chapter: "Logical device › Creating the logical device"
});
D("queues", {
  title: "Queues", api: "VkQueue", level: 1, group: "draw",
  summary: "Where you submit work. Graphics, present and compute handles are fetched from the device after creation.",
  body: `<p>If the families are the same, the handles will most likely be equal too. Queues need no cleanup.</p>`,
  code: `vkGetDeviceQueue(app->device, idx.graphicsFamily, 0, &app->graphicsQueue);
vkGetDeviceQueue(app->device, idx.presentFamily,  0, &app->presentQueue);
/* compute chapter: */
vkGetDeviceQueue(app->device, idx.graphicsAndComputeFamily, 0, &app->computeQueue);`,
  links: ["queueFamilies", "submit"],
  chapter: "Logical device › Retrieving queue handles"
});
D("msaaCount", {
  title: "Max Sample Count", api: "framebufferColorSampleCounts", level: 3, group: "resource",
  summary: "The highest MSAA sample count supported by both color and depth framebuffers.",
  code: `static VkSampleCountFlagBits getMaxUsableSampleCount(VkPhysicalDevice dev) {
    VkPhysicalDeviceProperties p;
    vkGetPhysicalDeviceProperties(dev, &p);
    VkSampleCountFlags counts = p.limits.framebufferColorSampleCounts
                              & p.limits.framebufferDepthSampleCounts;
    static const VkSampleCountFlagBits order[] = {
        VK_SAMPLE_COUNT_64_BIT, VK_SAMPLE_COUNT_32_BIT, VK_SAMPLE_COUNT_16_BIT,
        VK_SAMPLE_COUNT_8_BIT,  VK_SAMPLE_COUNT_4_BIT,  VK_SAMPLE_COUNT_2_BIT };
    for (int i = 0; i < 6; i++)
        if (counts & order[i]) return order[i];
    return VK_SAMPLE_COUNT_1_BIT;
}`,
  links: ["msaa"],
  chapter: "Multisampling › Getting available sample count"
});
