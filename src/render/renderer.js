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
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _c = new THREE.Vector3(), _lz = new THREE.Vector3();

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
    // scale: the share of the screen's resolution drawn (the Performance
    // settings; pixel art gets chunkier pixels instead)
    this.gfx = { pixelArt: true, pixelSize: 2, ao: true, scale: 1 };

    this.hemi = new THREE.HemisphereLight('#cfe6f7', '#7f6f55', 0.9);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.8);
    this.sun.castShadow = true;
    this.maxShadow = Math.min(4096, r.capabilities.maxTextureSize || 4096);
    this.sun.shadow.mapSize.set(this.maxShadow, this.maxShadow);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    // shadows let a little sunlight through, like a bright day's soft shade
    this.sun.shadow.intensity = 0.72;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.rig = {
      target: new THREE.Vector3(24, 0.5, 24),
      goal: new THREE.Vector3(24, 0.5, 24),
      // the camera's compass angle is base (45° isometric, 0° for the 2D map)
      // plus turn, a quarter turn per press of the rotate buttons
      angle: Math.PI / 4, base: Math.PI / 4, baseT: Math.PI / 4,
      view: 0, turn: 0, turnT: 0,
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2), scale = g.scale || 1;
    r.setPixelRatio(g.pixelArt ? dpr : Math.min(dpr, g.ao ? 1.5 : 2) * scale);
    r.toneMapping = g.pixelArt ? THREE.NeutralToneMapping : THREE.AgXToneMapping;
    this.baseExposure = g.pixelArt ? 1.0 : 1.2;
    try {
      if (g.pixelArt) {
        const composer = new EffectComposer(r);
        const pix = new PixelPass(Math.max(1, Math.round((g.pixelSize * dpr) / scale)), this.scene, this.camera);
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

  // size: the shadow map's width in texels (sharper and slower the bigger)
  setShadows(on, size = this.maxShadow) {
    size = Math.min(size, this.maxShadow);
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      // made again at the new size when next drawn
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    if (this.renderer.shadowMap.enabled === on && this.sun.castShadow === on) return;
    this.renderer.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }

  // Is the camera still gliding to where it was sent (panning, zooming,
  // turning or tilting)?
  get moving() {
    const r = this.rig;
    return !!r.anchor || r.zoom !== r.zoomT || r.turn !== r.turnT || Math.abs(r.elev - r.elevT) > 1e-4 || Math.abs(r.base - r.baseT) > 1e-4
      || Math.abs(r.target.x - r.goal.x) > 1e-3 || Math.abs(r.target.z - r.goal.z) > 1e-3;
  }

  // ------------------------------------------------------------- camera
  setBounds(N) {
    this.rig.bounds = N;
    // let bigger maps zoom out far enough to see the whole valley
    this.rig.minZoom = Math.min(0.45, 0.45 * 48 / N);
    this.setZoom(this.rig.zoomT);
  }
  lookAt(x, z, instant = false) {
    this.rig.anchor = null;
    this.rig.goal.set(x, this.rig.goal.y, z);
    if (instant) this.rig.target.copy(this.rig.goal);
  }
  // The camera turns and tilts around its target. Moving the target along the
  // line of sight doesn't change the (orthographic) picture, so before turning
  // it is moved onto the ground under the middle of the screen, which then
  // stays put. pivot: that ground point, or null to keep the current target.
  _pivotOn(pivot) {
    const rig = this.rig;
    rig.anchor = null;
    if (pivot) rig.target.copy(pivot);
    rig.goal.copy(rig.target);
  }
  setTopDown(on, pivot = null) {
    this._pivotOn(pivot);
    this.rig.topDown = on;
    this.rig.elevT = on ? Math.PI / 2 : ISO_ELEV;
    // the 2D map is grid-aligned; the isometric view sits at 45° to the grid
    this.rig.baseT = on ? 0 : Math.PI / 4;
  }
  // Swing the camera a quarter turn around the middle of the screen
  // (dir = 1 turns the town clockwise on screen, -1 anticlockwise).
  rotate(dir, pivot = null) {
    const rig = this.rig;
    this._pivotOn(pivot);
    rig.view += dir;
    rig.turnT = rig.view * Math.PI / 2;
  }
  // which of the four quarter turns the view is in (0–3)
  get facing() { return ((this.rig.view % 4) + 4) % 4; }
  zoomBy(factor, clientX = null, clientY = null) {
    const rig = this.rig;
    const z0 = rig.zoomT;
    const z1 = Math.min(6, Math.max(rig.minZoom || 0.45, z0 * factor));
    if (clientX !== null) {
      // Zoom toward the cursor: remember the ground point under it and its
      // offset from the view centre (scaled by zoom), and hold it fixed while
      // the zoom animates.
      const p = this.screenToGround(clientX, clientY, rig.target.y);
      if (p) {
        rig.anchor = { x: p.x, z: p.z, cx: (p.x - rig.target.x) * rig.zoom, cz: (p.z - rig.target.z) * rig.zoom };
        rig.goal.x = p.x - rig.anchor.cx / z1;
        rig.goal.z = p.z - rig.anchor.cz / z1;
      }
    }
    rig.zoomT = z1;
  }
  setZoom(z) { this.rig.zoomT = Math.min(6, Math.max(this.rig.minZoom || 0.45, z)); }

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
    if (rig.anchor) { rig.anchor.x += mx; rig.anchor.z += mz; }
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
    rig.base += (rig.baseT - rig.base) * k;
    rig.turn = Math.abs(rig.turnT - rig.turn) < 1e-4 ? rig.turnT : rig.turn + (rig.turnT - rig.turn) * k;
    rig.angle = rig.base + rig.turn;
    rig.elev += (rig.elevT - rig.elev) * k;
    // ease zoom in log space so zooming in and out feel the same
    const lz = Math.log(rig.zoom), lzT = Math.log(rig.zoomT);
    rig.zoom = Math.abs(lzT - lz) < 1e-3 ? rig.zoomT : Math.exp(lz + (lzT - lz) * k);
    const zooming = rig.zoom !== rig.zoomT || rig.turn !== rig.turnT;
    if (rig.anchor) {
      // keep the point under the cursor exactly where it is for the whole animation
      const an = rig.anchor;
      rig.target.x = an.x - an.cx / rig.zoom;
      rig.target.z = an.z - an.cz / rig.zoom;
      if (!zooming) { rig.anchor = null; rig.goal.copy(rig.target); }
    } else rig.target.lerp(rig.goal, k);
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
    if (this.post && this.post.pix && !zooming) {
      // Snap the view to whole pixels so pixel art doesn't shimmer while panning.
      // Not while zooming or turning: the pixel grid itself moves every frame
      // then, and snapping to a moving grid makes the whole picture vibrate.
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
    // Grow/shrink the shadow area in coarse steps rather than every frame,
    // otherwise shadow edges crawl while zooming.
    r = Math.pow(2, Math.ceil(Math.log2(r) * 3) / 3);
    r = Math.min(r, Math.pow(2, Math.ceil(Math.log2(rig.bounds * 0.8 + 4) * 3) / 3));
    const sc = this.sun.shadow.camera;
    if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix(); }
    // snap the shadow camera to whole shadow-map texels in light space
    const texel = (2 * r) / this.sun.shadow.mapSize.x;
    const lz = this.lightDir;
    const lx = _lx.set(lz.z, 0, -lz.x);
    if (lx.lengthSq() < 1e-6) lx.set(1, 0, 0);
    lx.normalize();
    const ly = _ly.crossVectors(lz, lx);
    const t = rig.target;
    const px = Math.round(t.dot(lx) / texel) * texel, py = Math.round(t.dot(ly) / texel) * texel, pz = t.dot(lz);
    const c = _c.copy(lx).multiplyScalar(px).addScaledVector(ly, py).addScaledVector(lz, pz);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(lz, 100);
  }

  // The sun's direction as lit: the time-of-day direction. It belongs to the
  // world, not the camera, so turning the view never moves the sun: every
  // shadow keeps falling the same way across the ground, and a turned view
  // just shows the town from another side, sunlit or in shade.
  get lightDir() { return _lz.copy(this.sunDir); }

  render() {
    if (this.post) this.post.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
