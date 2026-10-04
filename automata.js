// automata.js: a loose GPU re-creation of Fluid Automata (Forbes, Höllerer, Legrady, "Generative fluid profiles
// for interactive media arts projects", CAe 2013; github.com/CreativeCodingLab/FluidAutomataJS).
//
// Fluid: a grid of cells, each holding an 8-bit energy vector (256 orientations x 256 magnitudes), updated on the
// GPU every step: the energy in a cell splits into a forward stream (share `forward`) and left/right streams (the
// rest, split `dir`) turned by +-`ang`. Each stream displaces a copy of the cell along itself (at most one cell, or
// `maxOut`); every cell it overlaps receives a partial scaled by the overlap. Partials combine as in the JS original
// (magnitudes add, the orientation is pulled toward each partial by its weight), then `fluidity` damps them.
// Image: every frame the previous image is distorted by the field, blended with the background (`blend`), then
// given saturation, brightness and contrast; the result feeds the next frame.
// Classic script: defines createAutomata(gl, opts), AUTOMATA_PROFILES, AUTOMATA_BGS.

const AUTOMATA_PALETTES = {
  ocean: ['#0d1b2a', '#1b4965', '#5fa8d3', '#f4d35e', '#ee964b'],
  dusk: ['#1d1a3a', '#4b3a78', '#c86b8a', '#f2b880', '#7a5aa6'],
  ember: ['#120705', '#5c1a0b', '#c4421a', '#f29e4c', '#fff1c1'],
  ice: ['#0a1622', '#294a66', '#7fa7c4', '#b9d3e6', '#dfeaf2'],
};
// background textures: mode (shader), cell size in pixels, palette
const AUTOMATA_BGS = {
  'colour noise': { mode: 1, px: 1 }, 'grey noise': { mode: 0, px: 1 },
  'coarse colour': { mode: 1, px: 8 }, 'coarse b/w': { mode: 3, px: 8 },
  'ocean bands': { mode: 5, pal: 'ocean' }, 'dusk bands': { mode: 5, pal: 'dusk' }, 'ice bands': { mode: 5, pal: 'ice' },
  'ocean field': { mode: 2, pal: 'ocean' }, 'dusk field': { mode: 2, pal: 'dusk' }, 'ember field': { mode: 2, pal: 'ember' },
  'live noise': { mode: 1, px: 2, live: true },
  'camera': { mode: 4, camera: true }, 'image…': { mode: 4, image: true },
};
// profiles: the JS original's presets (blend, brightness, contrast, saturation, fluidity, momentum, angularity,
// energy). Its "momentum" m sends 2m of the energy forward, so forward = min(1, 2m) here.
const AUTOMATA_PROFILES = (() => {
  const D = { grid: 13, dir: 0.5, maxOut: 1, jitter: 0, sens: 0.25, burst: 0.25, fluids: true, torus: true, bg: 'colour noise' };
  const P = (b, br, c, s, fl, m, a, e, x = {}) => Object.assign({}, D, { blend: b, bright: br, contrast: c, sat: s, fluidity: fl, forward: Math.min(1, 2 * m), ang: a, energy: e }, x);
  return {
    'Watercolors': P(0.8241, 1.0799, 1.1007, 1.04, 0.985, 0.26, 1.18, 0.2),
    "Jupiter's Moons": P(0.93, 1.0, 1.03, 1.04, 0.95, 0.45, Math.PI / 2, 0.5, { grid: 16 }),
    'Ice Cracks': P(0.824, 1.0799, 1.1007, 0.9757, 1.0, 0.0001, 0.0001, 0.25, { fluids: false, grid: 14 }),
    // Angus's tuning of Ice Cracks (2026-10-03): coarse colour, wrapping, desaturated, gentler feedback
    'Cracks 2': Object.assign({}, D, { grid: 14, forward: 0, dir: 0.5, ang: 0, fluidity: 1, maxOut: 1, jitter: 0, burst: 0.25, sens: 0.25, energy: 0.25,
      blend: 0.821, bright: 1.083, contrast: 1.131, sat: 0.705, fluids: false, torus: true, bg: 'coarse colour' }),
    'Milky Way': P(0.7954, 1.1076, 1.165, 0.7188, 0.9999, 0.158, Math.PI / 4, 0.05, { grid: 18 }),
    'La Brea': P(0.82, 1.12, 1.1732, 0.5, 0.96, 0.4, Math.PI / 4, 0.15),
    'Cubism': P(0.7851, 1.0694, 1.1632, 1.0347, 0.99, 0, 0.0001, 0.5),
    'Sepia': P(0.8495, 1.0798, 1.1006, 0.8, 1, 0.0001, 0.0001, 0.3, { fluids: false, grid: 10 }),
    'Kaleidoscope': P(0.8036, 1.0799, 1.1215, 0.93, 0.99, 0.4524, Math.PI / 4, 0.218),
    'Rainbow Drop': P(0.8179, 1.0474, 1.1007, 1.0243, 0.99, 0, 0.7854, 0.07),
    'Infrared': P(0.7093, 1.0104, 1.1632, 1.2188, 0.99, 0.25, 1.5, 0.15),
    'Planetary': P(0.7925, 1.0799, 1.1288, 1.0168, 1.0, 0.0001, 0.0001, 0.3, { grid: 6 }),
    'Magic Marker': P(0.81, 1.0799, 1.1207, 1.0688, 0.97, 0.0001, 0.0001, 0.3),
    // after the paper: fine GPU grids, max outflow ("ice cracking and melting"), jitter, low-res b/w smear (fig. 11)
    'Melt': P(0.93, 1.0, 1.0, 1.0, 0.995, 0.35, Math.PI / 3, 0.4, { grid: 64, maxOut: 0.15, bg: 'ocean field' }),
    'Turbulence': P(0.95, 1.0, 1.005, 1.0, 0.985, 0.3, 2.2, 0.35, { grid: 96, dir: 0.35, jitter: 0.6, bg: 'dusk bands' }),
    'Smear': P(0.9, 1.0, 1.05, 0, 0.98, 0.45, Math.PI / 5, 0.12, { grid: 48, bg: 'coarse b/w' }),
    'Ember': P(0.94, 1.0, 1.01, 1.0, 0.99, 0.4, Math.PI / 2.5, 0.35, { grid: 72, bg: 'ember field' }),
  };
})();

function createAutomata(gl, opts = {}) {
  const o = Object.assign({ width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, vectors: false },
    AUTOMATA_PROFILES.Watercolors, opts);
  const VS = `#version 300 es
  in vec2 a; out vec2 vUv; void main(){ vUv=a*.5+.5; gl_Position=vec4(a,0.,1.); }`;
  const HEAD = `#version 300 es
  precision highp float; precision highp int; precision highp sampler2D;
  in vec2 vUv; out vec4 o;
  const float TAU=6.28318530718;
  // integer hash: random everywhere on the screen (a float hash repeats in tiles at large pixel coordinates)
  uint ih(uint x){ x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; x^=x>>16; return x; }
  float rnd(vec2 c, float k){ uvec2 u=uvec2(ivec2(floor(c))+ivec2(65536)); return float(ih(u.x^ih(u.y^ih(uint(k)))))/4294967295.; }
  float vnoise(vec2 p, float k){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(rnd(i,k),rnd(i+vec2(1,0),k),f.x), mix(rnd(i+vec2(0,1),k),rnd(i+vec2(1,1),k),f.x), f.y); }
  float fbm(vec2 p, float k){ float f=0., a=.55; for(int i=0;i<5;i++){ f+=a*vnoise(p,k+float(i)); p=p*2.03+7.1; a*=.5; } return f; }
  float angDist(float a, float b){ return mod(mod(b-a,TAU)+3.*3.14159265359,TAU)-3.14159265359; }
  `;
  const FS = {
    step: `uniform sampler2D uS; uniform ivec2 N; uniform float r1, r2, phi, damp, maxOut, jitter, seed, torus, fluids;
    void main(){
      ivec2 C=ivec2(gl_FragCoord.xy);
      vec4 me=texelFetch(uS,C,0);
      float no=me.r*TAU, nm=0.;
      if(fluids<.5) nm=me.g;
      else for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++){
        ivec2 n=C+ivec2(dx,dy); vec2 fl=vec2(1);
        if(torus>.5) n=(n+N)%N;
        else {   // walls: a ghost cell mirrors the edge cell with its vector reflected, so energy bounces back
          if(n.x<0||n.x>=N.x){ n.x=clamp(n.x,0,N.x-1); fl.x=-1.; }
          if(n.y<0||n.y>=N.y){ n.y=clamp(n.y,0,N.y-1); fl.y=-1.; }
        }
        vec4 s=texelFetch(uS,n,0); float m=s.g;
        if(m<.002) continue;
        vec2 v=vec2(cos(s.r*TAU),sin(s.r*TAU))*fl; float th=atan(v.y,v.x);
        for(int k=0;k<3;k++){
          float sm = k==0 ? r1*m : (k==1 ? (1.-r2)*(1.-r1)*m : r2*(1.-r1)*m);
          if(sm<=0.) continue;
          float so = th + (k==1 ? phi : (k==2 ? -phi : 0.));
          vec2 off=vec2(dx,dy)+min(sm,maxOut)*vec2(cos(so),sin(so));   // displaced copy of the neighbour, relative to me
          float ov=max(0.,1.-abs(off.x))*max(0.,1.-abs(off.y));
          if(ov<=0.) continue;
          float cm=sm*ov, w=(cm>nm||nm==0.) ? 1. : cm/nm;
          no+=angDist(no,so)*w; nm+=cm;
        }
      }
      nm*=damp;
      if(jitter>0.) no+=(rnd(vec2(C),seed)-.5)*jitter;
      o=vec4(fract(no/TAU+1.), min(nm,1.), 0., 1.);
    }`,
    splat: `uniform sampler2D uS; uniform vec2 at, add; uniform float radius, spin;
    void main(){
      ivec2 C=ivec2(gl_FragCoord.xy); vec4 s=texelFetch(uS,C,0);
      vec2 v=s.g*vec2(cos(s.r*TAU),sin(s.r*TAU));
      vec2 d=gl_FragCoord.xy-at; float w=exp(-dot(d,d)/(radius*radius));
      vec2 a = spin!=0. ? spin*normalize(vec2(-d.y,d.x)+1e-5)*smoothstep(0.,1.2,length(d)) : add;
      v+=a*w;
      float m=min(length(v),1.);
      o=vec4(m>0. ? fract(atan(v.y,v.x)/TAU+1.) : s.r, m, 0., 1.);
    }`,
    bg: `uniform int mode; uniform float px, seed, aspect, imgAspect; uniform vec3 pal[5]; uniform sampler2D uImg;
    void main(){
      vec2 c=floor(gl_FragCoord.xy/px);
      vec3 col;
      if(mode==0) col=vec3(rnd(c,seed));
      else if(mode==1) col=vec3(rnd(c,seed),rnd(c,seed+1.),rnd(c,seed+2.));
      else if(mode==3) col=vec3(step(.5,rnd(c,seed)));
      else if(mode==2){   // a smooth noise field through the palette, with a little grain
        vec2 p=(vUv-.5)*vec2(aspect,1.)*3.;
        float f=clamp((fbm(p,seed)-.2)*1.6,0.,.999)*4.; int i=int(f);
        col=mix(pal[i],pal[min(i+1,4)],smoothstep(.35,.65,fract(f)))*(.9+.2*rnd(gl_FragCoord.xy,seed+5.));
      } else if(mode==5){  // poster bands, as in swirlfluid
        vec2 p=(vUv-.5)*vec2(aspect,1.)*2.;
        float r=length(p-vec2(-.5,.1)); p=mat2(cos(3.*exp(-r*r*2.)),sin(3.*exp(-r*r*2.)),-sin(3.*exp(-r*r*2.)),cos(3.*exp(-r*r*2.)))*(p-vec2(-.5,.1))+vec2(-.5,.1);
        float b=(dot(p,vec2(.4,2.2))+(fbm(p*1.2,seed)-.5)*.6)*3.;
        float k=floor(b); col=pal[int(mod(k,5.))];
        float fr=fract(b), w=fwidth(b); col=mix(col,pal[0]*.6,smoothstep(w*1.4,0.,min(fr,1.-fr)-.015));
      } else {
        vec2 uv=vUv-.5; if(imgAspect>aspect) uv.x*=aspect/imgAspect; else uv.y*=imgAspect/aspect;
        col=texture(uImg,vec2(uv.x+.5,.5-uv.y)).rgb;
      }
      o=vec4(col,1.);
    }`,
    frame: `uniform sampler2D uS, uPrev, uBg; uniform vec2 Nf, scale; uniform float energy, blend, bright, contrast, sat;
    vec2 vecAt(ivec2 c){ c=clamp(c,ivec2(0),ivec2(Nf)-1); vec4 s=texelFetch(uS,c,0); return s.g*vec2(cos(s.r*TAU),sin(s.r*TAU)); }
    void main(){
      vec2 g=vUv*Nf-.5; ivec2 i=ivec2(floor(g)); vec2 f=fract(g);
      vec2 v=mix(mix(vecAt(i),vecAt(i+ivec2(1,0)),f.x), mix(vecAt(i+ivec2(0,1)),vecAt(i+1),f.x), f.y);
      vec3 c=mix(texture(uBg,vUv).rgb, texture(uPrev, vUv-v*energy*scale).rgb, blend);
      c=mix(vec3(dot(c,vec3(.2125,.7154,.0721))),c,sat); c*=bright; c=mix(vec3(.9),c,contrast);
      o=vec4(clamp(c,0.,1.),1.);
    }`,
    show: `uniform sampler2D uImg, uS; uniform vec2 Nf, res; uniform float vectors;
    void main(){
      vec3 c=texture(uImg,vUv).rgb;
      if(vectors>.5){
        vec2 g=vUv*Nf; ivec2 i=ivec2(floor(g)); vec2 p=fract(g)-.5;
        vec4 s=texelFetch(uS,i,0); vec2 v=s.g*vec2(cos(s.r*TAU),sin(s.r*TAU))*.9;
        float h=clamp(dot(p,v)/max(dot(v,v),1e-6),0.,1.); float d=length(p-v*h);
        float px=Nf.y/res.y;
        float line=smoothstep(px*1.6,px*.4,d)*step(.004,s.g);
        float dot_=smoothstep(px*2.2,px*1.,length(p));
        c=mix(c,vec3(0.),max(line,dot_)*.55); c=mix(c,vec3(1.,.95,.7),line*.9);
      }
      o=vec4(c,1.);
    }`,
  };
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('automata shader: ' + gl.getShaderInfoLog(s)); return s; };
  const vs = sh(gl.VERTEX_SHADER, VS), PR = {};
  for (const [name, src] of Object.entries(FS)) {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + src));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('automata link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    PR[name] = { p, u };
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // 8-bit textures throughout, as in the original (the state is 8-bit orientation + 8-bit magnitude)
  function target(w, h, filter) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  }
  const free = t => { if (t) { gl.deleteTexture(t.t); gl.deleteFramebuffer(t.fb); } };
  const pair = (w, h, f) => { let a = target(w, h, f), b = target(w, h, f);
    return { get r() { return a; }, get w() { return b; }, swap() { [a, b] = [b, a]; }, free() { free(a); free(b); } }; };
  const tex = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.t || t); return unit; };
  const use = name => { gl.useProgram(PR[name].p); return PR[name].u; };
  function draw(t) {
    gl.bindVertexArray(vao);
    if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, o.width, o.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const clearT = t => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  let S, img, bgT, cols, rows, seed = Math.floor(Math.random() * 1e6), acc = 0, lastDir = [1, 0];
  const imgTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  let imgAspect = 1, source = null;   // an <img> or a <video> for the image / camera backgrounds

  function alloc() {
    if (img) img.free(); free(bgT);
    img = pair(o.width, o.height, gl.LINEAR); bgT = target(o.width, o.height, gl.LINEAR);
    allocGrid(); makeBackground(); restart();
  }
  function allocGrid() {
    rows = Math.max(2, Math.round(o.grid)); cols = Math.max(2, Math.round(rows * o.width / o.height));
    if (S) S.free(); S = pair(cols, rows, gl.NEAREST); clearT(S.r); clearT(S.w); o._grid = o.grid;
  }
  function makeBackground() {
    const b = AUTOMATA_BGS[o.bg] || AUTOMATA_BGS['colour noise'];
    if (source instanceof HTMLVideoElement && source.readyState >= 2) {
      gl.bindTexture(gl.TEXTURE_2D, imgTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    const u = use('bg');
    gl.uniform1i(u.mode, b.mode); gl.uniform1f(u.px, b.px || 1); gl.uniform1f(u.seed, b.live ? Math.floor(Math.random() * 1e6) : seed);
    gl.uniform1f(u.aspect, o.width / o.height); gl.uniform1f(u.imgAspect, imgAspect);
    gl.uniform3fv(u.pal, new Float32Array(AUTOMATA_PALETTES[b.pal || 'ocean'].flatMap(hex)));
    gl.uniform1i(u.uImg, tex(0, imgTex)); draw(bgT);
  }
  function restart() {   // start the image as the background itself
    const u = use('frame'); gl.uniform1i(u.uS, tex(0, S.r)); gl.uniform1i(u.uPrev, tex(1, bgT)); gl.uniform1i(u.uBg, tex(2, bgT));
    gl.uniform2f(u.Nf, cols, rows); gl.uniform2f(u.scale, 0, 0); gl.uniform1f(u.energy, 0); gl.uniform1f(u.blend, 0);
    gl.uniform1f(u.bright, 1); gl.uniform1f(u.contrast, 1); gl.uniform1f(u.sat, 1); draw(img.w); img.swap();
  }
  function stepFluid() {
    const u = use('step');
    gl.uniform1i(u.uS, tex(0, S.r)); gl.uniform2i(u.N, cols, rows);
    gl.uniform1f(u.r1, o.forward); gl.uniform1f(u.r2, o.dir); gl.uniform1f(u.phi, o.ang); gl.uniform1f(u.damp, o.fluidity);
    gl.uniform1f(u.maxOut, o.maxOut); gl.uniform1f(u.jitter, o.jitter); gl.uniform1f(u.seed, Math.floor(Math.random() * 1e6));
    gl.uniform1f(u.torus, o.torus ? 1 : 0); gl.uniform1f(u.fluids, o.fluids ? 1 : 0);
    draw(S.w); S.swap();
  }
  function stepImage() {
    if (AUTOMATA_BGS[o.bg]?.live || source instanceof HTMLVideoElement) makeBackground();
    const u = use('frame');
    gl.uniform1i(u.uS, tex(0, S.r)); gl.uniform1i(u.uBg, tex(2, bgT)); gl.uniform1i(u.uPrev, tex(1, img.r));   // unit 1 last: the wrap below applies to it
    const wrap = o.torus ? gl.REPEAT : gl.CLAMP_TO_EDGE;   // the previous image wraps around with the fluid, or clamps at walls
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.uniform2f(u.Nf, cols, rows);
    const a = o.width / o.height; gl.uniform2f(u.scale, Math.min(1, 1 / a), Math.min(1, a));
    gl.uniform1f(u.energy, o.energy); gl.uniform1f(u.blend, o.blend);
    gl.uniform1f(u.bright, o.bright); gl.uniform1f(u.contrast, o.contrast); gl.uniform1f(u.sat, o.sat);
    draw(img.w); img.swap();
  }
  // the automaton and the image both step at 60 Hz, whatever the display rate
  function step(dt) {
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (Math.round(o.grid) !== Math.round(o._grid)) allocGrid();
    acc = Math.min(acc + dt * 60, 2);
    while (acc >= 1) { acc -= 1; stepFluid(); stepImage(); if (o.auto && ++autoN % 8 === 0) autoLight(); }
  }
  // auto light: the image feeds back through blend, brightness and contrast every frame, so the per-frame gain
  // k = blend * brightness * contrast decides everything: at 1 or above every pixel runs off to black or white; well
  // below it the picture fades to a flat copy of the background. The structure lives just under 1. Every 8 frames
  // this reads a tiny copy of the picture and steers brightness and contrast (blend stays yours): the mean towards
  // mid-grey (by moving the balance point), the spread towards a lively target (by moving k, never above 0.997)
  let autoN = 0, small = null, autoK = null, autoDc = 0;
  const px = new Uint8Array(48 * 32 * 4);
  function autoLight() {
    if (!small) small = target(48, 32, gl.LINEAR);
    const u = use('show'); gl.uniform1i(u.uImg, tex(0, img.r)); gl.uniform1i(u.uS, tex(1, S.r));
    gl.uniform2f(u.Nf, cols, rows); gl.uniform2f(u.res, 48, 32); gl.uniform1f(u.vectors, 0); draw(small);
    gl.readPixels(0, 0, 48, 32, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s1 = 0, s2 = 0; const n = 48 * 32;
    for (let i = 0; i < n; i++) { const l = (0.2125 * px[i * 4] + 0.7154 * px[i * 4 + 1] + 0.0721 * px[i * 4 + 2]) / 255; s1 += l; s2 += l * l; }
    const mean = s1 / n, std = Math.sqrt(Math.max(0, s2 / n - mean * mean)), b = Math.max(0.3, o.blend);
    if (autoK === null) { autoK = Math.min(0.997, b * o.bright * o.contrast); autoDc = o.contrast - (1 + (autoK / b - 1) / 1.8); }
    autoDc += 0.04 * (mean - 0.5);                                   // too bright: more contrast around 0.9 darkens
    autoK += std < 0.17 ? 0.0015 : std > 0.24 ? -0.003 : 0;           // flat: closer to the edge; harsh: back off
    autoK = Math.min(0.997, Math.max(0.85, autoK)); autoDc = Math.min(0.25, Math.max(-0.25, autoDc));
    const m = autoK / b, C = Math.min(1.3, Math.max(0.8, 1 + (m - 1) / 1.8 + autoDc));
    o.contrast = C; o.bright = Math.min(1.25, Math.max(0.8, m / C)); o.autoStats = { mean, std, k: b * o.bright * o.contrast };
  }
  function render(t, target = null) {
    const u = use('show'); gl.uniform1i(u.uImg, tex(0, img.r)); gl.uniform1i(u.uS, tex(1, S.r));
    gl.uniform2f(u.Nf, cols, rows); gl.uniform2f(u.res, o.width, o.height); gl.uniform1f(u.vectors, o.vectors ? 1 : 0); draw(target);
  }
  // x, y in 0..1 (y up); (ax, ay) a vector in cell units, or spin = tangential strength
  function splat(x, y, ax, ay, spin = 0, radius = 1.1) {
    const u = use('splat'); gl.uniform1i(u.uS, tex(0, S.r));
    gl.uniform2f(u.at, x * cols, y * rows); gl.uniform2f(u.add, ax, ay);
    gl.uniform1f(u.radius, Math.max(0.6, radius)); gl.uniform1f(u.spin, spin); draw(S.w); S.swap();
  }
  // energy along a pointer move (paper, sec. 2): direction = the motion, magnitude from how far it moved
  function push(x0, y0, x1, y1) {
    const dx = (x1 - x0) * cols, dy = (y1 - y0) * rows, d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    lastDir = [dx / d, dy / d];
    const steps = Math.min(40, Math.ceil(d / 0.5)), amt = o.sens * Math.min(1, 0.2 + d * 0.3) / Math.sqrt(steps);
    for (let i = 1; i <= steps; i++) { const f = i / steps; splat(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, lastDir[0] * amt, lastDir[1] * amt); }
  }
  // held still: keep adding energy in the last known direction
  const hold = (x, y) => splat(x, y, lastDir[0] * o.sens * 0.25, lastDir[1] * o.sens * 0.25);
  // a press held still: energy shoots out in every direction like drags away from the press: each frame a ring of
  // pushes, each pointing away from the press, on a ring that moves outward the longer you hold (r cells, up to 6);
  // burst = how strong each push is, compared with sensitivity
  function burst(x, y, r = 1) {
    const amt = o.sens * (o.burst ?? 0.25), n = Math.max(8, Math.round(8 * r));
    for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a);
      splat(x + c * r / cols, y + s * r / rows, c * amt, s * amt, 0, 0.9); }
  }
  // n: every cell a random direction at a small magnitude, all at once
  function randomize(energy = 1) {
    const a = new Uint8Array(cols * rows * 4);
    for (let i = 0; i < cols * rows; i++) { a[i * 4] = Math.random() * 256; a[i * 4 + 1] = Math.min(255, 255 * 0.15 * energy * (0.5 + Math.random())); a[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, S.r.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, a);
  }
  const spin = (x, y, s, r = 2.2) => splat(x, y, 0, 0, s * o.sens, r);
  function reset() { clearT(S.r); clearT(S.w); seed = Math.floor(Math.random() * 1e6); makeBackground(); restart(); }
  function set(params) {
    const bgWas = o.bg; Object.assign(o, params);
    if ('auto' in params || 'blend' in params || ('bright' in params || 'contrast' in params) && !params._auto) autoK = null;   // re-seed from the current values
    if (o.bg !== bgWas) { makeBackground(); }
  }
  function setSource(src) {   // an <img> or <video> to use as the background (bg 'image…' / 'camera')
    if (source instanceof HTMLVideoElement && source !== src) source.srcObject?.getTracks().forEach(t => t.stop());
    source = src; if (!src) return;
    imgAspect = (src.videoWidth || src.width) / (src.videoHeight || src.height);
    if (!(src instanceof HTMLVideoElement)) { gl.bindTexture(gl.TEXTURE_2D, imgTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); }
    makeBackground(); restart();
  }
  function resize(w, h) { o.width = w; o.height = h; alloc(); }
  alloc();
  return { step, render, splat, randomize, push, hold, burst, spin, reset, resize, set, setSource, opts: o };
}
if (typeof window !== 'undefined') Object.assign(window, { createAutomata, AUTOMATA_PROFILES, AUTOMATA_BGS, AUTOMATA_PALETTES });
