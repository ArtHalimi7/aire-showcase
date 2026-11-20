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
  const fbm = (u, v, o = 5) => { let n = 0, amp = 0.5, f = 1; for (let k = 0; k < o; k++) { n += vn(u * f + 7, v * f + 3) * amp; f *= 2.07; amp *= 0.5; } return n; };
  for (let y = 0; y < N; y++) for (let X = 0; X < N; X++) {
    const u = X / N, v = y / N;
    // domain-warped billows: the edge wanders, so no puff reads as a circle
    const wu = u + (fbm(u * 3 + 11, v * 3, 3) - 0.5) * 0.32, wv = v + (fbm(u * 3, v * 3 + 5, 3) - 0.5) * 0.32;
    const d = Math.hypot(wu - 0.5, (wv - 0.5) * 1.08) * 2;
    const n = fbm(wu * 4.2, wv * 4.2);
    const base = 1 - THREE.MathUtils.smoothstep(d, 0.1, 0.98);
    let a = THREE.MathUtils.clamp(base * 1.45 - 0.36 + (n - 0.48) * 1.3, 0, 1); a = a * a * (3 - 2 * a);
    const k = (y * N + X) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(a * 255);
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; return t;
}

const VERT = /* glsl */ `
attribute vec3 iOffset;
attribute vec4 iData; // scale, rotation, height-in-cloud, seed
uniform float uTime; uniform vec4 uPart; uniform float uPartK;
varying vec2 vUv; varying float vShade; varying float vDepth; varying vec3 vDir; varying float vRot; varying float vA;
void main() {
  vec3 c = iOffset;
  c.x += sin(uTime * 0.04 + iData.w * 6.283) * 0.3;
  c.y += sin(uTime * 0.05 + iData.w * 12.0) * 0.05;
  // the bottle parts the cloud: puffs are pushed aside and lifted in its wake
  vec3 dp = c - uPart.xyz;
  float infl = exp(-pow(length(dp * vec3(1.0, 0.55, 1.0)) / uPart.w, 2.0)) * uPartK;
  c += normalize(vec3(dp.x, 0.0, dp.z) + 1e-4) * infl * 1.2 + vec3(0.0, infl * 0.5, 0.0);
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float r = iData.y + uTime * 0.01 * (fract(iData.w * 7.0) - 0.5) + infl * 0.8;
  float cs = cos(r), sn = sin(r);
  mv.xy += mat2(cs, sn, -sn, cs) * position.xy * iData.x * (1.0 + infl * 0.3);
  gl_Position = projectionMatrix * mv;
  vUv = uv; vShade = iData.z; vDepth = -mv.z; vDir = c - cameraPosition; vRot = r; vA = 1.0 - infl * 0.3;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uCloudLight, uCloudShadow; uniform vec2 uSunView; uniform float uCloudVis;
varying vec2 vUv; varying float vShade; varying float vDepth; varying vec3 vDir; varying float vRot; varying float vA;
${SKY_GLSL}
void main() {
  float a = texture2D(uTex, vUv).a;
  if (a < 0.004) discard;
  // lit from the sun's side on screen: compare with the puff one step toward the light
  float cs = cos(vRot), sn = sin(vRot);
  vec2 l = vec2(cs * uSunView.x + sn * uSunView.y, -sn * uSunView.x + cs * uSunView.y);
  float a2 = texture2D(uTex, vUv + l * 0.08).a;
  float lit = clamp(0.5 + (a - a2) * 2.3, 0.0, 1.0);
  float k = clamp(vShade * 0.72 + lit * 0.62 - 0.14, 0.0, 1.0);
  vec3 col = mix(uCloudShadow, uCloudLight, k);
  vec3 d = normalize(vDir);
  col += uSunColor * pow(max(dot(d, uSunDir), 0.0), 5.0) * a * (1.0 - a) * 3.2 * uGlow; // silver lining toward the sun
  float fog = 1.0 - exp(-vDepth * 0.011);
  col = mix(col, skyColor(d), fog * 0.88);
  gl_FragColor = vec4(col, a * smoothstep(0.35, 2.4, vDepth) * (1.0 - fog * 0.22) * uCloudVis * vA);
}`;

export function createClouds(U) {
  const r = rng(7);
  const px = [], py = [], pz = [], data = [];
  const mass = (cx, cy, cz, size, dens = 1) => {
    const n = Math.round(THREE.MathUtils.clamp(size * 12 * dens, 10, 64));
    const rx = size * 1.7, ry = size * 0.6, rz = size * 1.1;
    for (let k = 0; k < n; k++) {
      const u = r() * 2 - 1, v = r() * 2 - 1, w = r() * 2 - 1; if (u * u + v * v + w * w > 1) { k--; continue; }
      let y = v * ry; if (y < -0.2 * ry) y = -0.2 * ry - r() * 0.06 * ry;
      px.push(cx + u * rx); py.push(cy + y); pz.push(cz + w * rz);
      data.push(size * (0.75 + r() * 0.8) * (1 - 0.3 * (u * u + w * w)), r() * 6.283, (y + 0.2 * ry) / (1.2 * ry), r());
    }
  };
  // a sea of cloud with its tops near y = 0.2 (the bottle rises out of it at the origin)
  for (let i = 0; i < 84; i++) { const R = Math.sqrt(r()) * 46, th = r() * Math.PI * 2, sz = (1.6 + r() * 1.6) * (1 + R / 26); mass(Math.sin(th) * R * 1.1, -1.25 - sz * 0.12 + r() * 0.75, -Math.abs(Math.cos(th)) * R - 2 + r() * 10, sz, 0.75); }
  for (let i = 0; i < 6; i++) mass((r() - 0.5) * 3.2, -1.1 + r() * 0.4, (r() - 0.5) * 3.2, 1.3 + r() * 0.6, 1.3); // right where the bottle rises
  // towering cumulus far away, catching the low sun
  for (let i = 0; i < 9; i++) { const x = (r() - 0.5) * 140, z = -55 - r() * 45, s = 5 + r() * 3; mass(x, 1.0 + s * 0.2, z, s); mass(x + (r() - 0.5) * 4, 1.0 + s * 0.85, z + 2, s * 0.75); mass(x + (r() - 0.5) * 3, 1.0 + s * 1.4, z + 3, s * 0.5); }
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
  // Far puffs are drawn in the opaque pass (blended by hand) so glass and liquid refract them; near ones after the glass.
  const makeMesh = (opaquePass, order, layer) => {
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, uTex: { value: tex } }, vertexShader: VERT, fragmentShader: FRAG, transparent: !opaquePass, depthWrite: false });
    if (opaquePass) Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const mesh = new THREE.Mesh(makeGeo(), m); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.layers.set(layer); return mesh;
  };
  const far = makeMesh(true, 1, 0), near = makeMesh(false, 10, 1);
  const group = new THREE.Group(); group.add(far, near);

  const depth = new Float32Array(count), order = new Uint32Array(count).map((_, i) => i);
  const fill = (mesh, list) => {
    const o = mesh.geometry.attributes.iOffset.array, d = mesh.geometry.attributes.iData.array;
    for (let k = 0; k < list.length; k++) { const i = list[k]; o[k * 3] = px[i]; o[k * 3 + 1] = py[i]; o[k * 3 + 2] = pz[i]; for (let c = 0; c < 4; c++) d[k * 4 + c] = D[i * 4 + c]; }
    mesh.geometry.instanceCount = list.length; mesh.geometry.attributes.iOffset.needsUpdate = true; mesh.geometry.attributes.iData.needsUpdate = true;
  };
  const A = [], B = [];
  function update(cam, fwd, split) {
    group.visible = U.uCloudVis.value > 0.002;
    if (!group.visible) return;
    for (let i = 0; i < count; i++) depth[i] = (px[i] - cam.x) * fwd.x + (py[i] - cam.y) * fwd.y + (pz[i] - cam.z) * fwd.z;
    order.sort((a, b) => depth[b] - depth[a]);
    A.length = B.length = 0;
    for (let k = 0; k < count; k++) { const i = order[k], d = depth[i]; if (d < 0.25) continue; (d > split ? A : B).push(i); }
    fill(far, A); fill(near, B);
  }
  return { group, update, count };
}
