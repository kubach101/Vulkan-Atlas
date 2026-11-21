/* Interactive widgets shown in the inspector panel. Each takes (host, api) where api = { timer(fn, ms), pulse(id) }. */
window.VKW = (() => {
  const h = (s) => s; // markup helper (trusted, local strings only)
  const hue = (f) => `hsl(${(f * 47) % 360} 55% 44%)`;
  const slotColors = ["var(--g-draw)", "var(--g-compute)", "var(--g-resource)"];

  /* ---------- Present modes ---------- */
  function presentModes(host, api) {
    host.innerHTML = h(`<h4>Present mode simulator</h4>
      <div class="row">
        <label for="pm-mode">Mode
          <select id="pm-mode">
            <option value="FIFO">FIFO (vsync)</option>
            <option value="MAILBOX" selected>MAILBOX</option>
            <option value="FIFO_RELAXED">FIFO_RELAXED</option>
            <option value="IMMEDIATE">IMMEDIATE</option>
          </select></label>
        <label for="pm-fps"><span>App renders at <b id="pm-fpsv">90</b> FPS</span>
          <input id="pm-fps" type="range" min="20" max="200" step="5" value="90"></label>
      </div>
      <div class="modes">
        <div class="queue"><span class="lbl">rendering</span><span id="pm-r"></span></div>
        <div class="queue"><span class="lbl">queue</span><span id="pm-q" style="display:flex;gap:4px"></span></div>
        <div class="queue"><span class="lbl">screen 60Hz</span><span class="screen" id="pm-s">–</span></div>
      </div>
      <div class="out" id="pm-stats"></div>
      <div class="note">Slow motion: one display refresh every 66 ms of real time.</div>`);
    const modeSel = host.querySelector("#pm-mode"), fps = host.querySelector("#pm-fps");
    let S;
    const reset = () => { S = { t: 0, nextV: 1000 / 60, prog: 0, id: 0, q: [], cap: 2, blocked: false, pending: 0, late: false, screen: 0, tear: false, shown: 0, replaced: 0, repeated: 0, tears: 0, waited: 0 }; };
    reset();
    modeSel.addEventListener("change", reset);
    fps.addEventListener("input", () => { host.querySelector("#pm-fpsv").textContent = fps.value; reset(); });
    const step = () => {
      const mode = modeSel.value, frameMs = 1000 / +fps.value;
      S.t += 1;
      if (S.blocked) S.waited++;
      else if ((S.prog += 1) >= frameMs) {
        S.prog = 0; const f = ++S.id;
        if (mode === "IMMEDIATE") { S.screen = f; S.tear = true; S.tears++; S.shown++; }
        else if (mode === "MAILBOX") { if (S.q.length < S.cap) S.q.push(f); else { S.q[S.q.length - 1] = f; S.replaced++; } }
        else if (mode === "FIFO_RELAXED" && S.late) { S.screen = f; S.tear = true; S.tears++; S.shown++; S.late = false; }
        else if (S.q.length < S.cap) S.q.push(f);
        else { S.blocked = true; S.pending = f; }
      }
      if (S.t >= S.nextV) {
        S.nextV += 1000 / 60; S.tear = false;
        if (mode !== "IMMEDIATE") {
          if (S.q.length) { S.screen = S.q.shift(); S.shown++; S.late = false; if (S.blocked) { S.q.push(S.pending); S.blocked = false; } }
          else { S.repeated++; if (mode === "FIFO_RELAXED") S.late = true; }
        }
      }
    };
    const draw = () => {
      const frameMs = 1000 / +fps.value;
      host.querySelector("#pm-r").innerHTML = S.blocked
        ? `<span style="color:var(--l4)">blocked: queue full, frame #${S.pending} waits</span>`
        : `<span class="img" style="background:${hue(S.id + 1)};display:inline-grid;width:${Math.max(6, 30 * S.prog / frameMs)}px">${S.prog / frameMs > .6 ? S.id + 1 : ""}</span>`;
      host.querySelector("#pm-q").innerHTML = S.q.map(f => `<span class="img" style="background:${hue(f)}">${f}</span>`).join("") || `<span style="color:var(--ink-3)">empty</span>`;
      const sc = host.querySelector("#pm-s");
      sc.textContent = S.screen ? "#" + S.screen : "–";
      sc.style.background = S.screen ? hue(S.screen) : "transparent";
      sc.style.color = S.screen ? "#fff" : "inherit";
      sc.classList.toggle("tear", S.tear);
      const secs = S.t / 1000;
      host.querySelector("#pm-stats").innerHTML =
        `frames shown ${S.shown} · replaced ${S.replaced} · repeated refreshes ${S.repeated} · tears ${S.tears}<br>` +
        `app blocked ${secs ? Math.round(100 * S.waited / S.t) : 0}% of the time`;
    };
    api.timer(() => { for (let i = 0; i < 4; i++) step(); draw(); }, 16);
  }

  /* ---------- Frames in flight timeline ---------- */
  function inflight(host) {
    host.innerHTML = h(`<h4>Frames-in-flight timeline</h4>
      <div class="row">
        <label for="fi-n">Frames in flight <select id="fi-n"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label for="fi-c"><span>CPU record <b id="fi-cv">4</b> ms</span> <input id="fi-c" type="range" min="1" max="14" value="4"></label>
        <label for="fi-g"><span>GPU render <b id="fi-gv">7</b> ms</span> <input id="fi-g" type="range" min="1" max="14" value="7"></label>
      </div>
      <div class="timeline" id="fi-t"></div>
      <div class="out" id="fi-s"></div>`);
    const T = 60, q = (s) => host.querySelector(s);
    const run = () => {
      const F = +q("#fi-n").value, c = +q("#fi-c").value, g = +q("#fi-g").value;
      q("#fi-cv").textContent = c; q("#fi-gv").textContent = g;
      const cpu = [], gpu = [], gEnd = [];
      let cEnd = 0, k = 0, waitCpu = 0;
      while (k < 60) {
        const fenceReady = k - F >= 0 ? gEnd[k - F] : 0;
        const cs = Math.max(cEnd, fenceReady); waitCpu += cs - cEnd;
        if (cs >= T) break;
        const ce = cs + c; cEnd = ce;
        const gs = Math.max(ce, k ? gEnd[k - 1] : 0), ge = gs + g; gEnd[k] = ge;
        cpu.push([cs, ce, k]); gpu.push([gs, ge, k]); k++;
      }
      const lane = (name, blocks) => `<div class="lane"><span>${name}</span><div class="track">${blocks.filter(b => b[0] < T).map(([s, e, f]) =>
        `<span class="blk" style="left:${s / T * 100}%;width:${(Math.min(e, T) - s) / T * 100}%;background:${slotColors[f % F]}">${f}</span>`).join("")}</div></div>`;
      q("#fi-t").innerHTML = lane("CPU", cpu) + lane("GPU", gpu) +
        `<div class="lane"><span></span><div style="display:flex;justify-content:space-between;font:10.5px var(--f-mono);color:var(--ink-3)"><span>0 ms</span><span>30</span><span>60 ms</span></div></div>`;
      const done = gpu.filter(b => b[1] <= T).length;
      const gpuBusy = gpu.reduce((a, [s, e]) => a + Math.max(0, Math.min(e, T) - Math.min(s, T)), 0);
      q("#fi-s").innerHTML = `${done} frames finished in 60 ms (≈ ${Math.round(done / 0.06)} FPS) · GPU busy ${Math.round(gpuBusy / T * 100)}% · CPU waited on fences ${Math.round(Math.min(waitCpu, T))} ms<br>` +
        `<span style="color:var(--ink-3)">Block numbers are frame indices; colors are the frame slot (currentFrame).</span>`;
    };
    host.querySelectorAll("select,input").forEach(e => e.addEventListener("input", run));
    run();
  }

  /* ---------- drawFrame stepper ---------- */
  function frameStepper(host, api) {
    const steps = [
      ["waitFence", "<code>vkWaitForFences(inFlight[f])</code>: the CPU blocks until the GPU finished the last frame that used slot <b>f</b>."],
      ["acquire", "<code>vkAcquireNextImageKHR</code> returns an image index at once. <code>imageAvailable[f]</code> signals later, when the image is truly free."],
      ["updateUniform", "<code>memcpy</code> the new matrices into <code>uniformBuffersMapped[f]</code>. Safe, because the fence proved the GPU is done with it."],
      ["recordCommands", "Reset the fence (we are now sure to submit), reset <code>commandBuffers[f]</code> and record into <code>framebuffers[imageIndex]</code>."],
      ["submit", "<code>vkQueueSubmit</code>: wait <code>imageAvailable[f]</code> at COLOR_ATTACHMENT_OUTPUT, signal <code>renderFinished[f]</code> and the fence."],
      ["present", "<code>vkQueuePresentKHR</code> waits on <code>renderFinished[f]</code>. OUT_OF_DATE / SUBOPTIMAL or a resize triggers recreation."],
      ["advanceFrame", "<code>currentFrame = (f + 1) % 2</code>. The next call uses the other slot's objects."]
    ];
    host.innerHTML = h(`<h4>Step through one frame</h4>
      <ol class="steps" id="fs-l">${steps.map(s => `<li>${s[1]}</li>`).join("")}</ol>
      <div class="row" style="align-items:center">
        <button class="btn" id="fs-p" type="button">◀ Prev</button>
        <button class="btn primary" id="fs-n" type="button">Next ▶</button>
        <button class="btn" id="fs-a" type="button">Auto-play</button>
        <span class="out" id="fs-f"></span>
      </div>`);
    let i = -1, frame = 0, auto = null;
    const items = [...host.querySelectorAll("#fs-l li")];
    const show = () => {
      items.forEach((li, k) => { li.className = k === i ? "cur" : k < i ? "past" : ""; });
      host.querySelector("#fs-f").textContent = `frame ${frame} · slot f = ${frame % 2}`;
      api.pulse(i >= 0 ? steps[i][0] : null);
    };
    const next = () => { i++; if (i >= steps.length) { i = 0; frame++; } show(); };
    host.querySelector("#fs-n").onclick = next;
    host.querySelector("#fs-p").onclick = () => { if (i > 0) i--; show(); };
    host.querySelector("#fs-a").onclick = (e) => {
      if (auto) { auto.stop(); auto = null; e.target.textContent = "Auto-play"; return; }
      e.target.textContent = "Pause"; auto = api.timer(next, 1400);
    };
    show();
  }

  /* ---------- std140 alignment lab ---------- */
  function alignment(host) {
    const TYPES = { float: [4, 4, 4], int: [4, 4, 4], vec2: [4, 8, 8], vec3: [4, 16, 12], vec4: [4, 16, 16], mat4: [4, 16, 64] }; // [C align, std140 align, size]
    const defaults = () => [["vec2", "foo"], ["mat4", "model"], ["mat4", "view"], ["mat4", "proj"]];
    let fields = defaults(), fix = false;
    const colors = ["var(--g-draw)", "var(--g-pipeline)", "var(--g-resource)", "var(--g-compute)", "var(--g-setup)", "var(--g-present)", "var(--g-sync)", "var(--ink-2)"];
    const up = (v, a) => Math.ceil(v / a) * a;
    host.innerHTML = h(`<h4>UBO alignment lab</h4>
      <div class="row" id="al-add"></div>
      <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="al-fix"> <span>add <code>_Alignas</code> where the shader needs it</span></label>
      <div class="out" id="al-tab"></div>
      <div class="mem" id="al-mem"></div>
      <div class="mem-legend" id="al-leg"></div>
      <div class="row"><button class="btn" type="button" id="al-reset">Reset to tutorial example</button></div>`);
    host.querySelector("#al-add").innerHTML = Object.keys(TYPES).map(t => `<button class="btn" type="button" data-t="${t}">+ ${t}</button>`).join("");
    const run = () => {
      let c = 0, s = 0; const rows = []; const cells = [];
      fields.forEach(([t, name], i) => {
        const [ca, sa, size] = TYPES[t];
        c = up(c, fix ? sa : ca); s = up(s, sa);
        rows.push([t, name, c, s, i]);
        while (cells.length * 4 < s) cells.push(-1);
        for (let b = 0; b < size; b += 4) cells.push(i);
        c += size; s += size;
      });
      const total = up(s, 16); while (cells.length * 4 < total) cells.push(-1);
      const bad = rows.some(r => r[2] !== r[3]);
      host.querySelector("#al-tab").innerHTML =
        `<table style="border-collapse:collapse;width:100%"><tr style="color:var(--ink-3)"><td>field</td><td>C offset</td><td>shader offset</td><td></td></tr>` +
        rows.map(([t, n, co, so, i]) => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${colors[i % 8]}"></i> ${t} ${n}</td><td>${co}</td><td>${so}</td>
          <td style="color:${co === so ? "var(--l1)" : "var(--l4)"}">${co === so ? "ok" : "wrong"}</td><td><button class="btn" type="button" data-rm="${i}" aria-label="Remove ${n}" style="padding:0 6px">×</button></td></tr>`).join("") +
        `</table><div style="margin-top:6px;color:${bad ? "var(--l4)" : "var(--l1)"}">${bad ? "The shader would read garbage: offsets differ." : "C and shader agree. The square renders."}</div>`;
      host.querySelector("#al-mem").innerHTML = cells.map(i => i < 0 ? `<b class="pad" title="padding"></b>` : `<b style="background:${colors[i % 8]}" title="${fields[i][1]}"></b>`).join("");
      host.querySelector("#al-leg").innerHTML = `<span>each cell = 4 bytes · row = 64 bytes · total ${total} B</span><span><i class="pad" style="background:repeating-linear-gradient(45deg,var(--grid) 0 3px,var(--line) 3px 5px)"></i> padding</span>`;
      host.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { fields.splice(+b.dataset.rm, 1); run(); });
    };
    host.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { if (fields.length < 8) fields.push([b.dataset.t, "f" + (fields.length + 1)]); run(); });
    host.querySelector("#al-fix").onchange = (e) => { fix = e.target.checked; run(); };
    host.querySelector("#al-reset").onclick = () => { fields = defaults(); run(); };
    run();
  }

  /* ---------- mip calculator ---------- */
  function mips(host) {
    host.innerHTML = h(`<h4>Mip chain calculator</h4>
      <div class="row"><label for="mp-w">Width<input id="mp-w" type="number" min="1" max="16384" value="1024"></label>
      <label for="mp-h">Height<input id="mp-h" type="number" min="1" max="16384" value="512"></label></div>
      <div class="out" id="mp-o"></div><div class="bars" id="mp-b"></div>`);
    const run = () => {
      let w = Math.max(1, Math.min(16384, +host.querySelector("#mp-w").value || 1)), hh = Math.max(1, Math.min(16384, +host.querySelector("#mp-h").value || 1));
      const levels = Math.floor(Math.log2(Math.max(w, hh))) + 1, W0 = w;
      let total = 0, base = w * hh * 4, rows = "";
      for (let i = 0; i < levels; i++) {
        const bytes = w * hh * 4; total += bytes;
        rows += `<div class="bar-row"><span>level ${i}</span><i style="width:${Math.max(.4, w / W0 * 100)}%"></i><span>${w}×${hh}</span></div>`;
        if (w > 1) w = Math.floor(w / 2); if (hh > 1) hh = Math.floor(hh / 2);
      }
      const kb = (b) => b >= 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(1) + " KB";
      host.querySelector("#mp-o").innerHTML = `mipLevels = floor(log2(${Math.max(W0, +host.querySelector("#mp-h").value || 1)})) + 1 = <b>${levels}</b><br>RGBA8 memory: ${kb(base)} → ${kb(total)} with mips (+${Math.round((total / base - 1) * 100)}%)`;
      host.querySelector("#mp-b").innerHTML = rows;
    };
    host.querySelectorAll("input").forEach(e => e.addEventListener("input", run));
    run();
  }

  /* ---------- dispatch calculator ---------- */
  function dispatch(host) {
    host.innerHTML = h(`<h4>Dispatch calculator</h4>
      <div class="row"><label for="dp-n">Particles<input id="dp-n" type="number" min="1" max="1000000" value="4096"></label>
      <label for="dp-l">local_size_x<select id="dp-l"><option>32</option><option>64</option><option>128</option><option selected>256</option><option>512</option><option>1024</option></select></label></div>
      <div class="out" id="dp-o"></div><div class="mem" id="dp-g" style="gap:3px"></div>`);
    const run = () => {
      const n = Math.max(1, +host.querySelector("#dp-n").value || 1), l = +host.querySelector("#dp-l").value;
      const groups = Math.ceil(n / l), inv = groups * l, waste = inv - n;
      host.querySelector("#dp-o").innerHTML = `vkCmdDispatch(cmd, <b>${groups}</b>, 1, 1);<br>${groups} groups × ${l} invocations = ${inv} invocations` +
        (waste ? `<br><span style="color:var(--l3)">${waste} extra invocations: add <code>if (index >= COUNT) return;</code> in the shader.</span>` : `<br><span style="color:var(--l1)">Divides evenly: no bounds check needed.</span>`);
      const shown = Math.min(groups, 64);
      host.querySelector("#dp-g").innerHTML = Array.from({ length: shown }, (_, i) =>
        `<b style="background:${i === groups - 1 && waste ? "var(--l3)" : "var(--g-compute)"};border-color:transparent" title="group ${i}"></b>`).join("") +
        (groups > 64 ? `<span class="note">+${groups - 64} more</span>` : "");
    };
    host.querySelectorAll("input,select").forEach(e => e.addEventListener("input", run));
    run();
  }

  /* ---------- barrier picker ---------- */
  function barriers(host) {
    const STAGES = ["TOP_OF_PIPE", "VERTEX_INPUT", "VERTEX_SHADER", "EARLY_FRAGMENT_TESTS", "FRAGMENT_SHADER", "LATE_FRAGMENT_TESTS", "COLOR_ATTACHMENT_OUTPUT", "TRANSFER", "BOTTOM_OF_PIPE"];
    const T = {
      "UNDEFINED → TRANSFER_DST_OPTIMAL": ["0", "TRANSFER_WRITE", "TOP_OF_PIPE", "TRANSFER", "Nothing has to finish first, so wait on nothing at the earliest stage. The copy's writes must wait for the transition."],
      "TRANSFER_DST → SHADER_READ_ONLY": ["TRANSFER_WRITE", "SHADER_READ", "TRANSFER", "FRAGMENT_SHADER", "The texture is read in the fragment shader, so its reads wait for the copy's writes."],
      "UNDEFINED → DEPTH_STENCIL_ATTACHMENT": ["0", "DEPTH_STENCIL_ATTACHMENT_READ | WRITE", "TOP_OF_PIPE", "EARLY_FRAGMENT_TESTS", "Depth is first read in the early fragment tests; pick the earliest stage that uses it."],
      "TRANSFER_DST → TRANSFER_SRC (mip i-1)": ["TRANSFER_WRITE", "TRANSFER_READ", "TRANSFER", "TRANSFER", "The blit reading level i-1 waits for the copy or blit that wrote it."],
      "TRANSFER_SRC → SHADER_READ_ONLY (mip i-1)": ["TRANSFER_READ", "SHADER_READ", "TRANSFER", "FRAGMENT_SHADER", "Once the blit has read the level, sampling may start."]
    };
    host.innerHTML = h(`<h4>Barrier picker</h4>
      <label for="br-s">Transition<select id="br-s">${Object.keys(T).map(k => `<option>${k}</option>`).join("")}</select></label>
      <div class="out" id="br-o"></div>
      <div class="mem-legend" id="br-st" style="gap:4px"></div>`);
    const run = () => {
      const [sa, da, ss, ds, why] = T[host.querySelector("#br-s").value];
      host.querySelector("#br-o").innerHTML = `srcAccessMask = ${sa === "0" ? "0" : "VK_ACCESS_" + sa + "_BIT"}<br>dstAccessMask = VK_ACCESS_${da.replace(" | WRITE", "_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE")}_BIT<br>` +
        `srcStage = VK_PIPELINE_STAGE_${ss}_BIT<br>dstStage = VK_PIPELINE_STAGE_${ds}_BIT<br><span style="font-family:var(--f-body);color:var(--ink-2)">${why}</span>`;
      host.querySelector("#br-st").innerHTML = STAGES.map(s => {
        const c = s === ss && s === ds ? "var(--l3)" : s === ss ? "var(--l2)" : s === ds ? "var(--l4)" : "";
        return `<span style="border:1px solid ${c || "var(--line)"};background:${c ? `color-mix(in srgb, ${c} 18%, transparent)` : "transparent"};border-radius:3px;padding:1px 5px">${s}</span>`;
      }).join("") + `<span style="width:100%;color:var(--ink-3)">blue = source stage · red = destination stage · amber = both</span>`;
    };
    host.querySelector("#br-s").addEventListener("input", run);
    run();
  }

  return { presentModes, inflight, frameStepper, alignment, mips, dispatch, barriers };
})();
