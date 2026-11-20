import * as THREE from 'three';

// One sky function, shared by the sky dome and the clouds (their fog fades into exactly this colour).
// Colours are written as sRGB and linearised at the end of each shader.
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uSun;
vec3 skyColor(vec3 d) {
  float h = d.y;
  vec3 zenith = vec3(0.84, 0.89, 0.96);
  vec3 horizon = vec3(0.972, 0.965, 0.955);
  vec3 below = vec3(0.925, 0.94, 0.958);
  vec3 c = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6)) : mix(horizon, below, clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.9, 0.78) * (pow(s, 5.0) * 0.07 + pow(s, 48.0) * 0.22) * (0.4 + uSun);
  return c;
}
`;

export function createSky(uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${SKY_GLSL}
      void main() {
        gl_FragColor = vec4(pow(skyColor(normalize(vDir)), vec3(2.2)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// A photo studio for reflections: a soft white dome, big softboxes, and two black flags
// so the glass edges pick up crisp dark lines (that is what makes clear glass read on white).
export function createEnvironment(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.SphereGeometry(20, 64, 32);
  const col = [];
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 20;
    const c = new THREE.Color().lerpColors(new THREE.Color('#c9cdd4'), new THREE.Color('#ffffff'), THREE.MathUtils.smoothstep(y, -0.6, 0.5));
    col.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, pos, k, hex = '#ffffff') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(10, 4, [0, 12, 2], 3.2);            // overhead softbox
  panel(2.2, 9, [-9, 1.5, 5], 5.5);         // tall strip, front left
  panel(2.2, 9, [9, 1.5, 4], 4.2, '#fff4ea'); // warm strip, front right
  panel(5, 5, [0, 2, 12], 1.6);             // fill from the camera side
  panel(3.2, 14, [-11, 0, -6], 0, '#000');  // black flags behind and to the sides
  panel(3.2, 14, [11, 0, -6], 0, '#000');
  panel(2.4, 14, [-4.5, 0, -11], 0, '#000');
  panel(2.4, 14, [4.5, 0, -11], 0, '#000');
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}
