import * as THREE from 'three';

function travertine() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#e4d8c6'; x.fillRect(0, 0, 1024, 1024);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) { const y = r() * 1024, h = 2 + r() * 12; x.fillStyle = `rgba(${150 + r() * 40},${128 + r() * 30},${100 + r() * 25},${0.06 + r() * 0.12})`; x.fillRect(0, y, 1024, h); }
  for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(118,98,76,${0.12 + r() * 0.28})`; x.beginPath(); x.ellipse(r() * 1024, r() * 1024, 2 + r() * 13, 1 + r() * 3, 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// The top of the plinth: stone lit by the low sun, the bottle's long shadow, and the caustic the liquid throws.
const TOP_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uSunDir, uSunColor, uZenith, uBottle, uLiquid; uniform float uTime, uK, uSlosh;
varying vec2 vUv; varying vec3 vPw;
float caustic(vec2 p, float t) {
  vec2 i = p; float c = 1.0, inten = 0.005;
  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n + 1))); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x)); c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0);
}
void main() {
  vec3 stone = texture2D(uMap, vUv * 1.6).rgb;
  vec2 s2 = normalize(uSunDir.xz + 1e-4), rel = vPw.xz - uBottle.xz;
  float along = dot(rel, -s2), across = dot(rel, vec2(-s2.y, s2.x));
  float lambert = max(uSunDir.y, 0.0) * 0.9 + 0.25;
  float shadow = exp(-pow((along - 0.42) / 0.5, 2.0) - pow(across / 0.2, 2.0)) * 0.5 * step(0.0, along) + exp(-dot(rel, rel) / 0.05) * 0.4;
  vec3 col = stone * (uSunColor * lambert * (1.0 - shadow) + uZenith * 0.45);
  // light through the perfume lands as a caustic beside the shadow, with a little dispersion at its edges
  float mask = exp(-pow((along - 0.36) / 0.2, 2.0) - pow(across / 0.12, 2.0));
  vec2 cp = rel * 11.0; float t = uTime * (0.35 + uSlosh * 2.0);
  vec3 caus = min(vec3(caustic(cp * 1.0, t), caustic(cp * 1.015, t), caustic(cp * 1.03, t)), vec3(2.5));
  col += uLiquid * caus * mask * uK * 0.9 + uLiquid * mask * uK * 0.12;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createPlinth(U) {
  const group = new THREE.Group();
  const map = travertine();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.6, 128, 1, true), new THREE.MeshPhysicalMaterial({ map, roughness: 0.55, clearcoat: 0.15 }));
  side.position.y = -0.8; group.add(side);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(0.612, 0.008, 12, 128), new THREE.MeshPhysicalMaterial({ map, roughness: 0.4 }));
  edge.rotation.x = Math.PI / 2; edge.position.y = -0.008; group.add(edge);
  const topU = { uMap: { value: map }, uSunDir: U.uSunDir, uSunColor: U.uSunColor, uZenith: U.uZenith, uBottle: { value: new THREE.Vector3() }, uLiquid: { value: new THREE.Color('#f2b25c') }, uTime: U.uTime, uK: { value: 1 }, uSlosh: { value: 0 } };
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.62, 128), new THREE.ShaderMaterial({
    uniforms: topU,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vPw; void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vPw = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: TOP_FRAG,
  }));
  top.rotation.x = -Math.PI / 2; group.add(top);
  return { group, topU };
}
