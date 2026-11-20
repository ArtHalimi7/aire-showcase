import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createSky, createEnvironment } from './gl/sky.js';
import { createClouds } from './gl/clouds.js';
import { createBottle, blendedOpaque } from './gl/bottle.js';
import { createBubbles } from './gl/bubbles.js';

gsap.registerPlugin(ScrollTrigger);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);

// film grain
{
  const c = document.createElement('canvas'); c.width = c.height = 220; const x = c.getContext('2d'); const im = x.createImageData(220, 220);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); $('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
}

// ---------------- smooth scroll ----------------
const lenis = new Lenis({ lerp: reduce ? 1 : 0.072, smoothWheel: !reduce });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
document.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); const t = a.dataset.scroll;
  lenis.scrollTo(t === '0' ? 0 : t, { duration: 2.6, easing: (k) => 1 - Math.pow(1 - k, 4) });
}));
$('.cta').addEventListener('click', (e) => e.currentTarget.classList.add('done'));

// ---------------- the story, as one state object the scroll timeline writes and the renderer reads ----------------
const S = { rigY: 0, camX: 0, camY: 0.08, camZ: 5.4, lookX: 0, lookY: 0.02, bx: 0, by: 0, brx: 0, bry: 0, word: 1, sun: 0.2, notes: 0 };
const I = reduce ? { z: 0, by: 0, word: 1, s: 1 } : { z: 4.2, by: -0.55, word: 0, s: 0.92 }; // intro offsets

function story() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const at = (sel) => $(sel).offsetTop / max;
  const f = { rise: at('.rise'), idea: at('.idea'), notes: at('.notes'), craft: at('.craft'), final: at('.final') };
  const w = 0.035;
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  tl.to(S, { word: 0, duration: 0.06, ease: 'power1.in' }, Math.max(0, f.rise - 0.08))
    // rise up through the cloud layer
    .to(S, { rigY: 10, camZ: 6.2, camY: 1.0, lookY: -0.12, bx: 0.25, bry: Math.PI, sun: 0.6, duration: f.idea - 0.085 - (f.rise - 0.06), ease: 'power1.inOut' }, f.rise - 0.06)
    // the bottle steps aside before the story text arrives
    .to(S, { bx: 0.95, bry: Math.PI * 1.35, camX: -0.25, camZ: 5.6, lookX: 0.35, duration: 0.06 }, f.idea - 0.085)
    // back to centre, the notes arrive
    .to(S, { bx: 0, lookX: 0, camX: 0, camZ: 5.9, camY: 0.55, lookY: 0.05, bry: Math.PI * 2.15, duration: 2 * w }, f.notes - w)
    .to(S, { notes: 1, duration: 0.07, ease: 'power1.out' }, f.notes - 0.005)
    .to(S, { notes: 0, duration: 0.035, ease: 'power1.in' }, f.craft - 0.12)
    // macro on the glass, in place before the craft text arrives
    .to(S, { camZ: 2.1, camX: 0.42, camY: 0.12, lookX: 0.1, lookY: 0.08, bx: -0.22, bry: Math.PI * 2 + 0.6, brx: 0.06, duration: 0.06 }, f.craft - 0.088)
    // pull back; it comes to rest on a cloud in warm light
    .to(S, { camZ: 7.0, camX: 0, camY: 1.35, lookY: -0.25, lookX: 0, bx: 0, by: -0.3, brx: 0, bry: Math.PI * 3, rigY: 9.4, sun: 1, duration: 1 - (f.final - 0.15) }, f.final - 0.15)
    .set({}, {}, 1);
  ScrollTrigger.create({ trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: true, animation: tl });

  for (const sec of document.querySelectorAll('.ch:not(.hero)')) {
    const spans = sec.querySelectorAll('.ln > span'); const last = sec.classList.contains('final');
    // the stage stops being sticky at progress (H - 0.2) / (H + 0.6); the text must be gone by then
    const H = sec.offsetHeight / innerHeight, exitAt = Math.max(0.3, (H - 0.2) / (H + 0.6) - 0.2);
    const t = gsap.timeline({ scrollTrigger: { trigger: sec, start: last ? 'top 40%' : 'top 80%', end: last ? 'bottom bottom' : 'bottom 20%', scrub: true } });
    t.fromTo(spans, { yPercent: 118 }, { yPercent: 0, duration: 0.22, stagger: 0.035, ease: 'power3.out' }, 0);
    const rules = sec.querySelectorAll('.stats div');
    if (rules.length) { t.fromTo(rules, { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: 0.03 }, 0.04); t.to(rules, { opacity: 0, duration: 0.12 }, exitAt); }
    if (last) t.fromTo(sec.querySelectorAll('.cta, .ships, .credit'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.2, stagger: 0.05, ease: 'power2.out' }, 0.3);
    else t.to(spans, { yPercent: -118, duration: 0.14, stagger: 0.02, ease: 'power3.in' }, exitAt);
    t.set({}, {}, 1);
  }
  gsap.to('.hero .stage > p', { opacity: 0, y: -26, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 45%', scrub: true } });
}

// ---------------- three ----------------
const mouse = { x: 0, y: 0, tx: 0, ty: 0, px: innerWidth / 2, py: innerHeight / 2, ndc: { x: 0, y: 0, active: false }, moved: false };
addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / innerWidth) * 2 - 1; mouse.ty = (e.clientY / innerHeight) * 2 - 1;
  mouse.ndc.x = mouse.tx; mouse.ndc.y = -mouse.ty; mouse.ndc.active = e.pointerType === 'mouse';
  mouse.px = e.clientX; mouse.py = e.clientY; mouse.moved = true;
});
document.documentElement.addEventListener('pointerleave', () => { mouse.ndc.active = false; });

function wordmark() {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 760; const x = c.getContext('2d');
  x.fillStyle = '#1d2027'; x.textAlign = 'center'; x.font = '300 640px Fraunces'; x.letterSpacing = '24px'; x.fillText('AIRE', 1212, 600);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6.6, (6.6 * 760) / 2400), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, ...blendedOpaque }));
  m.position.set(0, 0.12, -3.4); m.renderOrder = 2; return m;
}

async function init() {
  await Promise.all(['300 100px Fraunces', '400 100px Fraunces', '500 40px Geist', '400 30px Geist'].map((f) => document.fonts.load(f))).catch(() => {});

  const renderer = new THREE.WebGLRenderer({ canvas: $('.gl'), antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.environment = createEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 600);
  const rig = new THREE.Group(); rig.add(camera); scene.add(rig);

  const U = { uTime: { value: 0 }, uSun: { value: S.sun }, uSunDir: { value: new THREE.Vector3(0.55, 0.28, -0.79).normalize() } };
  const sky = createSky(U); scene.add(sky);
  const clouds = createClouds(U); scene.add(clouds.group);
  const bottle = createBottle(); rig.add(bottle.group);
  const word = wordmark(); rig.add(word);
  const bubbles = createBubbles(rig, U, [...document.querySelectorAll('.note')]);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 44 : 30; camera.updateProjectionMatrix();
  };
  resize(); addEventListener('resize', resize);

  const ray = new THREE.Raycaster(), ndcV = new THREE.Vector2();
  addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button')) return;
    ndcV.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndcV, camera);
    bubbles.pop(bubbles.pick(ray.ray));
  });

  const cursor = $('.cursor'), cp = { x: mouse.px, y: mouse.py };
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3(), camW = new THREE.Vector3();
  const frame = (time, deltaMS) => {
    const t = time, dt = Math.min(0.05, deltaMS / 1000);
    U.uTime.value = t; U.uSun.value = S.sun;
    mouse.x += (mouse.tx - mouse.x) * 0.045; mouse.y += (mouse.ty - mouse.y) * 0.045;

    rig.position.y = S.rigY;
    camera.position.set(S.camX + mouse.x * 0.14, S.camY - mouse.y * 0.09, S.camZ + I.z);
    camera.lookAt(tmp.set(S.lookX, S.lookY, 0).add(rig.position));
    const g = bottle.group;
    g.position.set(S.bx, S.by + I.by + Math.sin(t * 0.8) * 0.035, 0);
    g.rotation.set(S.brx + mouse.y * 0.06 + Math.sin(t * 0.6) * 0.02, S.bry + t * 0.1 + mouse.x * 0.22, Math.sin(t * 0.5) * 0.025);
    g.scale.setScalar(I.s);
    word.material.opacity = S.word * I.word; word.visible = word.material.opacity > 0.002;
    rig.updateMatrixWorld();

    camera.getWorldPosition(camW); camera.getWorldDirection(fwd);
    sky.position.copy(camW);
    const dWord = word.visible ? tmp.setFromMatrixPosition(word.matrixWorld).sub(camW).dot(fwd) : Infinity;
    const dBottle = tmp.setFromMatrixPosition(g.matrixWorld).sub(camW).dot(fwd);
    clouds.update(camW, fwd, dWord, dBottle - 0.45);
    bubbles.update(t, dt, camera, mouse.ndc, S.notes, g);

    if (mouse.moved) {
      ndcV.set(mouse.ndc.x, mouse.ndc.y); ray.setFromCamera(ndcV, camera);
      cursor.classList.toggle('on', !!bubbles.pick(ray.ray)); mouse.moved = false;
    }
    cp.x += (mouse.px - cp.x) * 0.25; cp.y += (mouse.py - cp.y) * 0.25;
    cursor.style.transform = `translate(${cp.x.toFixed(1)}px, ${cp.y.toFixed(1)}px)`;

    renderer.render(scene, camera);
  };
  gsap.ticker.add(frame);

  story();
  if (reduce) gsap.set('.veil', { autoAlpha: 0 });
  else {
    gsap.timeline({ delay: 0.15 })
      .to('.veil', { autoAlpha: 0, duration: 1.4, ease: 'power2.out' }, 0)
      .to(I, { z: 0, duration: 3.4, ease: 'expo.out' }, 0)
      .to(I, { by: 0, s: 1, duration: 2.8, ease: 'expo.out' }, 0.2)
      .to(I, { word: 1, duration: 2.2, ease: 'power2.out' }, 0.55)
      .from(['.nav', '.hero .stage'], { opacity: 0, y: 14, duration: 1.4, stagger: 0.1, ease: 'power3.out' }, 1.1);
  }
  window.__aire = { S, lenis, ready: true };
}
init();
