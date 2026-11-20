import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Drawn in the opaque pass (so glass refracts it) but alpha-blended: three skips blending for opaque NormalBlending.
export const blendedOpaque = { transparent: false, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

function labelTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
  x.fillStyle = 'rgba(29, 32, 39, 0.92)'; x.textAlign = 'center';
  x.font = '300 230px Fraunces'; x.letterSpacing = '34px'; x.fillText('AIRE', 528, 250);
  x.font = '500 40px Geist'; x.letterSpacing = '16px'; x.fillText('CUMULUS Nº 01', 520, 352);
  x.fillStyle = 'rgba(29, 32, 39, 0.6)'; x.font = '400 30px Geist'; x.letterSpacing = '10px'; x.fillText('EAU DE PARFUM  50 ML', 518, 418);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function createBottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, thickness: 1.1, roughness: 0.0, ior: 1.5, dispersion: 0.7,
    attenuationColor: new THREE.Color('#fbf7f1'), attenuationDistance: 6,
    clearcoat: 1, clearcoatRoughness: 0.0, specularIntensity: 1, envMapIntensity: 1.7,
  });
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.74, 1.0, 0.42, 10, 0.11), glass);
  g.add(body);

  // the perfume: drawn in the opaque pass with blending, so the glass refracts it (thick clear walls, air above)
  const lg = new RoundedBoxGeometry(0.58, 0.6, 0.27, 6, 0.06);
  const lc = [], top = new THREE.Color('#f6dfae'), deep = new THREE.Color('#cf9548'), lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) { const c = deep.clone().lerp(top, THREE.MathUtils.smoothstep(lp.getY(i), -0.3, 0.3)); lc.push(c.r, c.g, c.b); }
  lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  const liquid = new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.9, opacity: 0.58, ...blendedOpaque,
  }));
  liquid.position.y = -0.16; liquid.renderOrder = 4; g.add(liquid);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: labelTexture(), toneMapped: false, ...blendedOpaque }));
  label.position.set(0, -0.07, 0.2108); label.renderOrder = 5; g.add(label);

  const metal = new THREE.MeshPhysicalMaterial({ color: '#dcc9a8', metalness: 1, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.2 });
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.116, 0.075, 96), metal);
  collar.position.y = 0.535; g.add(collar);

  const pearl = new THREE.MeshPhysicalMaterial({
    color: '#f1ece6', roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.04,
    sheen: 1, sheenColor: new THREE.Color('#f7e4ea'), sheenRoughness: 0.4,
    iridescence: 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 560], envMapIntensity: 1.5,
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 96, 64), pearl);
  cap.position.y = 0.5 + 0.075 + 0.19; g.add(cap);

  return { group: g, body, cap };
}
