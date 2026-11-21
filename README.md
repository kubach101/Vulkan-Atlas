# Vulkan Atlas

An interactive, zoomable map of the [Vulkan Tutorial](https://vulkan-tutorial.com/) with all code snippets written in C.

- Click a block to read about it; blocks marked **+** open their own, more detailed diagram.
- Every concept is tagged **Basic**, **Intermediate**, **Advanced** or **Expert**.
- Interactive widgets: present-mode simulator, frames-in-flight timeline, `drawFrame()` stepper, std140 alignment lab, mip and dispatch calculators, barrier picker.
- Search (`/` or `Ctrl+K`), quiz mode, progress tracking and a dark mode switch.

It is a static site with no build step: open `index.html` or serve the folder with GitHub Pages.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | Styles and light/dark theme tokens |
| `data-setup.js` | Root map, program setup, instance, validation, surface, devices |
| `data-render.js` | Swap chain, render pass, pipeline, drawing, sync, depth and MSAA |
| `data-resources.js` | Buffers, descriptors, textures, models, mipmaps, compute, quiz |
| `widgets.js` | Interactive panel widgets |
| `app.js` | Diagram rendering, navigation, search, quiz |

Content is based on the Vulkan Tutorial by Alexander Overvoorde (CC BY-SA 4.0); its code listings are CC0.
