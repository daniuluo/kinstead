// Lightweight CPU particle systems drawn as soft points (smoke, glows, fireflies, snow, fireworks).

import * as THREE from 'three';

const VS = `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aSize * uScale);
}`;

const FS = `
varying vec4 vColor;
uniform float uSoft;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, uSoft, d);
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

export class Particles {
  constructor(scene, max, { additive = false, soft = 0.0 } = {}) {
    this.max = max;
    this.items = [];
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      uniforms: { uScale: { value: 1 }, uSoft: { value: soft } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.statics = [];
  }

  emit(p) {
    if (this.items.length >= this.max - this.statics.length) return;
    p.age = 0;
    this.items.push(p);
  }

  // statics: [{x,y,z,size,r,g,b,a}] redrawn each frame with an alpha multiplier
  setStatics(list) { this.statics = list; }

  update(dt, scale, staticAlpha = 1, wind = [0.12, 0.05]) {
    this.mat.uniforms.uScale.value = scale;
    const items = this.items;
    let n = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.age += dt;
      if (p.age >= p.life) { items[i] = items[items.length - 1]; items.pop(); continue; }
    }
    for (const p of items) {
      const t = p.age / p.life;
      p.vx += (wind[0] * (p.wind ?? 1) - p.vx * (p.drag || 0)) * dt;
      p.vz += (wind[1] * (p.wind ?? 1) - p.vz * (p.drag || 0)) * dt;
      p.vy += (p.gravity || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const o = n * 3, c = n * 4;
      this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
      this.size[n] = p.size + (p.size1 - p.size) * t;
      const fadeIn = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1;
      let a = (p.alpha + (p.alpha1 - p.alpha) * t) * fadeIn;
      if (p.blink) a *= 0.5 + 0.5 * Math.sin(p.age * p.blink + p.phase);
      this.col[c] = p.r; this.col[c + 1] = p.g; this.col[c + 2] = p.b; this.col[c + 3] = a;
      n++;
    }
    for (const s of this.statics) {
      if (n >= this.max) break;
      const a = s.always ? s.a * (0.85 + 0.15 * Math.sin(performance.now() * 0.008 + s.x * 10)) : s.a * staticAlpha;
      if (a < 0.01) continue;
      const o = n * 3, c = n * 4;
      this.pos[o] = s.x; this.pos[o + 1] = s.y; this.pos[o + 2] = s.z;
      this.size[n] = s.size;
      this.col[c] = s.r; this.col[c + 1] = s.g; this.col[c + 2] = s.b; this.col[c + 3] = a;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; this.statics = []; }

  dispose(scene) { scene.remove(this.points); this.geo.dispose(); this.mat.dispose(); }
}
