/* Concept data, part 2: swap chain, render pass, pipeline, drawing, sync, attachments. */

/* ---------------- Swap chain ---------------- */
D("swapchain", {
  title: "Swap Chain", api: "VkSwapchainKHR", level: 2, group: "present",
  summary: "A queue of images owned by the presentation engine. You acquire one, render into it, and hand it back to be shown.",
  body: `<p>Vulkan has no default framebuffer. The swap chain makes sure the image you render to is never the one currently on screen, and it paces presentation with the display's refresh.</p>
  <p>Creating one means choosing three things from what the surface supports: the pixel format, the present mode, and the image size (extent).</p>`,
  facts: ["Request <code>minImageCount + 1</code> images so you rarely wait on the driver.", "Swap chain images are destroyed with the swap chain; their image views are yours to destroy.", "Window resizes make the swap chain out of date: rebuild it."],
  code: `static void createSwapChain(App *app) {
    SwapChainSupport s = querySwapChainSupport(app, app->physicalDevice);
    VkSurfaceFormatKHR fmt  = chooseSwapSurfaceFormat(s.formats, s.formatCount);
    VkPresentModeKHR   mode = chooseSwapPresentMode(s.modes, s.modeCount);
    VkExtent2D         ext  = chooseSwapExtent(app, &s.caps);

    uint32_t count = s.caps.minImageCount + 1;
    if (s.caps.maxImageCount > 0 && count > s.caps.maxImageCount)
        count = s.caps.maxImageCount;           /* 0 means "no maximum" */

    VkSwapchainCreateInfoKHR ci = {
        .sType = VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR,
        .surface = app->surface,
        .minImageCount = count,
        .imageFormat = fmt.format,
        .imageColorSpace = fmt.colorSpace,
        .imageExtent = ext,
        .imageArrayLayers = 1,
        .imageUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
        .imageSharingMode = VK_SHARING_MODE_EXCLUSIVE,
        .preTransform = s.caps.currentTransform,
        .compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
        .presentMode = mode,
        .clipped = VK_TRUE,
        .oldSwapchain = VK_NULL_HANDLE,
    };
    setSharingMode(app, &ci);   /* CONCURRENT if graphics != present */
    VK_CHECK(vkCreateSwapchainKHR(app->device, &ci, NULL, &app->swapChain));

    vkGetSwapchainImagesKHR(app->device, app->swapChain, &app->imageCount, NULL);
    app->swapChainImages = malloc(app->imageCount * sizeof(VkImage));
    vkGetSwapchainImagesKHR(app->device, app->swapChain, &app->imageCount,
                            app->swapChainImages);
    app->swapChainImageFormat = fmt.format;
    app->swapChainExtent = ext;
    free(s.formats); free(s.modes);
}`,
  chapter: "Drawing a triangle › Presentation › Swap chain",
  diagram: {
    nodes: [["swapSupport", 0, 1.1], ["surfaceFormat", 1.2, 0], ["presentMode", 1.2, 1.1], ["swapExtent", 1.2, 2.2], ["sharingMode", 2.4, 0], ["swapCreate", 2.4, 1.1], ["recreateSwapchain", 2.4, 2.3], ["swapImages", 3.6, 0.5], ["imageViews", 3.6, 1.7]],
    edges: [["swapSupport", "surfaceFormat", "formats"], ["swapSupport", "presentMode", "present modes"], ["swapSupport", "swapExtent", "capabilities"], ["surfaceFormat", "swapCreate", ""], ["presentMode", "swapCreate", ""], ["swapExtent", "swapCreate", ""], ["sharingMode", "swapCreate", "queue families"], ["swapCreate", "swapImages", "vkGetSwapchainImagesKHR"], ["swapImages", "imageViews", "one view each"], ["recreateSwapchain", "swapCreate", "rebuilds"]]
  }
});
D("surfaceFormat", {
  title: "Surface Format", api: "VkSurfaceFormatKHR", level: 2, group: "present",
  summary: "Pixel layout plus color space. Prefer B8G8R8A8_SRGB with SRGB_NONLINEAR; otherwise take the first offered.",
  body: `<p>An sRGB format gives more accurate perceived color and matches the color space of typical textures. Shaders then work in linear space and the hardware converts on write.</p>`,
  code: `static VkSurfaceFormatKHR chooseSwapSurfaceFormat(const VkSurfaceFormatKHR *f,
                                                 uint32_t n) {
    for (uint32_t i = 0; i < n; i++)
        if (f[i].format == VK_FORMAT_B8G8R8A8_SRGB &&
            f[i].colorSpace == VK_COLOR_SPACE_SRGB_NONLINEAR_KHR)
            return f[i];
    return f[0];
}`,
  chapter: "Swap chain › Choosing the right settings › Surface format"
});
D("presentMode", {
  title: "Present Mode", api: "VkPresentModeKHR", level: 2, group: "present",
  summary: "The rule for when a finished image reaches the screen. FIFO is always available; MAILBOX is a low-latency, tear-free favorite.",
  body: `<p>Four modes exist. Try them in the simulator below: the app renders frames at a different speed than the display refreshes, and each mode handles the queue differently.</p>`,
  facts: ["IMMEDIATE: shown right away, may tear.", "FIFO: a queue drained once per vertical blank. Like vsync. The app waits when it is full.", "FIFO_RELAXED: like FIFO, but a late frame is shown immediately (may tear).", "MAILBOX: when the queue is full, the newest frame replaces the queued one. Often called triple buffering."],
  widget: "presentModes",
  code: `static VkPresentModeKHR chooseSwapPresentMode(const VkPresentModeKHR *m,
                                              uint32_t n) {
    for (uint32_t i = 0; i < n; i++)
        if (m[i] == VK_PRESENT_MODE_MAILBOX_KHR) return m[i];
    return VK_PRESENT_MODE_FIFO_KHR;   /* guaranteed to exist */
}`,
  chapter: "Swap chain › Choosing the right settings › Presentation mode"
});
D("swapExtent", {
  title: "Swap Extent", api: "VkExtent2D", level: 2, group: "present",
  summary: "The resolution of the swap chain images in pixels. Usually equals the window, but high-DPI screens need care.",
  body: `<p>If <code>currentExtent.width</code> is <code>UINT32_MAX</code>, the window manager lets you choose. Ask GLFW for the framebuffer size in <em>pixels</em> (not screen coordinates) and clamp it to the allowed range.</p>`,
  code: `static uint32_t clampu(uint32_t v, uint32_t lo, uint32_t hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

static VkExtent2D chooseSwapExtent(App *app, const VkSurfaceCapabilitiesKHR *c) {
    if (c->currentExtent.width != UINT32_MAX) return c->currentExtent;
    int w, h;
    glfwGetFramebufferSize(app->window, &w, &h);
    VkExtent2D e = {
        clampu((uint32_t)w, c->minImageExtent.width,  c->maxImageExtent.width),
        clampu((uint32_t)h, c->minImageExtent.height, c->maxImageExtent.height),
    };
    return e;
}`,
  chapter: "Swap chain › Choosing the right settings › Swap extent"
});
D("sharingMode", {
  title: "Image Sharing Mode", api: "VK_SHARING_MODE_*", level: 3, group: "present",
  summary: "EXCLUSIVE images belong to one queue family at a time; CONCURRENT images can be used by several without ownership transfers.",
  body: `<p>When the graphics and present families differ, the tutorial uses CONCURRENT to avoid explicit ownership transfers. When they match (most hardware), EXCLUSIVE is required and fastest.</p>`,
  code: `static void setSharingMode(App *app, VkSwapchainCreateInfoKHR *ci) {
    QueueFamilyIndices idx = findQueueFamilies(app, app->physicalDevice);
    static uint32_t fams[2];
    fams[0] = idx.graphicsFamily; fams[1] = idx.presentFamily;
    if (idx.graphicsFamily != idx.presentFamily) {
        ci->imageSharingMode = VK_SHARING_MODE_CONCURRENT;
        ci->queueFamilyIndexCount = 2;
        ci->pQueueFamilyIndices = fams;
    } else {
        ci->imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
    }
}`,
  chapter: "Swap chain › Creating the swap chain"
});
D("swapCreate", {
  title: "Swap Chain Create Info", api: "VkSwapchainCreateInfoKHR", level: 2, group: "present",
  summary: "The large struct that ties surface, format, extent, usage, transform, alpha and present mode together.",
  facts: ["<code>imageArrayLayers</code> is 1 unless you do stereoscopic 3D.", "<code>clipped = VK_TRUE</code>: skip pixels hidden behind other windows.", "<code>oldSwapchain</code> lets you build a new swap chain while the old one is still in use."],
  code: `VkSwapchainCreateInfoKHR ci = {
    .sType = VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR,
    .surface = app->surface,
    .minImageCount = count,
    .imageFormat = fmt.format,
    .imageColorSpace = fmt.colorSpace,
    .imageExtent = ext,
    .imageArrayLayers = 1,
    .imageUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
    .preTransform = caps.currentTransform,
    .compositeAlpha = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
    .presentMode = mode,
    .clipped = VK_TRUE,
};
VK_CHECK(vkCreateSwapchainKHR(app->device, &ci, NULL, &app->swapChain));`,
  chapter: "Swap chain › Creating the swap chain"
});
D("swapImages", {
  title: "Swap Chain Images", api: "VkImage[]", level: 1, group: "present",
  summary: "The images the implementation created for you. You only asked for a minimum, so query the real count.",
  code: `vkGetSwapchainImagesKHR(app->device, app->swapChain, &app->imageCount, NULL);
app->swapChainImages = malloc(app->imageCount * sizeof(VkImage));
vkGetSwapchainImagesKHR(app->device, app->swapChain, &app->imageCount,
                        app->swapChainImages);`,
  chapter: "Swap chain › Retrieving the swap chain images"
});
D("imageViews", {
  title: "Image Views", api: "VkImageView", level: 1, group: "present",
  summary: "A view describes how to access an image: as 2D, which format, which mip levels and layers, which aspect.",
  body: `<p>You cannot use a <code>VkImage</code> in a pipeline directly. Every swap chain image, texture, depth buffer and MSAA target gets a view. The tutorial generalizes this into one <code>createImageView</code> helper.</p>`,
  facts: ["Component swizzles can remap channels; identity is 0, so zero-initialization gives the default."],
  code: `static VkImageView createImageView(App *app, VkImage image, VkFormat format,
                                   VkImageAspectFlags aspect, uint32_t mipLevels) {
    VkImageViewCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO,
        .image = image,
        .viewType = VK_IMAGE_VIEW_TYPE_2D,
        .format = format,
        .subresourceRange = {
            .aspectMask = aspect,
            .baseMipLevel = 0, .levelCount = mipLevels,
            .baseArrayLayer = 0, .layerCount = 1,
        },
    };
    VkImageView view;
    VK_CHECK(vkCreateImageView(app->device, &ci, NULL, &view));
    return view;
}

static void createImageViews(App *app) {
    app->swapChainImageViews = malloc(app->imageCount * sizeof(VkImageView));
    for (uint32_t i = 0; i < app->imageCount; i++)
        app->swapChainImageViews[i] = createImageView(app, app->swapChainImages[i],
            app->swapChainImageFormat, VK_IMAGE_ASPECT_COLOR_BIT, 1);
}`,
  chapter: "Presentation › Image views"
});
D("recreateSwapchain", {
  title: "Swap Chain Recreation", api: "VK_ERROR_OUT_OF_DATE_KHR", level: 3, group: "present",
  summary: "When the window changes, destroy and rebuild the swap chain and everything sized to it.",
  body: `<p>Recreate after <code>vkAcquireNextImageKHR</code> returns OUT_OF_DATE, or after present returns OUT_OF_DATE / SUBOPTIMAL, or when your resize flag is set. A minimized window has size 0: wait until it is restored.</p>
  <p>The render pass is not rebuilt here, though in theory the format could change (moving to an HDR monitor).</p>`,
  facts: ["Image views, framebuffers, depth and MSAA images depend on the extent and must be rebuilt.", "<code>vkDeviceWaitIdle</code> first: never destroy what the GPU still uses."],
  code: `static void cleanupSwapChain(App *app) {
    vkDestroyImageView(app->device, app->colorImageView, NULL);
    vkDestroyImage(app->device, app->colorImage, NULL);
    vkFreeMemory(app->device, app->colorImageMemory, NULL);
    vkDestroyImageView(app->device, app->depthImageView, NULL);
    vkDestroyImage(app->device, app->depthImage, NULL);
    vkFreeMemory(app->device, app->depthImageMemory, NULL);
    for (uint32_t i = 0; i < app->imageCount; i++) {
        vkDestroyFramebuffer(app->device, app->framebuffers[i], NULL);
        vkDestroyImageView(app->device, app->swapChainImageViews[i], NULL);
    }
    vkDestroySwapchainKHR(app->device, app->swapChain, NULL);
}

static void recreateSwapChain(App *app) {
    int w = 0, h = 0;
    glfwGetFramebufferSize(app->window, &w, &h);
    while (w == 0 || h == 0) {           /* minimized */
        glfwGetFramebufferSize(app->window, &w, &h);
        glfwWaitEvents();
    }
    vkDeviceWaitIdle(app->device);
    cleanupSwapChain(app);
    createSwapChain(app);
    createImageViews(app);
    createColorResources(app);
    createDepthResources(app);
    createFramebuffers(app);
}`,
  chapter: "Swap chain recreation"
});

/* ---------------- Render pass ---------------- */
D("renderPass", {
  title: "Render Pass", api: "VkRenderPass", level: 2, group: "pipeline",
  summary: "Describes the attachments used while rendering: their formats, sample counts, what to do with their contents before and after, and the subpasses that use them.",
  body: `<p>A render pass describes <em>types</em> of images. A framebuffer later binds <em>actual</em> image views to those slots. The pipeline is created against a render pass and works with any compatible one.</p>`,
  facts: ["<code>loadOp</code>: LOAD, CLEAR or DONT_CARE. <code>storeOp</code>: STORE or DONT_CARE.", "Layouts change automatically: <code>initialLayout</code> → subpass layout → <code>finalLayout</code>.", "The attachment index in <code>pColorAttachments</code> is <code>layout(location = 0)</code> in the fragment shader."],
  code: `static void createRenderPass(App *app) {
    VkAttachmentDescription attachments[3] = {
        { /* 0: multisampled color */
            .format = app->swapChainImageFormat, .samples = app->msaaSamples,
            .loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR, .storeOp = VK_ATTACHMENT_STORE_OP_STORE,
            .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
            .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
            .finalLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL },
        { /* 1: depth */
            .format = findDepthFormat(app), .samples = app->msaaSamples,
            .loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR, .storeOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
            .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
            .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
            .finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL },
        { /* 2: resolve target = swap chain image */
            .format = app->swapChainImageFormat, .samples = VK_SAMPLE_COUNT_1_BIT,
            .loadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE, .storeOp = VK_ATTACHMENT_STORE_OP_STORE,
            .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
            .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
            .finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR },
    };
    VkAttachmentReference colorRef   = { 0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL };
    VkAttachmentReference depthRef   = { 1, VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL };
    VkAttachmentReference resolveRef = { 2, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL };

    VkSubpassDescription subpass = {
        .pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS,
        .colorAttachmentCount = 1, .pColorAttachments = &colorRef,
        .pDepthStencilAttachment = &depthRef,
        .pResolveAttachments = &resolveRef,
    };
    VkSubpassDependency dep = makeExternalDependency();

    VkRenderPassCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO,
        .attachmentCount = 3, .pAttachments = attachments,
        .subpassCount = 1, .pSubpasses = &subpass,
        .dependencyCount = 1, .pDependencies = &dep,
    };
    VK_CHECK(vkCreateRenderPass(app->device, &ci, NULL, &app->renderPass));
}`,
  chapter: "Graphics pipeline basics › Render passes",
  diagram: {
    nodes: [["colorAttachment", 0, 0], ["depthAttachment", 0, 1.1], ["resolveAttachment", 0, 2.2], ["imageLayouts", 1.2, 0], ["attachmentRefs", 1.2, 1.1], ["subpass", 2.4, 1.1], ["subpassDependency", 2.4, 2.3], ["framebuffers", 3.6, 1.1]],
    edges: [["colorAttachment", "attachmentRefs", "index 0"], ["depthAttachment", "attachmentRefs", "index 1"], ["resolveAttachment", "attachmentRefs", "index 2"], ["imageLayouts", "colorAttachment", "initial → final"], ["attachmentRefs", "subpass", "used by"], ["subpassDependency", "subpass", "EXTERNAL → 0"], ["subpass", "framebuffers", "compatible"]]
  }
});
D("colorAttachment", {
  title: "Color Attachment", api: "VkAttachmentDescription", level: 2, group: "pipeline",
  summary: "Format and sample count match the swap chain (or the MSAA target). Clear at start, store at end.",
  code: `VkAttachmentDescription colorAttachment = {
    .format = app->swapChainImageFormat,
    .samples = VK_SAMPLE_COUNT_1_BIT,
    .loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR,
    .storeOp = VK_ATTACHMENT_STORE_OP_STORE,
    .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
    .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
    .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
    .finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,  /* COLOR_ATTACHMENT_OPTIMAL with MSAA */
};`,
  chapter: "Render passes › Attachment description"
});
D("depthAttachment", {
  title: "Depth Attachment", api: "VkAttachmentDescription", level: 2, group: "pipeline",
  summary: "Cleared to 1.0 each frame and never stored: depth is not needed after drawing.",
  code: `VkAttachmentDescription depthAttachment = {
    .format = findDepthFormat(app),
    .samples = app->msaaSamples,
    .loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR,
    .storeOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
    .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
    .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
    .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
    .finalLayout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
};`,
  links: ["depth"],
  chapter: "Depth buffering › Render pass"
});
D("resolveAttachment", {
  title: "Resolve Attachment", api: "pResolveAttachments", level: 3, group: "resource",
  summary: "Multisampled images cannot be presented. The subpass resolves the MSAA color image into this single-sample swap chain image.",
  code: `VkAttachmentDescription colorAttachmentResolve = {
    .format = app->swapChainImageFormat,
    .samples = VK_SAMPLE_COUNT_1_BIT,
    .loadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
    .storeOp = VK_ATTACHMENT_STORE_OP_STORE,
    .stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE,
    .stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE,
    .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
    .finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
};
VkAttachmentReference resolveRef = { 2, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL };
subpass.pResolveAttachments = &resolveRef;`,
  links: ["msaa"],
  chapter: "Multisampling › Adding new attachments"
});
D("imageLayouts", {
  title: "Image Layouts", api: "VkImageLayout", level: 3, group: "resource",
  summary: "The same image can be arranged in memory differently depending on its next use. You always declare which layout it is in.",
  facts: ["<code>UNDEFINED</code>: don't care about old contents (may be discarded).", "<code>COLOR_ATTACHMENT_OPTIMAL</code>: render target.", "<code>PRESENT_SRC_KHR</code>: ready to show.", "<code>TRANSFER_DST_OPTIMAL</code> / <code>TRANSFER_SRC_OPTIMAL</code>: copy target / source.", "<code>SHADER_READ_ONLY_OPTIMAL</code>: sampled in a shader.", "<code>GENERAL</code>: works for everything, optimal for nothing."],
  body: `<p>Render passes transition attachments automatically. For anything else, such as textures, you record an image memory barrier.</p>`,
  links: ["pipelineBarrier"],
  chapter: "Render passes › Attachment description; Texture mapping › Images"
});
D("attachmentRefs", {
  title: "Attachment References", api: "VkAttachmentReference", level: 2, group: "pipeline",
  summary: "A subpass refers to attachments by index into the render pass's attachment array, plus the layout it wants during the subpass.",
  code: `VkAttachmentReference colorRef = {
    .attachment = 0,
    .layout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
};
VkAttachmentReference depthRef = {
    .attachment = 1,
    .layout = VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
};`,
  chapter: "Render passes › Subpasses and attachment references"
});
D("subpass", {
  title: "Subpass", api: "VkSubpassDescription", level: 2, group: "pipeline",
  summary: "One rendering step inside the pass. The tutorial uses a single graphics subpass with color, depth and resolve references.",
  body: `<p>Several subpasses (for example a chain of post-processing steps) let the driver reorder work and save memory bandwidth, which matters a lot on tiled mobile GPUs. A subpass can use only one depth attachment.</p>`,
  facts: ["Other slots: <code>pInputAttachments</code>, <code>pResolveAttachments</code>, <code>pDepthStencilAttachment</code>, <code>pPreserveAttachments</code>."],
  code: `VkSubpassDescription subpass = {
    .pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS,
    .colorAttachmentCount = 1,
    .pColorAttachments = &colorRef,
    .pDepthStencilAttachment = &depthRef,
};`,
  chapter: "Render passes › Subpasses and attachment references"
});
D("subpassDependency", {
  title: "Subpass Dependency", api: "VkSubpassDependency", level: 4, group: "sync",
  summary: "Delays the render pass's automatic layout transition until the swap chain image is actually available and the previous frame's depth writes are done.",
  body: `<p>The implicit dependency at the start of a render pass assumes the image is ready at the top of the pipe, but the acquire semaphore is only waited on at <code>COLOR_ATTACHMENT_OUTPUT</code>. This explicit dependency from <code>VK_SUBPASS_EXTERNAL</code> makes the transition wait for that stage, and covers the depth buffer's early fragment tests (its clear is a write).</p>`,
  facts: ["<code>dstSubpass</code> must be greater than <code>srcSubpass</code> unless one is EXTERNAL.", "Alternative: wait on <code>TOP_OF_PIPE</code> in the submit's wait stage."],
  code: `static VkSubpassDependency makeExternalDependency(void) {
    return (VkSubpassDependency){
        .srcSubpass = VK_SUBPASS_EXTERNAL,
        .dstSubpass = 0,
        .srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT |
                        VK_PIPELINE_STAGE_LATE_FRAGMENT_TESTS_BIT,
        .srcAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT |
                         VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT,
        .dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT |
                        VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT,
        .dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT |
                         VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT,
    };
}`,
  chapter: "Rendering and presentation › Subpass dependencies"
});

/* ---------------- Graphics pipeline ---------------- */
D("pipeline", {
  title: "Graphics Pipeline", api: "VkPipeline", level: 2, group: "pipeline",
  summary: "An almost immutable object holding shaders and every fixed-function setting. Changing a shader or blend mode means another pipeline.",
  body: `<p>Because everything is known in advance, the driver can compile and optimize the whole pipeline at creation time, and switching pipelines at draw time is explicit and predictable. Only a few states (viewport, scissor, line width, blend constants) can be made dynamic.</p>`,
  facts: ["There is no default state: you must fill every struct, even blending.", "Shader modules can be destroyed right after the pipeline is created.", "A pipeline cache can speed up creation across runs."],
  code: `VkGraphicsPipelineCreateInfo pi = {
    .sType = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO,
    .stageCount = 2,
    .pStages = shaderStages,
    .pVertexInputState = &vertexInput,
    .pInputAssemblyState = &inputAssembly,
    .pViewportState = &viewportState,
    .pRasterizationState = &rasterizer,
    .pMultisampleState = &multisampling,
    .pDepthStencilState = &depthStencil,
    .pColorBlendState = &colorBlending,
    .pDynamicState = &dynamicState,
    .layout = app->pipelineLayout,
    .renderPass = app->renderPass,
    .subpass = 0,
    .basePipelineHandle = VK_NULL_HANDLE,
    .basePipelineIndex = -1,
};
VK_CHECK(vkCreateGraphicsPipelines(app->device, VK_NULL_HANDLE, 1, &pi, NULL,
                                   &app->graphicsPipeline));
vkDestroyShaderModule(app->device, fragModule, NULL);
vkDestroyShaderModule(app->device, vertModule, NULL);`,
  chapter: "Graphics pipeline basics",
  diagram: {
    labels: "hover",
    nodes: [["pipelineStages", 0, 0], ["shaders", 0, 1.1], ["vertexInput", 0, 2.2], ["inputAssembly", 0, 3.3],
            ["dynamicState", 1.2, 0], ["viewportScissor", 1.2, 1.1], ["rasterizer", 1.2, 2.2], ["multisampleState", 1.2, 3.3],
            ["depthStencilState", 2.4, 0], ["colorBlend", 2.4, 1.1], ["pipelineLayout", 2.4, 2.2], ["renderPass", 2.4, 3.3],
            ["pipelineCreate", 3.6, 1.65]],
    edges: [["pipelineStages", "shaders", "programmable"], ["shaders", "pipelineCreate", "pStages"], ["vertexInput", "pipelineCreate", "pVertexInputState"], ["inputAssembly", "pipelineCreate", "pInputAssemblyState"],
            ["dynamicState", "pipelineCreate", "pDynamicState"], ["viewportScissor", "pipelineCreate", "pViewportState"], ["rasterizer", "pipelineCreate", "pRasterizationState"], ["multisampleState", "pipelineCreate", "pMultisampleState"],
            ["depthStencilState", "pipelineCreate", "pDepthStencilState"], ["colorBlend", "pipelineCreate", "pColorBlendState"], ["pipelineLayout", "pipelineCreate", "layout"], ["renderPass", "pipelineCreate", "renderPass"], ["dynamicState", "viewportScissor", "makes dynamic"]]
  }
});
D("pipelineStages", {
  title: "Pipeline Stages", api: "vertices → pixels", level: 1, group: "pipeline",
  summary: "The path data takes from vertex buffers to the framebuffer. Some stages are programmable shaders; the rest are fixed functions you configure.",
  body: `<p>Programmable stages run your SPIR-V code on many GPU cores in parallel. Fixed-function stages only take parameters. Tessellation and geometry are optional; a depth-only pass can even skip the fragment shader.</p>`,
  chapter: "Graphics pipeline basics › Introduction",
  diagram: {
    nodes: [["stIA", 0, 0], ["stVS", 1, 0], ["stTess", 2, 0], ["stGeom", 3, 0], ["stRaster", 3, 1.25], ["stFS", 2, 1.25], ["stBlend", 1, 1.25], ["framebuffers", 0, 1.25]],
    edges: [["stIA", "stVS", "vertices"], ["stVS", "stTess", "clip coords"], ["stTess", "stGeom", "patches"], ["stGeom", "stRaster", "primitives"], ["stRaster", "stFS", "fragments"], ["stFS", "stBlend", "colors + depth"], ["stBlend", "framebuffers", "pixels"]]
  }
});
D("stIA", { title: "Input Assembler", api: "fixed function", level: 1, group: "pipeline", summary: "Collects raw vertex data from the bound buffers, optionally using an index buffer to reuse vertices, and groups it into primitives.", links: ["vertexInput", "inputAssembly", "indexBuffer"], chapter: "Graphics pipeline basics › Introduction" });
D("stVS", { title: "Vertex Shader", api: "programmable", level: 1, group: "pipeline", summary: "Runs once per vertex. Transforms positions to clip space and passes per-vertex data (color, UVs) down the pipeline.", links: ["shaders"], chapter: "Graphics pipeline basics › Introduction" });
D("stTess", { title: "Tessellation", api: "programmable, optional", level: 3, group: "pipeline", summary: "Subdivides geometry by rules you define, for example to add detail to brick walls and stairs when the camera is close.", chapter: "Graphics pipeline basics › Introduction" });
D("stGeom", { title: "Geometry Shader", api: "programmable, optional", level: 3, group: "pipeline", summary: "Runs per primitive and can discard it or emit more primitives. Flexible but slow on most GPUs, so rarely used today.", chapter: "Graphics pipeline basics › Introduction" });
D("stRaster", { title: "Rasterization", api: "fixed function", level: 1, group: "pipeline", summary: "Turns primitives into fragments, discards those off-screen, interpolates vertex outputs, and runs early depth tests.", links: ["rasterizer"], chapter: "Graphics pipeline basics › Introduction" });
D("stFS", { title: "Fragment Shader", api: "programmable", level: 1, group: "pipeline", summary: "Runs per surviving fragment and decides its color (and optionally depth) using interpolated data such as texture coordinates.", links: ["shaders", "textureShader"], chapter: "Graphics pipeline basics › Introduction" });
D("stBlend", { title: "Color Blending", api: "fixed function", level: 1, group: "pipeline", summary: "Mixes the new fragment color with what is already in the framebuffer: overwrite, add, or blend by transparency.", links: ["colorBlend"], chapter: "Graphics pipeline basics › Introduction" });

D("shaders", {
  title: "Shader Modules", api: "VkShaderModule", level: 2, group: "pipeline",
  summary: "Vulkan takes shaders as SPIR-V bytecode. You write GLSL, compile it offline with glslc, load the bytes and wrap them in a module.",
  body: `<p>A bytecode format means simpler vendor compilers and fewer "works on my GPU" shader bugs. Shader modules are thin wrappers: real compilation to GPU code happens when the pipeline is created.</p>`,
  chapter: "Graphics pipeline basics › Shader modules",
  code: `/* compile.bat */
/* C:/VulkanSDK/x.x.x.x/Bin/glslc.exe shader.vert -o vert.spv */
/* C:/VulkanSDK/x.x.x.x/Bin/glslc.exe shader.frag -o frag.spv */`,
  diagram: {
    nodes: [["glslVert", 0, 0], ["glslFrag", 0, 1.2], ["glslc", 1.2, 0.6], ["readFile", 2.4, 0.6], ["shaderModule", 3.6, 0.6], ["stageInfo", 3.6, 1.8]],
    edges: [["glslVert", "glslc", "shader.vert"], ["glslFrag", "glslc", "shader.frag"], ["glslc", "readFile", "*.spv"], ["readFile", "shaderModule", "uint32_t words"], ["shaderModule", "stageInfo", "module + \"main\""]]
  }
});
D("glslVert", {
  title: "Vertex Shader (GLSL)", api: "shader.vert", level: 2, group: "pipeline",
  summary: "Reads per-vertex attributes, applies model-view-projection from a uniform buffer, and passes color and UVs on.",
  body: `<p>The first version hardcodes three positions and indexes them with <code>gl_VertexIndex</code>. This is the final version from the textured-model chapters. <code>layout(location = N)</code> links attributes to your vertex description; 64-bit types such as <code>dvec3</code> take two locations.</p>`,
  lang: "glsl",
  code: `#version 450

layout(binding = 0) uniform UniformBufferObject {
    mat4 model;
    mat4 view;
    mat4 proj;
} ubo;

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inColor;
layout(location = 2) in vec2 inTexCoord;

layout(location = 0) out vec3 fragColor;
layout(location = 1) out vec2 fragTexCoord;

void main() {
    gl_Position = ubo.proj * ubo.view * ubo.model * vec4(inPosition, 1.0);
    fragColor = inColor;
    fragTexCoord = inTexCoord;
}`,
  chapter: "Shader modules › Vertex shader"
});
D("glslFrag", {
  title: "Fragment Shader (GLSL)", api: "shader.frag", level: 2, group: "pipeline",
  summary: "Receives interpolated values and writes one color per framebuffer attachment.",
  body: `<p>There is no built-in color output: you declare <code>layout(location = 0) out vec4</code>, which maps to color attachment 0 of the subpass.</p>`,
  lang: "glsl",
  code: `#version 450

layout(binding = 1) uniform sampler2D texSampler;

layout(location = 0) in vec3 fragColor;
layout(location = 1) in vec2 fragTexCoord;

layout(location = 0) out vec4 outColor;

void main() {
    outColor = texture(texSampler, fragTexCoord);
}`,
  chapter: "Shader modules › Fragment shader"
});
D("glslc", {
  title: "glslc Compiler", api: "GLSL → SPIR-V", level: 1, group: "pipeline",
  summary: "Google's compiler from the Vulkan SDK, with GCC-style flags. Syntax errors report line numbers like any compiler.",
  body: `<p>Compiling on the command line is simplest. <code>libshaderc</code> from the SDK can also compile at runtime. Remember to recompile after every shader edit.</p>`,
  lang: "sh",
  code: `glslc shaders/shader.vert -o shaders/vert.spv
glslc shaders/shader.frag -o shaders/frag.spv
glslc shaders/shader.comp -o shaders/comp.spv`,
  chapter: "Shader modules › Compiling the shaders"
});
D("readFile", {
  title: "Loading SPIR-V", api: "fopen / fread", level: 1, group: "pipeline",
  summary: "Read the whole binary file into memory. The code pointer must be 4-byte aligned, which malloc guarantees.",
  code: `static uint32_t *readFile(const char *path, size_t *outSize) {
    FILE *f = fopen(path, "rb");
    if (!f) die("failed to open file");
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint32_t *buf = malloc((size_t)size);   /* malloc is suitably aligned */
    if (fread(buf, 1, (size_t)size, f) != (size_t)size) die("short read");
    fclose(f);
    *outSize = (size_t)size;
    return buf;
}`,
  chapter: "Shader modules › Loading a shader"
});
D("shaderModule", {
  title: "Create Shader Module", api: "vkCreateShaderModule", level: 2, group: "pipeline",
  summary: "codeSize is in bytes; pCode is a uint32_t pointer. Free the buffer right after creation.",
  code: `static VkShaderModule createShaderModule(App *app, const uint32_t *code,
                                         size_t size) {
    VkShaderModuleCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO,
        .codeSize = size,
        .pCode = code,
    };
    VkShaderModule m;
    VK_CHECK(vkCreateShaderModule(app->device, &ci, NULL, &m));
    return m;
}`,
  chapter: "Shader modules › Creating shader modules"
});
D("stageInfo", {
  title: "Shader Stage Info", api: "VkPipelineShaderStageCreateInfo", level: 2, group: "pipeline",
  summary: "Assigns a module to a pipeline stage and names the entry point function.",
  body: `<p>One module can hold several entry points. <code>pSpecializationInfo</code> sets shader constants at pipeline creation, letting the compiler remove branches.</p>`,
  code: `VkPipelineShaderStageCreateInfo shaderStages[2] = {
    { .sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
      .stage = VK_SHADER_STAGE_VERTEX_BIT,
      .module = vertModule, .pName = "main" },
    { .sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
      .stage = VK_SHADER_STAGE_FRAGMENT_BIT,
      .module = fragModule, .pName = "main" },
};`,
  chapter: "Shader modules › Shader stage creation"
});
D("vertexInput", {
  title: "Vertex Input State", api: "VkPipelineVertexInputStateCreateInfo", level: 2, group: "pipeline",
  summary: "Tells the pipeline how vertex buffer bytes map to shader inputs: bindings (stride, rate) and attributes (location, format, offset).",
  body: `<p>With hardcoded vertices in the shader this struct is empty. Once you use a vertex buffer, point it at your binding and attribute descriptions.</p>`,
  code: `VkVertexInputBindingDescription binding = vertexBindingDescription();
VkVertexInputAttributeDescription attrs[3];
vertexAttributeDescriptions(attrs);

VkPipelineVertexInputStateCreateInfo vertexInput = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO,
    .vertexBindingDescriptionCount = 1,
    .pVertexBindingDescriptions = &binding,
    .vertexAttributeDescriptionCount = 3,
    .pVertexAttributeDescriptions = attrs,
};`,
  links: ["vertexDescription"],
  chapter: "Fixed functions › Vertex input; Vertex buffers › Pipeline vertex input"
});
D("inputAssembly", {
  title: "Input Assembly", api: "VkPipelineInputAssemblyStateCreateInfo", level: 1, group: "pipeline",
  summary: "Which primitives to build from vertices (points, lines, triangles, strips) and whether primitive restart is on.",
  facts: ["Primitive restart uses index 0xFFFF / 0xFFFFFFFF to break strips."],
  code: `VkPipelineInputAssemblyStateCreateInfo inputAssembly = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO,
    .topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
    .primitiveRestartEnable = VK_FALSE,
};`,
  chapter: "Fixed functions › Input assembly"
});
D("dynamicState", {
  title: "Dynamic State", api: "VkPipelineDynamicStateCreateInfo", level: 2, group: "pipeline",
  summary: "Leaves a few states out of the pipeline so you set them in the command buffer instead. Viewport and scissor are the common pair.",
  body: `<p>Dynamic viewport and scissor cost nothing on any implementation, and they mean the pipeline need not be rebuilt when the window is resized.</p>`,
  code: `VkDynamicState dynamicStates[] = {
    VK_DYNAMIC_STATE_VIEWPORT,
    VK_DYNAMIC_STATE_SCISSOR,
};
VkPipelineDynamicStateCreateInfo dynamicState = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO,
    .dynamicStateCount = 2,
    .pDynamicStates = dynamicStates,
};`,
  chapter: "Fixed functions › Dynamic state"
});
D("viewportScissor", {
  title: "Viewport & Scissor", api: "VkViewport / VkRect2D", level: 1, group: "pipeline",
  summary: "The viewport maps the image onto the framebuffer region (a transform). The scissor discards pixels outside a rectangle (a filter).",
  body: `<p>With dynamic state you only give the counts at pipeline creation and set the actual values while recording. Use the swap chain extent, which may differ from the window size.</p>`,
  code: `VkPipelineViewportStateCreateInfo viewportState = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO,
    .viewportCount = 1,
    .scissorCount = 1,
};

/* while recording: */
VkViewport vp = {
    .x = 0.0f, .y = 0.0f,
    .width  = (float)app->swapChainExtent.width,
    .height = (float)app->swapChainExtent.height,
    .minDepth = 0.0f, .maxDepth = 1.0f,
};
vkCmdSetViewport(cmd, 0, 1, &vp);
VkRect2D scissor = { {0, 0}, app->swapChainExtent };
vkCmdSetScissor(cmd, 0, 1, &scissor);`,
  chapter: "Fixed functions › Viewports and scissors"
});
D("rasterizer", {
  title: "Rasterizer", api: "VkPipelineRasterizationStateCreateInfo", level: 2, group: "pipeline",
  summary: "Fill mode, line width, face culling, winding order and depth bias.",
  body: `<p>After flipping Y in the projection matrix, triangles wind counter-clockwise, so <code>frontFace</code> must be COUNTER_CLOCKWISE or back-face culling hides everything. That is the classic "my square vanished" bug.</p>`,
  facts: ["LINE or POINT polygon mode needs a GPU feature.", "Lines wider than 1.0 need <code>wideLines</code>.", "<code>depthClampEnable</code> is useful for shadow maps."],
  code: `VkPipelineRasterizationStateCreateInfo rasterizer = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO,
    .depthClampEnable = VK_FALSE,
    .rasterizerDiscardEnable = VK_FALSE,
    .polygonMode = VK_POLYGON_MODE_FILL,
    .lineWidth = 1.0f,
    .cullMode = VK_CULL_MODE_BACK_BIT,
    .frontFace = VK_FRONT_FACE_COUNTER_CLOCKWISE,
    .depthBiasEnable = VK_FALSE,
};`,
  chapter: "Fixed functions › Rasterizer; Descriptor pool and sets › Using descriptor sets"
});
D("multisampleState", {
  title: "Multisample State", api: "VkPipelineMultisampleStateCreateInfo", level: 2, group: "pipeline",
  summary: "Sample count for rasterization and optional sample shading. Must match the render pass attachments.",
  code: `VkPipelineMultisampleStateCreateInfo multisampling = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO,
    .rasterizationSamples = app->msaaSamples,
    .sampleShadingEnable = VK_TRUE,   /* optional quality boost */
    .minSampleShading = 0.2f,
};`,
  links: ["msaa"],
  chapter: "Fixed functions › Multisampling; Multisampling"
});
D("depthStencilState", {
  title: "Depth & Stencil State", api: "VkPipelineDepthStencilStateCreateInfo", level: 2, group: "pipeline",
  summary: "Turns depth testing and writing on. Fragments with a smaller depth (closer) pass.",
  body: `<p>Required whenever the render pass has a depth attachment. Before depth buffering you pass <code>NULL</code>.</p>`,
  code: `VkPipelineDepthStencilStateCreateInfo depthStencil = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO,
    .depthTestEnable = VK_TRUE,
    .depthWriteEnable = VK_TRUE,
    .depthCompareOp = VK_COMPARE_OP_LESS,
    .depthBoundsTestEnable = VK_FALSE,
    .minDepthBounds = 0.0f, .maxDepthBounds = 1.0f,
    .stencilTestEnable = VK_FALSE,
};`,
  links: ["depth"],
  chapter: "Depth buffering › Depth and stencil state"
});
D("colorBlend", {
  title: "Color Blending", api: "VkPipelineColorBlendStateCreateInfo", level: 2, group: "pipeline",
  summary: "Per-attachment blend equations plus global settings. Disabled blending writes the fragment color as is.",
  body: `<p>With <code>blendEnable</code>: <code>rgb = srcFactor*new OP dstFactor*old</code>. Standard alpha blending uses SRC_ALPHA and ONE_MINUS_SRC_ALPHA. Turning on <code>logicOpEnable</code> switches to bitwise combination and disables blending for every attachment.</p>`,
  code: `VkPipelineColorBlendAttachmentState blendAttachment = {
    .colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
                      VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT,
    .blendEnable = VK_FALSE,
    /* alpha blending instead:
    .blendEnable = VK_TRUE,
    .srcColorBlendFactor = VK_BLEND_FACTOR_SRC_ALPHA,
    .dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA,
    .colorBlendOp = VK_BLEND_OP_ADD,
    .srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE,
    .dstAlphaBlendFactor = VK_BLEND_FACTOR_ZERO,
    .alphaBlendOp = VK_BLEND_OP_ADD, */
};
VkPipelineColorBlendStateCreateInfo colorBlending = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO,
    .logicOpEnable = VK_FALSE,
    .attachmentCount = 1,
    .pAttachments = &blendAttachment,
};`,
  chapter: "Fixed functions › Color blending"
});
D("pipelineLayout", {
  title: "Pipeline Layout", api: "VkPipelineLayout", level: 2, group: "pipeline",
  summary: "Declares which descriptor set layouts and push constant ranges the shaders use. Required even when empty.",
  code: `VkPipelineLayoutCreateInfo li = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
    .setLayoutCount = 1,
    .pSetLayouts = &app->descriptorSetLayout,
    .pushConstantRangeCount = 0,
};
VK_CHECK(vkCreatePipelineLayout(app->device, &li, NULL, &app->pipelineLayout));`,
  links: ["descriptorSetLayout"],
  chapter: "Fixed functions › Pipeline layout"
});
D("pipelineCreate", {
  title: "Create the Pipeline", api: "vkCreateGraphicsPipelines", level: 2, group: "pipeline",
  summary: "Combines shader stages, fixed-function state, layout and render pass into one VkPipeline.",
  body: `<p>The function can create many pipelines at once and accepts an optional <code>VkPipelineCache</code>. Pipeline derivatives (<code>basePipelineHandle</code>) only matter with <code>VK_PIPELINE_CREATE_DERIVATIVE_BIT</code>.</p>`,
  code: `VK_CHECK(vkCreateGraphicsPipelines(app->device, VK_NULL_HANDLE, 1, &pi, NULL,
                                   &app->graphicsPipeline));
/* cleanup */
vkDestroyPipeline(app->device, app->graphicsPipeline, NULL);
vkDestroyPipelineLayout(app->device, app->pipelineLayout, NULL);`,
  chapter: "Graphics pipeline basics › Conclusion"
});

/* ---------------- Framebuffers ---------------- */
D("framebuffers", {
  title: "Framebuffers", api: "VkFramebuffer", level: 2, group: "draw",
  summary: "Bind real image views to the render pass's attachment slots. One framebuffer per swap chain image.",
  body: `<p>Which framebuffer you use depends on which image the swap chain hands you, so create one for each. The MSAA color and depth images are shared by all of them, because only one frame renders at a time within a subpass.</p>`,
  facts: ["Attachment order must match the render pass's <code>pAttachments</code> order.", "Destroy before the image views and render pass."],
  code: `static void createFramebuffers(App *app) {
    app->framebuffers = malloc(app->imageCount * sizeof(VkFramebuffer));
    for (uint32_t i = 0; i < app->imageCount; i++) {
        VkImageView attachments[3] = {
            app->colorImageView,            /* 0: MSAA color  */
            app->depthImageView,            /* 1: depth       */
            app->swapChainImageViews[i],    /* 2: resolve     */
        };
        VkFramebufferCreateInfo ci = {
            .sType = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO,
            .renderPass = app->renderPass,
            .attachmentCount = 3,
            .pAttachments = attachments,
            .width = app->swapChainExtent.width,
            .height = app->swapChainExtent.height,
            .layers = 1,
        };
        VK_CHECK(vkCreateFramebuffer(app->device, &ci, NULL, &app->framebuffers[i]));
    }
}`,
  chapter: "Drawing › Framebuffers"
});

/* ---------------- Commands ---------------- */
D("commands", {
  title: "Command Buffers", api: "VkCommandPool / VkCommandBuffer", level: 2, group: "draw",
  summary: "You do not call draw functions directly. You record vkCmd* commands into a buffer and submit the whole buffer to a queue.",
  body: `<p>Recording up front lets the driver process everything together, and lets you record on several threads. Command buffers come from a pool tied to one queue family.</p>`,
  chapter: "Drawing › Command buffers",
  code: `vkResetCommandBuffer(app->commandBuffers[app->currentFrame], 0);
recordCommandBuffer(app, app->commandBuffers[app->currentFrame], imageIndex);`,
  diagram: {
    nodes: [["commandPool", 0, 0.5], ["commandBuffers", 1.2, 0.5], ["singleTime", 1.2, 1.8], ["recordCommands", 2.4, 0.5], ["drawCommands", 2.4, 1.8], ["submit", 3.6, 0.5]],
    edges: [["commandPool", "commandBuffers", "vkAllocateCommandBuffers"], ["commandPool", "singleTime", "short-lived"], ["commandBuffers", "recordCommands", "vkBeginCommandBuffer"], ["recordCommands", "drawCommands", "inside render pass"], ["recordCommands", "submit", "vkEndCommandBuffer"], ["singleTime", "submit", "wait idle"]]
  }
});
D("commandPool", {
  title: "Command Pool", api: "VkCommandPool", level: 2, group: "draw",
  summary: "Manages command buffer memory for one queue family. RESET_COMMAND_BUFFER lets you re-record buffers individually.",
  facts: ["<code>TRANSIENT_BIT</code>: hint that buffers are short-lived.", "Freeing the pool frees all its command buffers."],
  code: `QueueFamilyIndices idx = findQueueFamilies(app, app->physicalDevice);
VkCommandPoolCreateInfo ci = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO,
    .flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT,
    .queueFamilyIndex = idx.graphicsFamily,
};
VK_CHECK(vkCreateCommandPool(app->device, &ci, NULL, &app->commandPool));`,
  chapter: "Command buffers › Command pools"
});
D("commandBuffers", {
  title: "Allocate Command Buffers", api: "vkAllocateCommandBuffers", level: 2, group: "draw",
  summary: "One primary command buffer per frame in flight. Secondary buffers can be called from primaries.",
  code: `VkCommandBufferAllocateInfo ai = {
    .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
    .commandPool = app->commandPool,
    .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
    .commandBufferCount = MAX_FRAMES_IN_FLIGHT,
};
VK_CHECK(vkAllocateCommandBuffers(app->device, &ai, app->commandBuffers));`,
  chapter: "Command buffers › Command buffer allocation; Frames in flight"
});
D("recordCommands", {
  title: "Record a Frame", api: "recordCommandBuffer", level: 2, group: "draw",
  summary: "Begin the buffer, begin the render pass on this image's framebuffer, bind and draw, end the pass, end the buffer.",
  body: `<p><code>vkCmd*</code> functions return nothing; errors surface only at <code>vkEndCommandBuffer</code> or via validation. Calling <code>vkBeginCommandBuffer</code> on a recorded buffer implicitly resets it.</p>`,
  facts: ["Clear values follow attachment order: color, depth (1.0 = far).", "<code>VK_SUBPASS_CONTENTS_INLINE</code>: commands live in this primary buffer."],
  code: `static void recordCommandBuffer(App *app, VkCommandBuffer cmd, uint32_t imageIndex) {
    VkCommandBufferBeginInfo bi = { .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO };
    VK_CHECK(vkBeginCommandBuffer(cmd, &bi));

    VkClearValue clears[2] = {
        { .color = {{ 0.0f, 0.0f, 0.0f, 1.0f }} },
        { .depthStencil = { 1.0f, 0 } },
    };
    VkRenderPassBeginInfo rp = {
        .sType = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO,
        .renderPass = app->renderPass,
        .framebuffer = app->framebuffers[imageIndex],
        .renderArea = { {0, 0}, app->swapChainExtent },
        .clearValueCount = 2,
        .pClearValues = clears,
    };
    vkCmdBeginRenderPass(cmd, &rp, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS, app->graphicsPipeline);
    setViewportAndScissor(app, cmd);
    recordDraw(app, cmd);
    vkCmdEndRenderPass(cmd);
    VK_CHECK(vkEndCommandBuffer(cmd));
}`,
  chapter: "Command buffers › Command buffer recording"
});
D("drawCommands", {
  title: "Bind & Draw", api: "vkCmdBind* / vkCmdDrawIndexed", level: 2, group: "draw",
  summary: "Bind vertex buffer, index buffer and the frame's descriptor set, then draw the indices.",
  body: `<p>The first triangle used <code>vkCmdDraw(cmd, 3, 1, 0, 0)</code>: 3 vertices, 1 instance, first vertex 0, first instance 0. With an index buffer you switch to <code>vkCmdDrawIndexed</code>.</p>`,
  code: `static void recordDraw(App *app, VkCommandBuffer cmd) {
    VkBuffer vbs[] = { app->vertexBuffer };
    VkDeviceSize offsets[] = { 0 };
    vkCmdBindVertexBuffers(cmd, 0, 1, vbs, offsets);
    vkCmdBindIndexBuffer(cmd, app->indexBuffer, 0, VK_INDEX_TYPE_UINT32);
    vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS,
                            app->pipelineLayout, 0, 1,
                            &app->descriptorSets[app->currentFrame], 0, NULL);
    vkCmdDrawIndexed(cmd, app->indexCount, 1, 0, 0, 0);
}`,
  links: ["vertexBuffer", "indexBuffer", "descriptorSets"],
  chapter: "Command buffers › Basic drawing commands; Index buffer; Descriptor sets"
});
D("singleTime", {
  title: "One-Time Commands", api: "beginSingleTimeCommands", level: 2, group: "draw",
  summary: "Helpers for setup work (copies, layout transitions): allocate, record, submit, wait idle, free.",
  body: `<p>Waiting for the queue after each helper is simple but slow. Real apps batch these into one command buffer and submit asynchronously, using fences to wait for several transfers at once.</p>`,
  code: `static VkCommandBuffer beginSingleTimeCommands(App *app) {
    VkCommandBufferAllocateInfo ai = {
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO,
        .level = VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        .commandPool = app->commandPool,
        .commandBufferCount = 1,
    };
    VkCommandBuffer cmd;
    vkAllocateCommandBuffers(app->device, &ai, &cmd);
    VkCommandBufferBeginInfo bi = {
        .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO,
        .flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT,
    };
    vkBeginCommandBuffer(cmd, &bi);
    return cmd;
}

static void endSingleTimeCommands(App *app, VkCommandBuffer cmd) {
    vkEndCommandBuffer(cmd);
    VkSubmitInfo si = {
        .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
        .commandBufferCount = 1, .pCommandBuffers = &cmd,
    };
    vkQueueSubmit(app->graphicsQueue, 1, &si, VK_NULL_HANDLE);
    vkQueueWaitIdle(app->graphicsQueue);
    vkFreeCommandBuffers(app->device, app->commandPool, 1, &cmd);
}`,
  chapter: "Images › Layout transitions"
});
D("submit", {
  title: "Queue Submit", api: "vkQueueSubmit", level: 3, group: "sync",
  summary: "Hands command buffers to a queue with semaphores to wait on (and at which stage), semaphores to signal, and an optional fence.",
  body: `<p>Waiting at <code>COLOR_ATTACHMENT_OUTPUT</code> means the GPU may already run the vertex shader before the swap chain image is available. Each entry in <code>pWaitDstStageMask</code> pairs with the semaphore at the same index.</p>`,
  code: `VkSemaphore waitSems[]  = { app->imageAvailable[app->currentFrame] };
VkPipelineStageFlags waitStages[] = { VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT };
VkSemaphore signalSems[] = { app->renderFinished[app->currentFrame] };

VkSubmitInfo si = {
    .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
    .waitSemaphoreCount = 1,
    .pWaitSemaphores = waitSems,
    .pWaitDstStageMask = waitStages,
    .commandBufferCount = 1,
    .pCommandBuffers = &app->commandBuffers[app->currentFrame],
    .signalSemaphoreCount = 1,
    .pSignalSemaphores = signalSems,
};
VK_CHECK(vkQueueSubmit(app->graphicsQueue, 1, &si, app->inFlight[app->currentFrame]));`,
  chapter: "Rendering and presentation › Submitting the command buffer"
});

/* ---------------- Synchronization ---------------- */
D("sync", {
  title: "Synchronization", api: "VkSemaphore / VkFence / barriers", level: 3, group: "sync",
  summary: "GPU work runs asynchronously and in no guaranteed order. You order it explicitly: semaphores between GPU operations, fences to let the CPU wait.",
  body: `<p>Acquire, draw and present each start with one call that returns immediately. Each depends on the one before, so semaphores chain them on the GPU. A fence stops the CPU from re-recording a command buffer the GPU is still reading.</p>`,
  facts: ["Semaphores: GPU ↔ GPU, reset automatically after a wait.", "Fences: GPU → CPU, reset manually with <code>vkResetFences</code>.", "Pipeline barriers and subpass dependencies order memory access inside a queue."],
  chapter: "Rendering and presentation › Synchronization",
  diagram: {
    nodes: [["semaphores", 0, 0], ["fences", 0, 1.2], ["framesInFlight", 1.3, 0.6], ["subpassDependency", 2.6, 0], ["pipelineBarrier", 2.6, 1.2], ["computeSync", 1.3, 1.9]],
    edges: [["semaphores", "framesInFlight", "one set per frame"], ["fences", "framesInFlight", "one per frame"], ["semaphores", "computeSync", "compute → vertex"], ["subpassDependency", "pipelineBarrier", "same idea, inside a pass"]]
  }
});
D("semaphores", {
  title: "Semaphores", api: "VkSemaphore", level: 3, group: "sync",
  summary: "Order queue operations on the GPU. Operation A signals S; operation B waits on S before it starts. The CPU is never blocked.",
  body: `<p>The tutorial uses binary semaphores: one for "image acquired", one for "rendering finished". Timeline semaphores also exist but are not covered.</p>`,
  code: `VkSemaphoreCreateInfo si = { .sType = VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO };
VK_CHECK(vkCreateSemaphore(app->device, &si, NULL, &app->imageAvailable[i]));
VK_CHECK(vkCreateSemaphore(app->device, &si, NULL, &app->renderFinished[i]));

/* pseudo:
   vkQueueSubmit(work: A, signal: S, wait: none)
   vkQueueSubmit(work: B, signal: none, wait: S)   both return at once */`,
  chapter: "Rendering and presentation › Synchronization › Semaphores"
});
D("fences", {
  title: "Fences", api: "VkFence", level: 3, group: "sync",
  summary: "Let the CPU wait for GPU work. Created signaled so the very first wait does not block forever.",
  body: `<p>Reset the fence only once you know you will submit work with it. If <code>drawFrame</code> returns early after resetting (for example on OUT_OF_DATE), the fence never gets signaled and the next wait deadlocks.</p>`,
  code: `VkFenceCreateInfo fi = {
    .sType = VK_STRUCTURE_TYPE_FENCE_CREATE_INFO,
    .flags = VK_FENCE_CREATE_SIGNALED_BIT,
};
VK_CHECK(vkCreateFence(app->device, &fi, NULL, &app->inFlight[i]));

vkWaitForFences(app->device, 1, &app->inFlight[f], VK_TRUE, UINT64_MAX);
/* ... acquire; return early if out of date ... */
vkResetFences(app->device, 1, &app->inFlight[f]);   /* only now */`,
  chapter: "Rendering and presentation › Fences; Swap chain recreation › Fixing a deadlock"
});
D("framesInFlight", {
  title: "Frames in Flight", api: "MAX_FRAMES_IN_FLIGHT = 2", level: 3, group: "sync",
  summary: "Duplicate every per-frame resource so the CPU records frame N+1 while the GPU renders frame N.",
  body: `<p>With one set of objects the CPU idles until the GPU finishes. Two frames lets both work at once without the CPU getting so far ahead that latency grows. Step through the timeline below.</p>`,
  facts: ["Per frame: command buffer, two semaphores, fence, uniform buffer, descriptor set.", "<code>currentFrame = (currentFrame + 1) % MAX_FRAMES_IN_FLIGHT</code>."],
  widget: "inflight",
  code: `#define MAX_FRAMES_IN_FLIGHT 2

typedef struct App {
    /* ... */
    VkCommandBuffer commandBuffers[MAX_FRAMES_IN_FLIGHT];
    VkSemaphore     imageAvailable[MAX_FRAMES_IN_FLIGHT];
    VkSemaphore     renderFinished[MAX_FRAMES_IN_FLIGHT];
    VkFence         inFlight[MAX_FRAMES_IN_FLIGHT];
    uint32_t        currentFrame;
} App;`,
  chapter: "Drawing › Frames in flight"
});

/* ---------------- Frame loop ---------------- */
D("frameLoop", {
  title: "drawFrame()", api: "one frame, start to finish", level: 3, group: "draw",
  summary: "Wait for this slot's previous frame, acquire an image, update uniforms, record, submit, present, advance. Step through it below.",
  body: `<p>Everything here is asynchronous except the fence wait. Each arrow in the diagram is enforced by a semaphore or fence, not by call order.</p>`,
  widget: "frameStepper",
  code: `static void drawFrame(App *app) {
    uint32_t f = app->currentFrame;
    vkWaitForFences(app->device, 1, &app->inFlight[f], VK_TRUE, UINT64_MAX);

    uint32_t imageIndex;
    VkResult r = vkAcquireNextImageKHR(app->device, app->swapChain, UINT64_MAX,
                                       app->imageAvailable[f], VK_NULL_HANDLE,
                                       &imageIndex);
    if (r == VK_ERROR_OUT_OF_DATE_KHR) { recreateSwapChain(app); return; }
    if (r != VK_SUCCESS && r != VK_SUBOPTIMAL_KHR) die("acquire failed");

    updateUniformBuffer(app, f);
    vkResetFences(app->device, 1, &app->inFlight[f]);
    vkResetCommandBuffer(app->commandBuffers[f], 0);
    recordCommandBuffer(app, app->commandBuffers[f], imageIndex);

    submitFrame(app, f);                     /* waits imageAvailable, signals renderFinished */

    VkPresentInfoKHR pi = {
        .sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR,
        .waitSemaphoreCount = 1,
        .pWaitSemaphores = &app->renderFinished[f],
        .swapchainCount = 1,
        .pSwapchains = &app->swapChain,
        .pImageIndices = &imageIndex,
    };
    r = vkQueuePresentKHR(app->presentQueue, &pi);
    if (r == VK_ERROR_OUT_OF_DATE_KHR || r == VK_SUBOPTIMAL_KHR ||
        app->framebufferResized) {
        app->framebufferResized = 0;
        recreateSwapChain(app);
    } else if (r != VK_SUCCESS) die("present failed");

    app->currentFrame = (f + 1) % MAX_FRAMES_IN_FLIGHT;
}`,
  chapter: "Drawing › Rendering and presentation; Frames in flight; Swap chain recreation",
  diagram: {
    nodes: [["waitFence", 0, 0], ["acquire", 1, 0], ["updateUniform", 2, 0], ["recordCommands", 3, 0], ["submit", 3, 1.3], ["present", 2, 1.3], ["advanceFrame", 1, 1.3], ["recreateSwapchain", 0, 1.3]],
    edges: [["waitFence", "acquire", "fence signaled"], ["acquire", "updateUniform", "imageIndex"], ["updateUniform", "recordCommands", ""], ["recordCommands", "submit", "wait imageAvailable"], ["submit", "present", "renderFinished"], ["present", "advanceFrame", ""], ["acquire", "recreateSwapchain", "OUT_OF_DATE"], ["present", "recreateSwapchain", "SUBOPTIMAL / resized"]]
  }
});
D("waitFence", {
  title: "Wait for the Frame Slot", api: "vkWaitForFences", level: 3, group: "sync",
  summary: "Block the CPU until the GPU has finished the last frame that used this slot's command buffer and semaphores.",
  code: `vkWaitForFences(app->device, 1, &app->inFlight[f], VK_TRUE, UINT64_MAX);`,
  links: ["fences"],
  chapter: "Rendering and presentation › Waiting for the previous frame"
});
D("acquire", {
  title: "Acquire an Image", api: "vkAcquireNextImageKHR", level: 2, group: "present",
  summary: "Asks the swap chain for the index of an image you may render to. The semaphore signals when the presentation engine is done reading it.",
  facts: ["Returns immediately; the image may not be ready yet. That is what the semaphore is for.", "SUBOPTIMAL still counts as success; OUT_OF_DATE means recreate and skip the frame."],
  code: `uint32_t imageIndex;
VkResult r = vkAcquireNextImageKHR(app->device, app->swapChain, UINT64_MAX,
                                   app->imageAvailable[f], VK_NULL_HANDLE,
                                   &imageIndex);`,
  chapter: "Rendering and presentation › Acquiring an image from the swap chain"
});
D("present", {
  title: "Present", api: "vkQueuePresentKHR", level: 2, group: "present",
  summary: "Returns the image to the swap chain, waiting on the render-finished semaphore so only complete frames appear.",
  body: `<p>Check the resize flag <em>after</em> present so that the semaphores stay consistent; otherwise a signaled semaphore may never be waited on.</p>`,
  code: `VkPresentInfoKHR pi = {
    .sType = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR,
    .waitSemaphoreCount = 1,
    .pWaitSemaphores = &app->renderFinished[f],
    .swapchainCount = 1,
    .pSwapchains = &app->swapChain,
    .pImageIndices = &imageIndex,
};
VkResult r = vkQueuePresentKHR(app->presentQueue, &pi);`,
  chapter: "Rendering and presentation › Presentation"
});
D("advanceFrame", {
  title: "Advance the Frame", api: "currentFrame++", level: 1, group: "sync",
  summary: "Move to the next frame-in-flight slot, wrapping with modulo.",
  code: `app->currentFrame = (app->currentFrame + 1) % MAX_FRAMES_IN_FLIGHT;`,
  links: ["framesInFlight"],
  chapter: "Frames in flight"
});

/* ---------------- Depth + MSAA ---------------- */
D("attachments", {
  title: "Depth & MSAA Targets", api: "extra attachments", level: 3, group: "resource",
  summary: "Images you create yourself and attach next to the swap chain image: a depth buffer for correct occlusion and a multisampled color target for anti-aliasing.",
  body: `<p>Both are sized to the swap chain extent, so they are rebuilt on resize. Only one of each is needed because only one frame draws at a time.</p>`,
  chapter: "Depth buffering; Multisampling",
  diagram: {
    nodes: [["depth", 0, 0], ["msaa", 0, 1.3], ["framebuffers", 1.4, 0.65]],
    edges: [["depth", "framebuffers", "attachment 1"], ["msaa", "framebuffers", "attachments 0 + 2"]]
  }
});
D("depth", {
  title: "Depth Buffering", api: "D32_SFLOAT image", level: 2, group: "resource",
  summary: "Stores the depth of the closest fragment at each pixel, so later fragments behind it are discarded no matter the draw order.",
  body: `<p>Without it, the square drawn second always lands on top (the "Escher" picture). Sorting draw calls works for transparency, but a depth buffer is the general fix.</p>
  <p>GLM uses OpenGL's -1..1 depth range by default; define <code>GLM_FORCE_DEPTH_ZERO_TO_ONE</code> for Vulkan's 0..1. In C with <em>cglm</em>, use the <code>_rh_zo</code> projection functions.</p>`,
  chapter: "Depth buffering",
  code: `static void createDepthResources(App *app) {
    VkFormat fmt = findDepthFormat(app);
    createImage(app, app->swapChainExtent.width, app->swapChainExtent.height, 1,
                app->msaaSamples, fmt, VK_IMAGE_TILING_OPTIMAL,
                VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
                VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
                &app->depthImage, &app->depthImageMemory);
    app->depthImageView = createImageView(app, app->depthImage, fmt,
                                          VK_IMAGE_ASPECT_DEPTH_BIT, 1);
}`,
  diagram: {
    nodes: [["depthFormat", 0, 0], ["depthImage", 1.2, 0], ["depthTransition", 1.2, 1.2], ["depthAttachment", 2.4, 0], ["depthStencilState", 2.4, 1.2]],
    edges: [["depthFormat", "depthImage", "format"], ["depthImage", "depthTransition", "optional"], ["depthImage", "depthAttachment", "render pass"], ["depthAttachment", "depthStencilState", "tested by"]]
  }
});
D("depthFormat", {
  title: "Choosing a Depth Format", api: "vkGetPhysicalDeviceFormatProperties", level: 3, group: "resource",
  summary: "Try candidates in order of preference and take the first that supports depth-attachment use with optimal tiling.",
  facts: ["D32_SFLOAT: 32-bit float depth.", "D32_SFLOAT_S8_UINT and D24_UNORM_S8_UINT also carry 8 bits of stencil.", "Use <code>VK_FORMAT_FEATURE_*</code> flags here, not <code>VK_IMAGE_USAGE_*</code>."],
  code: `static VkFormat findSupportedFormat(App *app, const VkFormat *cands, int n,
                                    VkImageTiling tiling, VkFormatFeatureFlags feats) {
    for (int i = 0; i < n; i++) {
        VkFormatProperties p;
        vkGetPhysicalDeviceFormatProperties(app->physicalDevice, cands[i], &p);
        if (tiling == VK_IMAGE_TILING_LINEAR && (p.linearTilingFeatures & feats) == feats)
            return cands[i];
        if (tiling == VK_IMAGE_TILING_OPTIMAL && (p.optimalTilingFeatures & feats) == feats)
            return cands[i];
    }
    die("failed to find supported format");
    return VK_FORMAT_UNDEFINED;
}

static VkFormat findDepthFormat(App *app) {
    static const VkFormat c[] = { VK_FORMAT_D32_SFLOAT, VK_FORMAT_D32_SFLOAT_S8_UINT,
                                  VK_FORMAT_D24_UNORM_S8_UINT };
    return findSupportedFormat(app, c, 3, VK_IMAGE_TILING_OPTIMAL,
                               VK_FORMAT_FEATURE_DEPTH_STENCIL_ATTACHMENT_BIT);
}

static int hasStencilComponent(VkFormat f) {
    return f == VK_FORMAT_D32_SFLOAT_S8_UINT || f == VK_FORMAT_D24_UNORM_S8_UINT;
}`,
  chapter: "Depth buffering › Depth image and view"
});
D("depthImage", {
  title: "Depth Image & View", api: "VK_IMAGE_ASPECT_DEPTH_BIT", level: 2, group: "resource",
  summary: "Same resolution as the color attachment, depth-attachment usage, device-local memory, and a view with the depth aspect.",
  code: `createImage(app, w, h, 1, app->msaaSamples, depthFormat, VK_IMAGE_TILING_OPTIMAL,
            VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT,
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
            &app->depthImage, &app->depthImageMemory);
app->depthImageView = createImageView(app, app->depthImage, depthFormat,
                                      VK_IMAGE_ASPECT_DEPTH_BIT, 1);`,
  links: ["createImage"],
  chapter: "Depth buffering › Depth image and view"
});
D("depthTransition", {
  title: "Explicit Depth Transition", api: "UNDEFINED → DEPTH_STENCIL_ATTACHMENT", level: 4, group: "sync",
  summary: "Not needed (the render pass transitions it), but shows how a barrier targets depth: depth aspect, plus stencil if the format has it.",
  code: `if (newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
    barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT;
    if (hasStencilComponent(format))
        barrier.subresourceRange.aspectMask |= VK_IMAGE_ASPECT_STENCIL_BIT;
}
/* UNDEFINED -> DEPTH_STENCIL_ATTACHMENT_OPTIMAL */
barrier.srcAccessMask = 0;
barrier.dstAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_READ_BIT |
                        VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
srcStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
dstStage = VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;`,
  links: ["pipelineBarrier"],
  chapter: "Depth buffering › Explicitly transitioning the depth image"
});
D("msaa", {
  title: "Multisampling (MSAA)", api: "VkSampleCountFlagBits", level: 3, group: "resource",
  summary: "Takes several coverage samples per pixel to smooth jagged geometry edges. Render to a multisampled image, then resolve it into the swap chain image.",
  body: `<p>With one sample at the pixel center, an edge either covers the pixel or not, which produces staircases. MSAA runs the fragment shader once per pixel per triangle but stores several samples, so it is far cheaper than rendering at a higher resolution.</p>
  <p>MSAA only smooths geometry edges. Aliasing inside textures needs <em>sample shading</em>, at extra cost.</p>`,
  facts: ["Multisampled images must have exactly one mip level.", "Color, depth and pipeline must all use the same sample count."],
  chapter: "Multisampling",
  code: `static void createColorResources(App *app) {
    VkFormat fmt = app->swapChainImageFormat;
    createImage(app, app->swapChainExtent.width, app->swapChainExtent.height, 1,
                app->msaaSamples, fmt, VK_IMAGE_TILING_OPTIMAL,
                VK_IMAGE_USAGE_TRANSIENT_ATTACHMENT_BIT |
                VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
                VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
                &app->colorImage, &app->colorImageMemory);
    app->colorImageView = createImageView(app, app->colorImage, fmt,
                                          VK_IMAGE_ASPECT_COLOR_BIT, 1);
}`,
  diagram: {
    nodes: [["msaaCount", 0, 0.6], ["msaaColor", 1.2, 0], ["multisampleState", 1.2, 1.2], ["resolveAttachment", 2.4, 0], ["sampleShading", 2.4, 1.2]],
    edges: [["msaaCount", "msaaColor", "samples"], ["msaaCount", "multisampleState", "rasterizationSamples"], ["msaaColor", "resolveAttachment", "resolved into"], ["multisampleState", "sampleShading", "optional"]]
  }
});
D("msaaColor", {
  title: "Multisampled Color Target", api: "TRANSIENT_ATTACHMENT", level: 3, group: "resource",
  summary: "An off-screen color image with N samples per pixel. Transient usage hints it never needs to leave on-chip memory.",
  code: `createImage(app, w, h, 1, app->msaaSamples, app->swapChainImageFormat,
            VK_IMAGE_TILING_OPTIMAL,
            VK_IMAGE_USAGE_TRANSIENT_ATTACHMENT_BIT | VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
            VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, &app->colorImage, &app->colorImageMemory);`,
  chapter: "Multisampling › Setting up a render target"
});
D("sampleShading", {
  title: "Sample Shading", api: "sampleRateShading", level: 3, group: "resource",
  summary: "Runs the fragment shader per sample (for a fraction of samples) to also smooth aliasing inside textures. Costs performance.",
  code: `/* createLogicalDevice */
features.sampleRateShading = VK_TRUE;
/* createGraphicsPipeline */
multisampling.sampleShadingEnable = VK_TRUE;
multisampling.minSampleShading = 0.2f;   /* closer to 1.0 = smoother */`,
  chapter: "Multisampling › Quality improvements"
});
