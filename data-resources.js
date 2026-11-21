/* Concept data, part 3: buffers, descriptors, textures, models, mipmaps, compute + quiz. */

/* ---------------- Buffers & memory ---------------- */
D("buffers", {
  title: "Buffers & Memory", api: "VkBuffer + VkDeviceMemory", level: 2, group: "resource",
  summary: "Buffers are regions of GPU-readable memory. Unlike other objects they do not allocate memory themselves: you find a memory type, allocate, and bind.",
  body: `<p>The tutorial starts with a CPU-visible vertex buffer filled by <code>memcpy</code>, then moves data through a <em>staging buffer</em> into faster device-local memory. Index and uniform buffers follow the same helpers.</p>`,
  facts: ["<code>maxMemoryAllocationCount</code> can be as low as 4096: real apps sub-allocate (e.g. Vulkan Memory Allocator).", "Drivers recommend packing vertex and index data into one VkBuffer with offsets."],
  chapter: "Vertex buffers",
  diagram: {
    nodes: [["vertexDescription", 0, 0], ["models", 0, 1.2], ["memoryTypes", 1.2, 1.2], ["createBuffer", 1.2, 0], ["staging", 2.4, 0], ["copyBuffer", 2.4, 1.2], ["updateUniform", 2.4, 2.4],
            ["vertexBuffer", 3.6, 0], ["indexBuffer", 3.6, 1.2], ["uniformBuffer", 3.6, 2.4]],
    edges: [["vertexDescription", "vertexBuffer", "describes"], ["models", "vertexBuffer", "vertices"], ["models", "indexBuffer", "indices"], ["memoryTypes", "createBuffer", "findMemoryType"],
            ["createBuffer", "staging", "HOST_VISIBLE"], ["staging", "copyBuffer", "TRANSFER_SRC"], ["copyBuffer", "vertexBuffer", "DEVICE_LOCAL"], ["copyBuffer", "indexBuffer", "DEVICE_LOCAL"],
            ["createBuffer", "uniformBuffer", "mapped forever"], ["updateUniform", "uniformBuffer", "memcpy per frame"]]
  }
});
D("vertexDescription", {
  title: "Vertex Input Description", api: "binding + attribute descriptions", level: 2, group: "resource",
  summary: "A C struct for one vertex, plus descriptions telling Vulkan its stride and where each attribute sits.",
  body: `<p>Attributes are interleaved in one array, so there is one binding. Formats reuse the color enum: <code>vec2</code> = <code>R32G32_SFLOAT</code>, <code>vec3</code> = <code>R32G32B32_SFLOAT</code>, <code>ivec2</code> = <code>R32G32_SINT</code>, <code>double</code> = <code>R64_SFLOAT</code>.</p>`,
  facts: ["<code>INPUT_RATE_VERTEX</code> advances per vertex; <code>INPUT_RATE_INSTANCE</code> per instance.", "<code>location</code> matches <code>layout(location = N) in</code> in the vertex shader."],
  code: `#include <stddef.h>   /* offsetof */

typedef struct Vertex {
    float pos[3];
    float color[3];
    float texCoord[2];
} Vertex;

static VkVertexInputBindingDescription vertexBindingDescription(void) {
    return (VkVertexInputBindingDescription){
        .binding = 0,
        .stride = sizeof(Vertex),
        .inputRate = VK_VERTEX_INPUT_RATE_VERTEX,
    };
}

static void vertexAttributeDescriptions(VkVertexInputAttributeDescription a[3]) {
    a[0] = (VkVertexInputAttributeDescription){ 0, 0, VK_FORMAT_R32G32B32_SFLOAT,
                                                offsetof(Vertex, pos) };
    a[1] = (VkVertexInputAttributeDescription){ 1, 0, VK_FORMAT_R32G32B32_SFLOAT,
                                                offsetof(Vertex, color) };
    a[2] = (VkVertexInputAttributeDescription){ 2, 0, VK_FORMAT_R32G32_SFLOAT,
                                                offsetof(Vertex, texCoord) };
    /* field order: location, binding, format, offset */
}`,
  chapter: "Vertex buffers › Vertex input description"
});
D("memoryTypes", {
  title: "Memory Types", api: "vkGetPhysicalDeviceMemoryProperties", level: 3, group: "resource",
  summary: "GPUs expose several memory heaps (VRAM, system RAM) and types with properties. Pick a type that the resource allows and that has the properties you need.",
  body: `<p><code>memoryTypeBits</code> from the requirements is a bit field of allowed types. Check that bit <em>and</em> that all requested property flags are present (compare with <code>==</code>, not just non-zero).</p>`,
  facts: ["DEVICE_LOCAL: fastest for the GPU, usually not mappable on discrete cards.", "HOST_VISIBLE: mappable with <code>vkMapMemory</code>.", "HOST_COHERENT: writes are visible without <code>vkFlushMappedMemoryRanges</code>."],
  code: `static uint32_t findMemoryType(App *app, uint32_t typeFilter,
                               VkMemoryPropertyFlags props) {
    VkPhysicalDeviceMemoryProperties mp;
    vkGetPhysicalDeviceMemoryProperties(app->physicalDevice, &mp);
    for (uint32_t i = 0; i < mp.memoryTypeCount; i++)
        if ((typeFilter & (1u << i)) &&
            (mp.memoryTypes[i].propertyFlags & props) == props)
            return i;
    die("failed to find suitable memory type");
    return 0;
}`,
  chapter: "Vertex buffer creation › Memory requirements"
});
D("createBuffer", {
  title: "createBuffer Helper", api: "vkCreateBuffer + vkAllocateMemory + vkBindBufferMemory", level: 2, group: "resource",
  summary: "Create the buffer, ask for its memory requirements, allocate a matching block, bind it at offset 0.",
  body: `<p><code>memRequirements.size</code> may be larger than what you asked for. A non-zero bind offset must be a multiple of <code>alignment</code>.</p>`,
  code: `static void createBuffer(App *app, VkDeviceSize size, VkBufferUsageFlags usage,
                         VkMemoryPropertyFlags props,
                         VkBuffer *buf, VkDeviceMemory *mem) {
    VkBufferCreateInfo bi = {
        .sType = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO,
        .size = size,
        .usage = usage,
        .sharingMode = VK_SHARING_MODE_EXCLUSIVE,
    };
    VK_CHECK(vkCreateBuffer(app->device, &bi, NULL, buf));

    VkMemoryRequirements req;
    vkGetBufferMemoryRequirements(app->device, *buf, &req);
    VkMemoryAllocateInfo ai = {
        .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
        .allocationSize = req.size,
        .memoryTypeIndex = findMemoryType(app, req.memoryTypeBits, props),
    };
    VK_CHECK(vkAllocateMemory(app->device, &ai, NULL, mem));
    vkBindBufferMemory(app->device, *buf, *mem, 0);
}`,
  chapter: "Staging buffer › Abstracting buffer creation"
});
D("staging", {
  title: "Staging Buffer", api: "HOST_VISIBLE → DEVICE_LOCAL", level: 2, group: "resource",
  summary: "Upload through a temporary CPU-visible buffer, then copy on the GPU into a fast device-local buffer the CPU cannot see.",
  body: `<p>The staging buffer gets <code>TRANSFER_SRC</code> usage, the final buffer <code>TRANSFER_DST</code> plus its real usage. Coherent memory means the write is visible by the next <code>vkQueueSubmit</code>.</p>`,
  code: `static void createVertexBuffer(App *app) {
    VkDeviceSize size = sizeof(Vertex) * app->vertexCount;
    VkBuffer staging; VkDeviceMemory stagingMem;
    createBuffer(app, size, VK_BUFFER_USAGE_TRANSFER_SRC_BIT,
                 VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                 VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, &staging, &stagingMem);

    void *data;
    vkMapMemory(app->device, stagingMem, 0, size, 0, &data);
    memcpy(data, app->vertices, (size_t)size);
    vkUnmapMemory(app->device, stagingMem);

    createBuffer(app, size, VK_BUFFER_USAGE_TRANSFER_DST_BIT |
                 VK_BUFFER_USAGE_VERTEX_BUFFER_BIT,
                 VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
                 &app->vertexBuffer, &app->vertexBufferMemory);
    copyBuffer(app, staging, app->vertexBuffer, size);

    vkDestroyBuffer(app->device, staging, NULL);
    vkFreeMemory(app->device, stagingMem, NULL);
}`,
  chapter: "Vertex buffers › Staging buffer"
});
D("copyBuffer", {
  title: "Buffer Copy", api: "vkCmdCopyBuffer", level: 2, group: "resource",
  summary: "Copies are commands too: record vkCmdCopyBuffer in a one-time command buffer and submit it.",
  facts: ["Any graphics or compute queue can do transfers.", "A dedicated transfer queue is possible: separate pool, CONCURRENT sharing, transfer-family submits."],
  code: `static void copyBuffer(App *app, VkBuffer src, VkBuffer dst, VkDeviceSize size) {
    VkCommandBuffer cmd = beginSingleTimeCommands(app);
    VkBufferCopy region = { .srcOffset = 0, .dstOffset = 0, .size = size };
    vkCmdCopyBuffer(cmd, src, dst, 1, &region);
    endSingleTimeCommands(app, cmd);
}`,
  links: ["singleTime"],
  chapter: "Staging buffer › Using a staging buffer"
});
D("vertexBuffer", {
  title: "Vertex Buffer", api: "VK_BUFFER_USAGE_VERTEX_BUFFER_BIT", level: 2, group: "resource",
  summary: "Holds the interleaved vertex array. Bound to binding 0 while recording, before the draw.",
  code: `VkBuffer vbs[] = { app->vertexBuffer };
VkDeviceSize offsets[] = { 0 };
vkCmdBindVertexBuffers(cmd, 0, 1, vbs, offsets);
vkCmdDraw(cmd, app->vertexCount, 1, 0, 0);   /* before index buffers */`,
  chapter: "Vertex buffer creation › Binding the vertex buffer"
});
D("indexBuffer", {
  title: "Index Buffer", api: "vkCmdDrawIndexed", level: 1, group: "resource",
  summary: "An array of indices into the vertex buffer, so shared vertices are stored once. A rectangle needs 4 vertices instead of 6.",
  body: `<p>Use <code>uint16_t</code> under 65,535 vertices, otherwise <code>uint32_t</code> (the Viking room model needs 32-bit). You can bind only one index buffer, so a vertex that differs in any attribute must be duplicated.</p>`,
  code: `static const Vertex quad[] = {
    {{-0.5f, -0.5f, 0.0f}, {1, 0, 0}, {0, 0}},
    {{ 0.5f, -0.5f, 0.0f}, {0, 1, 0}, {1, 0}},
    {{ 0.5f,  0.5f, 0.0f}, {0, 0, 1}, {1, 1}},
    {{-0.5f,  0.5f, 0.0f}, {1, 1, 1}, {0, 1}},
};
static const uint16_t quadIndices[] = { 0, 1, 2, 2, 3, 0 };

/* same staging pattern, usage VK_BUFFER_USAGE_INDEX_BUFFER_BIT */
vkCmdBindIndexBuffer(cmd, app->indexBuffer, 0, VK_INDEX_TYPE_UINT16);
vkCmdDrawIndexed(cmd, 6, 1, 0, 0, 0);
/* indexCount, instanceCount, firstIndex, vertexOffset, firstInstance */`,
  chapter: "Vertex buffers › Index buffer"
});
D("uniformBuffer", {
  title: "Uniform Buffers", api: "VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT", level: 2, group: "resource",
  summary: "Small buffers of per-frame constants such as the MVP matrices. One per frame in flight, mapped once and kept mapped.",
  body: `<p>No staging buffer: the data changes every frame, so a copy would only add overhead. <em>Persistent mapping</em> skips the cost of mapping each time. For very small, frequently changing data, push constants are even cheaper.</p>`,
  code: `static void createUniformBuffers(App *app) {
    VkDeviceSize size = sizeof(UniformBufferObject);
    for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
        createBuffer(app, size, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,
                     VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT |
                     VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,
                     &app->uniformBuffers[i], &app->uniformBuffersMemory[i]);
        vkMapMemory(app->device, app->uniformBuffersMemory[i], 0, size, 0,
                    &app->uniformBuffersMapped[i]);
    }
}`,
  links: ["uboAlignment", "descriptors"],
  chapter: "Uniform buffers › Descriptor set layout and buffer"
});
D("updateUniform", {
  title: "Update Uniforms", api: "memcpy into mapped memory", level: 2, group: "resource",
  summary: "Rebuild model, view and projection from elapsed time and copy them into this frame's uniform buffer.",
  body: `<p>The model spins 90° per second around Z, the camera looks from (2, 2, 2), and the projection uses the swap chain's current aspect ratio. GLM and cglm follow OpenGL's clip space, where Y points up, so flip the Y scale.</p>`,
  code: `#define CGLM_FORCE_DEPTH_ZERO_TO_ONE
#include <cglm/cglm.h>
#include <time.h>

typedef struct UniformBufferObject {
    _Alignas(16) mat4 model;
    _Alignas(16) mat4 view;
    _Alignas(16) mat4 proj;
} UniformBufferObject;

static void updateUniformBuffer(App *app, uint32_t frame) {
    float t = (float)glfwGetTime();
    UniformBufferObject ubo;

    glm_mat4_identity(ubo.model);
    glm_rotate(ubo.model, t * glm_rad(90.0f), (vec3){0.0f, 0.0f, 1.0f});
    glm_lookat((vec3){2.0f, 2.0f, 2.0f}, (vec3){0.0f, 0.0f, 0.0f},
               (vec3){0.0f, 0.0f, 1.0f}, ubo.view);
    float aspect = app->swapChainExtent.width / (float)app->swapChainExtent.height;
    glm_perspective(glm_rad(45.0f), aspect, 0.1f, 10.0f, ubo.proj);
    ubo.proj[1][1] *= -1.0f;   /* Vulkan's Y points down */

    memcpy(app->uniformBuffersMapped[frame], &ubo, sizeof ubo);
}`,
  chapter: "Uniform buffers › Updating uniform data"
});

/* ---------------- Models ---------------- */
D("models", {
  title: "Loading Models", api: "OBJ → vertices + indices", level: 2, group: "resource",
  summary: "Read positions and texture coordinates from an OBJ file, flip V, and deduplicate identical vertices.",
  body: `<p>The tutorial uses the C++ tinyobjloader. In C, <em>tinyobj_loader_c</em> offers the same data. Build with optimizations on: loading 500,000 triangles is slow in a debug build.</p>`,
  chapter: "Loading models",
  diagram: {
    nodes: [["objLoad", 0, 0], ["uvFlip", 1.2, 0], ["dedup", 2.4, 0], ["vertexBuffer", 3.6, -0.55], ["indexBuffer", 3.6, 0.55]],
    edges: [["objLoad", "uvFlip", "texcoords"], ["uvFlip", "dedup", "Vertex"], ["dedup", "vertexBuffer", "unique"], ["dedup", "indexBuffer", "uint32_t"]]
  }
});
D("objLoad", {
  title: "Parse the OBJ", api: "tinyobj_parse_obj", level: 2, group: "resource",
  summary: "An OBJ face references a position, normal and UV by separate indices. The loader triangulates faces for you.",
  body: `<p>Attribute arrays are flat floats, so multiply indices by 3 (positions) or 2 (UVs).</p>`,
  code: `#define TINYOBJ_LOADER_C_IMPLEMENTATION
#include "tinyobj_loader_c.h"

tinyobj_attrib_t attrib;
tinyobj_shape_t *shapes; size_t numShapes;
tinyobj_material_t *mats; size_t numMats;
if (tinyobj_parse_obj(&attrib, &shapes, &numShapes, &mats, &numMats,
                      MODEL_PATH, fileReader, NULL,
                      TINYOBJ_FLAG_TRIANGULATE) != TINYOBJ_SUCCESS)
    die("failed to load model");

for (unsigned i = 0; i < attrib.num_faces; i++) {   /* one entry per face vertex */
    tinyobj_vertex_index_t ix = attrib.faces[i];
    Vertex v = {0};
    v.pos[0] = attrib.vertices[3 * ix.v_idx + 0];
    v.pos[1] = attrib.vertices[3 * ix.v_idx + 1];
    v.pos[2] = attrib.vertices[3 * ix.v_idx + 2];
    v.texCoord[0] = attrib.texcoords[2 * ix.vt_idx + 0];
    v.texCoord[1] = 1.0f - attrib.texcoords[2 * ix.vt_idx + 1];
    v.color[0] = v.color[1] = v.color[2] = 1.0f;
    addVertex(app, &v);
}`,
  chapter: "Loading models › Loading vertices and indices"
});
D("uvFlip", {
  title: "Flip the V Coordinate", api: "1.0f - v", level: 1, group: "resource",
  summary: "OBJ puts v = 0 at the bottom of the image; the texture was uploaded top row first. Flip it or the texture looks scrambled.",
  code: `v.texCoord[1] = 1.0f - attrib.texcoords[2 * ix.vt_idx + 1];`,
  chapter: "Loading models › Loading vertices and indices"
});
D("dedup", {
  title: "Vertex Deduplication", api: "hash map Vertex → index", level: 3, group: "resource",
  summary: "Keep only unique vertices and emit indices. The Viking room shrinks from 1,500,000 vertices to 265,645.",
  body: `<p>C has no <code>unordered_map</code>, so a small open-addressing table keyed on the vertex bytes works. Zero-initialize each <code>Vertex</code> so padding bytes compare equal.</p>`,
  code: `static uint32_t hashVertex(const Vertex *v) {        /* FNV-1a */
    const unsigned char *p = (const unsigned char *)v;
    uint32_t h = 2166136261u;
    for (size_t i = 0; i < sizeof *v; i++) { h ^= p[i]; h *= 16777619u; }
    return h;
}

static void addVertex(App *app, const Vertex *v) {
    uint32_t slot = hashVertex(v) & (app->tableCap - 1);   /* cap = power of two */
    for (;;) {
        uint32_t idx = app->table[slot];
        if (idx == UINT32_MAX) {                            /* empty: new vertex */
            idx = app->vertexCount++;
            app->vertices[idx] = *v;
            app->table[slot] = idx;
            app->indices[app->indexCount++] = idx;
            return;
        }
        if (memcmp(&app->vertices[idx], v, sizeof *v) == 0) {
            app->indices[app->indexCount++] = idx;          /* seen before */
            return;
        }
        slot = (slot + 1) & (app->tableCap - 1);
    }
}`,
  chapter: "Loading models › Vertex deduplication"
});

/* ---------------- Descriptors ---------------- */
D("descriptors", {
  title: "Descriptors", api: "layout → pool → sets → bind", level: 3, group: "resource",
  summary: "Descriptors let shaders reach buffers and images. A layout says what kinds exist, a set points at actual resources, and you bind the set before drawing.",
  body: `<p>The analogy: a descriptor set layout is to a descriptor set what a render pass is to a framebuffer. Types and slots first, concrete resources second.</p>`,
  facts: ["Sets come from a pool, like command buffers.", "One set per frame in flight, each pointing at that frame's uniform buffer.", "Sets are freed with their pool."],
  chapter: "Uniform buffers",
  diagram: {
    nodes: [["descriptorSetLayout", 0, 0.5], ["descriptorPool", 1.2, -0.3], ["descriptorSets", 2.4, 0.5], ["descriptorWrites", 2.4, 1.7], ["bindSets", 3.6, 0.5], ["pipelineLayout", 1.2, 1.3],
            ["uniformBuffer", 1.2, 2.6], ["combinedSampler", 3.6, 1.7], ["uboAlignment", 0, 2.6], ["multipleSets", 0, 1.6]],
    edges: [["descriptorSetLayout", "descriptorSets", "pSetLayouts"], ["descriptorPool", "descriptorSets", "allocates"], ["descriptorWrites", "descriptorSets", "fills"], ["descriptorSets", "bindSets", "per frame"],
            ["descriptorSetLayout", "pipelineLayout", "set 0"], ["uniformBuffer", "descriptorWrites", "binding 0"], ["combinedSampler", "descriptorWrites", "binding 1"], ["uboAlignment", "uniformBuffer", "layout rules"], ["multipleSets", "pipelineLayout", "set = N"]]
  }
});
D("descriptorSetLayout", {
  title: "Descriptor Set Layout", api: "VkDescriptorSetLayout", level: 3, group: "resource",
  summary: "Lists each binding: its number, descriptor type, array count and which shader stages read it.",
  code: `static void createDescriptorSetLayout(App *app) {
    VkDescriptorSetLayoutBinding bindings[2] = {
        { .binding = 0, .descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
          .descriptorCount = 1, .stageFlags = VK_SHADER_STAGE_VERTEX_BIT },
        { .binding = 1, .descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
          .descriptorCount = 1, .stageFlags = VK_SHADER_STAGE_FRAGMENT_BIT },
    };
    VkDescriptorSetLayoutCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO,
        .bindingCount = 2,
        .pBindings = bindings,
    };
    VK_CHECK(vkCreateDescriptorSetLayout(app->device, &ci, NULL,
                                         &app->descriptorSetLayout));
}`,
  chapter: "Uniform buffers › Descriptor set layout"
});
D("descriptorPool", {
  title: "Descriptor Pool", api: "VkDescriptorPool", level: 3, group: "resource",
  summary: "Reserves room for a number of descriptors of each type and a maximum number of sets.",
  body: `<p>An undersized pool is a bug validation may not catch: some drivers let the allocation succeed anyway, others return <code>VK_ERROR_POOL_OUT_OF_MEMORY</code>. Size it exactly.</p>`,
  code: `VkDescriptorPoolSize sizes[2] = {
    { VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,         MAX_FRAMES_IN_FLIGHT },
    { VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, MAX_FRAMES_IN_FLIGHT },
};
VkDescriptorPoolCreateInfo ci = {
    .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO,
    .poolSizeCount = 2,
    .pPoolSizes = sizes,
    .maxSets = MAX_FRAMES_IN_FLIGHT,
};
VK_CHECK(vkCreateDescriptorPool(app->device, &ci, NULL, &app->descriptorPool));`,
  chapter: "Descriptor pool and sets › Descriptor pool"
});
D("descriptorSets", {
  title: "Descriptor Sets", api: "vkAllocateDescriptorSets", level: 3, group: "resource",
  summary: "Allocate one set per frame. The API wants one layout per set, so pass an array of copies.",
  code: `VkDescriptorSetLayout layouts[MAX_FRAMES_IN_FLIGHT];
for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) layouts[i] = app->descriptorSetLayout;

VkDescriptorSetAllocateInfo ai = {
    .sType = VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO,
    .descriptorPool = app->descriptorPool,
    .descriptorSetCount = MAX_FRAMES_IN_FLIGHT,
    .pSetLayouts = layouts,
};
VK_CHECK(vkAllocateDescriptorSets(app->device, &ai, app->descriptorSets));`,
  chapter: "Descriptor pool and sets › Descriptor set"
});
D("descriptorWrites", {
  title: "Writing Descriptors", api: "vkUpdateDescriptorSets", level: 3, group: "resource",
  summary: "Point each binding at a real resource: VkDescriptorBufferInfo for buffers, VkDescriptorImageInfo for images.",
  code: `for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
    VkDescriptorBufferInfo bufInfo = {
        .buffer = app->uniformBuffers[i], .offset = 0,
        .range = sizeof(UniformBufferObject),
    };
    VkDescriptorImageInfo imgInfo = {
        .imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
        .imageView = app->textureImageView,
        .sampler = app->textureSampler,
    };
    VkWriteDescriptorSet w[2] = {
        { .sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
          .dstSet = app->descriptorSets[i], .dstBinding = 0,
          .descriptorType = VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
          .descriptorCount = 1, .pBufferInfo = &bufInfo },
        { .sType = VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET,
          .dstSet = app->descriptorSets[i], .dstBinding = 1,
          .descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
          .descriptorCount = 1, .pImageInfo = &imgInfo },
    };
    vkUpdateDescriptorSets(app->device, 2, w, 0, NULL);
}`,
  chapter: "Descriptor sets; Combined image sampler › Updating the descriptors"
});
D("bindSets", {
  title: "Bind Descriptor Sets", api: "vkCmdBindDescriptorSets", level: 2, group: "draw",
  summary: "Before the draw, bind this frame's set to the graphics bind point using the pipeline layout.",
  body: `<p>Descriptor sets are not tied to graphics pipelines, so you name the bind point. Arguments: first set, count, array, and dynamic offsets.</p>`,
  code: `vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_GRAPHICS,
                        app->pipelineLayout, 0, 1,
                        &app->descriptorSets[app->currentFrame], 0, NULL);`,
  chapter: "Descriptor pool and sets › Using descriptor sets"
});
D("uboAlignment", {
  title: "Alignment Rules", api: "std140 / alignas", level: 3, group: "resource",
  summary: "The shader expects each member at a specific offset. A stray vec2 before a mat4 shifts everything and the square disappears.",
  body: `<p>Scalars align to 4 bytes, <code>vec2</code> to 8, <code>vec3</code>/<code>vec4</code>/<code>mat4</code> to 16, nested structs to 16. In C11 use <code>_Alignas(16)</code> on every member to be explicit. Build a struct below and see where the shader would read it.</p>`,
  widget: "alignment",
  code: `typedef struct Foo { float v[2]; } Foo;

typedef struct UniformBufferObject {
    float foo[2];               /* offset 0, size 8                     */
    _Alignas(16) mat4 model;    /* without _Alignas: offset 8  -> broken */
    _Alignas(16) mat4 view;     /* offset 80                             */
    _Alignas(16) mat4 proj;     /* offset 144                            */
} UniformBufferObject;`,
  chapter: "Descriptor pool and sets › Alignment requirements"
});
D("multipleSets", {
  title: "Multiple Descriptor Sets", api: "layout(set = N, binding = M)", level: 3, group: "resource",
  summary: "A pipeline layout can hold several set layouts, so shared data and per-object data can be bound separately.",
  body: `<p>Rebinding only the per-object set between draw calls avoids rebinding everything.</p>`,
  lang: "glsl",
  code: `layout(set = 0, binding = 0) uniform Camera { mat4 view; mat4 proj; } cam;
layout(set = 1, binding = 0) uniform Object { mat4 model; } obj;`,
  chapter: "Descriptor pool and sets › Multiple descriptor sets"
});

/* ---------------- Textures ---------------- */
D("textures", {
  title: "Texture Mapping", api: "VkImage + VkImageView + VkSampler", level: 3, group: "resource",
  summary: "Load pixels, stage them, copy them into an optimally tiled image with layout transitions around the copy, then sample it through a view and a sampler.",
  body: `<p>The flow mirrors the vertex buffer's staging path, with one big extra: images have <em>layouts</em>, and you must transition them with pipeline barriers before each kind of use.</p>`,
  chapter: "Texture mapping",
  diagram: {
    nodes: [["loadImage", 0, 0], ["staging", 0, 1.2], ["createImage", 1.2, 0], ["pipelineBarrier", 1.2, 1.2], ["copyBufferToImage", 2.4, 0], ["mipmaps", 2.4, 1.2],
            ["textureView", 3.6, 0], ["sampler", 3.6, 1.2], ["anisotropy", 3.6, 2.4], ["combinedSampler", 4.8, 0.6], ["textureShader", 4.8, 1.8]],
    edges: [["loadImage", "staging", "pixels"], ["staging", "copyBufferToImage", "src buffer"], ["createImage", "pipelineBarrier", "UNDEFINED → DST"], ["pipelineBarrier", "copyBufferToImage", "TRANSFER_DST"],
            ["copyBufferToImage", "mipmaps", "level 0 filled"], ["mipmaps", "textureView", "SHADER_READ_ONLY"], ["textureView", "combinedSampler", "imageView"], ["sampler", "combinedSampler", "sampler"],
            ["anisotropy", "sampler", "device feature"], ["combinedSampler", "textureShader", "binding 1"]]
  }
});
D("loadImage", {
  title: "Load the Image", api: "stbi_load", level: 1, group: "resource",
  summary: "stb_image is a single-header C library. STBI_rgb_alpha forces 4 channels so the size is width × height × 4.",
  code: `#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

int w, h, ch;
stbi_uc *pixels = stbi_load(TEXTURE_PATH, &w, &h, &ch, STBI_rgb_alpha);
if (!pixels) die("failed to load texture image");
VkDeviceSize imageSize = (VkDeviceSize)w * h * 4;
/* ... copy into a staging buffer ... */
stbi_image_free(pixels);`,
  chapter: "Images › Loading an image"
});
D("createImage", {
  title: "createImage Helper", api: "VkImageCreateInfo", level: 3, group: "resource",
  summary: "Like createBuffer, but for images: type, extent, mips, format, tiling, usage, samples; then allocate and bind memory.",
  facts: ["OPTIMAL tiling is implementation-defined and fast; LINEAR is row-major and needed only for direct CPU access.", "<code>initialLayout</code> is UNDEFINED (contents discarded) or PREINITIALIZED.", "The format must match the staging data: R8G8B8A8_SRGB."],
  code: `static void createImage(App *app, uint32_t w, uint32_t h, uint32_t mips,
                        VkSampleCountFlagBits samples, VkFormat fmt,
                        VkImageTiling tiling, VkImageUsageFlags usage,
                        VkMemoryPropertyFlags props,
                        VkImage *img, VkDeviceMemory *mem) {
    VkImageCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO,
        .imageType = VK_IMAGE_TYPE_2D,
        .extent = { w, h, 1 },
        .mipLevels = mips,
        .arrayLayers = 1,
        .format = fmt,
        .tiling = tiling,
        .initialLayout = VK_IMAGE_LAYOUT_UNDEFINED,
        .usage = usage,
        .samples = samples,
        .sharingMode = VK_SHARING_MODE_EXCLUSIVE,
    };
    VK_CHECK(vkCreateImage(app->device, &ci, NULL, img));

    VkMemoryRequirements req;
    vkGetImageMemoryRequirements(app->device, *img, &req);
    VkMemoryAllocateInfo ai = {
        .sType = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO,
        .allocationSize = req.size,
        .memoryTypeIndex = findMemoryType(app, req.memoryTypeBits, props),
    };
    VK_CHECK(vkAllocateMemory(app->device, &ai, NULL, mem));
    vkBindImageMemory(app->device, *img, *mem, 0);
}`,
  chapter: "Images › Texture Image"
});
D("pipelineBarrier", {
  title: "Pipeline Barriers", api: "vkCmdPipelineBarrier", level: 4, group: "sync",
  summary: "An image memory barrier transitions layout and orders access: operations in the source stage/access must finish before the destination stage/access starts.",
  body: `<p>Pick a transition below to see the masks the tutorial uses. Rule of thumb: source = what wrote the image last, destination = the earliest stage that will use it next.</p>`,
  facts: ["Queue family indices must be <code>VK_QUEUE_FAMILY_IGNORED</code> unless you transfer ownership (not the default 0!).", "<code>TRANSFER</code> is a pseudo-stage, not a real pipeline stage.", "Submitting implies a host-write dependency at the start."],
  widget: "barriers",
  code: `static void transitionImageLayout(App *app, VkImage image, VkFormat format,
        VkImageLayout oldL, VkImageLayout newL, uint32_t mips) {
    (void)format;
    VkCommandBuffer cmd = beginSingleTimeCommands(app);
    VkImageMemoryBarrier b = {
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        .oldLayout = oldL, .newLayout = newL,
        .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .image = image,
        .subresourceRange = { VK_IMAGE_ASPECT_COLOR_BIT, 0, mips, 0, 1 },
    };
    VkPipelineStageFlags src, dst;
    if (oldL == VK_IMAGE_LAYOUT_UNDEFINED &&
        newL == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL) {
        b.srcAccessMask = 0;
        b.dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        src = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
        dst = VK_PIPELINE_STAGE_TRANSFER_BIT;
    } else if (oldL == VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL &&
               newL == VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL) {
        b.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        b.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        src = VK_PIPELINE_STAGE_TRANSFER_BIT;
        dst = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
    } else {
        die("unsupported layout transition");
    }
    vkCmdPipelineBarrier(cmd, src, dst, 0, 0, NULL, 0, NULL, 1, &b);
    endSingleTimeCommands(app, cmd);
}`,
  chapter: "Images › Layout transitions; Transition barrier masks"
});
D("copyBufferToImage", {
  title: "Copy Buffer to Image", api: "vkCmdCopyBufferToImage", level: 3, group: "resource",
  summary: "Copies tightly packed pixels from the staging buffer into mip level 0. The image must already be in TRANSFER_DST_OPTIMAL.",
  facts: ["<code>bufferRowLength = 0</code> and <code>bufferImageHeight = 0</code> mean tightly packed rows."],
  code: `static void copyBufferToImage(App *app, VkBuffer buf, VkImage img,
                              uint32_t w, uint32_t h) {
    VkCommandBuffer cmd = beginSingleTimeCommands(app);
    VkBufferImageCopy region = {
        .bufferOffset = 0, .bufferRowLength = 0, .bufferImageHeight = 0,
        .imageSubresource = { VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1 },
        .imageOffset = { 0, 0, 0 },
        .imageExtent = { w, h, 1 },
    };
    vkCmdCopyBufferToImage(cmd, buf, img, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                           1, &region);
    endSingleTimeCommands(app, cmd);
}`,
  chapter: "Images › Copying buffer to image"
});
D("textureView", {
  title: "Texture Image View", api: "createImageView", level: 2, group: "resource",
  summary: "Same helper as the swap chain views, with the texture's format and all of its mip levels.",
  code: `app->textureImageView = createImageView(app, app->textureImage,
    VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_ASPECT_COLOR_BIT, app->mipLevels);`,
  links: ["imageViews"],
  chapter: "Image view and sampler › Texture image view"
});
D("sampler", {
  title: "Sampler", api: "VkSampler", level: 2, group: "resource",
  summary: "Filtering and addressing rules for reading texels. A sampler is independent of any image and can be reused for many.",
  facts: ["mag/min filter: NEAREST (blocky) or LINEAR (smooth).", "Address modes: REPEAT, MIRRORED_REPEAT, CLAMP_TO_EDGE, MIRROR_CLAMP_TO_EDGE, CLAMP_TO_BORDER.", "Normalized coordinates use 0..1 regardless of texture size."],
  code: `static void createTextureSampler(App *app) {
    VkPhysicalDeviceProperties p;
    vkGetPhysicalDeviceProperties(app->physicalDevice, &p);
    VkSamplerCreateInfo ci = {
        .sType = VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO,
        .magFilter = VK_FILTER_LINEAR,
        .minFilter = VK_FILTER_LINEAR,
        .addressModeU = VK_SAMPLER_ADDRESS_MODE_REPEAT,
        .addressModeV = VK_SAMPLER_ADDRESS_MODE_REPEAT,
        .addressModeW = VK_SAMPLER_ADDRESS_MODE_REPEAT,
        .anisotropyEnable = VK_TRUE,
        .maxAnisotropy = p.limits.maxSamplerAnisotropy,
        .borderColor = VK_BORDER_COLOR_INT_OPAQUE_BLACK,
        .unnormalizedCoordinates = VK_FALSE,
        .compareEnable = VK_FALSE,
        .compareOp = VK_COMPARE_OP_ALWAYS,
        .mipmapMode = VK_SAMPLER_MIPMAP_MODE_LINEAR,
        .minLod = 0.0f,
        .maxLod = VK_LOD_CLAMP_NONE,
        .mipLodBias = 0.0f,
    };
    VK_CHECK(vkCreateSampler(app->device, &ci, NULL, &app->textureSampler));
}`,
  chapter: "Image view and sampler › Samplers"
});
D("anisotropy", {
  title: "Anisotropic Filtering", api: "samplerAnisotropy feature", level: 2, group: "resource",
  summary: "Keeps textures sharp at steep viewing angles. It is an optional device feature, so check for it and enable it on the device.",
  code: `/* isDeviceSuitable */
VkPhysicalDeviceFeatures supported;
vkGetPhysicalDeviceFeatures(dev, &supported);
ok = ok && supported.samplerAnisotropy;

/* createLogicalDevice */
features.samplerAnisotropy = VK_TRUE;

/* or skip it: */
ci.anisotropyEnable = VK_FALSE;
ci.maxAnisotropy = 1.0f;`,
  chapter: "Image view and sampler › Anisotropy device feature"
});
D("combinedSampler", {
  title: "Combined Image Sampler", api: "VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER", level: 3, group: "resource",
  summary: "A descriptor type pairing an image view with a sampler, so the fragment shader can call texture().",
  body: `<p>Add a binding to the layout (fragment stage), a pool size of this type, and a write with <code>pImageInfo</code>. See <em>Writing Descriptors</em> for the full code.</p>`,
  code: `VkDescriptorImageInfo imgInfo = {
    .imageLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
    .imageView = app->textureImageView,
    .sampler = app->textureSampler,
};`,
  links: ["descriptorWrites"],
  chapter: "Texture mapping › Combined image sampler"
});
D("textureShader", {
  title: "Sampling in the Shader", api: "sampler2D + texture()", level: 2, group: "resource",
  summary: "Pass UVs through the vertex shader; the fragment shader samples with them. Outputting UVs as color is shader printf debugging.",
  lang: "glsl",
  code: `layout(binding = 1) uniform sampler2D texSampler;
layout(location = 0) in vec3 fragColor;
layout(location = 1) in vec2 fragTexCoord;
layout(location = 0) out vec4 outColor;

void main() {
    // debug: outColor = vec4(fragTexCoord, 0.0, 1.0);
    // tiling: texture(texSampler, fragTexCoord * 2.0)
    outColor = vec4(fragColor * texture(texSampler, fragTexCoord).rgb, 1.0);
}`,
  chapter: "Combined image sampler › Shaders"
});

/* ---------------- Mipmaps ---------------- */
D("mipmaps", {
  title: "Mipmaps", api: "vkCmdBlitImage chain", level: 3, group: "resource",
  summary: "Precomputed half-size copies of a texture. Distant surfaces sample smaller levels: faster and free of Moiré patterns.",
  body: `<p>Allocate the image with all levels, fill level 0 from the buffer, then blit each level into the next, transitioning levels one at a time. Try sizes in the calculator.</p>`,
  widget: "mips",
  chapter: "Generating Mipmaps",
  code: `app->mipLevels = (uint32_t)floor(log2(w > h ? w : h)) + 1;
/* createImage(..., app->mipLevels, ..., TRANSFER_SRC | TRANSFER_DST | SAMPLED, ...) */`,
  diagram: {
    nodes: [["mipCount", 0, 0.6], ["linearCheck", 1.2, 0], ["blitLoop", 1.2, 1.2], ["mipSampler", 2.4, 0.6]],
    edges: [["mipCount", "blitLoop", "levels"], ["linearCheck", "blitLoop", "LINEAR filter ok?"], ["blitLoop", "mipSampler", "all SHADER_READ"]]
  }
});
D("mipCount", {
  title: "Number of Levels", api: "floor(log2(max(w,h))) + 1", level: 2, group: "resource",
  summary: "How many times the largest side halves before reaching 1, plus the original level.",
  widget: "mips",
  code: `#include <math.h>
uint32_t largest = (uint32_t)(w > h ? w : h);
app->mipLevels = (uint32_t)floor(log2((double)largest)) + 1;`,
  chapter: "Generating Mipmaps › Image creation"
});
D("linearCheck", {
  title: "Linear Blit Support", api: "SAMPLED_IMAGE_FILTER_LINEAR_BIT", level: 3, group: "resource",
  summary: "vkCmdBlitImage with LINEAR filtering needs format support. Check, and fall back to another format or CPU resizing.",
  body: `<p>In practice most engines ship mip levels pregenerated in the texture file instead of building them at runtime.</p>`,
  code: `VkFormatProperties fp;
vkGetPhysicalDeviceFormatProperties(app->physicalDevice, imageFormat, &fp);
if (!(fp.optimalTilingFeatures & VK_FORMAT_FEATURE_SAMPLED_IMAGE_FILTER_LINEAR_BIT))
    die("texture image format does not support linear blitting");`,
  chapter: "Generating Mipmaps › Linear filtering support"
});
D("blitLoop", {
  title: "Blit Loop", api: "generateMipmaps", level: 4, group: "sync",
  summary: "For each level i: make i-1 a transfer source, blit i-1 into i at half size, make i-1 shader-readable. Finish the last level after the loop.",
  body: `<p>Blits must go to a queue with graphics capability. Dimensions halve but never drop below 1, which handles non-square images.</p>`,
  code: `static void generateMipmaps(App *app, VkImage img, int32_t w, int32_t h, uint32_t mips) {
    VkCommandBuffer cmd = beginSingleTimeCommands(app);
    VkImageMemoryBarrier b = {
        .sType = VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER, .image = img,
        .srcQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED,
        .subresourceRange = { VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1 },
    };
    for (uint32_t i = 1; i < mips; i++) {
        b.subresourceRange.baseMipLevel = i - 1;
        b.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
        b.newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        b.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        b.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_TRANSFER_BIT,
            VK_PIPELINE_STAGE_TRANSFER_BIT, 0, 0, NULL, 0, NULL, 1, &b);

        VkImageBlit blit = {
            .srcSubresource = { VK_IMAGE_ASPECT_COLOR_BIT, i - 1, 0, 1 },
            .srcOffsets = { {0, 0, 0}, {w, h, 1} },
            .dstSubresource = { VK_IMAGE_ASPECT_COLOR_BIT, i, 0, 1 },
            .dstOffsets = { {0, 0, 0}, {w > 1 ? w / 2 : 1, h > 1 ? h / 2 : 1, 1} },
        };
        vkCmdBlitImage(cmd, img, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,
                       img, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                       1, &blit, VK_FILTER_LINEAR);

        b.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        b.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        b.srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        b.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
        vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_TRANSFER_BIT,
            VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0, NULL, 0, NULL, 1, &b);

        if (w > 1) w /= 2;
        if (h > 1) h /= 2;
    }
    b.subresourceRange.baseMipLevel = mips - 1;          /* never blitted from */
    b.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
    b.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    b.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
    b.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;
    vkCmdPipelineBarrier(cmd, VK_PIPELINE_STAGE_TRANSFER_BIT,
        VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0, NULL, 0, NULL, 1, &b);
    endSingleTimeCommands(app, cmd);
}`,
  links: ["pipelineBarrier"],
  chapter: "Generating Mipmaps › Generating Mipmaps"
});
D("mipSampler", {
  title: "Sampler LOD Settings", api: "minLod / maxLod / mipLodBias", level: 3, group: "resource",
  summary: "The sampler picks a level from screen-space size, adds the bias and clamps to [minLod, maxLod]. LINEAR mipmap mode blends two levels.",
  body: `<p>Setting <code>minLod = mipLevels / 2</code> forces blurrier levels everywhere, which makes the effect easy to see.</p>`,
  code: `samplerInfo.mipmapMode = VK_SAMPLER_MIPMAP_MODE_LINEAR;
samplerInfo.minLod = 0.0f;
samplerInfo.maxLod = VK_LOD_CLAMP_NONE;   /* 1000.0f: use every level */
samplerInfo.mipLodBias = 0.0f;

/* lod   = clamp(lodFromScreenSize + mipLodBias, minLod, maxLod)
   level = clamp(floor(lod), 0, mipLevels - 1)
   lod <= 0 -> magFilter, else minFilter */`,
  chapter: "Generating Mipmaps › Sampler"
});

/* ---------------- Compute ---------------- */
D("compute", {
  title: "Compute Shaders", api: "VkPipeline (compute)", level: 4, group: "compute",
  summary: "General-purpose GPU work outside the graphics pipeline. The tutorial's example moves thousands of particles entirely on the GPU, then draws them.",
  body: `<p>Compute support is mandatory in Vulkan. Because the compute stage is detached from the graphics stages, you can run it whenever you like, and the data never makes a round trip to the CPU.</p>`,
  facts: ["Uses the same descriptor machinery as graphics.", "Buffers can have several usages: storage buffer for compute, vertex buffer for drawing.", "Async compute on a dedicated queue is an advanced topic."],
  chapter: "Compute Shader",
  diagram: {
    nodes: [["computeQueue", 0, 0], ["ssbo", 0, 1.2], ["storageImages", 0, 2.4], ["computeDescriptors", 1.2, 0], ["computeShader", 1.2, 1.2], ["computePipeline", 2.4, 0], ["computeSpace", 2.4, 1.2],
            ["dispatch", 3.6, 0], ["computeSync", 3.6, 1.2], ["particleDraw", 3.6, 2.4]],
    edges: [["ssbo", "computeDescriptors", "bindings 1 + 2"], ["computeDescriptors", "computePipeline", "layout"], ["computeShader", "computePipeline", "single stage"], ["computePipeline", "dispatch", "bound"],
            ["computeSpace", "dispatch", "group count"], ["computeQueue", "dispatch", "submitted to"], ["dispatch", "computeSync", "signals"], ["computeSync", "particleDraw", "VERTEX_INPUT waits"], ["ssbo", "particleDraw", "as vertex buffer"]]
  }
});
D("computeQueue", {
  title: "Compute Queue Family", api: "VK_QUEUE_COMPUTE_BIT", level: 3, group: "compute",
  summary: "The tutorial looks for one family that does both graphics and compute, avoiding cross-queue synchronization.",
  body: `<p>A family with compute but no graphics hints at an asynchronous compute queue, which can run in parallel with rendering.</p>`,
  code: `for (uint32_t i = 0; i < n; i++) {
    if ((fams[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) &&
        (fams[i].queueFlags & VK_QUEUE_COMPUTE_BIT)) {
        idx.graphicsAndComputeFamily = i;
        idx.hasGraphicsAndCompute = 1;
    }
}
vkGetDeviceQueue(app->device, idx.graphicsAndComputeFamily, 0, &app->computeQueue);`,
  chapter: "Compute Shader › Compute queue families"
});
D("ssbo", {
  title: "Shader Storage Buffers", api: "VK_BUFFER_USAGE_STORAGE_BUFFER_BIT", level: 3, group: "compute",
  summary: "Buffers shaders can read and write, of unbounded size. One per frame: each frame reads the previous frame's particles and writes its own.",
  code: `typedef struct Particle {
    float position[2];
    float velocity[2];
    float color[4];
} Particle;   /* 32 bytes, matches std140 here */

for (int i = 0; i < MAX_FRAMES_IN_FLIGHT; i++) {
    createBuffer(app, size,
        VK_BUFFER_USAGE_STORAGE_BUFFER_BIT | VK_BUFFER_USAGE_VERTEX_BUFFER_BIT |
        VK_BUFFER_USAGE_TRANSFER_DST_BIT,
        VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT,
        &app->ssbo[i], &app->ssboMemory[i]);
    copyBuffer(app, staging, app->ssbo[i], size);   /* initial particles */
}`,
  chapter: "Compute Shader › Shader storage buffer objects; Preparing the shader storage buffers"
});
D("storageImages", {
  title: "Storage Images", api: "VK_IMAGE_USAGE_STORAGE_BIT", level: 4, group: "compute",
  summary: "Images a compute shader can read and write per pixel with imageLoad and imageStore. Used for post-processing and filters.",
  lang: "glsl",
  code: `layout(binding = 0, rgba8) uniform readonly  image2D inputImage;
layout(binding = 1, rgba8) uniform writeonly image2D outputImage;

void main() {
    ivec2 p = ivec2(gl_GlobalInvocationID.xy);
    vec4 px = imageLoad(inputImage, p);
    imageStore(outputImage, p, px);
}`,
  chapter: "Compute Shader › Storage images"
});
D("computeDescriptors", {
  title: "Compute Descriptors", api: "VK_SHADER_STAGE_COMPUTE_BIT", level: 3, group: "compute",
  summary: "A UBO with delta time, the last frame's SSBO, and this frame's SSBO. The pool needs twice as many storage-buffer descriptors as frames.",
  code: `VkDescriptorSetLayoutBinding b[3] = {
    { 0, VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER, 1, VK_SHADER_STAGE_COMPUTE_BIT, NULL },
    { 1, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 1, VK_SHADER_STAGE_COMPUTE_BIT, NULL },
    { 2, VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, 1, VK_SHADER_STAGE_COMPUTE_BIT, NULL },
};
/* per frame i: */
VkDescriptorBufferInfo lastFrame = {
    app->ssbo[(i + MAX_FRAMES_IN_FLIGHT - 1) % MAX_FRAMES_IN_FLIGHT],
    0, sizeof(Particle) * PARTICLE_COUNT };
VkDescriptorBufferInfo thisFrame = { app->ssbo[i], 0, sizeof(Particle) * PARTICLE_COUNT };

/* pool: */
VkDescriptorPoolSize sizes[2] = {
    { VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER, MAX_FRAMES_IN_FLIGHT },
    { VK_DESCRIPTOR_TYPE_STORAGE_BUFFER, MAX_FRAMES_IN_FLIGHT * 2 },
};`,
  chapter: "Compute Shader › Descriptors"
});
D("computeShader", {
  title: "The Compute Shader", api: "shader.comp", level: 3, group: "compute",
  summary: "local_size sets invocations per work group; gl_GlobalInvocationID identifies each invocation across the whole dispatch.",
  lang: "glsl",
  code: `#version 450
layout(binding = 0) uniform ParameterUBO { float deltaTime; } ubo;

struct Particle { vec2 position; vec2 velocity; vec4 color; };

layout(std140, binding = 1) readonly buffer ParticleSSBOIn  { Particle particlesIn[];  };
layout(std140, binding = 2)          buffer ParticleSSBOOut { Particle particlesOut[]; };

layout(local_size_x = 256, local_size_y = 1, local_size_z = 1) in;

void main() {
    uint index = gl_GlobalInvocationID.x;
    Particle p = particlesIn[index];
    particlesOut[index].position = p.position + p.velocity.xy * ubo.deltaTime;
    particlesOut[index].velocity = p.velocity;
}`,
  chapter: "Compute Shader › Compute shaders"
});
D("computePipeline", {
  title: "Compute Pipeline", api: "vkCreateComputePipelines", level: 3, group: "compute",
  summary: "Far less state than graphics: one shader stage and a pipeline layout. No render pass, no viewport.",
  code: `VkPipelineLayoutCreateInfo li = {
    .sType = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO,
    .setLayoutCount = 1,
    .pSetLayouts = &app->computeDescriptorSetLayout,
};
VK_CHECK(vkCreatePipelineLayout(app->device, &li, NULL, &app->computePipelineLayout));

VkComputePipelineCreateInfo ci = {
    .sType = VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO,
    .layout = app->computePipelineLayout,
    .stage = {
        .sType = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO,
        .stage = VK_SHADER_STAGE_COMPUTE_BIT,
        .module = computeModule,
        .pName = "main",
    },
};
VK_CHECK(vkCreateComputePipelines(app->device, VK_NULL_HANDLE, 1, &ci, NULL,
                                  &app->computePipeline));`,
  chapter: "Compute Shader › Compute pipelines"
});
D("computeSpace", {
  title: "Work Groups & Invocations", api: "dispatch × local_size", level: 4, group: "compute",
  summary: "vkCmdDispatch sets how many work groups run; the shader's local_size sets invocations per group. Total = groups × local size, per axis.",
  body: `<p>Invocations in one group share memory and may run in parallel. Limits differ per GPU: check <code>maxComputeWorkGroupCount</code>, <code>maxComputeWorkGroupInvocations</code> and <code>maxComputeWorkGroupSize</code>.</p>`,
  widget: "dispatch",
  chapter: "Compute Shader › Compute space"
});
D("dispatch", {
  title: "Dispatch", api: "vkCmdDispatch", level: 3, group: "compute",
  summary: "The compute equivalent of a draw call: bind the compute pipeline and descriptor set, then dispatch PARTICLE_COUNT / 256 groups.",
  body: `<p>If the count is not a multiple of the local size, round the group count up and return early in the shader when <code>gl_GlobalInvocationID.x</code> is out of range.</p>`,
  code: `static void recordComputeCommandBuffer(App *app, VkCommandBuffer cmd) {
    VkCommandBufferBeginInfo bi = { .sType = VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO };
    VK_CHECK(vkBeginCommandBuffer(cmd, &bi));
    vkCmdBindPipeline(cmd, VK_PIPELINE_BIND_POINT_COMPUTE, app->computePipeline);
    vkCmdBindDescriptorSets(cmd, VK_PIPELINE_BIND_POINT_COMPUTE,
                            app->computePipelineLayout, 0, 1,
                            &app->computeDescriptorSets[app->currentFrame], 0, NULL);
    vkCmdDispatch(cmd, PARTICLE_COUNT / 256, 1, 1);
    VK_CHECK(vkEndCommandBuffer(cmd));
}`,
  chapter: "Compute Shader › Running compute commands › Dispatch"
});
D("computeSync", {
  title: "Graphics ↔ Compute Sync", api: "computeFinished semaphore", level: 4, group: "sync",
  summary: "Two submits per frame. The graphics submit waits on the compute semaphore at VERTEX_INPUT and on image-available at COLOR_ATTACHMENT_OUTPUT.",
  body: `<p>Submission order does not guarantee execution order. Without the semaphore the vertex stage could read particles mid-update (read-after-write), or compute could overwrite particles still being drawn (write-after-read).</p>`,
  code: `/* compute */
vkWaitForFences(app->device, 1, &app->computeInFlight[f], VK_TRUE, UINT64_MAX);
updateUniformBuffer(app, f);
vkResetFences(app->device, 1, &app->computeInFlight[f]);
vkResetCommandBuffer(app->computeCommandBuffers[f], 0);
recordComputeCommandBuffer(app, app->computeCommandBuffers[f]);
VkSubmitInfo cs = {
    .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
    .commandBufferCount = 1, .pCommandBuffers = &app->computeCommandBuffers[f],
    .signalSemaphoreCount = 1, .pSignalSemaphores = &app->computeFinished[f],
};
VK_CHECK(vkQueueSubmit(app->computeQueue, 1, &cs, app->computeInFlight[f]));

/* graphics */
VkSemaphore waits[] = { app->computeFinished[f], app->imageAvailable[f] };
VkPipelineStageFlags stages[] = { VK_PIPELINE_STAGE_VERTEX_INPUT_BIT,
                                  VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT };
VkSubmitInfo gs = {
    .sType = VK_STRUCTURE_TYPE_SUBMIT_INFO,
    .waitSemaphoreCount = 2, .pWaitSemaphores = waits, .pWaitDstStageMask = stages,
    .commandBufferCount = 1, .pCommandBuffers = &app->commandBuffers[f],
    .signalSemaphoreCount = 1, .pSignalSemaphores = &app->renderFinished[f],
};
VK_CHECK(vkQueueSubmit(app->graphicsQueue, 1, &gs, app->inFlight[f]));`,
  chapter: "Compute Shader › Synchronizing graphics and compute"
});
D("particleDraw", {
  title: "Drawing the Particles", api: "SSBO as vertex buffer", level: 3, group: "compute",
  summary: "The same buffer the compute shader wrote is bound as a vertex buffer. Velocity is skipped in the attributes: only compute needs it.",
  code: `static void particleAttributes(VkVertexInputAttributeDescription a[2]) {
    a[0] = (VkVertexInputAttributeDescription){ 0, 0, VK_FORMAT_R32G32_SFLOAT,
                                                offsetof(Particle, position) };
    a[1] = (VkVertexInputAttributeDescription){ 1, 0, VK_FORMAT_R32G32B32A32_SFLOAT,
                                                offsetof(Particle, color) };
}
/* topology: VK_PRIMITIVE_TOPOLOGY_POINT_LIST */
VkDeviceSize offsets[] = { 0 };
vkCmdBindVertexBuffers(cmd, 0, 1, &app->ssbo[app->currentFrame], offsets);
vkCmdDraw(cmd, PARTICLE_COUNT, 1, 0, 0);`,
  chapter: "Compute Shader › Drawing the particle system"
});

/* ---------------- Quiz ---------------- */
VK.quiz = [
  { q: "Which object must be created before you can enumerate GPUs?", o: ["VkDevice", "VkInstance", "VkSurfaceKHR", "VkSwapchainKHR"], a: 1, why: "<code>vkEnumeratePhysicalDevices</code> takes the instance. The logical device comes after you pick a GPU.", c: "instance" },
  { q: "Which present mode is guaranteed to be available?", o: ["MAILBOX", "IMMEDIATE", "FIFO", "FIFO_RELAXED"], a: 2, why: "Only <code>VK_PRESENT_MODE_FIFO_KHR</code> is guaranteed, which is why it is the fallback in <code>chooseSwapPresentMode</code>.", c: "presentMode" },
  { q: "Your fence-based loop hangs forever on the very first frame. What is the usual cause?", o: ["The fence was not created with VK_FENCE_CREATE_SIGNALED_BIT", "The semaphore was created signaled", "vkDeviceWaitIdle is missing", "The command pool lacks TRANSIENT_BIT"], a: 0, why: "The first <code>vkWaitForFences</code> waits on a frame that never ran. Creating the fence signaled lets it pass.", c: "fences" },
  { q: "Semaphores are mainly used to…", o: ["Make the CPU wait for the GPU", "Order operations between GPU queue submissions", "Transition image layouts", "Allocate descriptor sets"], a: 1, why: "Semaphores order GPU work (acquire → render → present). Fences are for the CPU.", c: "semaphores" },
  { q: "After flipping Y in the projection matrix your square disappears. What fixes it?", o: ["Disable depth testing", "Set frontFace to COUNTER_CLOCKWISE", "Use VK_POLYGON_MODE_LINE", "Increase lineWidth"], a: 1, why: "The flip reverses winding, so back-face culling removes everything until <code>frontFace</code> matches.", c: "rasterizer" },
  { q: "Why do you need a staging buffer for vertex data?", o: ["Vertex buffers cannot be larger than 64 KB", "Device-local memory is usually not CPU-mappable", "Staging buffers are required by validation layers", "To convert floats to half floats"], a: 1, why: "The fastest memory (DEVICE_LOCAL) is usually not HOST_VISIBLE on discrete GPUs, so you copy on the GPU.", c: "staging" },
  { q: "A struct has <code>vec2 foo; mat4 model;</code>. At what offset does the shader expect <code>model</code>?", o: ["8", "12", "16", "32"], a: 2, why: "A <code>mat4</code> aligns like a <code>vec4</code>: 16 bytes. Without <code>_Alignas(16)</code>, C places it at 8.", c: "uboAlignment" },
  { q: "What does a descriptor set layout describe?", o: ["The concrete buffers bound to a shader", "The types and binding slots of resources a pipeline uses", "The memory heap to allocate from", "The order of subpasses"], a: 1, why: "The layout lists binding types and stages; the descriptor set points at actual resources.", c: "descriptorSetLayout" },
  { q: "Which layout must an image be in before vkCmdCopyBufferToImage writes into it?", o: ["SHADER_READ_ONLY_OPTIMAL", "PRESENT_SRC_KHR", "TRANSFER_DST_OPTIMAL", "GENERAL is required"], a: 2, why: "Transition UNDEFINED → TRANSFER_DST_OPTIMAL with a barrier first.", c: "pipelineBarrier" },
  { q: "How many mip levels does a 1024 × 512 texture get?", o: ["10", "11", "9", "512"], a: 1, why: "floor(log2(1024)) + 1 = 10 + 1 = 11.", c: "mipCount" },
  { q: "Why can't the multisampled color image be presented directly?", o: ["It uses the wrong format", "Multisampled images must be resolved to a single-sample image first", "It has no image view", "Presentation only supports depth images"], a: 1, why: "The subpass resolves it into the swap chain image via <code>pResolveAttachments</code>.", c: "resolveAttachment" },
  { q: "vkAcquireNextImageKHR returns VK_ERROR_OUT_OF_DATE_KHR. What should drawFrame do?", o: ["Throw a fatal error", "Recreate the swap chain and skip this frame", "Present anyway", "Reset the fence and continue"], a: 1, why: "Recreate and return. Don't reset the fence before returning, or the next wait deadlocks.", c: "recreateSwapchain" },
  { q: "A compute shader has local_size_x = 256. How many work groups for 4096 particles?", o: ["4096", "256", "16", "1"], a: 2, why: "4096 / 256 = 16 groups of 256 invocations.", c: "computeSpace" },
  { q: "Which stage should the graphics submit wait at for the compute-finished semaphore?", o: ["TOP_OF_PIPE", "VERTEX_INPUT", "FRAGMENT_SHADER", "BOTTOM_OF_PIPE"], a: 1, why: "Particles are consumed as vertices, so wait at <code>VK_PIPELINE_STAGE_VERTEX_INPUT_BIT</code>.", c: "computeSync" },
  { q: "Why are there two of most per-frame objects (MAX_FRAMES_IN_FLIGHT = 2)?", o: ["The swap chain always has two images", "So the CPU can record one frame while the GPU renders the previous one", "Validation layers require it", "To support stereo rendering"], a: 1, why: "Duplicated resources let CPU and GPU work in parallel without stepping on each other.", c: "framesInFlight" },
  { q: "What does VK_ATTACHMENT_LOAD_OP_CLEAR do?", o: ["Keeps the old contents", "Clears the attachment to a constant at the start of the render pass", "Discards the attachment after rendering", "Clears only the stencil"], a: 1, why: "The clear value comes from <code>VkRenderPassBeginInfo.pClearValues</code>.", c: "colorAttachment" },
  { q: "When can you destroy shader modules?", o: ["Only at program exit", "Right after the pipeline is created", "After the first frame is presented", "Never; the pipeline owns them"], a: 1, why: "SPIR-V is compiled into the pipeline at creation, so modules are only needed until then.", c: "shaderModule" },
  { q: "Why does findMemoryType compare <code>(flags & props) == props</code> instead of just checking non-zero?", o: ["Because flags are signed", "So every requested property is present, not just one of them", "To skip host-coherent memory", "Validation requires it"], a: 1, why: "You may ask for HOST_VISIBLE and HOST_COHERENT together; both must be set.", c: "memoryTypes" }
];
