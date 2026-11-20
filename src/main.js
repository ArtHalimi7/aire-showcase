import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createAtmosphere, createSky, createEnvironment, createOrbs } from './gl/sky.js';
import { createClouds } from './gl/clouds.js';
import { createBottle, blendedOpaque } from './gl/bottle.js';
import { createLiquid } from './gl/liquid.js';
import { createBubbles } from './gl/bubbles.js';
import { createPlinth } from './gl/plinth.js';
import { createPost } from './gl/post.js';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp;

// ---------------- smooth scroll ----------------
const lenis = new Lenis({ lerp: reduce ? 1 : 0.07, smoothWheel: !reduce });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
document.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); const t = a.dataset.scroll;
  lenis.scrollTo(t === '0' ? 0 : t, { duration: 3, easing: (k) => 1 - Math.pow(1 - k, 4) });
}));
$('.cta').addEventListener('click', (e) => e.currentTarget.classList.add('done'));

// ---------------- the story: one state object written by the scroll timeline, read by the renderer ----------------
const HERO_Y = 1.0, HIGH_Y = 9.0, PLINTH_TOP = 0.62;
const S = {
  tod: 0, cloudVis: 1, orbs: 0, notes: 0, plinth: 0, word: 1,
  bx: 0, by: HERO_Y, spin: 0, tiltX: 0, tiltZ: 0,
  camDist: 4.5, camYaw: 0, camPitch: 0.15, lookY: 0.14, shiftX: 0, aperture: 0.12,
};
const I = reduce ? { camBack: 0, camLow: 0, yaw: 0, word: 1, spin: 0, part: 0.3 } : { camBack: 3.2, camLow: -0.35, yaw: -0.42, word: 0, spin: -2.2, part: 0 };
const rise = { x: reduce ? 0 : -3.8, v: 0, target: reduce ? 0 : -3.8 };   // the bottle's rise out of the cloud, on a spring
const drag = { spin: 0, vel: 0, down: false, moved: 0, lastX: 0, lastT: 0 };

function story() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const at = (sel) => $(sel).offsetTop / max;
  const f = { rise: at('.rise'), liquid: at('.liquid'), notes: at('.notes'), craft: at('.craft'), final: at('.final') };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  const TAU = Math.PI * 2;
  tl.to(S, { word: 0, duration: 0.05, ease: 'power1.in' }, Math.max(0, f.rise - 0.07))
    // up and away: the bottle climbs high above the cloud sea, turning once
    .to(S, { tod: 1, by: HIGH_Y, spin: TAU, camDist: 5.3, camPitch: 0.24, camYaw: 0.5, lookY: 0.0, aperture: 0.45, duration: f.liquid - 0.09 - (f.rise - 0.05), ease: 'power1.inOut' }, f.rise - 0.05)
    // into the light: a warm studio, close on the liquid
    .to(S, { tod: 2, cloudVis: 0, orbs: 1, camDist: 3.3, camYaw: -0.35, camPitch: 0.06, shiftX: 0.2, aperture: 1.5, lookY: 0.0, duration: 0.06 }, f.liquid - 0.09)
    // the bottle rocks; the liquid stays level and sloshes
    .to(S, { tiltZ: 0.5, spin: TAU + 0.3, duration: (f.notes - f.liquid) * 0.3, ease: 'power2.inOut' }, f.liquid - 0.02)
    .to(S, { tiltZ: -0.42, duration: (f.notes - f.liquid) * 0.28 }, '>')
    .to(S, { tiltZ: 0.12, duration: (f.notes - f.liquid) * 0.18 }, '>')
    .to(S, { tiltZ: 0, duration: (f.notes - f.liquid) * 0.14 }, '>')
    // pearl light, the notes arrive
    .to(S, { tod: 3, camDist: 5.4, camYaw: 0.15, camPitch: 0.05, shiftX: 0, aperture: 1.0, duration: 0.06 }, f.notes - 0.08)
    .to(S, { notes: 1, duration: 0.07, ease: 'power1.out' }, f.notes - 0.01)
    .to(S, { spin: TAU + 0.3 + Math.PI, duration: f.craft - f.notes, ease: 'none' }, f.notes - 0.02)
    .to(S, { notes: 0, duration: 0.035, ease: 'power1.in' }, f.craft - 0.13)
    // golden hour: down toward the clouds, macro on the stopper and the gold
    .to(S, { tod: 4, cloudVis: 1, orbs: 0, by: 3.2, camDist: 1.6, camPitch: 0.3, camYaw: -0.62, lookY: 0.48, shiftX: -0.25, aperture: 2.2, duration: 0.07 }, f.craft - 0.095)
    .to(S, { spin: TAU + 0.3 + Math.PI + 0.9, duration: f.final - f.craft, ease: 'none' }, f.craft - 0.02)
    // sunset: a stone plinth rises out of the cloud and the bottle comes to rest on it
    .to(S, { tod: 5, plinth: 1, by: PLINTH_TOP + 0.46, camDist: 6.3, camPitch: 0.2, camYaw: 0.22, lookY: -0.12, shiftX: 0, aperture: 0.5, spin: TAU * 2 + 0.3, duration: 1 - (f.final - 0.17) }, f.final - 0.17)
    .set({}, {}, 1);
  ScrollTrigger.create({ trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: true, animation: tl });

  for (const sec of document.querySelectorAll('.ch:not(.hero)')) {
    const spans = sec.querySelectorAll('.ln > span'); const last = sec.classList.contains('final');
    const H = sec.offsetHeight / innerHeight, exitAt = Math.max(0.3, (H - 0.2) / (H + 0.6) - 0.2);
    const t = gsap.timeline({ scrollTrigger: { trigger: sec, start: last ? 'top 40%' : 'top 80%', end: last ? 'bottom bottom' : 'bottom 20%', scrub: true } });
    t.fromTo(spans, { yPercent: 118 }, { yPercent: 0, duration: 0.22, stagger: 0.035, ease: 'power3.out' }, 0);
    const rules = sec.querySelectorAll('.stats div');
    if (rules.length) { t.fromTo(rules, { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.03 }, 0.04); t.to(rules, { opacity: 0, duration: 0.12 }, exitAt); }
    if (last) t.fromTo(sec.querySelectorAll('.cta, .ships, .credit'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.05, ease: 'power2.out' }, 0.3);
    else t.to(spans, { yPercent: -118, duration: 0.14, stagger: 0.02, ease: 'power3.in' }, exitAt);
    t.set({}, {}, 1);
  }
  // the 312 counts up as the chapter arrives
  const num = $('.giant .ln > span');
  ScrollTrigger.create({ trigger: '.liquid', start: 'top 80%', end: 'top 10%', scrub: true, onUpdate: (st) => { num.textContent = String(Math.round(312 * (1 - Math.pow(1 - st.progress, 3)))); } });
  gsap.to('.hero .stage > p', { opacity: 0, y: -26, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 45%', scrub: true } });
}

// ---------------- pointer: drag to turn the bottle, click to pop bubbles ----------------
const mouse = { x: 0, y: 0, tx: 0, ty: 0, px: innerWidth / 2, py: innerHeight / 2, ndc: { x: 0, y: 0, active: false }, moved: false };
addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  mouse.ndc.x = mouse.tx; mouse.ndc.y = -mouse.ty; mouse.ndc.active = e.pointerType === 'mouse';
  mouse.px = e.clientX; mouse.py = e.clientY; mouse.moved = true;
  if (drag.down) {
    const dx = e.clientX - drag.lastX, now = performance.now(), dt = Math.max(1, now - drag.lastT) / 1000;
    drag.moved += Math.abs(dx); drag.spin += dx * 0.009;
    drag.vel = clamp(drag.vel * 0.4 + (dx * 0.009 / dt) * 0.6, -14, 14); drag.lastX = e.clientX; drag.lastT = now;
  }
});
document.documentElement.addEventListener('pointerleave', () => { mouse.ndc.active = false; });

function wordmark() {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 760; const x = c.getContext('2d');
  x.fillStyle = '#1d2027'; x.textAlign = 'center'; x.font = '300 640px Fraunces'; x.letterSpacing = '30px'; x.fillText('AIRE', 1215, 600);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, (9 * 760) / 2400), new THREE.MeshBasicMaterial({ map: t, ...blendedOpaque }));
  m.position.set(0, HERO_Y + 0.62, -7.5); m.renderOrder = 2; return m;
}

async function init() {
  await Promise.all(['300 100px Fraunces', '400 100px Fraunces', '500 40px Geist', '400 30px Geist'].map((f) => document.fonts.load(f))).catch(() => {});

  const renderer = new THREE.WebGLRenderer({ canvas: $('.gl'), antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.NoToneMapping; renderer.localClippingEnabled = true; renderer.transmissionResolutionScale = 0.5;
  const post = createPost(renderer);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600); camera.layers.set(0);

  const { U, look, setTOD } = createAtmosphere();
  const env = createEnvironment(renderer, U);
  let envTex = env.update(); scene.environment = envTex;
  scene.add(createSky(U));
  const clouds = createClouds(U); scene.add(clouds.group);
  const orbs = createOrbs(new THREE.Vector3(0, HIGH_Y, 0)); scene.add(orbs);
  const word = wordmark(); scene.add(word);
  const plinth = createPlinth(U); scene.add(plinth.group);

  const bottle = createBottle(null, null, U); scene.add(bottle.group);
  bottle.glassU.envMap.value = envTex;
  const liquid = createLiquid(bottle.group);
  const world = new THREE.Group(); scene.add(world);
  const bubbles = createBubbles(world, U, [...document.querySelectorAll('.note')]);

  // ---- sizing, with resolution that adapts to the machine ----
  let dpr = Math.min(devicePixelRatio, 1.75), maxDpr = dpr;
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    post.setSize(Math.round(w * dpr), Math.round(h * dpr));
    bottle.glassU.uScene.value = post.T.copy.texture; bottle.glassU.uBack.value = post.T.back.texture;
    bottle.glassU.uRes.value.set(post.T.main.width, post.T.main.height);
    camera.aspect = w / h; camera.fov = camera.aspect < 0.8 ? 44 : 30; camera.updateProjectionMatrix();
  };
  resize(); addEventListener('resize', resize);

  // ---- pointer picking ----
  const ray = new THREE.Raycaster(), ndcV = new THREE.Vector2(), bodySphere = new THREE.Sphere();
  const overBottle = () => { bodySphere.set(bottle.group.position.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.55); return ray.ray.intersectsSphere(bodySphere); };
  const aim = (cx, cy) => { ndcV.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndcV, camera); };
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button')) return;
    aim(e.clientX, e.clientY);
    drag.down = overBottle(); drag.moved = 0; drag.lastX = e.clientX; drag.lastT = performance.now(); drag.downX = e.clientX; drag.downY = e.clientY;
  });
  addEventListener('pointerup', (e) => {
    const wasDrag = drag.down && drag.moved > 6; drag.down = false;
    if (wasDrag || e.target.closest('a, button')) return;
    aim(e.clientX, e.clientY); bubbles.pop(bubbles.pick(ray.ray));
  });

  const cursor = $('.cursor'), cursorLabel = cursor.querySelector('span'), cp = { x: mouse.px, y: mouse.py };
  const clockT = $('.clock-time'), clockN = $('.clock-name');
  const target = new THREE.Vector3(), tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), sunUV = new THREE.Vector2(), sunV = new THREE.Vector3();
  let envTod = -1, envFrames = 0, ftAvg = 16, lastDprChange = 0;

  const frame = (time, deltaMS) => {
    const t = time, dt = Math.min(0.05, deltaMS / 1000);
    ftAvg += (deltaMS - ftAvg) * 0.05;
    if (t - lastDprChange > 2.5) {
      if (ftAvg > 26 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); lastDprChange = t; }
      else if (ftAvg < 12 && dpr < maxDpr) { dpr = Math.min(maxDpr, dpr + 0.25); resize(); lastDprChange = t; }
    }
    U.uTime.value = t; setTOD(S.tod);
    mouse.x += (mouse.tx - mouse.x) * 0.045; mouse.y += (mouse.ty - mouse.y) * 0.045;

    // the rise out of the cloud: a spring with a little overshoot, like something buoyant settling
    const k = 22, c = 2 * 0.62 * Math.sqrt(k);
    for (let i = 0; i < 4; i++) { const h = dt / 4; rise.v += (k * (rise.target - rise.x) - c * rise.v) * h; rise.x += rise.v * h; }
    if (!drag.down) { drag.spin += drag.vel * dt; drag.vel *= Math.exp(-1.7 * dt); }

    // bottle
    const g = bottle.group;
    const spin = S.spin + I.spin + drag.spin + t * 0.12;
    g.position.set(S.bx, S.by + rise.x + Math.sin(t * 0.8) * 0.03, 0);
    g.rotation.set(S.tiltX + mouse.y * 0.04 + Math.sin(t * 0.6) * 0.015, spin, S.tiltZ - rise.v * 0.018 + Math.sin(t * 0.5) * 0.02, 'ZXY');
    g.updateMatrixWorld();
    const phys = liquid.update(dt, spin);

    // camera orbits the bottle; a lens shift places it left or right of frame
    target.set(g.position.x, g.position.y + S.lookY, 0);
    const pitch = S.camPitch, yaw = S.camYaw + I.yaw + mouse.x * 0.05, dist = S.camDist + I.camBack;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist + I.camLow - mouse.y * 0.06, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    const W = innerWidth, H = innerHeight, portrait = W / H < 0.8;
    // on a wide screen the bottle steps left or right of the text; on a phone it moves up above it
    camera.setViewOffset(W, H, portrait ? 0 : -S.shiftX * W, portrait ? Math.abs(S.shiftX) * 0.8 * H : 0, W, H);
    word.scale.setScalar(portrait ? 0.55 : 1);
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd); U.uCamFwd.value.copy(fwd);

    // atmosphere
    U.uCloudVis.value = S.cloudVis;
    sunV.copy(U.uSunDir.value).transformDirection(camera.matrixWorldInverse);
    const sl = Math.hypot(sunV.x, sunV.y); U.uSunView.value.set(sl > 0.05 ? sunV.x / sl : 0, sl > 0.05 ? sunV.y / sl : 1);
    U.uPart.value.set(g.position.x, -0.35, g.position.z, 1.8); U.uPartK.value = I.part + S.plinth * 0.9;
    orbs.material.uniforms.uTime.value = t; orbs.material.uniforms.uAlpha.value = S.orbs; orbs.material.uniforms.uTint.value.copy(U.uStudioA.value); orbs.visible = S.orbs > 0.01;
    word.material.opacity = S.word * I.word; word.visible = word.material.opacity > 0.002;
    plinth.group.position.set(0, THREE.MathUtils.lerp(-2.2, PLINTH_TOP, 1 - Math.pow(1 - S.plinth, 3)), 0); plinth.group.visible = S.plinth > 0.005;
    plinth.topU.uBottle.value.copy(g.position); plinth.topU.uSlosh.value = phys.energy; plinth.topU.uK.value = clamp((g.position.y - PLINTH_TOP - 0.3) * -4 + 1, 0, 1) * S.plinth;

    // env reflections follow the light (re-captured while it changes)
    envFrames++;
    if (Math.abs(S.tod - envTod) > 0.012 || envFrames > 90) { envTex = env.update(); scene.environment = envTex; bottle.glassU.envMap.value = envTex; envTod = S.tod; envFrames = 0; }

    clouds.update(camera.position, fwd, tmp.copy(g.position).sub(camera.position).dot(fwd) - 0.5);
    bubbles.update(t, dt, camera, mouse.ndc, S.notes, g);
    // the gold foil is printed on the outside: drawn over the glass when it faces us, refracted through it when it doesn't
    tmp.set(0, 0, 1).applyQuaternion(g.quaternion);
    bottle.label.layers.set(tmp.dot(fwd) < 0 ? 1 : 0);

    // cursor
    if (mouse.moved || drag.down) {
      aim(mouse.px, mouse.py);
      const overB = drag.down || overBottle(), overBub = !overB && bubbles.pick(ray.ray);
      cursor.classList.toggle('on', !!(overB || overBub)); cursorLabel.textContent = overB ? 'Drag' : overBub ? 'Pop' : '';
      mouse.moved = false;
    }
    cp.x += (mouse.px - cp.x) * 0.25; cp.y += (mouse.py - cp.y) * 0.25;
    cursor.style.transform = `translate(${cp.x.toFixed(1)}px, ${cp.y.toFixed(1)}px)`;
    if (clockT.textContent !== look.clock) clockT.textContent = look.clock;
    if (clockN.textContent !== look.name) clockN.textContent = look.name;

    // ---- render: glass back faces, the world, then the glass (reading a copy of the world), then the finish ----
    const T = post.T;
    camera.layers.set(3);
    renderer.setRenderTarget(T.back); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    camera.layers.set(0); renderer.setClearColor(0x000000, 1); renderer.setRenderTarget(T.main); renderer.render(scene, camera);
    post.copyMain();
    camera.layers.set(1); renderer.autoClear = false; renderer.setRenderTarget(T.main); renderer.render(scene, camera); renderer.autoClear = true;
    camera.layers.set(0);

    sunV.copy(camera.position).addScaledVector(U.uSunDir.value, 200).project(camera);
    sunUV.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5);
    const onScreen = sunV.z < 1 ? clamp(1.4 - Math.hypot(sunV.x, sunV.y) * 0.55, 0, 1) : 0;
    const dofFocus = camera.position.distanceTo(target);
    post.finish({
      near: camera.near, far: camera.far, focus: dofFocus, aperture: S.aperture, exposure: look.exposure, bloom: look.bloom, sat: look.sat, warm: look.warm, time: t,
      sunUV, raysK: onScreen * (1 - U.uStudio.value) * U.uGlow.value * 0.22 * S.cloudVis,
    });
    if (window.__showBack) post.show(post.T.back.texture);
  };
  gsap.ticker.add(frame);

  story();
  if (reduce) { gsap.set('.veil', { autoAlpha: 0 }); rise.target = 0; }
  else {
    gsap.timeline({ delay: 0.1 })
      .to('.veil', { autoAlpha: 0, duration: 1.6, ease: 'power2.out' }, 0)
      .to(I, { camBack: 0, camLow: 0, yaw: 0, duration: 5.2, ease: 'power2.inOut' }, 0)
      .to(rise, { target: 0.12, duration: 3.0, ease: 'power2.inOut' }, 1.0)
      .to(rise, { target: 0, duration: 1.2, ease: 'sine.inOut' }, 4.0)
      .to(I, { part: 1, duration: 1.6, ease: 'power2.out' }, 1.4)
      .to(I, { spin: 0, duration: 4.2, ease: 'power3.out' }, 1.0)
      .to(I, { part: 0.25, duration: 6, ease: 'power1.inOut' }, 3.4)
      .to(I, { word: 1, duration: 2.4, ease: 'power2.out' }, 3.0)
      .from(['.nav', '.hero .stage', '.clock'], { opacity: 0, y: 14, duration: 1.4, stagger: 0.1, ease: 'power3.out' }, 3.6);
  }
  window.__aire = { S, lenis, ready: true, bottle, liquid, debug: (k) => { if (k === 'noglass') { bottle.body.visible = bottle.neck.visible = false; } if (k === 'nocap') liquid.cap.visible = false; if (k === 'noshell') liquid.shell.visible = false; if (k === 'norefract') bottle.glassU.uRefract.value = 0; if (k === 'showback') window.__showBack = true; if (k === 'nofx') { bottle.glassU.uRefract.value = 0; bottle.glassU.uEnvK.value = 0; } } };
}
init();
