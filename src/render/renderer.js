// WebGL renderer, isometric / top-down camera rig, and the sun-moon lighting.

import * as THREE from 'three';
import { CONFIG, TILT_SHIFT, TILT_BAND } from '../config.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PixelPass } from './pixelPass.js';
import { TiltShiftPass } from './tiltShift.js';

// Classic 2:1 pixel-art isometric (dimetric) projection: 26.57° above the ground.
export const ISO_ELEV = Math.atan(0.5);
// how far the camera tilts: from just above the horizon to straight down
export const MIN_ELEV = (8 * Math.PI) / 180, MAX_ELEV = Math.PI / 2;
const QUARTER = Math.PI / 2, ISO_BASE = Math.PI / 4;
const DIST = 140;
// how close the camera can come: near enough to see a villager's face
const MAX_ZOOM = 24;
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _c = new THREE.Vector3(), _lz = new THREE.Vector3();
const _back = new THREE.Vector3(), _corner = new THREE.Vector3(), _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
const _foot = [0, 1, 2, 3, 4].map(() => new THREE.Vector3());

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
    // The classic view is orthographic: isometric at its classic angle. A
    // perspective camera (the Camera setting) sees the same scale at the
    // middle of the screen, nearer things bigger and farther ones smaller.
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, DIST - 110, DIST + 110);
    this.persp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    this.camera = this.ortho;
    // where the camera stands, before pixel art snaps it to whole pixels
    this.eye = new THREE.Vector3();
    // the height of the ground at x, z (set by the game), so a low
    // perspective camera stays above the hills
    this.groundAt = null;
    this.post = null;
    // scale: the share of the screen's resolution drawn (the Performance
    // settings; pixel art gets chunkier pixels instead); persp, fov: the
    // perspective camera and its vertical field of view in degrees
    this.gfx = { pixelArt: true, pixelSize: 2, ao: true, scale: 1, tilt: null, tiltBand: 'normal', persp: false, fov: 45 };

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
      // plus turn: a quarter turn per press of the rotate buttons, or any
      // angle turned freely (view: the nearest quarter turn)
      angle: Math.PI / 4, base: Math.PI / 4, baseT: Math.PI / 4,
      view: 0, turn: 0, turnT: 0,
      zoom: 1.6, zoomT: 1.6,
      // the camera's height above the horizon, MIN_ELEV to straight down
      elev: ISO_ELEV, elevT: ISO_ELEV,
      // the 2D map, and the free turn and tilt to go back to after it
      topDown: false, before2D: null,
      bounds: 48,
    };
    this.sunDir = new THREE.Vector3(0.5, 1, 0.3).normalize();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Graphics pipeline: pixel-art (low-res render + outlines, crisp upscale)
  // or smooth (antialiased, optional GTAO ambient occlusion), either with an
  // optional tilt-shift blur last (g.tilt: a TILT_SHIFT look, or none; it
  // goes after the pixel art's outlines and upscale, so the sharp band keeps
  // its crisp pixels and the blur softens whole pixels, outlines and all).
  setGraphics(opts) {
    Object.assign(this.gfx, opts);
    const g = this.gfx, r = this.renderer;
    if (this.post) { this.post.composer.dispose?.(); this.post.passes.forEach(p => p.dispose?.()); this.post = null; }
    // the passes below draw with whichever camera is in use
    this.persp.fov = g.fov || 45;
    this._useCamera(g.persp ? this.persp : this.ortho);
    const dpr = Math.min(window.devicePixelRatio || 1, 2), scale = g.scale || 1;
    r.setPixelRatio(g.pixelArt ? dpr : Math.min(dpr, g.ao ? 1.5 : 2) * scale);
    // Neutral tone mapping in both looks: it keeps the town's colours as they
    // were painted (AgX, used for the smooth look before, greyed them and
    // flattened the contrast). The smooth look is a touch brighter to make up
    // for its soft contact shadows.
    r.toneMapping = THREE.NeutralToneMapping;
    this.baseExposure = g.pixelArt ? 1.0 : 1.05;
    const pixelSize = Math.max(1, Math.round((g.pixelSize * dpr) / scale));
    const tilt = TILT_SHIFT[g.tilt] ? new TiltShiftPass({
      look: TILT_SHIFT[g.tilt], band: TILT_BAND[g.tiltBand] || TILT_BAND.normal,
      div: g.pixelArt ? Math.max(2, pixelSize) : 2, grid: g.pixelArt ? pixelSize : 0,
    }) : null;
    try {
      if (g.pixelArt) {
        const composer = new EffectComposer(r);
        const pix = new PixelPass(pixelSize, this.scene, this.camera);
        composer.addPass(pix);
        if (tilt) composer.addPass(tilt);
        composer.addPass(new OutputPass());
        this.post = { composer, passes: [pix, tilt].filter(Boolean), pix, tilt };
      } else if (!g.ao && tilt) {
        // smooth without ambient occlusion: a plain (antialiased) render, then the blur
        const size = r.getDrawingBufferSize(new THREE.Vector2());
        const composer = new EffectComposer(r, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
        composer.addPass(new RenderPass(this.scene, this.camera));
        composer.addPass(tilt);
        composer.addPass(new OutputPass());
        this.post = { composer, passes: [tilt], tilt };
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
        if (tilt) composer.addPass(tilt);
        composer.addPass(new OutputPass());
        this.post = { composer, passes: [gtao, tilt].filter(Boolean), tilt };
      }
    } catch (e) {
      console.warn('Post-processing unavailable', e);
      tilt?.dispose();
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
    Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.ortho.updateProjectionMatrix();
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
  }

  // Switch between the orthographic and the perspective camera, keeping the
  // view: the same place, angle, tilt and scale at the middle of the screen.
  _useCamera(cam) {
    if (this.camera === cam) return;
    cam.position.copy(this.camera.position);
    cam.quaternion.copy(this.camera.quaternion);
    this.camera = cam;
    this.updateCamera(0);
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
  // (A perspective camera stays where it is and changes its zoom to match.)
  _pivotOn(pivot) {
    const rig = this.rig;
    rig.anchor = null;
    if (pivot && this.camera.isPerspectiveCamera) {
      const d0 = this._camDist(rig.zoom), d1 = Math.max(0.05, d0 + this._backDir(_back).dot(_corner.copy(rig.target).sub(pivot)));
      const f = d0 / d1;
      rig.zoom = Math.min(MAX_ZOOM, Math.max(rig.minZoom || 0.45, rig.zoom * f));
      rig.zoomT = Math.min(MAX_ZOOM, Math.max(rig.minZoom || 0.45, rig.zoomT * f));
    }
    if (pivot) rig.target.copy(pivot);
    rig.goal.copy(rig.target);
  }
  // Fold the 2D map's grid-aligned base angle into the turn, keeping the
  // angle: the view is no longer the 2D map (it was tilted out of it, or
  // sent back to the classic view).
  _leave2D() {
    const rig = this.rig;
    rig.topDown = false;
    rig.before2D = null;
    rig.turn += rig.base - ISO_BASE;
    rig.turnT += rig.baseT - ISO_BASE;
    rig.base = rig.baseT = ISO_BASE;
  }
  setTopDown(on, pivot = null) {
    const rig = this.rig;
    this._pivotOn(pivot);
    if (on === rig.topDown) return;
    rig.topDown = on;
    if (on) {
      // the 2D map is grid-aligned and straight down: remember the free turn
      // and tilt to go back to
      const q = Math.round(rig.turnT / QUARTER) * QUARTER;
      rig.before2D = { turn: rig.turnT - q, elev: rig.elevT };
      rig.turnT = q;
      rig.elevT = MAX_ELEV;
    } else {
      const b = rig.before2D || { turn: 0, elev: ISO_ELEV };
      rig.turnT += b.turn;
      rig.elevT = b.elev;
      rig.before2D = null;
    }
    // the isometric view sits at 45° to the grid
    rig.baseT = on ? 0 : ISO_BASE;
    rig.view = Math.round(rig.turnT / QUARTER);
  }
  // Swing the camera a quarter turn around the middle of the screen
  // (dir = 1 turns the town clockwise on screen, -1 anticlockwise): from a
  // free angle, to the next quarter turn that way.
  rotate(dir, pivot = null) {
    const rig = this.rig;
    this._pivotOn(pivot);
    const q = rig.turnT / QUARTER, n = Math.round(q);
    rig.view = Math.abs(q - n) < 1e-3 ? n + dir : dir > 0 ? Math.ceil(q) : Math.floor(q);
    rig.turnT = rig.view * QUARTER;
  }
  // Turn and tilt freely, at once (a drag or a held key): dTurn radians
  // clockwise, dElev radians up toward overhead. at: a point on the screen
  // to turn around ({ x, y } in client pixels, else the middle).
  orbit(dTurn, dElev, at = null) {
    const rig = this.rig;
    if (dElev) rig.anchor = null;
    if (dElev && rig.topDown && rig.elevT + dElev < MAX_ELEV) this._leave2D();
    if (dTurn) {
      // Swing everything on the ground round that point as the camera turns
      // (so it stays under the fingers), the spot a zoom is heading for too.
      const g = (at && this.screenToGround(at.x, at.y, rig.target.y)) || _hit.copy(rig.target);
      const c = Math.cos(dTurn), s = Math.sin(dTurn);
      const swing = (v) => { const x = v.x - g.x, z = v.z - g.z; v.x = g.x + x * c + z * s; v.z = g.z - x * s + z * c; };
      swing(rig.target); swing(rig.goal);
      if (rig.anchor) {
        const an = rig.anchor;
        swing(an);
        [an.cx, an.cz] = [an.cx * c + an.cz * s, -an.cx * s + an.cz * c];
      }
      rig.turn += dTurn;
      rig.turnT += dTurn;
      rig.view = Math.round(rig.turnT / QUARTER);
    }
    if (dElev) rig.elev = rig.elevT = Math.min(MAX_ELEV, Math.max(MIN_ELEV, rig.elevT + dElev));
    rig.spun = true;
    this._clamp();
  }
  // Back to the classic isometric view: the nearest of the four classic
  // angles, the classic tilt (the game switches the projection back too).
  classicView(pivot = null) {
    const rig = this.rig;
    this._pivotOn(pivot);
    this._leave2D();
    rig.view = Math.round(rig.turnT / QUARTER);
    rig.turnT = rig.view * QUARTER;
    rig.elevT = ISO_ELEV;
  }
  // Is the view (or where it's going) the classic one?
  get classic() {
    const r = this.rig, q = r.turnT / QUARTER;
    return !this.camera.isPerspectiveCamera && !r.topDown && Math.abs(r.elevT - ISO_ELEV) < 1e-3 && Math.abs(q - Math.round(q)) < 1e-3;
  }
  // which of the four quarter turns the view is nearest (0–3)
  get facing() { return ((this.rig.view % 4) + 4) % 4; }
  zoomBy(factor, clientX = null, clientY = null) {
    const rig = this.rig;
    const z0 = rig.zoomT;
    const z1 = Math.min(MAX_ZOOM, Math.max(rig.minZoom || 0.45, z0 * factor));
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
  setZoom(z) { this.rig.zoomT = Math.min(MAX_ZOOM, Math.max(this.rig.minZoom || 0.45, z)); }

  pan(dxPx, dyPx) {
    const rig = this.rig;
    const upp = CONFIG.VIEW_HEIGHT / rig.zoom / this.canvas.clientHeight;
    const a = rig.angle;
    const rx = Math.cos(a), rz = -Math.sin(a);
    const fx = -Math.sin(a), fz = -Math.cos(a);
    const se = Math.max(0.3, Math.sin(rig.elev));
    this._move(-dxPx * upp * rx + (dyPx * upp * fx) / se, -dxPx * upp * rz + (dyPx * upp * fz) / se);
  }
  // Pan by dragging the ground: the spot under the pointer at (x, y) stays
  // under it as the pointer moves on by (dx, dy), whatever the angle. Near
  // the horizon of a perspective view a drag goes no faster than pan().
  grab(x, y, dx, dy) {
    const rig = this.rig, y0 = rig.target.y;
    const p0 = this.screenToGround(x, y, y0), p1 = p0 && this.screenToGround(x + dx, y + dy, y0);
    if (!p1) { this.pan(dx, dy); return; }
    let mx = p0.x - p1.x, mz = p0.z - p1.z;
    const cap = (Math.hypot(dx, dy) * CONFIG.VIEW_HEIGHT) / rig.zoom / this.canvas.clientHeight / Math.max(0.3, Math.sin(rig.elev)) * 1.5;
    const m = Math.hypot(mx, mz);
    if (m > cap) { mx *= cap / m; mz *= cap / m; }
    this._move(mx, mz);
  }
  _move(mx, mz) {
    const rig = this.rig;
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

  // The point at height y under the screen point (client pixels), or null
  // (above the horizon of a perspective view).
  screenToGround(clientX, clientY, y = 0) {
    const rect = this.canvas.getBoundingClientRect();
    return this._ndcToGround(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, y, new THREE.Vector3());
  }
  _ndcToGround(nx, ny, y, out) {
    _ray.setFromCamera(_ndc.set(nx, ny), this.camera);
    _plane.constant = -y;
    return _ray.ray.intersectPlane(_plane, out);
  }

  // behind: behind the camera, or past the far end of the view
  worldToScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: p.z > 1 };
  }

  // (at the middle of the screen, for a perspective camera)
  pixelsPerUnit() {
    return this.canvas.height / this.pixelScale / (CONFIG.VIEW_HEIGHT / this.rig.zoom);
  }

  // How far a perspective camera stands from its target to show the same
  // scale there as the orthographic view at that zoom.
  _camDist(zoom) {
    return CONFIG.VIEW_HEIGHT / (2 * zoom * Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2));
  }
  // the direction from the target back to the camera
  _backDir(out) {
    const a = this.rig.angle, e = Math.min(this.rig.elev, MAX_ELEV - 1e-4);
    return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  }

  updateCamera(dt) {
    const rig = this.rig;
    const k = 1 - Math.pow(0.0005, dt);
    const a0 = rig.angle, e0 = rig.elev;
    rig.base = Math.abs(rig.baseT - rig.base) < 1e-4 ? rig.baseT : rig.base + (rig.baseT - rig.base) * k;
    rig.turn = Math.abs(rig.turnT - rig.turn) < 1e-4 ? rig.turnT : rig.turn + (rig.turnT - rig.turn) * k;
    rig.angle = rig.base + rig.turn;
    rig.elev = Math.abs(rig.elevT - rig.elev) < 1e-4 ? rig.elevT : rig.elev + (rig.elevT - rig.elev) * k;
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
    // turning or tilting this frame, eased or by hand
    const turning = zooming || rig.angle !== a0 || rig.elev !== e0 || rig.spun;
    rig.spun = false;
    const a = rig.angle, e = Math.min(rig.elev, MAX_ELEV - 1e-4);
    const cam = this.camera, persp = cam.isPerspectiveCamera;
    const back = this._backDir(_back);
    // How far the town reaches along the line of sight, either side of the
    // target: the near and far ends of the view take it all in, at any tilt.
    const B = rig.bounds, t = rig.target;
    let sMin = Infinity, sMax = -Infinity;
    for (let i = 0; i < 8; i++) {
      const s = _corner.set(i & 1 ? B + 3 : -3, i & 2 ? 30 : -4, i & 4 ? B + 3 : -3).sub(t).dot(back);
      sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
    }
    let dist;
    if (persp) {
      dist = this._camDist(rig.zoom);
      cam.near = Math.min(2, Math.max(0.02, dist * 0.05));
      cam.far = Math.max(cam.near + 10, dist - sMin + 4);
    } else {
      // (the orthographic camera stands back far enough to have the whole town in front of it)
      dist = Math.max(DIST, sMax + 6);
      cam.near = dist - sMax - 2;
      cam.far = dist - sMin + 2;
      cam.zoom = rig.zoom;
    }
    cam.position.copy(t).addScaledVector(back, dist);
    // a low perspective camera stays above the hills (looking down at its target)
    if (persp && this.groundAt) cam.position.y = Math.max(cam.position.y, this.groundAt(cam.position.x, cam.position.z) + Math.min(0.3, dist * 0.2));
    this.eye.copy(cam.position);
    // (for sizing things by their distance: see Particles)
    cam.userData.dist = cam.position.distanceTo(t);
    cam.up.set(-Math.sin(a), 0, -Math.cos(a));
    if (e < 1.2) cam.up.set(0, 1, 0);
    cam.lookAt(t);
    cam.updateProjectionMatrix();
    if (this.post && this.post.pix && !turning) {
      // Snap the view to whole pixels so pixel art doesn't shimmer while panning
      // (for a perspective camera, the pixels at the target's distance).
      // Not while zooming or turning: the pixel grid itself moves every frame
      // then, and snapping to a moving grid makes the whole picture vibrate.
      cam.updateMatrixWorld();
      const e3 = cam.matrixWorld.elements;
      const right = _lx.set(e3[0], e3[1], e3[2]), up = _ly.set(e3[4], e3[5], e3[6]);
      const px = CONFIG.VIEW_HEIGHT / rig.zoom / this.post.pix.renderResolution.y;
      const rx = t.dot(right), uy = t.dot(up);
      const dx = Math.round(rx / px) * px - rx, dy = Math.round(uy / px) * px - uy;
      cam.position.addScaledVector(right, dx).addScaledVector(up, dy);
    }
    cam.updateMatrixWorld();
    // a light haze over only the farthest of the view in the smooth look (none
    // looking straight down, or in pixel art); lower views see further, into
    // a thicker haze
    const top = Math.min(1, Math.max(0, (e - ISO_ELEV) / (Math.PI / 2 - ISO_ELEV - 0.15)));
    const noFog = this.gfx.pixelArt ? 1000 : 0;
    const reach = persp ? Math.max(20, (dist - sMin) * 0.55) : 260 / Math.max(0.5, rig.zoom);
    this.scene.fog.near = dist + 14 + top * 400 + noFog;
    this.scene.fog.far = dist + 14 + top * 400 + reach + noFog;
    this._fitShadow();
  }

  // The sun's shadow map covers the ground in view: where the corners and
  // middle of the screen meet the ground (no further than the town reaches
  // past the target, toward the horizon of a low perspective view), in a
  // square round them.
  _fitShadow() {
    const rig = this.rig, t = rig.target;
    const reach = rig.bounds * 0.75 + 4;
    let cx = 0, cz = 0;
    for (let i = 0; i < 5; i++) {
      const p = _foot[i], nx = i === 4 ? 0 : i & 1 ? 1 : -1, ny = i === 4 ? 0 : i & 2 ? 1 : -1;
      if (!this._ndcToGround(nx, ny, t.y, p)) {
        // above the horizon: as far as the town reaches, that way
        _ray.setFromCamera(_ndc.set(nx, ny), this.camera);
        p.set(_ray.ray.direction.x, 0, _ray.ray.direction.z).normalize().multiplyScalar(reach).add(t);
      }
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
      if (d > reach) p.set(t.x + (dx * reach) / d, t.y, t.z + (dz * reach) / d);
      cx += p.x / 5; cz += p.z / 5;
    }
    let r = 0;
    for (const p of _foot) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    r += 3;
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
    const m = _corner.set(cx, t.y, cz);
    const px = Math.round(m.dot(lx) / texel) * texel, py = Math.round(m.dot(ly) / texel) * texel, pz = m.dot(lz);
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
