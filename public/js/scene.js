// Fleet node globe (three.js, vendored). Core = the server, nodes = apps. Returns null when WebGL is unavailable
// so the caller can keep the SVG radar. Labels are real links in the DOM, so keyboard and screen readers still work.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = { healthy: '#d8ccff', degraded: '#f0abfc', crashing: '#fb7185', down: '#fb7185', stopped: '#6b6880', unknown: '#6b6880' };

export async function mountScene(box, { apps, hostLabel = 'VPS', onOpen }) {
  let T;
  try { T = await import('/vendor/three.module.min.js'); } catch { return null; }
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) return null;
  } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'scene-canvas';
  box.append(canvas);
  const labels = document.createElement('div');
  labels.className = 'scene-labels';
  labels.setAttribute('role', 'list');
  box.append(labels);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0.5, 11.4);
  const root = new T.Group();
  scene.add(root);

  const cyan = new T.Color('#a78bfa'), violet = new T.Color('#6d3df5');

  /* glow texture for sprites */
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  })();

  /* core: wire icosahedron + fresnel shell + inner glow */
  const core = new T.Group(); root.add(core);
  const NP = 2600, pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NP; i++) {
    const y = 1 - (2 * (i + 0.5)) / NP, r = Math.sqrt(1 - y * y), th = i * GA, k = 1.2 + (Math.random() - 0.5) * 0.06;
    pp.set([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k], i * 3);
    const m = cyan.clone().lerp(violet, Math.random() * 0.8); pc.set([m.r, m.g, m.b], i * 3);
  }
  const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pp, 3)); pg.setAttribute('color', new T.BufferAttribute(pc, 3));
  const wire = new T.Points(pg, new T.PointsMaterial({ map: tex, size: 0.085, vertexColors: true, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }));
  core.add(wire);
  const fres = new T.Mesh(new T.SphereGeometry(1.32, 48, 32), new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.FrontSide,
    uniforms: { c1: { value: cyan }, c2: { value: violet } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; uniform vec3 c1; uniform vec3 c2; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); gl_FragColor = vec4(mix(c2, c1, f) * f * 1.5, f * 0.9); }',
  }));
  core.add(fres);
  const heart = new T.Sprite(new T.SpriteMaterial({ map: tex, color: cyan, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
  heart.scale.set(2.6, 2.6, 1); core.add(heart);

  /* orbit rings */
  const rings = [];
  [[2.1, 0.35, 0.0], [2.9, -0.5, 0.5], [3.7, 0.9, -0.3]].forEach(([r, tx, tz], i) => {
    const pts = []; for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: i === 1 ? new T.Color('#e879f9') : cyan, transparent: true, opacity: 0.4, dashSize: 0.05, gapSize: 0.1, blending: T.AdditiveBlending, depthWrite: false }));
    l.computeLineDistances(); l.rotation.set(tx, 0, tz); l.userData.spin = 0.08 + i * 0.03; root.add(l); rings.push(l);
  });

  /* starfield */
  const starGeo = new T.BufferGeometry(), N = 700, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = 8 + Math.random() * 14, a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1); sp.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
  starGeo.setAttribute('position', new T.BufferAttribute(sp, 3));
  const stars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xb9a6ff, size: 0.04, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
  scene.add(stars);

  /* nodes */
  let nodes = [], key = '';
  const netGroup = new T.Group(); root.add(netGroup);
  const packets = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({ map: tex, size: 0.32, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffffff }));
  root.add(packets);

  function build(list) {
    nodes.forEach((n) => { n.group.removeFromParent(); n.line.removeFromParent(); n.link.remove(); n.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); n.line.geometry.dispose(); n.line.material.dispose(); });
    nodes = []; netGroup.clear(); labels.replaceChildren();
    const n = list.length;
    list.forEach((a, i) => {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(n, 1)), th = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      const R = 3.15 + (i % 3) * 0.45;
      const p = new T.Vector3(R * Math.sin(phi) * Math.cos(th), R * Math.cos(phi) * 0.82, R * Math.sin(phi) * Math.sin(th));
      const g = new T.Group(); g.position.copy(p);
      const col = new T.Color(COLORS[a.status] || COLORS.unknown);
      const dot = new T.Mesh(new T.OctahedronGeometry(0.17, 0), new T.MeshBasicMaterial({ color: col, wireframe: a.status === 'stopped' }));
      const halo = new T.Sprite(new T.SpriteMaterial({ map: tex, color: col, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
      halo.scale.set(0.95, 0.95, 1);
      g.add(dot, halo); netGroup.add(g);
      const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), p]), new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false }));
      root.add(line);
      const link = document.createElement('a');
      link.className = 'scene-label'; link.href = `#/app/${a.id}`; link.setAttribute('role', 'listitem'); link.dataset.s = a.status;
      const dotEl = document.createElement('i'); const txt = document.createElement('span'); txt.textContent = a.name;
      link.append(dotEl, txt);
      link.addEventListener('pointerenter', () => { node.hot = true; }); link.addEventListener('pointerleave', () => { node.hot = false; });
      link.addEventListener('focus', () => { node.hot = true; }); link.addEventListener('blur', () => { node.hot = false; });
      if (onOpen) link.addEventListener('click', (e) => { e.preventDefault(); onOpen(a.id); });
      labels.append(link);
      const node = { id: a.id, group: g, dot, halo, line, link, p, hot: false, ph: Math.random() * 6.283, status: a.status };
      nodes.push(node);
    });
    const pos = new Float32Array(Math.max(n, 1) * 3 * 2);
    packets.geometry.setAttribute('position', new T.BufferAttribute(pos, 3));
    packets.geometry.setDrawRange(0, n * 2);
  }

  function recolor(list) {
    list.forEach((a) => {
      const nd = nodes.find((x) => x.id === a.id); if (!nd || nd.status === a.status) return;
      nd.status = a.status; const col = new T.Color(COLORS[a.status] || COLORS.unknown);
      nd.dot.material.color.copy(col); nd.dot.material.wireframe = a.status === 'stopped'; nd.halo.material.color.copy(col); nd.line.material.color.copy(col); nd.link.dataset.s = a.status;
    });
  }

  function setApps(list) {
    const k = list.map((a) => a.id).join();
    if (k !== key) { key = k; build(list); } else recolor(list);
    if (reduce) frame(0);
  }

  /* sizing */
  const size = () => {
    const w = box.clientWidth || 400, hgt = box.clientHeight || 400;
    renderer.setSize(w, hgt, false); canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / hgt; camera.fov = w / hgt < 0.9 ? 52 : 42; camera.updateProjectionMatrix();
    if (reduce) frame(0);
  };
  const ro = new ResizeObserver(size); ro.observe(box);

  /* pointer parallax */
  const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onMove = (e) => { const r = box.getBoundingClientRect(); tgt.x = ((e.clientX - r.left) / r.width - 0.5) * 2; tgt.y = ((e.clientY - r.top) / r.height - 0.5) * 2; };
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerleave', () => { tgt.x = 0; tgt.y = 0; });

  const v = new T.Vector3();
  let t0 = performance.now(), run = true, visible = true, raf = 0;
  function frame(dt) {
    const t = (performance.now() - t0) / 1000;
    cur.x += (tgt.x - cur.x) * 0.05; cur.y += (tgt.y - cur.y) * 0.05;
    if (!reduce) root.rotation.y += dt * 0.12;
    root.rotation.x = cur.y * 0.22 - 0.18; root.rotation.z = -cur.x * 0.06;
    camera.position.x = cur.x * 0.5;
    core.rotation.y += dt * 0.12;
    heart.material.opacity = 0.72 + Math.sin(t * 1.8) * 0.16;
    rings.forEach((r) => { r.rotation.y += dt * r.userData.spin; });
    stars.rotation.y += dt * 0.01;
    const pa = packets.geometry.attributes.position;
    nodes.forEach((n, i) => {
      const s = n.hot ? 1.5 : 1;
      n.halo.scale.setScalar((0.95 + Math.sin(t * 2 + n.ph) * (n.status === 'healthy' ? 0.08 : 0.22)) * s);
      n.dot.rotation.y += dt * 1.2; n.dot.scale.setScalar(n.hot ? 1.4 : 1);
      n.line.material.opacity = n.hot ? 0.8 : 0.32;
      const f = ((t * 0.35 + n.ph) % 1);
      pa.setXYZ(i * 2, n.p.x * f, n.p.y * f, n.p.z * f);
      pa.setXYZ(i * 2 + 1, n.p.x * (1 - f), n.p.y * (1 - f), n.p.z * (1 - f));
      /* label placement */
      n.group.getWorldPosition(v); const wz = v.z; v.project(camera);
      const x = (v.x * 0.5 + 0.5) * box.clientWidth, y = (-v.y * 0.5 + 0.5) * box.clientHeight;
      n.link.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      const op = Math.max(0, Math.min(1, 0.55 + wz * 0.3)); n.link.style.opacity = String(op); n.link.style.pointerEvents = op < 0.3 ? 'none' : 'auto';
      n.link.style.zIndex = String(Math.round(50 + wz * 10));
    });
    if (pa) pa.needsUpdate = true;
    renderer.render(scene, camera);
  }
  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!run || !visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; frame(dt);
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.01 }); io.observe(box);
  size(); setApps(apps);
  if (!reduce) raf = requestAnimationFrame(loop);
  if (hostLabel) { const hostEl = document.createElement('div'); hostEl.className = 'scene-host'; hostEl.textContent = hostLabel; labels.append(hostEl); }

  return {
    update: setApps,
    destroy() { run = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); renderer.forceContextLoss?.(); canvas.remove(); labels.remove(); },
  };
}
