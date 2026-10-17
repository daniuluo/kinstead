// WebGL renderer, isometric / top-down camera rig, and the sun-moon lighting.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelPass } from './pixelPass.js';

// Classic 2:1 pixel-art isometric (dimetric) projection: 26.57° above the ground.
export const ISO_ELEV = Math.atan(0.5);
const DIST = 140;

export class Renderer {
  constructor(container) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    this.baseExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    container.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#dfe8ea', DIST + 6, DIST + 110);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, DIST - 110, DIST + 110);
    this.post = null;
    this.gfx = { pixelArt: true, pixelSize: 2, ao: true };

    this.hemi = new THREE.HemisphereLight('#cfe6f7', '#7f6f55', 0.9);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.8);
    this.sun.castShadow = true;
    const maxTex = r.capabilities.maxTextureSize || 4096;
    const sm = Math.min(4096, maxTex);
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.rig = {
      target: new THREE.Vector3(24, 0.5, 24),
      goal: new THREE.Vector3(24, 0.5, 24),
      angle: Math.PI / 4, angleT: Math.PI / 4,
      zoom: 1.6, zoomT: 1.6,
      elev: ISO_ELEV, elevT: ISO_ELEV,
      topDown: false,
      bounds: 48,
    };
    this.sunDir = new THREE.Vector3(0.5, 1, 0.3).normalize();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Graphics pipeline: pixel-art (low-res render + outlines, crisp upscale)
  // or smooth (antialiased, optional GTAO ambient occlusion).
  setGraphics(opts) {
    Object.assign(this.gfx, opts);
    const g = this.gfx, r = this.renderer;
    if (this.post) { this.post.composer.dispose?.(); this.post.passes.forEach(p => p.dispose?.()); this.post = null; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(g.pixelArt ? dpr : Math.min(dpr, g.ao ? 1.5 : 2));
    r.toneMapping = g.pixelArt ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
    this.baseExposure = g.pixelArt ? 1.0 : 1.2;
    try {
      if (g.pixelArt) {
        const composer = new EffectComposer(r);
        const pix = new PixelPass(Math.max(1, Math.round(g.pixelSize * dpr)), this.scene, this.camera);
        composer.addPass(pix);
        composer.addPass(new OutputPass());
        this.post = { composer, passes: [pix], pix };
      } else if (g.ao) {
        const size = r.getDrawingBufferSize(new THREE.Vector2());
        const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
        const composer = new EffectComposer(r, rt);
        composer.addPass(new RenderPass(this.scene, this.camera));
        const gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
        gtao.blendIntensity = 0.9;
        gtao.overrideVisibility = function () {
          const cache = this._visibilityCache;
          this.scene.traverse((o) => {
            cache.set(o, o.visible);
            if (o.isPoints || o.isLine || (o.material && o.material.transparent)) o.visible = false;
          });
        };
        gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.6, thickness: 0.5, scale: 1.1, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
        gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        composer.addPass(gtao);
        composer.addPass(new OutputPass());
        this.post = { composer, passes: [gtao] };
      }
    } catch (e) {
      console.warn('Post-processing unavailable', e);
      this.post = null;
    }
    document.body.classList.toggle('pixel', !!g.pixelArt);
    this.resize();
  }

  // size of one rendered pixel in device pixels
  get pixelScale() { return this.post && this.post.pix ? this.post.pix.pixelSize : 1; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.post) {
      this.post.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.post.composer.setSize(w, h);
    }
    const halfH = CONFIG.VIEW_HEIGHT / 2, halfW = halfH * (w / h);
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // ------------------------------------------------------------- camera
  setBounds(N) { this.rig.bounds = N; }
  lookAt(x, z, instant = false) {
    this.rig.goal.set(x, this.rig.goal.y, z);
    if (instant) this.rig.target.copy(this.rig.goal);
  }
  // The isometric angle is fixed by design; the only view change is the 2D top-down toggle.
  setTopDown(on) {
    this.rig.topDown = on;
    this.rig.elevT = on ? Math.PI / 2 : ISO_ELEV;
    // the 2D map is grid-aligned; the isometric view always uses its one fixed angle
    this.rig.angleT = on ? 0 : Math.PI / 4;
  }
  zoomBy(factor, clientX = null, clientY = null) {
    const rig = this.rig;
    const z0 = rig.zoomT;
    const z1 = Math.min(6, Math.max(0.45, z0 * factor));
    if (clientX !== null) {
      const p = this.screenToGround(clientX, clientY, rig.goal.y);
      if (p) {
        const k = z0 / z1;
        rig.goal.x = p.x - (p.x - rig.goal.x) * k;
        rig.goal.z = p.z - (p.z - rig.goal.z) * k;
      }
    }
    rig.zoomT = z1;
  }
  setZoom(z) { this.rig.zoomT = Math.min(6, Math.max(0.45, z)); }

  pan(dxPx, dyPx) {
    const rig = this.rig;
    const upp = (this.camera.top - this.camera.bottom) / this.camera.zoom / this.canvas.clientHeight;
    const a = rig.angle;
    const rx = Math.cos(a), rz = -Math.sin(a);
    const fx = -Math.sin(a), fz = -Math.cos(a);
    const se = Math.max(0.3, Math.sin(rig.elev));
    const mx = -dxPx * upp * rx + (dyPx * upp * fx) / se;
    const mz = -dxPx * upp * rz + (dyPx * upp * fz) / se;
    rig.goal.x += mx; rig.goal.z += mz;
    rig.target.x += mx; rig.target.z += mz;
    this._clamp();
  }

  _clamp() {
    const B = this.rig.bounds;
    for (const v of [this.rig.goal, this.rig.target]) {
      v.x = Math.min(B + 2, Math.max(-2, v.x));
      v.z = Math.min(B + 2, Math.max(-2, v.z));
    }
  }

  screenToGround(clientX, clientY, y = 0) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: p.z > 1 };
  }

  pixelsPerUnit() {
    return this.canvas.height / this.pixelScale / ((this.camera.top - this.camera.bottom) / this.camera.zoom);
  }

  updateCamera(dt) {
    const rig = this.rig;
    const k = 1 - Math.pow(0.0005, dt);
    rig.angle += (rig.angleT - rig.angle) * k;
    rig.zoom += (rig.zoomT - rig.zoom) * k;
    rig.elev += (rig.elevT - rig.elev) * k;
    rig.target.lerp(rig.goal, k);
    this._clamp();
    const a = rig.angle, e = Math.min(rig.elev, Math.PI / 2 - 1e-4);
    const cam = this.camera;
    cam.position.set(
      rig.target.x + Math.sin(a) * Math.cos(e) * DIST,
      rig.target.y + Math.sin(e) * DIST,
      rig.target.z + Math.cos(a) * Math.cos(e) * DIST,
    );
    cam.up.set(-Math.sin(a), 0, -Math.cos(a));
    if (e < 1.2) cam.up.set(0, 1, 0);
    cam.lookAt(rig.target);
    cam.zoom = rig.zoom;
    cam.updateProjectionMatrix();
    if (this.post && this.post.pix) {
      // snap the view to whole pixels so pixel art doesn't shimmer while panning
      cam.updateMatrixWorld();
      const e3 = cam.matrixWorld.elements;
      const right = new THREE.Vector3(e3[0], e3[1], e3[2]), up = new THREE.Vector3(e3[4], e3[5], e3[6]);
      const px = (cam.top - cam.bottom) / cam.zoom / this.post.pix.renderResolution.y;
      const rx = rig.target.dot(right), uy = rig.target.dot(up);
      const dx = Math.round(rx / px) * px - rx, dy = Math.round(uy / px) * px - uy;
      cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
      cam.updateMatrixWorld();
    }
    // haze only things farther away than the focus point (none in top-down view)
    const top = Math.min(1, Math.max(0, (e - ISO_ELEV) / (Math.PI / 2 - ISO_ELEV - 0.15)));
    const noFog = this.gfx.pixelArt ? 1000 : 0;
    this.scene.fog.near = DIST + 3 + top * 400 + noFog;
    this.scene.fog.far = DIST + 3 + top * 400 + 150 / Math.max(0.5, rig.zoom) + noFog;
    this._fitShadow();
  }

  _fitShadow() {
    const rig = this.rig, cam = this.camera;
    const aspect = (cam.right - cam.left) / (cam.top - cam.bottom);
    const viewH = (cam.top - cam.bottom) / cam.zoom;
    const se = Math.max(0.35, Math.sin(rig.elev));
    let r = 0.5 * viewH * Math.sqrt(aspect * aspect + 1 / (se * se)) + 3;
    r = Math.min(r, rig.bounds * 0.8 + 4);
    const sc = this.sun.shadow.camera;
    const texel = (2 * r) / this.sun.shadow.mapSize.x;
    const tx = Math.round(rig.target.x / texel) * texel, tz = Math.round(rig.target.z / texel) * texel;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.updateProjectionMatrix();
    this.sun.target.position.set(tx, 0.5, tz);
    this.sun.position.set(tx + this.sunDir.x * 100, 0.5 + this.sunDir.y * 100, tz + this.sunDir.z * 100);
  }

  render() {
    if (this.post) this.post.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
