// Shared materials plus small shader patches for night glow, snow and wind.

import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 },  // 0 day → 1 night (windows, lamps)
  uLate: { value: 0 },   // 0 → 1 past midnight (windows switch off)
  uSnow: { value: 0 },   // winter snow cover
  uFresh: { value: 0 },  // snow fresh from a fall (see sky.js freshSnowAt)
};

const HEAD = 'uniform float uTime;\nuniform float uNight;\nuniform float uLate;\nuniform float uSnow;\nuniform float uFresh;\n';

const SNOW = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  float snowAmt = uSnow * 0.85 * smoothstep(0.55, 0.92, wN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
}
`;

// light: null for electric light, 'candle' for a building without power
// (dim, warmer windows and lanterns), 'off' for one that has stopped work.
const EMIT = (light) => `
{
  float m = vEmit.w;
  float on = 0.0;
  if (m >= 3.0) on = smoothstep(0.1, 0.45, uNight);   // lamps: all night
  else if (m >= 2.0) on = 1.0;                         // forges: always
  else if (m >= 1.0) {                                 // windows: staggered on/off
    float r = m - 1.0;
    on = smoothstep(r * 0.6, r * 0.6 + 0.25, uNight) * (1.0 - step(r, uLate * 0.8));
  }
  ${light === 'candle' ? 'on *= m >= 2.0 && m < 3.0 ? 1.0 : 0.3;\n  vec3 tint = vec3(1.0, 0.7, 0.42);' : light === 'off' ? 'on = 0.0;\n  vec3 tint = vec3(1.0);' : 'vec3 tint = vec3(1.0);'}
  totalEmissiveRadiance += vEmit.rgb * tint * on;
}
`;

const WIND = `
#ifdef USE_INSTANCING
{
  vec3 ip = instanceMatrix[3].xyz;
  float sway = sin(uTime * 1.6 + ip.x * 0.9 + ip.z * 0.7) * 0.6 + sin(uTime * 2.7 + ip.x * 1.3 - ip.z) * 0.3;
  float k = max(0.0, position.y);
  transformed.x += sway * 0.03 * k;
  transformed.z += sway * 0.018 * k;
}
#endif
`;

const WAVES = `
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  transformed.y += sin(wp.x * 1.9 + uTime * 1.2) * 0.022 + cos(wp.z * 2.3 + uTime * 0.9) * 0.022 + sin((wp.x + wp.z) * 3.1 + uTime * 1.7) * 0.01;
}
`;

// Buildings: the winter's snow lies on pitched roofs too, not only on flat
// tops, and a fresh fall whitens them all over again.
const SNOW_ROOF = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  float snowAmt = max(uSnow, uFresh) * 0.9 * smoothstep(0.38, 0.72, wN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
}
`;

// Roads: a patchy, trodden dusting through the winter that a fresh fall
// thickens, greyer than the fields and never quite covering the street.
const SNOW_ROAD = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  vec2 cell = floor(vWPos.xz / 0.055);
  float n = fract(sin(dot(cell, vec2(27.619, 57.583))) * 43758.5453);
  float lie = clamp(uSnow * 0.3 + uFresh * 0.72, 0.0, 0.82);
  float snowAmt = lie * smoothstep(0.2, 0.6, wN.y) * smoothstep(0.0, 0.75, n + lie - 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.86, 0.9), snowAmt);
}
`;

const SNOW_MASKED = `
{
  vec3 wN = normalize(inverseTransformDirection(normal, viewMatrix));
  float snowAmt = max(uSnow, uFresh * 0.9) * vSnowMask * smoothstep(0.42, 0.85, wN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), snowAmt);
}
`;

// Pixel-art surface detail drawn procedurally in world space.
const PATTERN_BUILDING = `
{
  vec3 pN = normalize(inverseTransformDirection(normal, viewMatrix));
  float ay = abs(pN.y);
  float along = abs(pN.x) > abs(pN.z) ? vWPos.z : vWPos.x;
  float grain = fract(sin(dot(floor(vWPos.xz * 28.0) + floor(vWPos.y * 28.0), vec2(12.9898, 78.233))) * 43758.5453);
  if (vEmit.w < 0.5) {
    if (ay < 0.35) {
      float row = floor(vWPos.y / 0.032);
      float course = step(fract(vWPos.y / 0.032), 0.17);
      float joint = step(fract(along / 0.075 + row * 0.5), 0.09);
      diffuseColor.rgb *= (1.0 - 0.075 * max(course, joint * 0.7)) * (0.97 + 0.06 * grain);
    } else if (ay < 0.93) {
      float row = floor(vWPos.y / 0.026);
      float line = step(fract(vWPos.y / 0.026), 0.24);
      float tab = step(fract(along / 0.046 + row * 0.5), 0.12);
      diffuseColor.rgb *= (1.0 - 0.17 * line - 0.07 * tab) * (0.96 + 0.08 * grain);
    } else {
      diffuseColor.rgb *= 0.96 + 0.08 * grain;
    }
  }
}
`;
const PATTERN_TERRAIN = `
{
  vec2 cell = floor(vWPos.xz / 0.042);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(39.3468, 11.135))) * 24634.6345);
  diffuseColor.rgb *= 0.94 + 0.1 * h + (h2 > 0.93 ? 0.06 : 0.0);
}
`;

export function patch(material, { snow = false, snowMask = false, emit = false, light = null, wind = false, waves = false, pattern = null }, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    let vs = HEAD + shader.vertexShader;
    let fs = HEAD + shader.fragmentShader;
    if (emit) {
      vs = vs.replace('#include <common>', '#include <common>\nattribute vec4 emit;\nvarying vec4 vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = emit;');
      fs = fs.replace('#include <common>', '#include <common>\nvarying vec4 vEmit;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + EMIT(light));
    }
    if (pattern) {
      vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (pattern === 'building' ? PATTERN_BUILDING : PATTERN_TERRAIN));
    }
    if (wind) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND);
    if (waves) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WAVES);
    if (snowMask) {
      vs = vs.replace('#include <common>', '#include <common>\nattribute float snowMask;\nvarying float vSnowMask;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowMask = snowMask;');
      fs = fs.replace('#include <common>', '#include <common>\nvarying float vSnowMask;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SNOW_MASKED);
    } else if (snow) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (snow === 'roof' ? SNOW_ROOF : snow === 'road' ? SNOW_ROAD : SNOW));
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => key;
  return material;
}

export const MAT = {
  building: patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }), { snow: 'roof', emit: true, pattern: 'building' }, 'bld'),
  // the same, lit by candles and lanterns (no power), or dark (work stopped)
  buildingCandle: patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }), { snow: 'roof', emit: true, light: 'candle', pattern: 'building' }, 'bldC'),
  buildingOff: patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }), { snow: 'roof', emit: true, light: 'off', pattern: 'building' }, 'bldO'),
  // building sites are open-topped shells, so their insides must show
  site: patch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide }), { snow: 'roof', emit: true, pattern: 'building' }, 'site'),
  terrain: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }), { snowMask: true, pattern: 'terrain' }, 'ter'),
  // crisp road surfaces laid over the terrain (only ever a trodden dusting of
  // snow, so streets stay readable)
  road: patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { snow: 'road', pattern: 'terrain' }, 'road'),
  side: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
  foliage: patch(new THREE.MeshStandardMaterial({ roughness: 0.92 }), { snow: true, wind: true }, 'fol'),
  grass: patch(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), { snow: true, wind: true }, 'grs'),
  trunk: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }),
  rock: patch(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), { snow: true }, 'rock'),
  water: patch(new THREE.MeshStandardMaterial({
    color: '#3f93bb', transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.05, flatShading: true,
  }), { waves: true }, 'water'),
  waterSide: new THREE.MeshStandardMaterial({ color: '#3a86ad', transparent: true, opacity: 0.72, roughness: 0.3 }),
  agent: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }),
  ghostOk: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.62, emissive: '#2f7a2f', emissiveIntensity: 0.35, flatShading: true }),
  ghostBad: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, emissive: '#c02020', emissiveIntensity: 0.6, flatShading: true }),
};

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
