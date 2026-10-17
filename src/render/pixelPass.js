// Pixel-art rendering (in the spirit of late-90s isometric sims): the scene is
// drawn at a fraction of the screen resolution, edges are found from depth and
// normal buffers, silhouettes get dark outlines and creases a light highlight,
// then everything is scaled up with crisp nearest-neighbour pixels.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec4 resolution;
uniform float depthScale;
uniform float outline;
uniform float highlight;
varying vec2 vUv;

float D(float x, float y) { return texture2D(tDepth, vUv + vec2(x, y) * resolution.zw).r * depthScale; }
vec3 Nr(float x, float y) { return texture2D(tNormal, vUv + vec2(x, y) * resolution.zw).rgb * 2.0 - 1.0; }

float nEdge(float x, float y, float d, vec3 n) {
  float dd = D(x, y) - d;
  vec3 nn = Nr(x, y);
  float bias = clamp(smoothstep(-0.01, 0.01, dot(n - nn, vec3(1.0, 1.0, 1.0))), 0.0, 1.0);
  float front = clamp(sign(dd * 0.25 + 0.0025), 0.0, 1.0);
  return (1.0 - dot(n, nn)) * front * bias;
}

void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float d = D(0.0, 0.0);
  vec3 n = Nr(0.0, 0.0);
  // silhouette: depth jumps (not just slopes — a sloped plane has zero second
  // derivative) and this pixel is the nearer side of the jump
  float dl = D(-1.0, 0.0), dr = D(1.0, 0.0), du = D(0.0, 1.0), dd = D(0.0, -1.0);
  float lap = max(abs(dl + dr - 2.0 * d), abs(du + dd - 2.0 * d));
  float gap = max(max(dl, dr), max(du, dd)) - d;
  float de = step(0.06, lap) * step(0.06, gap);
  float ne = step(0.12, nEdge(0.0, -1.0, d, n) + nEdge(0.0, 1.0, d, n) + nEdge(-1.0, 0.0, d, n) + nEdge(1.0, 0.0, d, n));
  float k = de > 0.0 ? (1.0 - outline) : (1.0 + highlight * ne);
  gl_FragColor = vec4(c.rgb * k, c.a);
}`;

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class PixelPass extends Pass {
  constructor(pixelSize, scene, camera) {
    super();
    this.pixelSize = pixelSize;
    this.scene = scene;
    this.camera = camera;
    this.resolution = new THREE.Vector2();
    this.renderResolution = new THREE.Vector2(1, 1);
    const rt = () => {
      const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      return t;
    };
    this.beauty = rt();
    this.beauty.depthTexture = new THREE.DepthTexture(1, 1);
    this.normals = rt();
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null },
        resolution: { value: new THREE.Vector4(1, 1, 1, 1) },
        depthScale: { value: 100 }, outline: { value: 0.42 }, highlight: { value: 0.22 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this._vis = new Map();
  }

  setSize(width, height) {
    this.resolution.set(width, height);
    const x = Math.max(1, Math.floor(width / this.pixelSize)), y = Math.max(1, Math.floor(height / this.pixelSize));
    this.renderResolution.set(x, y);
    this.beauty.setSize(x, y);
    this.normals.setSize(x, y);
    this.material.uniforms.resolution.value.set(x, y, 1 / x, 1 / y);
  }

  setPixelSize(p) { this.pixelSize = p; this.setSize(this.resolution.x, this.resolution.y); }

  render(renderer, writeBuffer) {
    const u = this.material.uniforms;
    u.depthScale.value = this.camera.far - this.camera.near;
    renderer.setRenderTarget(this.beauty);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    // normals: leave out particles, overlays, water and other see-through things
    const vis = this._vis;
    this.scene.traverse((o) => {
      vis.set(o, o.visible);
      if (o.isPoints || o.isLine || (o.material && o.material.transparent)) o.visible = false;
    });
    const old = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.normalMaterial;
    renderer.setRenderTarget(this.normals);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = old;
    this.scene.traverse((o) => { o.visible = vis.get(o); });
    vis.clear();
    u.tDiffuse.value = this.beauty.texture;
    u.tDepth.value = this.beauty.depthTexture;
    u.tNormal.value = this.normals.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.beauty.dispose(); this.normals.dispose(); this.normalMaterial.dispose(); this.material.dispose(); this.fsQuad.dispose();
  }
}
