import * as THREE from 'three';
import { CAV, cushionGeometry, inside, blendedOpaque } from './bottle.js';

// The perfume is a real volume: the surface is a plane that stays level with gravity (plus the bottle's own
// acceleration), sloshes on a damped spring, and is placed every frame so the liquid keeps its volume however the
// bottle is turned. A fast spin pulls the surface into a whirlpool. Bubbles rise along true up.
const FILL = 0.68, G = 14, OMEGA = 7.2, ZETA = 0.075;

function rippleNormalMap() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const im = x.createImageData(N, N);
  const H = (u, v) => { let h = 0; for (let k = 0; k < 6; k++) { const a = k * 2.399 + 0.3, f = 2 + k * 1.7; h += Math.sin((u * Math.cos(a) + v * Math.sin(a)) * Math.PI * 2 * Math.round(f)) / (1 + k * 0.6); } return h; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, e = 1 / N, dx = (H(u + e, v) - H(u - e, v)) * 0.6, dy = (H(u, v + e) - H(u, v - e)) * 0.6;
    const l = Math.hypot(dx, dy, 1), k = (j * N + i) * 4;
    im.data[k] = (-dx / l * 0.5 + 0.5) * 255; im.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; im.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function quickselect(a, k) { // k-th smallest, in place
  let l = 0, r = a.length - 1;
  while (l < r) { const p = a[(l + r) >> 1]; let i = l, j = r; while (i <= j) { while (a[i] < p) i++; while (a[j] > p) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } } if (k <= j) r = j; else if (k >= i) l = i; else break; }
  return a[k];
}

const WALL_FRAG = /* glsl */ `uniform vec4 uPlane; varying vec3 vNw; varying vec3 vPw;
  void main() { if (dot(uPlane.xyz, vPw) < uPlane.w) discard;
    float f = pow(1.0 - abs(dot(normalize(vNw), normalize(cameraPosition - vPw))), 3.0);
    gl_FragColor = vec4(vec3(1.0, 0.99, 0.97), f * 0.32); }`;
const WALL_VERT = /* glsl */ `varying vec3 vNw; varying vec3 vPw; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vPw = wp.xyz; vNw = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BUB_VERT = /* glsl */ `varying vec3 vNw; varying vec3 vPw; void main() { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vPw = wp.xyz; vNw = normalize(mat3(modelMatrix * instanceMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BUB_FRAG = /* glsl */ `uniform vec4 uPlane; varying vec3 vNw; varying vec3 vPw;
  void main() { if (dot(uPlane.xyz, vPw) > uPlane.w) discard;
    vec3 n = normalize(vNw), v = normalize(cameraPosition - vPw); float ndv = abs(dot(n, v));
    float rim = pow(1.0 - ndv, 2.0); float hl = pow(max(dot(reflect(-v, n), normalize(vec3(-0.4, 0.8, 0.45))), 0.0), 40.0);
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (0.6 + hl * 3.0), clamp(rim * 0.85 + hl, 0.0, 1.0)); }`;

export function createLiquid(group) {
  const cavGeo = cushionGeometry(CAV, 96);
  // points that fill the cavity: the surface height is the FILL quantile of their projection on the surface normal
  const N = 3200, S = new Float32Array(N * 3), proj = new Float32Array(N);
  for (let k = 0; k < N;) { const x = (Math.random() * 2 - 1) * CAV.a, y = CAV.y0 + Math.random() * (CAV.y1 - CAV.y0), z = (Math.random() * 2 - 1) * CAV.b; if (inside(CAV, x, y, z)) { S.set([x, y, z], k * 3); k++; } }

  const plane = new THREE.Plane(), above = new THREE.Plane();
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', transmission: 1, thickness: 0.32, roughness: 0.03, ior: 1.36, dispersion: 0.25,
    attenuationColor: new THREE.Color('#e3a24c'), attenuationDistance: 0.34, specularIntensity: 1, envMapIntensity: 1.1, clippingPlanes: [plane],
  });
  const shell = new THREE.Mesh(cavGeo, liquidMat); group.add(shell);

  const ripple = rippleNormalMap();
  const capMat = liquidMat.clone(); capMat.clippingPlanes = []; capMat.normalMap = ripple; capMat.normalScale.set(0.15, 0.15); capMat.side = THREE.DoubleSide;
  const MAXB = 520, RINGS = 4, capGeo = new THREE.BufferGeometry();
  const capPos = new Float32Array((1 + RINGS * MAXB) * 3), capNor = new Float32Array(capPos.length), capUv = new Float32Array((1 + RINGS * MAXB) * 2);
  capGeo.setAttribute('position', new THREE.BufferAttribute(capPos, 3).setUsage(THREE.DynamicDrawUsage));
  capGeo.setAttribute('normal', new THREE.BufferAttribute(capNor, 3).setUsage(THREE.DynamicDrawUsage));
  capGeo.setAttribute('uv', new THREE.BufferAttribute(capUv, 2).setUsage(THREE.DynamicDrawUsage));
  const capIdx = new Uint32Array(MAXB * 3 + (RINGS - 1) * MAXB * 6); capGeo.setIndex(new THREE.BufferAttribute(capIdx, 1).setUsage(THREE.DynamicDrawUsage));
  const cap = new THREE.Mesh(capGeo, capMat); cap.frustumCulled = false; group.add(cap);

  const wallU = { uPlane: { value: new THREE.Vector4() } };
  const wall = new THREE.Mesh(cavGeo, new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, side: THREE.DoubleSide, ...blendedOpaque }));
  wall.renderOrder = 3; group.add(wall);

  const NB = 46, bubU = { uPlane: { value: new THREE.Vector4() } };
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.ShaderMaterial({ uniforms: bubU, vertexShader: BUB_VERT, fragmentShader: BUB_FRAG, ...blendedOpaque }), NB);
  bubbles.renderOrder = 4; bubbles.frustumCulled = false; group.add(bubbles);
  const bub = Array.from({ length: NB }, () => ({ p: new THREE.Vector3(), r: 0, ph: Math.random() * 6.28, alive: false }));

  // physics state
  const n = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3(), cPrev = new THREE.Vector3(), vPrev = new THREE.Vector3(), acc = new THREE.Vector3();
  const centerL = new THREE.Vector3(0, CAV.y0 + (CAV.y1 - CAV.y0) * 0.33, 0);
  let first = true, level = 0, energy = 0, spinPrev = 0, omega = 0, time = 0;
  const q = new THREE.Quaternion(), qi = new THREE.Quaternion(), pW = new THREE.Vector3(), sW = new THREE.Vector3(), cW = new THREE.Vector3();
  const nW = new THREE.Vector3(), nL = new THREE.Vector3(), upL = new THREE.Vector3(), tmp = new THREE.Vector3(), m4 = new THREE.Matrix4(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const pts = [];

  function rebuildCap(d, dip) {
    // cross-section of the cavity with the plane nL . x = d, triangulated as rings for a whirlpool dip
    pts.length = 0;
    const p = cavGeo.attributes.position, idx = cavGeo.index.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const cut = (u, w) => { const du = u.dot(nL) - d, dw = w.dot(nL) - d; if ((du > 0) !== (dw > 0)) pts.push(u.clone().lerp(w, du / (du - dw))); };
    for (let i = 0; i < idx.length; i += 3) { a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]); cut(a, b); cut(b, c); cut(c, a); }
    if (pts.length < 3) { capGeo.setDrawRange(0, 0); return; }
    const ctr = new THREE.Vector3(); for (const v of pts) ctr.add(v); ctr.divideScalar(pts.length);
    e1.set(1, 0, 0); if (Math.abs(nL.x) > 0.9) e1.set(0, 0, 1); e1.sub(tmp.copy(nL).multiplyScalar(e1.dot(nL))).normalize(); e2.crossVectors(nL, e1);
    pts.sort((u, w) => Math.atan2(tmp.subVectors(u, ctr).dot(e2), tmp.dot(e1)) - Math.atan2(tmp.subVectors(w, ctr).dot(e2), tmp.dot(e1)));
    const B = Math.min(pts.length, MAXB);
    const put = (i, v, sink) => { capPos[i * 3] = v.x - nL.x * sink; capPos[i * 3 + 1] = v.y - nL.y * sink; capPos[i * 3 + 2] = v.z - nL.z * sink; capNor.set([nL.x, nL.y, nL.z], i * 3); capUv[i * 2] = tmp.subVectors(v, ctr).dot(e1) * 3 + time * 0.03; capUv[i * 2 + 1] = tmp.dot(e2) * 3; };
    put(0, ctr, dip);
    for (let r = 1; r <= RINGS; r++) { const f = r / RINGS; for (let k = 0; k < B; k++) put(1 + (r - 1) * B + k, tmp.copy(pts[Math.floor(k * pts.length / B)]).sub(ctr).multiplyScalar(f).add(ctr).clone(), dip * (1 - f * f)); }
    let t = 0;
    for (let k = 0; k < B; k++) { capIdx[t++] = 0; capIdx[t++] = 1 + k; capIdx[t++] = 1 + ((k + 1) % B); }
    for (let r = 1; r < RINGS; r++) for (let k = 0; k < B; k++) {
      const i0 = 1 + (r - 1) * B + k, i1 = 1 + (r - 1) * B + ((k + 1) % B), j0 = 1 + r * B + k, j1 = 1 + r * B + ((k + 1) % B);
      capIdx[t++] = i0; capIdx[t++] = j0; capIdx[t++] = i1; capIdx[t++] = i1; capIdx[t++] = j0; capIdx[t++] = j1;
    }
    capGeo.setDrawRange(0, t);
    for (const k of ['position', 'normal', 'uv']) capGeo.attributes[k].needsUpdate = true; capGeo.index.needsUpdate = true;
    capGeo.computeBoundingSphere();
  }

  function respawn(b) {
    for (let tries = 0; tries < 30; tries++) { const i = Math.floor(Math.random() * N); const v = tmp.set(S[i * 3], S[i * 3 + 1], S[i * 3 + 2]); if (v.dot(nL) < level - 0.12) { b.p.copy(v); break; } }
    b.r = 0.0035 + Math.pow(Math.random(), 2.2) * 0.009; b.alive = true;
  }

  function update(dt, spin) {
    time += dt;
    group.updateMatrixWorld();
    group.matrixWorld.decompose(pW, q, sW); qi.copy(q).invert();
    cW.copy(centerL).applyMatrix4(group.matrixWorld);
    if (first) { cPrev.copy(cW); first = false; }
    const vel = tmp.subVectors(cW, cPrev).divideScalar(Math.max(dt, 1e-3)); cPrev.copy(cW);
    acc.lerp(new THREE.Vector3().subVectors(vel, vPrev).divideScalar(Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 18)); vPrev.copy(vel);
    acc.clampLength(0, 40);
    // the surface wants to sit across effective gravity (g - a); a damped spring gets it there
    const eq = new THREE.Vector3(acc.x, G + acc.y, acc.z).normalize();
    const steps = 4, h = dt / steps;
    for (let s = 0; s < steps; s++) for (const k of ['x', 'z']) { const f = OMEGA * OMEGA * (eq[k] - n[k]) - 2 * ZETA * OMEGA * nv[k]; nv[k] += f * h; n[k] += nv[k] * h; }
    n.x = THREE.MathUtils.clamp(n.x, -0.7, 0.7); n.z = THREE.MathUtils.clamp(n.z, -0.7, 0.7); n.y = 1;
    const nw = nW.copy(n).normalize();
    // spin around the bottle's own axis: angular velocity drives the whirlpool depth (paraboloid ~ w^2)
    omega += ((spin - spinPrev) / Math.max(dt, 1e-3) - omega) * (1 - Math.exp(-dt * 6)); spinPrev = spin;
    const dip = Math.min(0.07, omega * omega * 0.0022);
    energy += (Math.hypot(nv.x, nv.z) * 0.6 + Math.abs(acc.y) * 0.004 + dip * 4 - energy) * (1 - Math.exp(-dt * 4));

    nL.copy(nw).applyQuaternion(qi);
    for (let i = 0; i < N; i++) proj[i] = S[i * 3] * nL.x + S[i * 3 + 1] * nL.y + S[i * 3 + 2] * nL.z;
    level = quickselect(proj, Math.floor(N * FILL));
    const s = sW.x, c = s * level + nw.dot(pW);
    plane.set(tmp.copy(nw).negate(), c);           // keep nw . X <= c
    above.set(nw.clone(), -c);
    wallU.uPlane.value.set(nw.x, nw.y, nw.z, c);
    bubU.uPlane.value.set(nw.x, nw.y, nw.z, c - 0.004 * s);
    rebuildCap(level, dip);
    capMat.normalScale.setScalar(0.08 + Math.min(0.6, energy * 1.2));
    ripple.offset.set(time * 0.02, time * 0.013);

    // bubbles: rise along true up (in the bottle's frame), speed ~ r^2 like small bubbles in a liquid
    upL.set(0, 1, 0).applyQuaternion(qi);
    for (let i = 0; i < NB; i++) {
      const b = bub[i];
      if (!b.alive) { if (Math.random() < dt * 2.5) respawn(b); else { m4.makeScale(0, 0, 0); bubbles.setMatrixAt(i, m4); continue; } }
      const v = 900 * b.r * b.r + 0.008;
      b.p.addScaledVector(upL, v * dt); b.p.x += Math.sin(time * 6 + b.ph) * 0.0006; b.p.z += Math.cos(time * 5 + b.ph) * 0.0006;
      if (b.p.dot(nL) > level - b.r * 0.5 || !inside(CAV, b.p.x, b.p.y, b.p.z)) { b.alive = false; m4.makeScale(0, 0, 0); }
      else m4.makeScale(b.r, b.r, b.r).setPosition(b.p);
      bubbles.setMatrixAt(i, m4);
    }
    bubbles.instanceMatrix.needsUpdate = true;
    return { energy, tilt: Math.acos(Math.min(1, nw.y)) };
  }

  return { update, plane, above, shell, cap, wall, bubbles, liquidMat, capMat };
}
