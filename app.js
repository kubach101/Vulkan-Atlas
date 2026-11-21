/* Vulkan Atlas: diagram navigation, inspector panel, search, quiz. */
(() => {
  const N = VK.nodes;
  const $ = (s, r = document) => r.querySelector(s);
  const SVG = "http://www.w3.org/2000/svg";
  const NW = 190, NH = 72, CW = 232, RH = 108;
  const MCW = NW + 26, MRH = NH + 38;           // phone grid spacing
  const mobileMq = matchMedia("(max-width: 760px)");
  const isMobile = () => mobileMq.matches;
  const LEVELS = { 1: "Basic", 2: "Intermediate", 3: "Advanced", 4: "Expert" };
  const GROUPS = { setup: "Setup", present: "Presentation", pipeline: "Pipeline", draw: "Drawing", resource: "Resources", compute: "Compute", sync: "Synchronization" };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const S = { stack: ["root"], sel: "root", hover: null, pulse: null, level: 0, done: new Set(store.get("vk-done", [])) };
  let timers = [];

  /* ---------- hierarchy ---------- */
  const parent = {};
  (() => {
    const q = ["root"], seen = new Set(q);
    while (q.length) {
      const id = q.shift(), d = N[id] && N[id].diagram;
      if (!d) continue;
      for (const [cid] of d.nodes) if (N[cid] && !seen.has(cid)) { seen.add(cid); parent[cid] = id; q.push(cid); }
    }
  })();
  const ownerChain = (id) => { const c = []; let p = parent[id]; while (p) { c.unshift(p); p = parent[p]; } return c.length ? c : ["root"]; };
  const owner = () => S.stack[S.stack.length - 1];
  const inDiagram = (o, id) => !!(N[o].diagram && N[o].diagram.nodes.some(n => n[0] === id));
  const totalConcepts = Object.keys(N).length;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const levelBadge = (l) => `<span class="level l${l}" title="Difficulty: ${LEVELS[l]}"><span class="pips">${[1, 2, 3, 4].map(i => `<b class="${i > l ? "off" : ""}"></b>`).join("")}</span>${LEVELS[l]}</span>`;
  const toast = (msg) => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 1600); };

  const KW = new Set("if else for while do return static const typedef struct union enum void break continue sizeof switch case default goto extern inline volatile register in out inout layout uniform buffer readonly writeonly shared".split(" "));
  const TY = /^(Vk[A-Z]\w*|PFN_\w+|u?int\d+_t|size_t|float|int|char|double|long|unsigned|bool|vec[234]|ivec[234]|uvec[234]|dvec[234]|mat[234]|sampler[123]D|image2D|FILE|GLFWwindow|stbi_uc|tinyobj_\w+|App|Vertex|Particle|Foo|QueueFamilyIndices|SwapChainSupport|UniformBufferObject|ParameterUBO|ParticleSSBOIn|ParticleSSBOOut|Camera|Object)$/;
  function highlight(src) {
    const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])')|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?f?u?\b)|([A-Za-z_]\w*)/gm;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)); last = re.lastIndex;
      const t = esc(m[0]);
      if (m[1]) out += `<span class="tok-c">${t}</span>`;
      else if (m[2]) out += `<span class="tok-s">${t}</span>`;
      else if (m[3]) out += `<span class="tok-p">${t}</span>`;
      else if (m[4]) out += `<span class="tok-n">${t}</span>`;
      else {
        const w = m[5];
        if (KW.has(w)) out += `<span class="tok-k">${t}</span>`;
        else if (TY.test(w)) out += `<span class="tok-t">${t}</span>`;
        else if (/^\s*\(/.test(src.slice(last))) out += `<span class="tok-f">${t}</span>`;
        else if (/^[A-Z][A-Z0-9_]{2,}$/.test(w)) out += `<span class="tok-m">${t}</span>`;
        else out += t;
      }
    }
    return out + esc(src.slice(last));
  }

  /* ---------- diagram ---------- */
  const svg = $("#svg");
  let vb = { x: 0, y: 0, w: 1000, h: 600 }, content = { w: 1000, h: 600 };
  const setVB = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

  function edgeGeom(a, b, mobile) {
    const ax = a.x + NW / 2, ay = a.y + NH / 2, bx = b.x + NW / 2, by = b.y + NH / 2, dx = bx - ax, dy = by - ay;
    let p1, p2, c1, c2;
    if (Math.abs(dx) < 1 && Math.abs(dy) > (mobile ? MRH : RH) * 1.5) {
      // same column, rows apart: route around the side instead of through the blocks in between
      const s = mobile && a.x === 0 ? -1 : 1;
      p1 = { x: ax + s * NW / 2, y: ay }; p2 = { x: bx + s * (NW / 2 + 4), y: by };
      c1 = { x: p1.x + s * 34, y: p1.y }; c2 = { x: p2.x + s * 34, y: p2.y };
    } else if (Math.abs(dx) > NW * 0.75 && Math.abs(dx) >= Math.abs(dy) * 0.8) {
      const s = Math.sign(dx); p1 = { x: ax + s * NW / 2, y: ay }; p2 = { x: bx - s * NW / 2 - s * 4, y: by };
      const k = Math.max(28, Math.abs(p2.x - p1.x) * 0.5); c1 = { x: p1.x + s * k, y: p1.y }; c2 = { x: p2.x - s * k, y: p2.y };
    } else {
      const s = Math.sign(dy) || 1; p1 = { x: ax, y: ay + s * NH / 2 }; p2 = { x: bx, y: by - s * NH / 2 - s * 4 };
      const k = Math.max(22, Math.abs(p2.y - p1.y) * 0.5); c1 = { x: p1.x, y: p1.y + s * k }; c2 = { x: p2.x, y: p2.y - s * k };
    }
    const mid = { x: .125 * p1.x + .375 * c1.x + .375 * c2.x + .125 * p2.x, y: .125 * p1.y + .375 * c1.y + .375 * c2.y + .125 * p2.y };
    return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid };
  }

  function renderDiagram(animate) {
    const o = owner(), d = N[o].diagram;
    svg.innerHTML = "";
    const defs = svgEl("defs");
    for (const [id] of [["arrow"], ["arrowHi"]]) {
      const m = svgEl("marker", { id, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
      m.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z" })); defs.appendChild(m);
    }
    svg.appendChild(defs);
    const root = svgEl("g", { class: "scene" }); svg.appendChild(root);
    const mobile = isMobile(), pos = {};
    svg.classList.toggle("m", mobile);
    if (mobile) {
      // phones: reading-order grid, ordered by the desktop column (creation order) then row
      const cols = svg.clientWidth >= 560 ? 3 : 2;
      d.nodes.filter(n => N[n[0]]).slice().sort((p, q) => p[1] - q[1] || p[2] - q[2])
        .forEach(([id], i) => { pos[id] = { x: (i % cols) * MCW, y: Math.floor(i / cols) * MRH }; });
    } else d.nodes.forEach(([id, c, r]) => { if (N[id]) pos[id] = { x: c * CW, y: r * RH }; });
    const showAll = labelsAll();
    const eg = svgEl("g"), ng = svgEl("g"), lg = svgEl("g");
    root.append(eg, ng, lg);
    d.edges.forEach(([a, b, label]) => {
      if (!pos[a] || !pos[b]) return;
      const g = svgEl("g", { class: "edge", "data-a": a, "data-b": b }), geo = edgeGeom(pos[a], pos[b], mobile);
      g.appendChild(svgEl("path", { d: geo.d, "marker-end": "url(#arrow)" }));
      const flow = svgEl("path", { d: geo.d, class: "flow" }); flow.style.display = "none"; g.appendChild(flow);
      eg.appendChild(g);
      if (label) {
        const t = svgEl("text", { x: geo.mid.x, y: geo.mid.y - 5, "text-anchor": "middle", class: "edge-label", "data-a": a, "data-b": b });
        t.textContent = label; t.style.display = showAll ? "" : "none";
        const lgWrap = svgEl("g", { class: "edge", "data-a": a, "data-b": b }); lgWrap.appendChild(t); lg.appendChild(lgWrap);
      }
    });
    d.nodes.forEach(([id]) => {
      const n = N[id]; if (!n) return;
      const p = pos[id];
      const g = svgEl("g", { class: "node", transform: `translate(${p.x},${p.y})`, tabindex: "0", role: "button", "data-id": id,
        "aria-label": `${n.title}, ${LEVELS[n.level]}${n.diagram && id !== o ? ", opens a diagram" : ""}` });
      [16, 32, 48].forEach(y => { g.appendChild(svgEl("rect", { class: "pin", x: -4, y: y + 2, width: 4, height: 6, rx: 1 })); g.appendChild(svgEl("rect", { class: "pin", x: NW, y: y + 2, width: 4, height: 6, rx: 1 })); });
      g.appendChild(svgEl("rect", { class: "body", width: NW, height: NH, rx: 6 }));
      g.appendChild(svgEl("rect", { class: "band", x: 1, y: 1, width: 5, height: NH - 2, rx: 2, fill: `var(--g-${n.group})` }));
      const t = svgEl("text", { class: "t", x: 16, y: 31 }); t.textContent = n.title;
      if (n.title.length > 17) t.style.fontSize = n.title.length > 21 ? "11.5px" : "12.5px";
      g.appendChild(t);
      const maxApi = n.diagram && id !== o ? 21 : 25;   // leave room for the + badge
      const s = svgEl("text", { class: "s", x: 16, y: 52 }); s.textContent = n.api.length > maxApi ? n.api.slice(0, maxApi - 1) + "…" : n.api; g.appendChild(s);
      for (let i = 0; i < 4; i++) {
        const c = svgEl("circle", { cx: NW - 41 + i * 9, cy: 12, r: 3, class: i < n.level ? "lvl-pip" : "lvl-off" });
        if (i < n.level) c.setAttribute("fill", `var(--l${n.level})`);
        g.appendChild(c);
      }
      if (S.done.has(id)) g.appendChild(svgEl("path", { class: "done-mark", d: `M${NW - 60},11 l3,3 l6,-7 l1.6,1.4 l-7.6,8.6 l-4.6,-4.6z` }));
      if (n.diagram && id !== o) {
        g.appendChild(svgEl("rect", { class: "expand", x: NW - 28, y: NH - 24, width: 20, height: 16, rx: 3 }));
        const pl = svgEl("text", { class: "expand-t", x: NW - 18, y: NH - 12, "text-anchor": "middle" }); pl.textContent = "+"; g.appendChild(pl);
      }
      const tt = svgEl("title"); tt.textContent = `${n.title} (${LEVELS[n.level]})\n${n.summary}`; g.appendChild(tt);
      g.addEventListener("click", () => { if (!suppressClick) open(id); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(id); } });
      // hover only for real mice: a tap would otherwise leave the dimming stuck on
      g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { S.hover = id; updateHighlight(); } });
      g.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { S.hover = null; updateHighlight(); } });
      ng.appendChild(g);
    });
    const xs = Object.values(pos).map(p => p.x), ys = Object.values(pos).map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs) + NW, maxY = Math.max(...ys) + NH;
    content = mobile
      ? { x: minX - 34, y: minY - 14, w: maxX - minX + 68, h: maxY - minY + 28 }
      : { x: minX - 40, y: minY - 70, w: maxX - minX + 80, h: maxY - minY + 170 };
    svg.style.height = mobile ? `${Math.round(svg.clientWidth * content.h / content.w)}px` : "";
    fit();
    updateHighlight();
    renderCrumbs();
    $("#dtitle").innerHTML = `<b>${esc(N[o].title)}</b>${d.nodes.length} concepts · ${mobile ? "tap" : "click"} a block, + opens its diagram`;
    if (animate && !reduceMotion && root.animate) root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  }
  function fit() { vb = { ...content }; setVB(); }
  const labelsAll = () => { const d = N[owner()].diagram; return !isMobile() && d.labels !== "hover" && d.edges.length <= 12; };

  function updateHighlight() {
    const o = owner();
    const focus = S.hover || S.pulse || (inDiagram(o, S.sel) ? S.sel : null);
    const nbrs = new Set();
    svg.querySelectorAll(".edge").forEach(g => {
      const a = g.dataset.a, b = g.dataset.b, hi = !!focus && (a === focus || b === focus);
      if (hi) { nbrs.add(a); nbrs.add(b); }
      g.classList.toggle("hi", hi);
      g.classList.toggle("dim", !!S.hover && !hi);
      const p = g.querySelector("path"); if (p) p.setAttribute("marker-end", hi ? "url(#arrowHi)" : "url(#arrow)");
      const f = g.querySelector(".flow"); if (f) f.style.display = hi && !reduceMotion ? "" : "none";
      const t = g.querySelector("text");
      if (t) t.style.display = labelsAll() || hi ? "" : "none";
    });
    svg.querySelectorAll(".node").forEach(g => {
      const id = g.dataset.id;
      g.classList.toggle("sel", id === S.sel || id === S.pulse);
      const lvlDim = S.level && N[id].level !== S.level;
      g.classList.toggle("dim", lvlDim || (!!S.hover && id !== S.hover && !nbrs.has(id)));
    });
  }

  function renderCrumbs() {
    const c = $("#crumbs"); c.innerHTML = "";
    S.stack.forEach((id, i) => {
      if (i) { const s = document.createElement("span"); s.className = "crumb-sep"; s.textContent = "›"; c.appendChild(s); }
      const b = document.createElement("button"); b.className = "crumb"; b.type = "button"; b.textContent = N[id].title;
      if (i === S.stack.length - 1) b.setAttribute("aria-current", "page"); else b.onclick = () => open(id);
      c.appendChild(b);
    });
  }

  /* ---------- navigation ---------- */
  function open(id, opts = {}) {
    if (!N[id]) return;
    const before = owner();
    const idx = S.stack.indexOf(id);
    if (idx >= 0) S.stack = S.stack.slice(0, idx + 1);
    else if (inDiagram(before, id)) { if (N[id].diagram) S.stack.push(id); }
    else { S.stack = id === "root" ? ["root"] : ownerChain(id).slice(); if (N[id].diagram && id !== "root") S.stack.push(id); }
    S.sel = id; S.pulse = null;
    const changed = owner() !== before;
    if (changed || opts.force) renderDiagram(true); else updateHighlight();
    renderPanel(id);
    if (location.hash.slice(1) !== id) { try { history.replaceState(null, "", "#" + id); } catch (e) { location.hash = id; } }
    if (isMobile()) {
      // opening a diagram shows the map; picking a block inside it opens the details sheet
      if (changed) { const top = $(".board").getBoundingClientRect().top; if (top < 0) window.scrollTo({ top: scrollY + top, behavior: reduceMotion ? "auto" : "smooth" }); }
      setSheet(opts.sheet != null ? opts.sheet : !changed);
    }
  }
  const up = () => { if (S.stack.length > 1) open(S.stack[S.stack.length - 2]); };

  /* ---------- bottom sheet (phones) ---------- */
  const panelEl = $("#panel"), backdrop = $("#sheet-backdrop"), sheetBar = $("#sheet-bar");
  const sheetOpen = () => panelEl.classList.contains("open");
  function setSheet(want) {
    const on = isMobile() && !!want;
    panelEl.classList.toggle("open", on);
    backdrop.hidden = !on;
    $("#sheet-toggle").setAttribute("aria-expanded", String(on));
    $("#panel-in").inert = isMobile() && !on;
    if (!on) panelEl.scrollTop = 0;
  }
  let swipeY = null, ignoreTap = false;
  sheetBar.addEventListener("click", () => { if (!ignoreTap) setSheet(!sheetOpen()); });
  sheetBar.addEventListener("touchstart", (e) => { swipeY = e.touches[0].clientY; }, { passive: true });
  sheetBar.addEventListener("touchend", (e) => {
    if (swipeY == null) return;
    const dy = e.changedTouches[0].clientY - swipeY; swipeY = null;
    if (Math.abs(dy) > 30) { setSheet(dy < 0); ignoreTap = true; setTimeout(() => { ignoreTap = false; }, 400); }
  });
  backdrop.addEventListener("click", () => setSheet(false));

  /* ---------- panel ---------- */
  function renderPanel(id) {
    timers.forEach(t => t.stop()); timers = [];
    const n = N[id], o = owner(), panel = $("#panel-in");
    const d = N[o].diagram;
    const conns = [];
    if (d && id !== o) d.edges.forEach(([a, b, l]) => { if (a === id && N[b]) conns.push(["→", b, l]); if (b === id && N[a]) conns.push(["←", a, l]); });
    const related = (n.links || []).filter(x => N[x]);
    const isDone = S.done.has(id);
    const lang = n.lang || "c";
    const langName = { c: "C", glsl: "GLSL", sh: "shell" }[lang];
    let html = `
      <div class="eyebrow"><span class="group-chip"><i style="background:var(--g-${n.group})"></i>${GROUPS[n.group]}</span>${levelBadge(n.level)}</div>
      <h2 id="panel-title" tabindex="-1">${esc(n.title)}</h2>
      <div class="api">${esc(n.api)}</div>
      <p class="lead">${n.summary}</p>
      <div class="actions">
        <button class="btn ${isDone ? "done" : ""}" type="button" id="btn-done">${isDone ? "✓ Understood" : "Mark as understood"}</button>
        ${n.diagram && id !== o ? `<button class="btn primary" type="button" id="btn-dive">Open diagram</button>` : ""}
        ${S.stack.length > 1 ? `<button class="btn" type="button" id="btn-up">↑ Up a level</button>` : ""}
      </div>`;
    if (n.widget) html += `<div class="widget" id="widget"></div>`;
    if (n.body) html += `<h3>How it works</h3><div class="prose">${n.body}</div>`;
    if (n.facts && n.facts.length) html += `<h3>Key facts</h3><ul class="facts">${n.facts.map(f => `<li>${f}</li>`).join("")}</ul>`;
    if (n.code) html += `<h3>Code</h3><div class="code-wrap"><div class="code-head"><span>${langName}</span><button type="button" id="btn-copy">Copy</button></div><pre class="code" id="code">${highlight(n.code)}</pre></div>`;
    if (id === o && d) {
      html += `<h3>Inside this diagram</h3><div class="links">${d.nodes.filter(([c]) => N[c] && c !== id).map(([c]) =>
        `<button class="link-chip" type="button" data-go="${c}">${esc(N[c].title)} <span class="dir">${"●".repeat(N[c].level)}</span>${N[c].diagram ? " +" : ""}</button>`).join("")}</div>`;
    }
    if (conns.length) html += `<h3>Connections</h3><div class="links">${conns.map(([dir, c, l]) =>
      `<button class="link-chip" type="button" data-go="${c}"><span class="dir">${dir}</span>${esc(N[c].title)}${l ? ` <span class="dir">${esc(l)}</span>` : ""}</button>`).join("")}</div>`;
    if (related.length) html += `<h3>Related</h3><div class="links">${related.map(c => `<button class="link-chip" type="button" data-go="${c}">${esc(N[c].title)}</button>`).join("")}</div>`;
    if (n.chapter) html += `<div class="chapter">Tutorial chapter: ${esc(n.chapter)}</div>`;
    panel.innerHTML = html;
    $("#sheet-title").innerHTML = `<b>${esc(n.title)}</b><span class="lvl-mini l${n.level}">${LEVELS[n.level]}</span>`;

    $("#btn-done").onclick = () => toggleDone(id);
    const dive = $("#btn-dive"); if (dive) dive.onclick = () => open(id);
    const upb = $("#btn-up"); if (upb) upb.onclick = up;
    panel.querySelectorAll("[data-go]").forEach(b => b.onclick = () => open(b.dataset.go));
    const cp = $("#btn-copy");
    if (cp) cp.onclick = () => {
      const fallback = () => { const r = document.createRange(); r.selectNodeContents($("#code")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected: press Ctrl+C to copy"); };
      try { navigator.clipboard.writeText(n.code).then(() => toast("Copied"), fallback); } catch (e) { fallback(); }
    };
    if (n.widget && VKW[n.widget]) VKW[n.widget]($("#widget"), {
      timer(fn, ms) { const h = setInterval(fn, ms); const t = { stop: () => clearInterval(h) }; timers.push(t); return t; },
      pulse(pid) { S.pulse = pid && inDiagram(owner(), pid) ? pid : null; updateHighlight(); }
    });
    $("#panel").scrollTop = 0;
  }

  function toggleDone(id) {
    if (S.done.has(id)) S.done.delete(id); else S.done.add(id);
    store.set("vk-done", [...S.done]);
    updateProgress();
    renderPanel(id);
    renderDiagramKeepView();
  }
  function renderDiagramKeepView() { const keep = { ...vb }; renderDiagram(false); vb = keep; setVB(); }
  function updateProgress() {
    const n = S.done.size;
    $("#prog-t").textContent = `${n} / ${totalConcepts}`;
    $("#prog-bar").style.width = `${n / totalConcepts * 100}%`;
  }

  /* ---------- pan & zoom ---------- */
  let suppressClick = false;
  const pointers = new Map();
  let drag = null, pinch = null;
  const toSvg = (cx, cy) => { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  function zoomAt(cx, cy, f) {
    const nw = vb.w * f;
    if (nw < content.w * 0.3 || nw > content.w * 3.5) return;
    const p = toSvg(cx, cy);
    vb = { x: p.x - (p.x - vb.x) * f, y: p.y - (p.y - vb.y) * f, w: vb.w * f, h: vb.h * f }; setVB();
  }
  svg.addEventListener("pointerdown", (e) => {
    if (isMobile()) return;   // phones scroll the page instead of panning
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, id: e.pointerId };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) { zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.d / d); pinch.d = d; }
      if (drag) drag.moved = true;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; svg.classList.add("dragging"); try { svg.setPointerCapture(e.pointerId); } catch (_) { } }
    if (drag.moved) { const k = svg.getScreenCTM().a; vb.x = drag.vx - dx / k; vb.y = drag.vy - dy / k; setVB(); }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && pointers.size === 0) {
      if (drag.moved) { suppressClick = true; setTimeout(() => suppressClick = false, 50); }
      drag = null; svg.classList.remove("dragging");
    }
  };
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("wheel", (e) => { if (isMobile()) return; e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  $("#z-in").onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); };
  $("#z-out").onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); };
  $("#z-fit").onclick = fit;

  /* ---------- level filter ---------- */
  $("#legend").innerHTML = `<span>Filter:</span>` + [1, 2, 3, 4].map(l =>
    `<button class="level l${l}" type="button" data-level="${l}" style="background:transparent;cursor:pointer" aria-pressed="false">${LEVELS[l]}</button>`).join("");
  $("#legend").querySelectorAll("[data-level]").forEach(b => b.onclick = () => {
    const l = +b.dataset.level; S.level = S.level === l ? 0 : l;
    $("#legend").querySelectorAll("[data-level]").forEach(x => { const on = +x.dataset.level === S.level; x.setAttribute("aria-pressed", on); x.style.background = on ? "var(--surface-2)" : "transparent"; });
    updateHighlight();
  });

  /* ---------- search ---------- */
  const overlay = $("#overlay");
  function closeOverlay() { overlay.hidden = true; overlay.innerHTML = ""; timers.forEach(() => { }); }
  function openSearch() {
    overlay.hidden = false;
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-label="Search concepts"><input type="search" id="q" placeholder="Search concepts, API names… e.g. fence, vkCmdDraw, mipmap" autocomplete="off"><div class="results" id="results" role="listbox"></div></div>`;
    const q = $("#q"), res = $("#results");
    let items = [], cur = 0;
    const run = () => {
      const terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      items = Object.values(N).map(n => {
        const t = n.title.toLowerCase(), a = n.api.toLowerCase(), s = (n.summary + " " + (n.body || "") + " " + (n.code || "")).toLowerCase();
        let score = 0;
        for (const w of terms) {
          const sc = t.startsWith(w) ? 6 : t.includes(w) ? 4 : a.includes(w) ? 3 : s.includes(w) ? 1 : 0;
          if (!sc) return null; score += sc;
        }
        return terms.length ? { n, score } : { n, score: -ownerChain(n.id).length };
      }).filter(Boolean).sort((x, y) => y.score - x.score).slice(0, 40);
      cur = 0; draw();
    };
    const draw = () => {
      res.innerHTML = items.length ? items.map(({ n }, i) => `<div class="result" role="option" aria-selected="${i === cur}" data-id="${n.id}">
        <b>${esc(n.title)}</b>${levelBadge(n.level)}<span class="path">${esc(ownerChain(n.id).map(x => N[x].title).join(" › "))} · ${esc(n.api)}</span><small>${n.summary.replace(/<[^>]+>/g, "")}</small></div>`).join("")
        : `<div class="result"><small>No concept matches. Try an API name like <code>vkQueueSubmit</code>.</small></div>`;
      res.querySelectorAll("[data-id]").forEach(r => r.onclick = () => { closeOverlay(); open(r.dataset.id, { sheet: true }); });
      const c = res.querySelector('[aria-selected="true"]'); if (c) c.scrollIntoView({ block: "nearest" });
    };
    q.addEventListener("input", run);
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { cur = Math.min(items.length - 1, cur + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { cur = Math.max(0, cur - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter" && items[cur]) { const id = items[cur].n.id; closeOverlay(); open(id, { sheet: true }); }
    });
    run(); q.focus();
  }

  /* ---------- quiz ---------- */
  function openQuiz() {
    const qs = VK.quiz.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    let i = 0, score = 0, answered = false;
    overlay.hidden = false;
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-label="Quiz"><div class="quiz" id="quiz"></div></div>`;
    const box = $("#quiz");
    const draw = () => {
      if (i >= qs.length) {
        box.innerHTML = `<h2>Score: ${score} / ${qs.length}</h2><p class="q">${score === qs.length ? "Flawless. Your validation layers would be bored." : score >= qs.length * 0.6 ? "Solid. Revisit the ones you missed in the map." : "Keep exploring the map and try again."}</p>
          <div class="foot"><button class="btn" type="button" id="qz-close">Close</button><button class="btn primary" type="button" id="qz-again">Another round</button></div>`;
        $("#qz-close").onclick = closeOverlay; $("#qz-again").onclick = openQuiz; return;
      }
      const q = qs[i]; answered = false;
      box.innerHTML = `<div class="meta"><span>Question ${i + 1} of ${qs.length}</span><span>Score ${score}</span></div>
        <h2>Quick check</h2><div class="q">${q.q}</div>
        <div class="opts">${q.o.map((o, k) => `<button class="opt" type="button" data-k="${k}">${o}</button>`).join("")}</div>
        <div id="qz-ex"></div>
        <div class="foot"><button class="btn" type="button" id="qz-close">Close</button><span style="display:flex;gap:8px"><button class="btn" type="button" id="qz-go" hidden>Open concept</button><button class="btn primary" type="button" id="qz-next" hidden>Next</button></span></div>`;
      box.querySelectorAll(".opt").forEach(b => b.onclick = () => {
        if (answered) return; answered = true;
        const k = +b.dataset.k, ok = k === q.a; if (ok) score++;
        box.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (+x.dataset.k === q.a) x.classList.add("right"); });
        if (!ok) b.classList.add("wrong");
        $("#qz-ex").innerHTML = `<div class="explain"><b>${ok ? "Correct." : "Not quite."}</b> ${q.why}</div>`;
        $("#qz-next").hidden = false; $("#qz-go").hidden = !N[q.c]; $("#qz-next").focus();
      });
      $("#qz-close").onclick = closeOverlay;
      $("#qz-next").onclick = () => { i++; draw(); };
      $("#qz-go").onclick = () => { closeOverlay(); open(q.c, { sheet: true }); };
    };
    draw();
  }

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
  $("#btn-search").onclick = openSearch;
  $("#btn-quiz").onclick = openQuiz;

  /* ---------- theme ---------- */
  const darkMq = matchMedia("(prefers-color-scheme: dark)");
  let theme = store.get("vk-theme", "system");
  const isDark = () => theme === "dark" || (theme === "system" && darkMq.matches);
  const applyTheme = () => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", theme);
    const sw = $("#btn-theme");
    sw.setAttribute("aria-checked", String(isDark()));
    sw.title = isDark() ? "Switch to light mode" : "Switch to dark mode";
  };
  $("#btn-theme").onclick = () => { theme = isDark() ? "light" : "dark"; store.set("vk-theme", theme); applyTheme(); };
  if (darkMq.addEventListener) darkMq.addEventListener("change", applyTheme);
  applyTheme();

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); openSearch(); return; }
    if (e.key === "Escape") {
      if (!overlay.hidden) closeOverlay();
      else if (isMobile() && sheetOpen()) setSheet(false);
      else if (!typing) up();
    }
  });
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && N[id] && id !== S.sel) open(id); });

  // re-layout when the phone/desktop mode or the phone width changes (not on URL-bar height changes)
  const layoutKey = () => isMobile() ? "m" + svg.clientWidth : "d";
  let lastLayout = null, resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const k = layoutKey();
      if (k !== lastLayout) { lastLayout = k; renderDiagram(false); setSheet(sheetOpen()); }
    }, 150);
  });

  /* ---------- boot ---------- */
  updateProgress();
  const start = N[location.hash.slice(1)] ? location.hash.slice(1) : "root";
  renderDiagram(false);
  open(start, { force: true, sheet: start !== "root" && !N[start].diagram });
  lastLayout = layoutKey();
})();
