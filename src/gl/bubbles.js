import * as THREE from 'three';
import gsap from 'gsap';
import { rng } from './clouds.js';

// Soap-film bubbles: thin-film interference on the rim, clear in the middle, two sharp window highlights.
const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */ `
uniform float uTime; uniform float uAlpha; uniform float uFade; uniform float uSeed;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = abs(dot(n, v)), fres = pow(1.0 - ndv, 2.4);
  float th = 0.5 + 0.22 * sin(vP.y * 3.2 + uTime * 0.8 + uSeed) + 0.12 * sin(vP.x * 5.1 - uTime * 0.6 + uSeed * 2.0);
  vec3 film = mix(vec3(1.0), 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + th * 1.7 + ndv * 0.9)), 0.62);
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(vec3(-0.45, 0.8, 0.4))), 0.0), 140.0) * 1.4 + pow(max(dot(r, normalize(vec3(0.75, 0.25, 0.6))), 0.0), 50.0) * 0.35;
  vec3 col = film * (0.35 + fres * 0.85) + spec;
  col = mix(col, vec3(0.56, 0.6, 0.7), smoothstep(0.86, 1.0, 1.0 - ndv) * 0.45); // a hairline of definition against white
  float a = clamp(fres * 0.8 + spec + 0.025, 0.0, 1.0) * uAlpha * uFade;
  gl_FragColor = vec4(pow(min(col, vec3(1.0)), vec3(2.2)), a);
  #include <colorspace_fragment>
}`;

const NOTES = [
  { off: [-1.15, 0.5, 0.25], core: '#d6e4b0' },  // bergamot, pear
  { off: [1.2, 0.2, -0.1], core: '#d2c9ee' },    // iris
  { off: [-0.88, -0.6, 0.55], core: '#ead5bd' }, // cashmere wood
];

export function createBubbles(rig, U, labelEls) {
  const geo = new THREE.SphereGeometry(1, 48, 32);
  const r = rng(21);
  const mk = (seed, order) => {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uAlpha: { value: 1 }, uFade: { value: 1 }, uSeed: { value: seed } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
    m.renderOrder = order; rig.add(m); return m;
  };
  const ambient = Array.from({ length: 16 }, () => ({
    kind: 'ambient', mesh: mk(r() * 10, 5), life: 1, push: new THREE.Vector3(),
    base: new THREE.Vector3((r() - 0.5) * 6.6, -2.3 + r() * 4.6, -2.2 + r() * 3.6),
    rad: 0.05 + Math.pow(r(), 1.6) * 0.14, speed: 0.05 + r() * 0.08, phase: r() * 6.28,
  }));
  const notes = NOTES.map((n, i) => {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 5), new THREE.MeshPhysicalMaterial({ color: n.core, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.5, clearcoat: 0.5 }));
    rig.add(core);
    return { kind: 'note', i, mesh: mk(i * 3.1, 6), core, life: 1, push: new THREE.Vector3(), off: new THREE.Vector3(...n.off), rad: 0.3, phase: i * 2.1, s: 0 };
  });
  const all = [...ambient, ...notes];

  const v = new THREE.Vector3(), ndc = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), tgt = new THREE.Vector3(), cam = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  const world = (b) => v.copy(b.mesh.position).add(rig.position);

  function repel(b, mouse, camera, dt) {
    ndc.copy(world(b)).project(camera);
    const dx = (ndc.x - mouse.x) * camera.aspect, dy = ndc.y - mouse.y, d = Math.hypot(dx, dy);
    tgt.set(0, 0, 0);
    if (mouse.active && d < 0.32 && d > 1e-4) { const k = (0.32 - d) / 0.32; tgt.copy(right).multiplyScalar((dx / d) * k * 0.5).addScaledVector(up, (dy / d) * k * 0.5); }
    b.push.lerp(tgt, 1 - Math.exp(-dt * 5));
  }

  function update(t, dt, camera, mouse, notesK, bottle) {
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.getWorldPosition(cam);
    for (const b of ambient) {
      b.base.y += b.speed * dt; if (b.base.y > 2.4) b.base.y = -2.4;
      b.mesh.position.set(b.base.x + Math.sin(t * 0.5 + b.phase) * 0.14, b.base.y, b.base.z).add(b.push);
      b.mesh.scale.setScalar(b.rad * b.life);
      b.mesh.material.uniforms.uFade.value = THREE.MathUtils.smoothstep(world(b).distanceTo(cam), 0.9, 2.2);
      repel(b, mouse, camera, dt);
    }
    for (const b of notes) {
      const s = THREE.MathUtils.clamp(notesK * 1.7 - b.i * 0.3, 0, 1); b.s = 1 - Math.pow(1 - s, 3);
      b.mesh.position.copy(bottle.position).add(b.off).add(b.push);
      b.mesh.position.y += Math.sin(t * 0.7 + b.phase) * 0.05; b.mesh.position.x += Math.cos(t * 0.5 + b.phase) * 0.03;
      b.mesh.scale.setScalar(b.rad * b.s * b.life);
      b.core.position.copy(b.mesh.position); b.core.rotation.set(t * 0.3, t * 0.4 + b.i, 0);
      b.core.scale.setScalar(b.s * Math.min(b.life, 1)); b.core.visible = b.s * b.life > 0.01;
      b.mesh.visible = b.s > 0.01;
      repel(b, mouse, camera, dt);
      // label beside the bubble (outside, away from the bottle)
      const el = labelEls[b.i]; if (!el) continue;
      ndc.copy(world(b)).project(camera);
      const sx = (ndc.x + 1) / 2 * innerWidth, sy = (1 - ndc.y) / 2 * innerHeight;
      const edge = v.copy(world(b)).addScaledVector(right, b.rad).project(camera);
      const rpx = Math.abs((edge.x - ndc.x) / 2 * innerWidth) * b.s;
      const left = b.off.x < 0, lw = el.offsetWidth;
      const lx = THREE.MathUtils.clamp(left ? sx - rpx - 18 - lw : sx + rpx + 18, 20, innerWidth - lw - 20);
      el.style.transform = `translate(${lx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(0, -50%)`;
      el.style.textAlign = left ? 'right' : 'left';
      el.style.opacity = (b.s * Math.min(1, b.life)).toFixed(3);
    }
  }

  function pick(ray) {
    let best = null, bd = Infinity;
    for (const b of all) {
      const rad = b.mesh.scale.x; if (rad < 0.02 || b.popping) continue;
      sphere.set(world(b), rad);
      const hit = ray.intersectSphere(sphere, tgt); if (hit) { const d = hit.distanceToSquared(ray.origin); if (d < bd) { bd = d; best = b; } }
    }
    return best;
  }

  function pop(b) {
    if (!b || b.popping) return; b.popping = true;
    const u = b.mesh.material.uniforms.uAlpha;
    gsap.timeline()
      .to(b, { life: 1.35, duration: 0.14, ease: 'power2.out' })
      .to(u, { value: 0, duration: 0.14, ease: 'power1.in' }, 0)
      .add(() => { if (b.kind === 'ambient') b.base.y = -2.4; b.life = 0; u.value = 1; })
      .to(b, { life: 1, duration: 1.2, ease: 'elastic.out(1, 0.6)', delay: b.kind === 'note' ? 0.8 : 0.5, onComplete: () => { b.popping = false; } });
  }

  return { update, pick, pop };
}
