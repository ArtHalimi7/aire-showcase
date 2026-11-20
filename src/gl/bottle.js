import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// Drawn in the opaque pass (so glass refracts it) but alpha-blended: three skips blending for opaque NormalBlending.
export const blendedOpaque = { transparent: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

// A cushion: a superellipse in plan, flat top and bottom, rounded edges. The cavity is the same shape, inset,
// sitting on a heavy base, so the walls read as thick glass.
export const BODY = { a: 0.36, b: 0.205, y0: -0.46, y1: 0.46, rb: 0.05, rs: 0.11, n: 4.2 };
export const CAV = { a: 0.288, b: 0.14, y0: -0.29, y1: 0.37, rb: 0.045, rs: 0.075, n: 4.2 };

const sp = (t, a, b, n) => { const c = Math.cos(t), s = Math.sin(t); return [a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]; };

function insetAt(S, y) {
  if (y < S.y0 + S.rb) { const c = 1 - (y - S.y0) / S.rb; return S.rb * (1 - Math.sqrt(Math.max(0, 1 - c * c))); }
  if (y > S.y1 - S.rs) { const s = (y - S.y1 + S.rs) / S.rs; return S.rs * (1 - Math.sqrt(Math.max(0, 1 - s * s))); }
  return 0;
}
export function inside(S, x, y, z) {
  if (y < S.y0 || y > S.y1) return false;
  const d = insetAt(S, y), a = S.a - d, b = S.b - d; if (a <= 0 || b <= 0) return false;
  return Math.pow(Math.abs(x / a), S.n) + Math.pow(Math.abs(z / b), S.n) <= 1;
}

export function cushionGeometry(S, seg = 128) {
  const rows = [], cap = 7, edge = 12, side = 8, dmax = Math.min(S.a, S.b) - 0.003;
  for (let i = 0; i < cap; i++) rows.push([S.y0, dmax - (dmax - S.rb) * (i / cap)]);
  for (let i = 0; i <= edge; i++) { const p = (i / edge) * Math.PI / 2; rows.push([S.y0 + S.rb * (1 - Math.cos(p)), S.rb * (1 - Math.sin(p))]); }
  for (let i = 1; i < side; i++) rows.push([S.y0 + S.rb + (S.y1 - S.rs - S.y0 - S.rb) * (i / side), 0]);
  for (let i = 0; i <= edge; i++) { const p = (i / edge) * Math.PI / 2; rows.push([S.y1 - S.rs + S.rs * Math.sin(p), S.rs * (1 - Math.cos(p))]); }
  for (let i = 1; i <= cap; i++) rows.push([S.y1, S.rs + (dmax - S.rs) * (i / cap)]);
  const pos = [];
  for (const [y, d] of rows) for (let j = 0; j < seg; j++) { const [x, z] = sp((j / seg) * Math.PI * 2, Math.max(0.002, S.a - d), Math.max(0.002, S.b - d), S.n); pos.push(x, y, z); }
  const bottom = pos.length / 3; pos.push(0, S.y0, 0); const top = bottom + 1; pos.push(0, S.y1, 0);
  const idx = [], R = rows.length;
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < seg; j++) {
    const a = r * seg + j, b = r * seg + ((j + 1) % seg), c = (r + 1) * seg + j, d = (r + 1) * seg + ((j + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  for (let j = 0; j < seg; j++) { idx.push(bottom, j, (j + 1) % seg); idx.push(top, (R - 1) * seg + ((j + 1) % seg), (R - 1) * seg + j); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // make sure the winding faces outward
  const n = g.attributes.normal, mid = Math.floor(rows.length / 2) * seg;
  if (n.getX(mid) * pos[mid * 3] + n.getZ(mid) * pos[mid * 3 + 2] < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

// ---------------- glass: two-surface refraction with dispersion, reading the scene behind it ----------------
const GLASS_VERT = /* glsl */ `
varying vec3 vNw; varying vec3 vPw; varying vec3 vNv; varying vec3 vPv; varying vec2 vProj;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vec4 vp = viewMatrix * wp;
  vProj = vec2(projectionMatrix[0][0], projectionMatrix[1][1]); vPw = wp.xyz; vNw = normalize(mat3(modelMatrix) * normal); vPv = vp.xyz; vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * vp;
}`;
const GLASS_FRAG = /* glsl */ `
uniform sampler2D uScene, uBack; uniform samplerCube envMap; uniform vec2 uRes; uniform float uIOR, uDisp, uRefract, uEnvK, uAbsorb;
uniform vec3 uTint, uSunDir, uSunColor;
varying vec3 vNw; varying vec3 vPw; varying vec3 vNv; varying vec3 vPv; varying vec2 vProj;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 N = normalize(vNv), V = normalize(-vPv);
  vec4 back = texture2D(uBack, uv);
  vec3 Nb = normalize(back.xyz * 2.0 - 1.0);
  float thick = clamp(back.w - (-vPv.z), 0.01, 0.8);
  vec2 proj = vProj / (2.0 * max(-vPv.z, 0.1));
  vec3 col = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float ior = uIOR + (float(k) - 1.0) * uDisp;
    vec3 r1 = refract(-V, N, 1.0 / ior);
    vec3 r2 = refract(r1, -Nb, ior);
    if (dot(r2, r2) < 1e-4) r2 = reflect(r1, -Nb); // total internal reflection
    vec2 off = (r1.xy * thick + r2.xy * thick * 0.6) * uRefract * proj;
    vec3 s = texture2D(uScene, clamp(uv + off, 0.002, 0.998)).rgb;
    col[k] = s[k];
  }
  col *= mix(vec3(1.0), uTint, clamp(thick * uAbsorb, 0.0, 1.0));
  vec3 Nw = normalize(vNw), Vw = normalize(cameraPosition - vPw);
  float ndv = max(dot(Nw, Vw), 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-Vw, Nw);
  vec3 env = textureLod(envMap, R, 0.0).rgb * uEnvK;
  col = col * (1.0 - F) + env * F;
  col *= 1.0 - 0.22 * smoothstep(0.55, 0.98, 1.0 - ndv);                         // thick edges go dark, like real glass
  col += uSunColor * pow(max(dot(R, uSunDir), 0.0), 900.0) * 12.0;                // a sharp sun glint
  gl_FragColor = vec4(col, 1.0);
}`;
const BACK_VERT = /* glsl */ `varying vec3 vNv; varying vec3 vPv; void main() { vec4 vp = modelViewMatrix * vec4(position, 1.0); vPv = vp.xyz; vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * vp; }`;
const BACK_FRAG = /* glsl */ `uniform float uFlip; varying vec3 vNv; varying vec3 vPv; void main() { gl_FragColor = vec4(normalize(vNv) * uFlip * 0.5 + 0.5, -vPv.z); }`;


function foilTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 600); x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = '300 250px Fraunces'; x.letterSpacing = '30px'; x.fillText('AIRE', 527, 270);
  x.fillRect(372, 330, 280, 3);
  x.font = '500 46px Geist'; x.letterSpacing = '22px'; x.fillText('CUMULUS', 523, 418);
  x.font = '400 34px Geist'; x.letterSpacing = '12px'; x.fillText('Nº 01   EAU DE PARFUM', 518, 486);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}

function stopperGeometry() {
  const mc = new MarchingCubes(72, new THREE.MeshBasicMaterial(), false, false, 200000);
  mc.isolation = 80; mc.reset();
  for (const [x, y, z, s] of [[0.5, 0.42, 0.5, 0.62], [0.32, 0.44, 0.5, 0.42], [0.68, 0.43, 0.51, 0.44], [0.5, 0.58, 0.48, 0.44], [0.4, 0.55, 0.6, 0.3], [0.6, 0.56, 0.4, 0.3], [0.56, 0.4, 0.66, 0.26]]) mc.addBall(x, y, z, s, 12);
  mc.update();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mc.positionArray.slice(0, mc.count * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mc.normalArray.slice(0, mc.count * 3), 3));
  g.computeBoundingBox(); const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const w = bb.max.x - bb.min.x; g.scale(0.36 / w, 0.36 / w, 0.36 / w);
  return g;
}

export function createBottle(sceneTex, backTex, U) {
  const group = new THREE.Group();
  const glassU = {
    uScene: { value: sceneTex }, uBack: { value: backTex }, envMap: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uIOR: { value: 1.5 }, uDisp: { value: 0.035 }, uRefract: { value: 1.0 }, uEnvK: { value: 1.0 }, uAbsorb: { value: 1.6 },
    uTint: { value: new THREE.Color('#e9f2ef') }, uSunDir: U.uSunDir, uSunColor: U.uSunColor,
  };
  const glassMat = new THREE.ShaderMaterial({ uniforms: glassU, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG });
  const backMat = new THREE.ShaderMaterial({ uniforms: { uFlip: { value: 1 } }, vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, side: THREE.BackSide });
  const cavBackMat = new THREE.ShaderMaterial({ uniforms: { uFlip: { value: -1 } }, vertexShader: BACK_VERT, fragmentShader: BACK_FRAG, side: THREE.FrontSide });

  const bodyGeo = cushionGeometry(BODY), neckGeo = new THREE.CylinderGeometry(0.066, 0.074, 0.07, 64);
  const body = new THREE.Mesh(bodyGeo, glassMat), neck = new THREE.Mesh(neckGeo, glassMat); neck.position.y = BODY.y1 + 0.03;
  for (const m of [body, neck]) { m.layers.set(1); group.add(m); }
  // what the glass sees behind its front surface: its own back faces, or the inner wall of the cavity where there is one
  const backs = [new THREE.Mesh(bodyGeo, backMat), new THREE.Mesh(neckGeo, backMat), new THREE.Mesh(cushionGeometry(CAV, 96), cavBackMat)];
  backs[1].position.y = neck.position.y;
  for (const m of backs) { m.layers.set(3); group.add(m); }

  const gold = new THREE.MeshPhysicalMaterial({ color: '#e7c58b', metalness: 1, roughness: 0.16, clearcoat: 0.5, clearcoatRoughness: 0.08 });
  const pts = [new THREE.Vector2(0.05, 0), new THREE.Vector2(0.086, 0)];
  for (let i = 0; i < 10; i++) { const y = 0.006 + i * 0.0074; pts.push(new THREE.Vector2(0.09, y + 0.0015), new THREE.Vector2(0.09, y + 0.005), new THREE.Vector2(0.086, y + 0.0068)); }
  pts.push(new THREE.Vector2(0.086, 0.082), new THREE.Vector2(0.05, 0.082));
  const collar = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), gold); collar.position.y = BODY.y1 + 0.035; group.add(collar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.079, 0.006, 16, 96), gold); ring.rotation.x = Math.PI / 2; ring.position.y = BODY.y1 + 0.006; group.add(ring);

  const stopper = new THREE.Mesh(stopperGeometry(), new THREE.MeshPhysicalMaterial({
    color: '#ffffff', transmission: 1, thickness: 0.45, roughness: 0.4, ior: 1.5, attenuationColor: new THREE.Color('#f3eefc'), attenuationDistance: 1.2,
    iridescence: 0.3, iridescenceIOR: 1.3, specularIntensity: 1, clearcoat: 0.3, clearcoatRoughness: 0.4,
  }));
  stopper.position.y = BODY.y1 + 0.105; group.add(stopper);

  // gold foil on the front face, curved to sit on the glass
  const lg = new THREE.PlaneGeometry(0.4, 0.234, 40, 6), lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i); lp.setZ(i, BODY.b * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / BODY.a), BODY.n)), 1 / BODY.n) + 0.0012); }
  lg.computeVertexNormals();
  const label = new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({ color: '#e9c88d', metalness: 1, roughness: 0.24, alphaMap: foilTexture(), alphaTest: 0.5, clearcoat: 0.4 }));
  label.position.y = -0.02; group.add(label);

  return { group, body, neck, glassMat, glassU, backMat, label, stopper, collar };
}
