// Tilt-shift (the "miniature model" look): the picture is sharp around a
// point and goes soft by degrees all the way out to every edge, the way a
// tilted lens makes a photo of a real town look like a tabletop model. The
// sharp area is a wide oval, stretched across the view; the blur eases in
// from it, so there's no line where it starts. A little extra colour and
// contrast helps the look.
//
// The blur is done at a fraction of the screen's resolution (half, or the
// pixel-art grid when that is coarser), across and then down, each a 13-tap
// Gaussian whose width grows with the distance from the focus. A last pass at
// full size mixes the blur into the sharp picture by that same distance, so
// the middle of the oval is the untouched picture.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// how much less the blur grows across the view than up and down it
const WIDE = '0.45';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// How far out of focus (0 to 1) a point of the screen is: by its distance
// from the focus in screen heights, counted at a little under half across
// (WIDE) as up and down, so the sharp area is a wide oval. Barely any blur
// near the middle, easing in and then on to the full blur by the edges.
const RAMP = /* glsl */`
uniform vec2 focus;
uniform float band, spread, aspect;
float ramp(vec2 p) {
  vec2 d = vec2((p.x - focus.x) * aspect * ${WIDE}, p.y - focus.y);
  float t = clamp((length(d) - band) / spread, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}`;

const BLUR = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 dir;        // one texel of the source, across or down
uniform float maxR;      // the widest blur, in those texels either side
varying vec2 vUv;
${RAMP}
void main() {
  float r = maxR * ramp(vUv);
  if (r < 0.5) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
  vec4 sum = vec4(0.0);
  float ws = 0.0;
  for (int i = -6; i <= 6; i++) {
    float t = float(i) / 6.0, w = exp(-2.0 * t * t);
    sum += texture2D(tDiffuse, vUv + dir * (r * t)) * w;
    ws += w;
  }
  gl_FragColor = sum / ws;
}`;

const MIX = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tBlur;
uniform float maxR;      // the widest blur, in screen pixels either side
uniform float saturate, contrast;
uniform vec2 grid;       // the pixel-art grid (0: none), so blur keeps to its pixels
varying vec2 vUv;
${RAMP}
void main() {
  vec2 uv = grid.x > 0.0 ? (floor(vUv * grid) + 0.5) / grid : vUv;
  vec4 c = texture2D(tDiffuse, vUv);
  // fade in the blur over its first pixel or two
  float m = smoothstep(0.3, 1.8, maxR * ramp(uv));
  if (m > 0.0) c = mix(c, texture2D(tBlur, uv), m);
  // grade the colour as if opaque (the picture's colours are premultiplied)
  float a = max(c.a, 1e-4);
  vec3 col = max(c.rgb / a, 0.0);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, 1.0 + saturate), 0.0);
  // contrast as a gentle S around mid-grey, in the linear light the scene is drawn in
  col = 0.18 * pow(col / 0.18, vec3(1.0 + contrast));
  gl_FragColor = vec4(col * c.a, c.a);
}`;

export class TiltShiftPass extends Pass {
  // look: { blur (the widest, in screen heights either side), saturate, contrast };
  // band: how far above and below the focus stays sharp (screen heights);
  // div: the blur's resolution as a fraction of the screen's;
  // grid: the pixel-art pixel size in screen pixels (0 for smooth rendering)
  constructor({ look, band, div = 2, grid = 0 }) {
    super();
    this.look = look;
    this.div = div;
    this.grid = grid;
    this.focus = { x: 0.5, y: 0.5 };
    // the sharp middle is under half the band (the blur eases in past it), and
    // the blur reaches its widest a good way out, near the top and bottom edges
    const uniforms = () => ({
      focus: { value: new THREE.Vector2(0.5, 0.5) }, band: { value: band * 0.45 }, spread: { value: Math.max(0.3, 0.62 - band) }, aspect: { value: 1 }, maxR: { value: 1 },
    });
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtA = rt();
    this.rtB = rt();
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() }, ...uniforms() },
      vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false,
    });
    this.mix = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBlur: { value: this.rtB.texture },
        saturate: { value: look.saturate }, contrast: { value: look.contrast }, grid: { value: new THREE.Vector2() },
        ...uniforms(),
      },
      vertexShader: VERT, fragmentShader: MIX, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.blur);
  }

  setSize(width, height) {
    const w = Math.max(1, Math.ceil(width / this.div)), h = Math.max(1, Math.ceil(height / this.div));
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.size = { w, h };
    // the blur scales with the height of the picture, so it looks the same on any screen
    this.blur.uniforms.maxR.value = this.look.blur * h;
    this.mix.uniforms.maxR.value = this.look.blur * height;
    this.blur.uniforms.aspect.value = this.mix.uniforms.aspect.value = width / height;
    if (this.grid) this.mix.uniforms.grid.value.set(Math.floor(width / this.grid), Math.floor(height / this.grid));
  }

  render(renderer, writeBuffer, readBuffer) {
    const b = this.blur.uniforms, m = this.mix.uniforms;
    b.focus.value.set(this.focus.x, this.focus.y);
    m.focus.value.set(this.focus.x, this.focus.y);
    // across, from the full picture (its linear filtering averages it down)...
    this.fsQuad.material = this.blur;
    b.tDiffuse.value = readBuffer.texture;
    b.dir.value.set(1 / this.size.w, 0);
    renderer.setRenderTarget(this.rtA);
    this.fsQuad.render(renderer);
    // ...then down
    b.tDiffuse.value = this.rtA.texture;
    b.dir.value.set(0, 1 / this.size.h);
    renderer.setRenderTarget(this.rtB);
    this.fsQuad.render(renderer);
    // and mixed into the sharp picture
    this.fsQuad.material = this.mix;
    m.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.rtA.dispose(); this.rtB.dispose(); this.blur.dispose(); this.mix.dispose(); this.fsQuad.dispose();
  }
}
