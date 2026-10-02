// swirl2.js: swirlfluid v2, the posterized swirl fluid with "fluid profile" controls.
// Builds on v1 (../swirl.js) and borrows ideas from Fluid Automata (Forbes, Höllerer, Legrady,
// "Generative fluid profiles for interactive media arts projects", CAe 2013):
//   fluidity    how long motion lasts (per-frame retention, 1 = forever)
//   viscosity   how thick it is: velocity diffuses into its neighbours (tar)
//   momentum    share of each cell's energy that branches sideways instead of flowing straight on
//   angularity  the angle of those side branches
//   energy      how far the paint is carried per unit of motion
//   grid        a coarse lattice the paint follows: facets (soft) or cracks along cell edges (sharp)
//   fluids      on: motion propagates (advects itself, incompressible); off: it stays where you put it
//   heal        how fast the picture relaxes back to the original pattern (the automaton's "blend")
//   paint       'bands': poster bands drawn from stirred coordinates (crisp forever)
//               'ink': a colour image is smeared with feedback (brightness, contrast, saturation per frame)
// Classic script: defines createSwirl2(gl, opts), SWIRL2_PALETTES, SWIRL2_PRESETS.

const SWIRL2_PALETTES = {
  ocean:  { pal: ['#0d1b2a', '#1b4965', '#5fa8d3', '#f4d35e', '#ee964b'], seq: [0, 1, 0, 2, 1, 0, 3, 4], outline: '#08121c' },
  dusk:   { pal: ['#1d1a3a', '#4b3a78', '#c86b8a', '#f2b880', '#7a5aa6'], seq: [0, 1, 0, 2, 1, 0, 3, 4], outline: '#12102a' },
  navygold: { pal: ['#102a43', '#f0b429', '#e9e4d8', '#2f4f73', '#d9822b'], seq: [0, 3, 0, 1, 0, 2, 3, 4], outline: '#0a1c2e' },
  wine:   { pal: ['#1a0b1a', '#4a1c34', '#e07a5f', '#f4e3c1', '#8c2f4a'], seq: [0, 1, 0, 4, 0, 2, 1, 3], outline: '#100610' },
  sea:    { pal: ['#051719', '#0f3d3e', '#5fb3a1', '#f2c46d', '#1f6f6b'], seq: [0, 1, 0, 4, 0, 2, 1, 3], outline: '#020c0d' },
  ice:    { pal: ['#0a1622', '#dfeaf2', '#7fa7c4', '#294a66', '#b9d3e6'], seq: [0, 3, 0, 2, 3, 0, 4, 1], outline: '#050c14' },
  tar:    { pal: ['#0b0907', '#2a211b', '#6b4e3a', '#c08a52', '#3d2f25'], seq: [0, 1, 0, 4, 1, 0, 2, 3], outline: '#050403' },
};

const SWIRL2_PRESETS = {
  'Poster':      { fluids: true,  fluidity: 0.982, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0,  gridSharp: 0, curl: 4, heal: 0.1,  paint: 'bands' },
  'Tar':         { fluids: true,  fluidity: 0.99,  viscosity: 2.5, momentum: 0.4,  angularity: 0.785, energy: 0.3, grid: 0,  gridSharp: 0, curl: 0, heal: 0.02, paint: 'bands', palette: 'tar', freq: 2.6 },
  'Ice Cracks':  { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.2, grid: 9, gridSharp: 1, gridShape: 'shards', curl: 0, heal: 0.25, paint: 'bands', palette: 'ice', freq: 3.4 },
  'Cubism':      { fluids: false, fluidity: 0.995, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.4, grid: 7,  gridSharp: 0.6, gridShape: 'square', curl: 0, heal: 0.15, paint: 'bands', palette: 'navygold' },
  'Kaleidoscope':{ fluids: true,  fluidity: 0.99,  viscosity: 0,   momentum: 0.45, angularity: 0.785, energy: 1,   grid: 0,  gridSharp: 0, curl: 0, heal: 0.08, paint: 'bands', palette: 'dusk' },
  "Jupiter":     { fluids: true,  fluidity: 0.95,  viscosity: 0.2, momentum: 0.3, angularity: 1.571, energy: 1.2, grid: 0,  gridSharp: 0, curl: 10, heal: 0.06, paint: 'bands', palette: 'wine', freq: 4.2 },
  'Watercolour': { fluids: true,  fluidity: 0.985, viscosity: 0.4, momentum: 0.26, angularity: 1.18,  energy: 1,   grid: 0,  gridSharp: 0, curl: 3, heal: 0.15, paint: 'ink', palette: 'sea', saturation: 1.001, brightness: 1.0, contrast: 1.0 },
  'Milky Way':   { fluids: true,  fluidity: 0.998, viscosity: 0,   momentum: 0.16, angularity: 0.785, energy: 0.8, grid: 0,  gridSharp: 0, curl: 6, heal: 0.06, paint: 'ink', palette: 'ocean', saturation: 0.998, brightness: 1.0, contrast: 1.0015 },
};

function createSwirl2(gl, opts = {}) {
  const o = Object.assign({
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
    simRes: 160, coordRes: 900, palette: 'ocean', freq: 3.0, dir: [0.4, 2.2],
    swirls: [[-0.55, 0.12, 5.5, 0.75], [0.7, -0.3, -4.5, 0.6], [0.15, 0.75, 2.5, 0.4]],
    cycle: 0.07, ambient: 1, saturation: 1, brightness: 1, contrast: 1, gridShape: 'square',
  }, SWIRL2_PRESETS.Poster, opts);
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float'))
    throw new Error('swirl: this GPU cannot render to float textures');

  const VS = `#version 300 es
  in vec2 a; uniform vec2 texel; out vec2 vUv, vL, vR, vT, vB;
  void main(){ vUv=a*.5+.5; vL=vUv-vec2(texel.x,0.); vR=vUv+vec2(texel.x,0.);
    vT=vUv+vec2(0.,texel.y); vB=vUv-vec2(0.,texel.y); gl_Position=vec4(a,0.,1.); }`;
  const HEAD = `#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 vUv, vL, vR, vT, vB; out vec4 o;
  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  mat2 rot(float a){ return mat2(cos(a),sin(a),-sin(a),cos(a)); }
  `;
  const INIT = `
  uniform vec4 sw[6]; uniform int nsw; uniform float aspect;
  vec2 swirl(vec2 p, vec4 s){ vec2 d=p-s.xy; float r=length(d);
    float an=s.z*exp(-r*r/(s.w*s.w)); return s.xy+mat2(cos(an),-sin(an),sin(an),cos(an))*d; }
  vec2 initP(vec2 uv){ vec2 p=(uv-.5)*vec2(aspect,1.)*2.;
    for(int i=0;i<6;i++) if(i<nsw) p=swirl(p,sw[i]); return p; }
  `;
  // velocity as the paint sees it: smooth, or read off a coarse lattice (facets / cracks)
  const VELAT = `
  uniform sampler2D uVel; uniform float grid, gridSharp;
  uniform float shards;
  vec2 velAt(vec2 uv){
    if(grid<.5) return texture(uVel,uv).xy;
    if(shards>.5){   // jittered Voronoi shards: each shard moves as one piece, so the bands crack along shard edges
      vec2 N=vec2(grid*aspect, grid); vec2 g=uv*N, i=floor(g); float best=9.; vec2 bc=g;
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 c=i+vec2(x,y);
        vec2 pt=c+.1+.8*vec2(hash(c),hash(c+17.3)); float d=length(g-pt); if(d<best){ best=d; bc=pt; } }
      return mix(texture(uVel,uv).xy, texture(uVel,bc/N).xy, gridSharp);
    }
    vec2 N=vec2(floor(grid*aspect+.5), grid);
    vec2 g=uv*N-.5; vec2 i=floor(g), f=fract(g);
    vec2 a=texture(uVel,(i+.5)/N).xy, b=texture(uVel,(i+vec2(1.5,.5))/N).xy,
         c=texture(uVel,(i+vec2(.5,1.5))/N).xy, d=texture(uVel,(i+1.5)/N).xy;
    f=mix(f, step(.5,f), gridSharp);
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
  }`;
  const FS = {
    init: INIT + `void main(){ o=vec4(initP(vUv),0.,1.); }`,
    advect: `uniform sampler2D uVel, uSrc; uniform vec2 simTexel; uniform float dt;
      void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*simTexel; o=texture(uSrc,c); }`,
    advectP: INIT + VELAT + `uniform sampler2D uSrc; uniform vec2 simTexel; uniform float dt, relax, flow, disp;
      void main(){
        // fluids off: the motion field is a displacement of the original picture (stays put, no smearing)
        if(flow<.5){ o=vec4(initP(vUv-velAt(vUv)*simTexel*disp),0.,1.); return; }
        vec2 c=vUv-dt*velAt(vUv)*simTexel;
        o=vec4(mix(texture(uSrc,c).xy, initP(vUv), relax),0.,1.); }`,
    advectInk: INIT + VELAT + `uniform sampler2D uSrc, uFresh; uniform vec2 simTexel; uniform float dt, relax, sat, bright, contrast, flow, disp;
      void main(){ vec2 c=vUv-dt*velAt(vUv)*simTexel;
        vec3 col=flow<.5 ? mix(texture(uSrc,vUv).rgb, texture(uFresh,vUv-velAt(vUv)*simTexel*disp).rgb, .2)
                         : mix(texture(uSrc,c).rgb, texture(uFresh,vUv).rgb, relax);
        float l=dot(col,vec3(.2125,.7154,.0721));
        col=mix(vec3(l),col,sat); col*=bright; col=mix(vec3(.5),col,contrast);
        o=vec4(clamp(col,0.,1.),1.); }`,
    splat: `uniform sampler2D uTarget; uniform vec2 point, force; uniform float radius, aspect, spin;
      void main(){ vec2 d=vUv-point; d.x*=aspect; float r2=dot(d,d); float g=exp(-r2/radius);
        vec2 tan_=vec2(-d.y,d.x)*radius/(r2+radius)*exp(-r2/(radius*5.));
        o=vec4(texture(uTarget,vUv).xy + force*g + spin*tan_*.6,0.,1.); }`,
    curl: `uniform sampler2D uVel;
      void main(){ float L=texture(uVel,vL).y, R=texture(uVel,vR).y, T=texture(uVel,vT).x, B=texture(uVel,vB).x;
        o=vec4(.5*(R-L-T+B),0.,0.,1.); }`,
    vort: `uniform sampler2D uVel, uCurl; uniform float curl, dt;
      void main(){ float L=texture(uCurl,vL).x, R=texture(uCurl,vR).x, T=texture(uCurl,vT).x, B=texture(uCurl,vB).x, C=texture(uCurl,vUv).x;
        vec2 f=.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f/=length(f)+1e-4; f*=curl*C; f.y*=-1.;
        o=vec4(texture(uVel,vUv).xy+f*dt,0.,1.); }`,
    // viscosity: one Jacobi step of implicit diffusion, v = (v0 + a*(L+R+T+B)) / (1+4a)
    visc: `uniform sampler2D uVel, uV0; uniform float alpha;
      void main(){ vec2 s=texture(uVel,vL).xy+texture(uVel,vR).xy+texture(uVel,vT).xy+texture(uVel,vB).xy;
        o=vec4((texture(uV0,vUv).xy+alpha*s)/(1.+4.*alpha),0.,1.); }`,
    // automaton branching: part of each cell's motion is fed in from the side, turned by +-angularity
    branch: `uniform sampler2D uVel; uniform float mom, ang, reach; uniform vec2 simTexel;
      void main(){ vec2 v=texture(uVel,vUv).xy; float m=length(v);
        if(m<1e-4||mom<1e-4){ o=vec4(v,0.,1.); return; }
        vec2 d=v/m;
        vec2 dl=rot(ang)*d, dr=rot(-ang)*d;
        vec2 vl=texture(uVel,vUv-dl*reach*simTexel).xy, vr=texture(uVel,vUv-dr*reach*simTexel).xy;
        o=vec4((1.-mom)*v+.5*mom*(rot(ang)*vl+rot(-ang)*vr),0.,1.); }`,
    div: `uniform sampler2D uVel;
      void main(){ vec2 C=texture(uVel,vUv).xy; float L=texture(uVel,vL).x, R=texture(uVel,vR).x, T=texture(uVel,vT).y, B=texture(uVel,vB).y;
        if(vL.x<0.) L=-C.x; if(vR.x>1.) R=-C.x; if(vT.y>1.) T=-C.y; if(vB.y<0.) B=-C.y;
        o=vec4(.5*(R-L+T-B),0.,0.,1.); }`,
    scale: `uniform sampler2D uSrc; uniform float k; void main(){ o=texture(uSrc,vUv)*k; }`,
    press: `uniform sampler2D uP, uDiv;
      void main(){ float L=texture(uP,vL).x, R=texture(uP,vR).x, T=texture(uP,vT).x, B=texture(uP,vB).x;
        o=vec4((L+R+B+T-texture(uDiv,vUv).x)*.25,0.,0.,1.); }`,
    grad: `uniform sampler2D uP, uVel;
      void main(){ float L=texture(uP,vL).x, R=texture(uP,vR).x, T=texture(uP,vT).x, B=texture(uP,vB).x;
        o=vec4(texture(uVel,vUv).xy-vec2(R-L,T-B),0.,1.); }`,
    display: `uniform sampler2D uP, uInk; uniform float time, freq, cycle, seqLen, inkOn, starsOn; uniform vec2 dir, res;
      uniform vec3 pal[5]; uniform float seq[8]; uniform vec3 outline, starC;
      vec3 colAt(float k){ int i=int(mod(k,seqLen)); return pal[int(seq[i])]; }
      void main(){
        vec3 col;
        if(inkOn>.5) col=texture(uInk,vUv).rgb;
        else {
          vec2 p=texture(uP,vUv).xy;
          float b=(dot(p,dir)+(vnoise(p*1.2)-.5)*.35)*freq;
          float k=floor(b);
          // every band runs its own colour clock, so parts of the fluid change colour at different times
          float hk=hash(vec2(k*.731,3.17));
          float ph=time*cycle*(.6+.8*hk)+hk*9.;
          float sh=floor(ph);
          col=mix(colAt(k+sh), colAt(k+sh+1.), smoothstep(.97,1.,fract(ph)));
          float fr=fract(b), w=fwidth(b);
          col=mix(col,outline,smoothstep(w*1.4,0.,min(fr,1.-fr)-.015));
        }
        if(starsOn>.5){
          vec2 g=gl_FragCoord.xy/res.y*14.; vec2 i=floor(g), f=fract(g)-.5;
          float rr=hash(i); vec2 q=abs(f-(vec2(hash(i+2.),hash(i+9.))-.5)*.5);
          float sz=(.06+.12*hash(i+4.))*(.75+.25*sin(time*(1.+2.*hash(i+5.))+rr*40.));
          float px=1.2/(res.y/14.);
          float star=max(smoothstep(px,0.,q.x)*smoothstep(sz,0.,q.y), smoothstep(px,0.,q.y)*smoothstep(sz,0.,q.x));
          star=max(star, smoothstep(.035,.02,length(q)));
          float dark=1.-smoothstep(.12,.22,dot(col,vec3(.3,.59,.11)));
          col=mix(col,starC,step(.86,rr)*star*dark);
        }
        o=vec4(col,1.);
      }`,
  };

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('swirl shader: ' + gl.getShaderInfoLog(s)); return s; };
  const vs = sh(gl.VERTEX_SHADER, VS);
  const P = {};
  for (const [name, src] of Object.entries(FS)) {
    const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + src));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('swirl link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    P[name] = { p, u };
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const fbo = (w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h }; };
  const dbl = (w, h) => { let a = fbo(w, h), b = fbo(w, h);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } }; };

  let S = {};
  const aspect = () => o.width / o.height;
  function alloc() {
    const sh_ = o.simRes, sw_ = Math.round(sh_ * aspect());
    const ch = Math.min(o.coordRes, o.height), cw = Math.round(ch * aspect());
    S = { vel: dbl(sw_, sh_), press: dbl(sw_, sh_), div: fbo(sw_, sh_), curl: fbo(sw_, sh_), v0: fbo(sw_, sh_),
          P: dbl(cw, ch), P0: fbo(cw, ch), ink: dbl(cw, ch), fresh: fbo(cw, ch), sw: sw_, sh: sh_ };
    reset();
  }
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const tex = (unit, f) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, f.t); return unit; };
  function use(name, target, texelOf) {
    const pr = P[name]; gl.useProgram(pr.p);
    const tw = texelOf || target;
    if (pr.u.texel) gl.uniform2f(pr.u.texel, 1 / tw.w, 1 / tw.h);
    if (pr.u.aspect) gl.uniform1f(pr.u.aspect, aspect());
    if (pr.u.sw) { const a = new Float32Array(24); o.swirls.slice(0, 6).forEach((s, i) => a.set(s, i * 4));
      gl.uniform4fv(pr.u.sw, a); gl.uniform1i(pr.u.nsw, Math.min(6, o.swirls.length)); }
    if (pr.u.grid) { gl.uniform1f(pr.u.grid, o.grid); gl.uniform1f(pr.u.gridSharp, o.gridSharp); gl.uniform1f(pr.u.shards, o.gridShape === 'shards' ? 1 : 0); }
    if (pr.u.simTexel) gl.uniform2f(pr.u.simTexel, 1 / S.sw, 1 / S.sh);
    return pr.u;
  }
  function blit(target) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, o.width, o.height); }
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const clear = f => { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  let time = 0;
  function reset() {
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    [S.vel.read, S.vel.write, S.press.read, S.press.write].forEach(clear);
    use('init', S.P.write); blit(S.P.write); S.P.swap();
    use('init', S.P0); blit(S.P0);
    renderBands(S.P0, S.ink.read, time, false); blit(S.ink.read);
  }
  function renderBands(src, target, t, stars) {
    const pl = SWIRL2_PALETTES[o.palette] || o.palette;
    const u = use('display', target || { w: o.width, h: o.height });
    gl.uniform1i(u.uP, tex(0, src)); gl.uniform1i(u.uInk, tex(1, S.div));   // placeholder: never sample the target
    gl.uniform1f(u.inkOn, 0); gl.uniform1f(u.starsOn, stars ? 1 : 0);
    gl.uniform1f(u.time, t); gl.uniform1f(u.freq, o.freq);
    gl.uniform1f(u.cycle, o.cycle); gl.uniform2f(u.dir, o.dir[0], o.dir[1]); gl.uniform2f(u.res, o.width, o.height);
    gl.uniform3fv(u.pal, new Float32Array(pl.pal.flatMap(hex))); gl.uniform1fv(u.seq, new Float32Array(pl.seq));
    gl.uniform1f(u.seqLen, pl.seq.length); gl.uniform3fv(u.outline, hex(pl.outline)); gl.uniform3fv(u.starC, hex(pl.star || '#f7f1e1'));
    return u;
  }

  // x,y in 0..1 (y up). force in uv/sec; spin is per-call strength; radius in uv^2
  function splat(x, y, fx, fy, spin = 0, radius = 0.0025) {
    const u = use('splat', S.vel.write);
    gl.uniform1i(u.uTarget, tex(0, S.vel.read)); gl.uniform2f(u.point, x, y);
    gl.uniform2f(u.force, fx * S.sw, fy * S.sh); gl.uniform1f(u.spin, spin * S.sh); gl.uniform1f(u.radius, radius);
    blit(S.vel.write); S.vel.swap();
  }
  let ambT = 0;
  function step(dt) {
    dt = Math.min(dt, 1 / 30); time += dt;
    const f60 = dt * 60;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    ambT += dt;
    if (o.ambient > 0) for (let i = 0; i < 3; i++) {   // three slow drifting eddies keep it alive when idle
      const t = ambT * (0.05 + i * 0.017) + i * 2.1;
      splat(0.5 + 0.35 * Math.cos(t * 1.3 + i), 0.5 + 0.32 * Math.sin(t * 0.9 + i * 2), 0, 0, (i % 2 ? -1 : 1) * 0.4 * o.ambient * dt, 0.02);
    }
    let u;
    if (o.fluids) {
      if (o.curl > 0) {
        u = use('curl', S.curl, S.vel.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); blit(S.curl);
        u = use('vort', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uCurl, tex(1, S.curl));
        gl.uniform1f(u.curl, o.curl); gl.uniform1f(u.dt, dt); blit(S.vel.write); S.vel.swap();
      }
    }
    if (o.viscosity > 0) {
      u = use('scale', S.v0); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, 1); blit(S.v0);
      for (let i = 0; i < 12; i++) {
        u = use('visc', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uV0, tex(1, S.v0));
        gl.uniform1f(u.alpha, o.viscosity * f60); blit(S.vel.write); S.vel.swap();
      }
    }
    if (o.momentum > 0) {
      u = use('branch', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read));
      gl.uniform1f(u.mom, Math.min(1, o.momentum * f60)); gl.uniform1f(u.ang, o.angularity); gl.uniform1f(u.reach, 1.5);
      blit(S.vel.write); S.vel.swap();
    }
    if (o.fluids) {
      u = use('div', S.div, S.vel.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); blit(S.div);
      u = use('scale', S.press.write); gl.uniform1i(u.uSrc, tex(0, S.press.read)); gl.uniform1f(u.k, 0.8); blit(S.press.write); S.press.swap();
      for (let i = 0; i < 24; i++) {
        u = use('press', S.press.write); gl.uniform1i(u.uP, tex(0, S.press.read)); gl.uniform1i(u.uDiv, tex(1, S.div));
        blit(S.press.write); S.press.swap();
      }
      u = use('grad', S.vel.write); gl.uniform1i(u.uP, tex(0, S.press.read)); gl.uniform1i(u.uVel, tex(1, S.vel.read)); blit(S.vel.write); S.vel.swap();
      u = use('advect', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.vel.read));
      gl.uniform1f(u.dt, dt); blit(S.vel.write); S.vel.swap();
    }
    // fluidity: per-frame retention of motion
    u = use('scale', S.vel.write); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, Math.pow(o.fluidity, f60)); blit(S.vel.write); S.vel.swap();

    const relax = 1 - Math.exp(-dt * o.heal);
    if (o.paint === 'ink') {
      renderBands(S.P0, S.fresh, time, false); blit(S.fresh);
      u = use('advectInk', S.ink.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.ink.read)); gl.uniform1i(u.uFresh, tex(2, S.fresh));
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06);
      gl.uniform1f(u.sat, Math.pow(o.saturation, f60)); gl.uniform1f(u.bright, Math.pow(o.brightness, f60)); gl.uniform1f(u.contrast, Math.pow(o.contrast, f60));
      blit(S.ink.write); S.ink.swap();
    } else {
      u = use('advectP', S.P.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.P.read));
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06);
      blit(S.P.write); S.P.swap();
    }
  }
  function render(t = time, target = null) {
    const u = renderBands(S.P.read, target, t, true);
    gl.uniform1f(u.inkOn, o.paint === 'ink' ? 1 : 0); gl.uniform1i(u.uInk, tex(1, S.ink.read));
    blit(target);
  }
  // switching paint mode: start the ink from the current bands so nothing jumps
  function set(params) {
    const wasInk = o.paint === 'ink';
    Object.assign(o, params);
    if (o.paint === 'ink' && !wasInk) { renderBands(S.P.read, S.ink.read, time, false); blit(S.ink.read); }
  }
  function resize(w, h) { o.width = w; o.height = h; alloc(); }
  alloc();
  return { step, render, splat, reset, resize, set, opts: o };
}
if (typeof window !== 'undefined') { window.createSwirl2 = createSwirl2; window.SWIRL2_PALETTES = SWIRL2_PALETTES; window.SWIRL2_PRESETS = SWIRL2_PRESETS; }
