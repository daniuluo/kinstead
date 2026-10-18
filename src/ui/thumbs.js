// Renders little isometric thumbnails of buildings for the build menu and inspector.

import * as THREE from 'three';
import { buildModel } from '../render/buildings.js';
import { BUILDINGS } from '../defs.js';
import { MAT } from '../render/materials.js';

let R = null, scene = null, camera = null;
const cache = new Map();

function setup() {
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(1);
  R.setSize(192, 144);
  R.toneMapping = THREE.AgXToneMapping;
  R.toneMappingExposure = 1.3;
  R.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#dceaf5', '#8a7a5a', 1.1));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.position.set(3, 6, 2);
  scene.add(sun);
  camera = new THREE.OrthographicCamera(-1, 1, 0.75, -0.75, 0.1, 50);
}

export function thumb(type, level = 0, variant = 777, flavor = null, look = null) {
  const key = `${type}|${level}|${variant}|${flavor}|${look}`;
  if (cache.has(key)) return cache.get(key);
  if (!R) setup();
  const def = BUILDINGS[type];
  const bw = def.merged ? 2 : def.size, bd = def.merged ? 1 : def.size;
  const b = { type, level, variant, flavor, look, size: def.size, w: bw, d: bd, baseY: 0, minY: 0, rot: 0, rail: def.needsRail ? { x: 0, z: 0, dir: 2 } : null };
  const model = buildModel(b, { flat: true });
  const mesh = new THREE.Mesh(model.geo, MAT.building);
  scene.add(mesh);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, bd), new THREE.MeshStandardMaterial({ color: '#8a9f5a', roughness: 1 }));
  plate.position.y = -0.025;
  mesh.add(plate);
  const extras = [];
  if (model.spin) { const s = new THREE.Mesh(model.spin.geo, MAT.building); s.position.set(model.spin.x, model.spin.y, model.spin.z); mesh.add(s); extras.push(s); }
  model.geo.computeBoundingSphere();
  const bs = model.geo.boundingSphere;
  const r = bs.radius * 1.02;
  camera.left = -r * 1.1; camera.right = r * 1.1; camera.top = r * 0.82; camera.bottom = -r * 0.82;
  camera.position.set(bs.center.x + 10, bs.center.y + 8.2, bs.center.z + 10);
  camera.lookAt(bs.center);
  camera.updateProjectionMatrix();
  R.render(scene, camera);
  const url = R.domElement.toDataURL('image/png');
  scene.remove(mesh);
  model.geo.dispose();
  for (const e of extras) e.geometry.dispose();
  plate.geometry.dispose(); plate.material.dispose();
  cache.set(key, url);
  return url;
}
