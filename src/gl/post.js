import * as THREE from 'three';

// Render targets and the camera finish: depth of field, sun rays, bloom, then a tone map and grade made for a light look.
const VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const mk = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });

const DEPTH = /* glsl */ `
uniform sampler2D tDepth; uniform float uNear, uFar, uFocus, uAperture;
float lin(float z) { return uNear * uFar / (uFar - z * (uFar - uNear)); }
float coc(vec2 uv) { return clamp(abs(1.0 / uFocus - 1.0 / lin(texture2D(tDepth, uv).x)) * uAperture, 0.0, 1.0); }`;

export function createPost(renderer) {
  const T = {};
  const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, depthBuffer: false, ...o });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const fsScene = new THREE.Scene(); fsScene.add(quad); const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

  const copy = mk(/* glsl */ `uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }`, { tSrc: { value: null } });
  const depthU = { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 600 }, uFocus: { value: 5 }, uAperture: { value: 0 } };
  const dofBlur = mk(/* glsl */ `uniform sampler2D tColor; uniform vec2 uTexel; uniform float uMaxR; varying vec2 vUv; ${DEPTH}
    void main() {
      float c0 = coc(vUv), R = c0 * uMaxR; vec3 acc = vec3(0.0); float ws = 0.0;
      for (int i = 0; i < 40; i++) {
        float r = sqrt((float(i) + 0.5) / 40.0); float th = float(i) * 2.39996;
        vec2 uv = vUv + vec2(cos(th), sin(th)) * r * R * uTexel;
        float w = clamp(coc(uv) * uMaxR - r * R + 1.5, 0.05, 1.0);
        acc += texture2D(tColor, uv).rgb * w; ws += w;
      }
      gl_FragColor = vec4(acc / ws, c0);
    }`, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uMaxR: { value: 14 }, ...depthU });
  const dofMix = mk(/* glsl */ `uniform sampler2D tSharp, tBlur; varying vec2 vUv; ${DEPTH}
    void main() { float c = coc(vUv); vec3 s = texture2D(tSharp, vUv).rgb; vec3 b = texture2D(tBlur, vUv).rgb; gl_FragColor = vec4(mix(s, b, smoothstep(0.03, 0.22, c)), 1.0); }`, { tSharp: { value: null }, tBlur: { value: null }, ...depthU });
  const bright = mk(/* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;
    void main() { vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel).rgb) * 0.25;
      float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 1.0, l), 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.5 } });
  const blur = mk(/* glsl */ `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main() { float w[5] = float[5](0.227, 0.195, 0.122, 0.054, 0.016); vec3 c = texture2D(tSrc, vUv).rgb * w[0];
      for (int i = 1; i < 5; i++) { c += texture2D(tSrc, vUv + uDir * float(i) * 1.4).rgb * w[i]; c += texture2D(tSrc, vUv - uDir * float(i) * 1.4).rgb * w[i]; } gl_FragColor = vec4(c, 1.0); }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const rays = mk(/* glsl */ `uniform sampler2D tSrc; uniform vec2 uSun; uniform float uK; varying vec2 vUv;
    void main() { vec2 d = (vUv - uSun) * (0.92 / 56.0); vec2 uv = vUv; float decay = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < 56; i++) { uv -= d; acc += texture2D(tSrc, clamp(uv, 0.0, 1.0)).rgb * decay; decay *= 0.962; }
      gl_FragColor = vec4(acc * (uK / 56.0), 1.0); }`, { tSrc: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uK: { value: 0 } });
  const final = mk(/* glsl */ `uniform sampler2D tScene, tB1, tB2, tB3, tRays; uniform float uExposure, uBloom, uSat, uWarm, uVig, uTime, uCA; varying vec2 vUv;
    vec3 neutral(vec3 c) { float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
      float peak = max(c.r, max(c.g, c.b)); if (peak < 0.76) return c; float d = 0.24; float np = 1.0 - d * d / (peak + d - 0.76); c *= np / peak;
      float g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0); return mix(c, vec3(np), g); }
    vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec2 q = vUv - 0.5; vec2 o = q * uCA;
      vec3 c = vec3(texture2D(tScene, vUv - o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + o).b);
      c += (texture2D(tB1, vUv).rgb * 0.5 + texture2D(tB2, vUv).rgb * 0.4 + texture2D(tB3, vUv).rgb * 0.35) * uBloom + texture2D(tRays, vUv).rgb;
      c *= uExposure * vec3(1.0 + uWarm, 1.0, 1.0 - uWarm);
      vec3 m = neutral(max(c, 0.0));
      float l = dot(m, vec3(0.2126, 0.7152, 0.0722)); m = mix(vec3(l), m, uSat);
      m = srgb(clamp(m, 0.0, 1.0));
      m = mix(m, m * m * (3.0 - 2.0 * m), 0.12);                       // a gentle S-curve
      m *= 1.0 - uVig * dot(q * vec2(1.0, 0.75), q * vec2(1.0, 0.75)) * 1.5;
      m += (fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 917.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.024;
      gl_FragColor = vec4(m, 1.0);
    }`, { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tRays: { value: null },
    uExposure: { value: 1 }, uBloom: { value: 1 }, uSat: { value: 1 }, uWarm: { value: 0 }, uVig: { value: 0.32 }, uTime: { value: 0 }, uCA: { value: 0.0025 } });

  let W = 1, H = 1;
  function setSize(w, h) {
    W = w; H = h;
    for (const t of Object.values(T)) t.dispose();
    T.main = rt(w, h, { depthBuffer: true, samples: 4, depthTexture: new THREE.DepthTexture(w, h) });
    T.copy = rt(w, h); T.back = rt(w >> 1, h >> 1, { depthBuffer: true });
    T.dofHalf = rt(w >> 1, h >> 1); T.dof = rt(w, h);
    T.b1 = rt(w >> 2, h >> 2); T.b1t = rt(w >> 2, h >> 2); T.b2 = rt(w >> 3, h >> 3); T.b2t = rt(w >> 3, h >> 3); T.b3 = rt(w >> 4, h >> 4); T.b3t = rt(w >> 4, h >> 4);
    T.rays = rt(w >> 2, h >> 2);
  }

  // scene -> main target (layers handled by the caller); then the finish
  function finish({ near, far, focus, aperture, exposure, bloom, sat, warm, time, sunUV, raysK }) {
    Object.assign(depthU.uNear, { value: near }); depthU.uFar.value = far; depthU.uFocus.value = focus; depthU.uAperture.value = aperture; depthU.tDepth.value = T.main.depthTexture;
    let scene = T.main.texture;
    if (aperture > 0.01) {
      dofBlur.uniforms.tColor.value = T.main.texture; dofBlur.uniforms.uTexel.value.set(1 / (W >> 1), 1 / (H >> 1)); dofBlur.uniforms.uMaxR.value = 14 * (H / 1800 + 0.5);
      pass(dofBlur, T.dofHalf);
      dofMix.uniforms.tSharp.value = T.main.texture; dofMix.uniforms.tBlur.value = T.dofHalf.texture; pass(dofMix, T.dof);
      scene = T.dof.texture;
    }
    bright.uniforms.tSrc.value = scene; bright.uniforms.uTexel.value.set(1 / W, 1 / H); pass(bright, T.b1);
    const lv = [[T.b1, T.b1t], [T.b2, T.b2t], [T.b3, T.b3t]];
    for (let i = 0; i < 3; i++) {
      const [a, t] = lv[i];
      if (i > 0) { copy.uniforms.tSrc.value = lv[i - 1][0].texture; pass(copy, a); }
      blur.uniforms.tSrc.value = a.texture; blur.uniforms.uDir.value.set(1 / a.width, 0); pass(blur, t);
      blur.uniforms.tSrc.value = t.texture; blur.uniforms.uDir.value.set(0, 1 / a.height); pass(blur, a);
    }
    rays.uniforms.tSrc.value = T.b1.texture; rays.uniforms.uSun.value.copy(sunUV); rays.uniforms.uK.value = raysK; pass(rays, T.rays);
    Object.assign(final.uniforms, {});
    const u = final.uniforms;
    u.tScene.value = scene; u.tB1.value = T.b1.texture; u.tB2.value = T.b2.texture; u.tB3.value = T.b3.texture; u.tRays.value = T.rays.texture;
    u.uExposure.value = exposure; u.uBloom.value = bloom; u.uSat.value = sat; u.uWarm.value = warm; u.uTime.value = time;
    pass(final, null);
  }
  function copyMain() { copy.uniforms.tSrc.value = T.main.texture; pass(copy, T.copy); }
  function show(tex) { copy.uniforms.tSrc.value = tex; pass(copy, null); }
  return { T, setSize, finish, copyMain, show };
}
