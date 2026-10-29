// Orbit view. Planet size, glow, moons and flares come only from the sky payload.
import * as THREE from '/vendor/three.module.min.js';

const GLOW = { healthy: 0x86efc0, degraded: 0xfde68a, crashing: 0xfb7185, down: 0xfb7185, stopped: 0x8478ad, unknown: 0xa094cc };

export function mountOrbit(canvas, sky, { onPick, reduced = false } = {}) {
  const planets = sky?.planets || [];
  if (reduced || !planets.length) return { destroy() {}, setSky() {} };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 18, 28);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xb69cff, 0.55));
  const sun = new THREE.PointLight(0xfff1d6, 2, 80); sun.position.set(0, 0, 0); scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 24), new THREE.MeshBasicMaterial({ color: 0xf4e4c1 })));
  const group = new THREE.Group(); scene.add(group);
  const meshes = [];
  planets.forEach((p, i) => {
    const radius = 6 + i * 3.2;
    const size = 0.45 + Math.min(1.1, (p.size || 1) / 40);
    const color = GLOW[p.glow] || GLOW.unknown;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: p.glow === 'healthy' ? 0.35 : 0.7, roughness: 0.45 }));
    planet.userData = p;
    const pivot = new THREE.Group();
    planet.position.x = radius;
    pivot.add(planet);
    (p.moons || []).forEach((m, mi) => {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshStandardMaterial({ color: m.state === 'running' ? 0xc4b5fd : 0x6b7280 }));
      moon.position.set(radius + size + 0.45, 0.2 * mi, 0.3);
      pivot.add(moon);
    });
    if (p.rings) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(size + 0.25, size + 0.45, 32), new THREE.MeshBasicMaterial({ color: 0xe9ddff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2.4; ring.position.x = radius; pivot.add(ring);
    }
    if (p.flares?.length) {
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfb7185 }));
      flare.position.set(radius, size + 0.4, 0); pivot.add(flare);
    }
    group.add(pivot);
    meshes.push({ pivot, planet, speed: p.orbitSpeed == null ? 0 : 0.15 + p.orbitSpeed * 0.4, base: i });
  });
  const ray = new THREE.Raycaster(); const pointer = new THREE.Vector2();
  function resize() {
    const w = canvas.clientWidth || 320; const h = canvas.clientHeight || 420;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  const onClick = (ev) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(meshes.map((m) => m.planet))[0];
    if (hit) onPick?.(hit.object.userData);
  };
  canvas.addEventListener('click', onClick);
  let raf = 0; let running = !document.hidden;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (!running) return;
    meshes.forEach((m, i) => { m.pivot.rotation.y += 0.002 * (m.speed || 0.2) * (i + 1); });
    renderer.render(scene, camera);
  };
  loop();
  const onVis = () => { running = document.visibilityState === 'visible'; };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  return { destroy() { cancelAnimationFrame(raf); canvas.removeEventListener('click', onClick); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('resize', onResize); renderer.dispose(); } };
}
