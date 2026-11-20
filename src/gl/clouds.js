import * as THREE from 'three';
import { SKY_GLSL } from './sky.js';

export function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A soft puff with a cauliflower edge: a radial falloff broken up by value-noise fbm.
function puffTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), im = x.createImageData(N, N);
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (u, v) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
    return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b; };
  for (let y = 0; y < N; y++) for (let X = 0; X < N; X++) {
    const u = X / N, v = y / N, d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let n = 0, amp = 0.5, f = 3.2; for (let o = 0; o < 5; o++) { n += vn(u * f + 7, v * f + 3) * amp; f *= 2.1; amp *= 0.5; }
    const base = 1 - THREE.MathUtils.smoothstep(d, 0.25, 1.0);
    let a = THREE.MathUtils.clamp(base * 1.55 - 0.42 + (n - 0.48) * 1.05, 0, 1); a = a * a * (3 - 2 * a);
    const k = (y * N + X) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t;
}

const VERT = /* glsl */ `
attribute vec3 iOffset;
attribute vec4 iData; // scale, rotation, height-in-cloud, seed
uniform float uTime;
varying vec2 vUv; varying float vShade; varying float vDepth; varying vec3 vDir; varying float vRot;
void main() {
  vec3 c = iOffset;
  c.x += sin(uTime * 0.045 + iData.w * 6.283) * 0.35;
  c.y += sin(uTime * 0.06 + iData.w * 12.0) * 0.06;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float r = iData.y + uTime * 0.012 * (fract(iData.w * 7.0) - 0.5);
  float cs = cos(r), sn = sin(r);
  mv.xy += mat2(cs, sn, -sn, cs) * position.xy * iData.x;
  gl_Position = projectionMatrix * mv;
  vUv = uv; vShade = iData.z; vDepth = -mv.z; vDir = c - cameraPosition; vRot = r;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv; varying float vShade; varying float vDepth; varying vec3 vDir; varying float vRot;
${SKY_GLSL}
void main() {
  float a = texture2D(uTex, vUv).a;
  if (a < 0.004) discard;
  // light from above (slightly from the sun side): compare with the puff a step toward the light
  vec2 L = normalize(vec2(0.35, 1.0));
  float cs = cos(vRot), sn = sin(vRot);
  vec2 l = vec2(cs * L.x + sn * L.y, -sn * L.x + cs * L.y);
  float a2 = texture2D(uTex, vUv + l * 0.07).a;
  float lit = clamp(0.55 + (a - a2) * 2.4, 0.0, 1.0);
  float k = clamp(vShade * 0.8 + lit * 0.55 - 0.18, 0.0, 1.0);
  vec3 shadow = vec3(0.86, 0.885, 0.93);
  vec3 light = mix(vec3(1.0), vec3(1.0, 0.975, 0.94), uSun);
  vec3 col = mix(shadow, light, k);
  float fog = 1.0 - exp(-vDepth * 0.021);
  col = mix(col, skyColor(normalize(vDir)), fog * 0.92);
  float alpha = a * smoothstep(0.5, 3.0, vDepth) * (1.0 - fog * 0.3);
  gl_FragColor = vec4(pow(col, vec3(2.2)), alpha);
  #include <colorspace_fragment>
}`;

export function createClouds(U) {
  const r = rng(7);
  const px = [], py = [], pz = [], data = [];
  const mass = (cx, cy, cz, size, dens = 1) => {
    const n = Math.round(THREE.MathUtils.clamp(size * 13 * dens, 10, 72));
    const rx = size * 1.7, ry = size * 0.6, rz = size * 1.1;
    for (let k = 0; k < n; k++) {
      const u = r() * 2 - 1, v = r() * 2 - 1, w = r() * 2 - 1; if (u * u + v * v + w * w > 1) { k--; continue; }
      let y = v * ry; if (y < -0.2 * ry) y = -0.2 * ry - r() * 0.06 * ry; // flat bottoms
      const s = size * (0.75 + r() * 0.8) * (1 - 0.3 * (u * u + w * w));
      px.push(cx + u * rx); py.push(cy + y); pz.push(cz + w * rz);
      data.push(s, r() * 6.283, (y + 0.2 * ry) / (1.2 * ry), r());
    }
  };
  // around the bottle at the start: framing it, never covering it
  [[-3.0, -0.9, -0.8, 1.2], [3.2, -1.2, -1.5, 1.4], [-1.7, -2.0, 1.5, 1.0], [1.9, -2.1, 1.8, 0.9], [4.3, 0.9, -5, 1.6],
    [-4.7, 1.3, -6, 1.8], [0.5, -2.7, -3.5, 1.8], [-0.4, 2.5, -7.5, 1.6], [2.3, 1.8, -9, 1.8], [-2.4, -0.2, -4.2, 1.1]].forEach((m) => mass(...m));
  // the layer we rise through
  for (let i = 0; i < 28; i++) mass((r() - 0.5) * 26, 2.2 + r() * 5, -24 + r() * 27.5, 1.4 + r() * 1.8);
  // the cloud we land on
  mass(0, 7.4, 0.2, 1.7, 1.4);
  // a sea of cloud below us once we're above, and a far horizon
  for (let i = 0; i < 32; i++) mass((r() - 0.5) * 80, 4 + r() * 3.2, -8 - r() * 55, 2 + r() * 2.2);
  for (let i = 0; i < 22; i++) mass((r() - 0.5) * 240, 3 + r() * 5, -70 - r() * 90, 5 + r() * 4);
  const count = px.length, D = new Float32Array(data);

  const tex = puffTexture();
  const base = new THREE.PlaneGeometry(1, 1);
  const makeGeo = () => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0; return g;
  };
  // Three groups by depth, each sorted far to near: behind the wordmark, between it and the bottle (both drawn in the
  // opaque pass, so the glass refracts them), and in front of the bottle (drawn after it).
  const makeMesh = (inOpaquePass, order) => {
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uSun: U.uSun, uSunDir: U.uSunDir, uTex: { value: tex } }, vertexShader: VERT, fragmentShader: FRAG, transparent: !inOpaquePass, depthWrite: false });
    if (inOpaquePass) Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const mesh = new THREE.Mesh(makeGeo(), m); mesh.frustumCulled = false; mesh.renderOrder = order; return mesh;
  };
  const far = makeMesh(true, 1), mid = makeMesh(true, 3), near = makeMesh(false, 10);
  const group = new THREE.Group(); group.add(far, mid, near);

  const depth = new Float32Array(count), order = new Uint32Array(count).map((_, i) => i);
  const fill = (mesh, list, n) => {
    const o = mesh.geometry.attributes.iOffset.array, d = mesh.geometry.attributes.iData.array;
    for (let k = 0; k < n; k++) { const i = list[k]; o[k * 3] = px[i]; o[k * 3 + 1] = py[i]; o[k * 3 + 2] = pz[i]; for (let c = 0; c < 4; c++) d[k * 4 + c] = D[i * 4 + c]; }
    mesh.geometry.instanceCount = n; mesh.geometry.attributes.iOffset.needsUpdate = true; mesh.geometry.attributes.iData.needsUpdate = true;
  };
  const A = [], B = [], C = [];
  function update(cam, fwd, splitWord, splitBottle) {
    for (let i = 0; i < count; i++) depth[i] = (px[i] - cam.x) * fwd.x + (py[i] - cam.y) * fwd.y + (pz[i] - cam.z) * fwd.z;
    order.sort((a, b) => depth[b] - depth[a]);
    A.length = B.length = C.length = 0;
    for (let k = 0; k < count; k++) { const i = order[k], d = depth[i]; if (d < 0.3) continue; (d > splitWord ? A : d > splitBottle ? B : C).push(i); }
    fill(far, A, A.length); fill(mid, B, B.length); fill(near, C, C.length);
  }
  return { group, update, count };
}
