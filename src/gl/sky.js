import * as THREE from 'three';

// A day passes as you scroll. Each chapter has its own light; everything (sky, clouds, reflections, grade) reads from here.
const PALETTES = [
  { name: 'Dawn over the clouds', time: 6 * 60 + 12, zenith: '#8c9ed6', horizon: '#f8c19c', ground: '#c7b2c6', sun: '#ffc88f', elev: 3.5, azim: -16, glow: 1.6, size: 0.0011,
    cloudLight: '#ffe3c8', cloudShadow: '#968dbb', studio: 0, studioA: '#fbe9cf', studioB: '#e8bf92', exposure: 0.96, sat: 1.12, warm: 0.02, bloom: 0.9 },
  { name: 'Morning', time: 9 * 60 + 30, zenith: '#74a3e2', horizon: '#eaf2fc', ground: '#dfe7f2', sun: '#fff3e2', elev: 34, azim: 30, glow: 0.8, size: 0.0007,
    cloudLight: '#ffffff', cloudShadow: '#b4c3dc', studio: 0, studioA: '#fbe9cf', studioB: '#e8bf92', exposure: 1.02, sat: 1.04, warm: -0.01, bloom: 0.6 },
  { name: 'Noon, in the light', time: 12 * 60 + 4, zenith: '#f1d9b6', horizon: '#fbeedc', ground: '#e6c49b', sun: '#fff0d6', elev: 52, azim: -38, glow: 0.5, size: 0.0007,
    cloudLight: '#fff6ea', cloudShadow: '#e0c6a8', studio: 1, studioA: '#fdf1de', studioB: '#e3ad6f', exposure: 1.0, sat: 1.05, warm: 0.02, bloom: 0.7 },
  { name: 'Afternoon', time: 15 * 60 + 20, zenith: '#e3def4', horizon: '#f7f4fb', ground: '#dcd5ee', sun: '#ffffff', elev: 40, azim: 32, glow: 0.4, size: 0.0007,
    cloudLight: '#ffffff', cloudShadow: '#cfc8e6', studio: 1, studioA: '#f8f6fd', studioB: '#cdc3ea', exposure: 1.0, sat: 1.0, warm: -0.01, bloom: 0.6 },
  { name: 'Golden hour', time: 18 * 60 + 41, zenith: '#8a9dd0', horizon: '#ffd298', ground: '#ebc8a2', sun: '#ffbb70', elev: 7, azim: -26, glow: 1.5, size: 0.001,
    cloudLight: '#ffd3a0', cloudShadow: '#9b8eb7', studio: 0, studioA: '#fbe9cf', studioB: '#e8bf92', exposure: 1.0, sat: 1.08, warm: 0.04, bloom: 1.0 },
  { name: 'Sunset', time: 20 * 60 + 5, zenith: '#7480c4', horizon: '#ffad86', ground: '#cf9fae', sun: '#ff9a62', elev: 4, azim: 58, glow: 1.5, size: 0.0013,
    cloudLight: '#ffc3a2', cloudShadow: '#8475ab', studio: 0, studioA: '#fbe9cf', studioB: '#e8bf92', exposure: 0.88, sat: 1.16, warm: 0.03, bloom: 0.9 },
];
const COLOR_KEYS = ['zenith', 'horizon', 'ground', 'sun', 'cloudLight', 'cloudShadow', 'studioA', 'studioB'];
const NUM_KEYS = ['elev', 'azim', 'glow', 'size', 'studio', 'exposure', 'sat', 'warm', 'bloom', 'time'];
for (const p of PALETTES) for (const k of COLOR_KEYS) p[k + 'C'] = new THREE.Color(p[k]); // sRGB hex -> linear

export const SKY_GLSL = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGround, uSunColor, uSunDir, uStudioA, uStudioB, uCamFwd;
uniform float uGlow, uSunSize, uStudio;
vec3 skyBase(vec3 d) {
  float h = d.y;
  vec3 c = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(uHorizon, uGround, pow(clamp(-h * 2.2, 0.0, 1.0), 0.6));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunColor * uGlow * (pow(s, 3.0) * 0.14 + pow(s, 24.0) * 0.35 + pow(s, 300.0) * 1.1);
  return c;
}
vec3 studioBg(vec3 d) {
  float ang = acos(clamp(dot(d, uCamFwd), -1.0, 1.0));
  return mix(uStudioA, uStudioB, smoothstep(0.0, 1.0, ang / 1.05 + (0.35 - d.y) * 0.22));
}
vec3 skyColor(vec3 d) { return mix(skyBase(d), studioBg(d), uStudio); }
vec3 skyWithSun(vec3 d) {
  float s = dot(d, uSunDir);
  return skyColor(d) + uSunColor * smoothstep(1.0 - uSunSize * 1.7, 1.0 - uSunSize, s) * 7.0 * (1.0 - uStudio);
}
`;

export function createAtmosphere() {
  const U = {
    uTime: { value: 0 },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
    uGlow: { value: 1 }, uSunSize: { value: 0.001 }, uStudio: { value: 0 },
    uStudioA: { value: new THREE.Color() }, uStudioB: { value: new THREE.Color() }, uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
    uCloudLight: { value: new THREE.Color() }, uCloudShadow: { value: new THREE.Color() }, uCloudVis: { value: 1 },
    uSunView: { value: new THREE.Vector2(0, 1) }, uPart: { value: new THREE.Vector4(0, -10, 0, 1.7) }, uPartK: { value: 0 },
  };
  const look = { name: '', clock: '', exposure: 1, sat: 1, warm: 0, bloom: 1, tod: -1 };
  const map = { zenith: 'uZenith', horizon: 'uHorizon', ground: 'uGround', sun: 'uSunColor', cloudLight: 'uCloudLight', cloudShadow: 'uCloudShadow', studioA: 'uStudioA', studioB: 'uStudioB' };
  function setTOD(t) {
    t = THREE.MathUtils.clamp(t, 0, PALETTES.length - 1);
    const i = Math.min(PALETTES.length - 2, Math.floor(t)), raw = t - i, f = raw * raw * (3 - 2 * raw);
    const A = PALETTES[i], B = PALETTES[i + 1];
    for (const k of COLOR_KEYS) U[map[k]].value.copy(A[k + 'C']).lerp(B[k + 'C'], f);
    const n = {}; for (const k of NUM_KEYS) n[k] = A[k] + (B[k] - A[k]) * f;
    const el = THREE.MathUtils.degToRad(n.elev), az = THREE.MathUtils.degToRad(n.azim);
    U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    U.uGlow.value = n.glow; U.uSunSize.value = n.size; U.uStudio.value = n.studio;
    Object.assign(look, { exposure: n.exposure, sat: n.sat, warm: n.warm, bloom: n.bloom, tod: t });
    const m = Math.round(n.time); look.clock = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    look.name = (f < 0.5 ? A : B).name;
  }
  setTOD(0);
  return { U, look, setTOD };
}

export function createSky(U) {
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `varying vec3 vDir; ${SKY_GLSL} void main() { gl_FragColor = vec4(skyWithSun(normalize(vDir)), 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 64, 32), mat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  return sky;
}

// Reflections that follow the time of day: the same sky plus studio softboxes, captured into a cube and pre-filtered.
export function createEnvironment(renderer, U) {
  const scene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vDir; ${SKY_GLSL} void main() { gl_FragColor = vec4(skyWithSun(normalize(vDir)) * 1.15, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMat));
  const boxes = [];
  const panel = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); m.userData.k = k; scene.add(m); boxes.push(m);
  };
  panel(10, 3.5, [0, 13, 3], 2.6);        // overhead
  panel(2.4, 10, [-11, 1.5, 6], 4.2);     // tall strip, front left
  panel(2.4, 10, [11, 1.5, 4], 3.2);      // tall strip, front right
  const black = (pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); scene.add(m); };
  black([-12, 0, -7]); black([12, 0, -7]); // flags, for crisp dark edges in the glass
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null;
  function update() {
    const s = U.uStudio.value;
    for (const b of boxes) b.material.color.setScalar(b.userData.k * (0.55 + 0.75 * s));
    cubeCam.update(renderer, scene);
    target = pmrem.fromCubemap(cubeRT.texture, target);
    return target.texture;
  }
  return { update };
}

// Out-of-focus light behind the bottle in the studio chapters.
export function createOrbs(center) {
  const n = 46, g = new THREE.InstancedBufferGeometry(), base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const off = new Float32Array(n * 3), dat = new Float32Array(n * 2);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const th = (r() - 0.5) * Math.PI * 1.5, ph = (r() - 0.35) * 1.3, rad = 6 + r() * 9;
    off.set([center.x + Math.sin(th) * Math.cos(ph) * rad, center.y + Math.sin(ph) * rad * 0.7, center.z - Math.cos(th) * Math.cos(ph) * rad], i * 3);
    dat.set([0.25 + Math.pow(r(), 2) * 1.1, r()], i * 2);
  }
  g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 2));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute vec3 iOffset; attribute vec2 iData; uniform float uTime; varying vec2 vUv; varying float vSeed;
      void main() { vec3 c = iOffset + vec3(sin(uTime * 0.11 + iData.y * 9.0), cos(uTime * 0.09 + iData.y * 7.0), 0.0) * 0.35;
        vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * iData.x; gl_Position = projectionMatrix * mv; vUv = uv; vSeed = iData.y; }`,
    fragmentShader: /* glsl */ `uniform float uAlpha; uniform vec3 uTint; varying vec2 vUv; varying float vSeed;
      void main() { float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard;
        float disc = smoothstep(1.0, 0.86, d); float ring = smoothstep(0.7, 0.95, d) * disc;
        vec3 hue = 0.5 + 0.5 * cos(6.2831 * (vSeed + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(uTint, hue * 0.4 + 0.6, 0.35);
        gl_FragColor = vec4(col * (disc * 0.16 + ring * 0.14) * uAlpha, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  return mesh;
}
