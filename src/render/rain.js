// Rain: short falling streaks around the middle of the view, as many as the
// shower is heavy. They fall at their own pace whatever the game speed.

import * as THREE from 'three';

const MAX = 650, AREA = 30, TOP = 6, LEN = 0.32;

export class Rain {
  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground;
    this.pos = new Float32Array(MAX * 6);
    this.drops = Array.from({ length: MAX }, () => ({ x: 0, y: 0, z: 0, gy: 0, v: 0 }));
    this.live = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c8d4e2', transparent: true, opacity: 0.5, depthWrite: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  _spawn(d, c, high) {
    d.x = c.x + (Math.random() - 0.5) * AREA;
    d.z = c.z + (Math.random() - 0.5) * AREA;
    d.gy = this.ground(d.x, d.z);
    d.y = d.gy + (high ? TOP : Math.random() * TOP);
    d.v = 7 + Math.random() * 3;
  }

  // amount 0..1 (0 stops new drops; the ones in the air still land)
  update(dt, amount, center) {
    const want = Math.round(MAX * Math.max(0, Math.min(1, amount)));
    // a shower builds up and dies away rather than switching on and off
    while (this.live < want) this._spawn(this.drops[this.live++], center, false);
    const P = this.pos, wind = 0.18;
    let n = 0;
    for (let i = 0; i < this.live; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      d.x += wind * d.v * dt * 0.1;
      if (d.y < d.gy) {
        if (i >= want) { this.drops[i] = this.drops[--this.live]; this.drops[this.live] = d; i--; continue; }
        this._spawn(d, center, true);
      }
      P[n++] = d.x; P[n++] = d.y; P[n++] = d.z;
      P[n++] = d.x - wind * LEN; P[n++] = d.y + LEN; P[n++] = d.z;
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, n / 3);
    geo.attributes.position.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
