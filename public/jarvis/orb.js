// Jarvis orb — a voice-reactive particle sphere (WebGL via vendored three.js), with a 2D fallback.
// Thousands of glowing points on a sphere, displaced by 3D noise + live audio level, coloured by state.
import * as THREE from '/vendor/three.module.min.js';

const PALETTES = {
  idle:      ['#6a3cff', '#c23bff', '#ff5db1'],
  thinking:  ['#5a4bff', '#9b5cff', '#ff6fc9'],
  listening: ['#3a6bff', '#7d5cff', '#49d6ff'],
  speaking:  ['#6a3cff', '#c23bff', '#ff5db1'],
  alert:     ['#ff7a3c', '#ff5db1', '#ffd24a'],
};
const col = (hex) => new THREE.Color(hex);

const SNOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function webglSupported() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export function createOrb(canvas) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!webglSupported()) return fallback2D(canvas); // no WebGL -> clean 2D, no three.js errors
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return fallback2D(canvas); }
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(2, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 3.2;

  // Fibonacci sphere of points
  const N = (navigator.deviceMemory && navigator.deviceMemory <= 4) || /Mobi/i.test(navigator.userAgent) ? 9000 : 18000;
  const pos = new Float32Array(N * 3), scale = new Float32Array(N);
  const gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = gold * i;
    pos[i * 3] = Math.cos(t) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(t) * r;
    scale[i] = 0.5 + Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));

  const uni = {
    uTime: { value: 0 }, uAudio: { value: 0 }, uAmp: { value: 0.26 }, uSize: { value: 5.5 * dpr },
    uColorA: { value: col(PALETTES.idle[0]) }, uColorB: { value: col(PALETTES.idle[1]) }, uColorC: { value: col(PALETTES.idle[2]) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime,uAudio,uAmp,uSize; attribute float aScale; varying float vMix;
      ${SNOISE}
      void main(){
        vec3 dir=normalize(position);
        float n=snoise(dir*1.8+uTime*0.22); float n2=snoise(dir*3.6-uTime*0.35);
        float disp=n*0.6+n2*0.4;
        float amp=uAmp*(0.4+uAudio*1.5);
        vec3 p=position+dir*disp*amp;
        vMix=clamp(disp*0.5+0.5+uAudio*0.25,0.0,1.0);
        vec4 mv=modelViewMatrix*vec4(p,1.0);
        gl_PointSize=uSize*aScale*(1.0+uAudio*0.9)*(2.6/-mv.z);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `
      precision mediump float; uniform vec3 uColorA,uColorB,uColorC; varying float vMix;
      void main(){
        vec2 uv=gl_PointCoord-0.5; float d=length(uv); if(d>0.5)discard;
        float a=smoothstep(0.5,0.0,d);
        vec3 c=mix(uColorA,uColorB,smoothstep(0.0,0.6,vMix));
        c=mix(c,uColorC,smoothstep(0.55,1.0,vMix));
        gl_FragColor=vec4(c,a*0.92);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let level = 0, shown = 0, rot = 0, raf = 0, last = performance.now(), targetPal = PALETTES.idle;
  function resize() {
    const s = canvas.clientWidth || 320;
    renderer.setSize(s, s, false); camera.aspect = 1; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  function lerpColor(u, hex) { u.value.lerp(col(hex), 0.06); }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    shown += (level - shown) * 0.18;
    uni.uTime.value += dt * (reduce ? 0.4 : 1);
    uni.uAudio.value += (shown - uni.uAudio.value) * 0.3;
    rot += dt * (0.12 + shown * 0.5) * (reduce ? 0.3 : 1);
    points.rotation.y = rot; points.rotation.x = Math.sin(rot * 0.4) * 0.18;
    lerpColor(uni.uColorA, targetPal[0]); lerpColor(uni.uColorB, targetPal[1]); lerpColor(uni.uColorC, targetPal[2]);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setLevel: (v) => { level = Math.max(0, Math.min(1, v)); },
    setState: (s) => { targetPal = PALETTES[s] || PALETTES.idle; uni.uAmp.value = s === 'listening' ? 0.32 : s === 'speaking' ? 0.3 : 0.26; },
    dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); geo.dispose(); mat.dispose(); renderer.dispose(); },
    webgl: true,
  };
}

// ---- 2D canvas fallback (no WebGL) ----
function fallback2D(canvas) {
  const ctx = canvas.getContext('2d'); const dpr = Math.min(2, devicePixelRatio || 1);
  let level = 0, shown = 0, t = 0, pal = PALETTES.idle, raf = 0;
  const fit = () => { const s = canvas.clientWidth || 320; canvas.width = s * dpr; canvas.height = s * dpr; };
  const ro = new ResizeObserver(fit); ro.observe(canvas); fit();
  (function frame() {
    raf = requestAnimationFrame(frame); t += 0.016; shown += (level - shown) * 0.18;
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.3 * (1 + Math.sin(t * 1.3) * 0.04 + shown * 0.4);
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx, cy - base * 0.2, base * 0.1, cx, cy, base * 1.8);
    g.addColorStop(0, pal[2]); g.addColorStop(0.5, pal[1]); g.addColorStop(1, 'rgba(10,8,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, base * 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, base, 0, 7); ctx.fillStyle = pal[0]; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  })();
  return { setLevel: (v) => { level = v; }, setState: (s) => { pal = PALETTES[s] || PALETTES.idle; }, dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); }, webgl: false };
}
