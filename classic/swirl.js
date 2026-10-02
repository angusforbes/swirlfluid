// swirl.js: posterized swirl fluid (WebGL2, no dependencies).
// A stable-fluids velocity field advects a "material coordinate" texture; the display shader turns those
// coordinates into flat colour bands, so the poster-style swirls get stirred by the fluid and slowly heal
// back to their original pattern. Colours cycle over time, each region on its own clock.
// Classic script: defines createSwirl(gl, opts). Also concatenated into the triptych stills.

const SWIRL_PALETTES = {
  dusk:   { pal: ['#1d1a3a', '#4b3a78', '#c86b8a', '#f2b880', '#7a5aa6'], seq: [0, 1, 0, 2, 1, 0, 3, 4], outline: '#12102a' },
  ocean:  { pal: ['#0d1b2a', '#1b4965', '#5fa8d3', '#f4d35e', '#ee964b'], seq: [0, 1, 0, 2, 1, 0, 3, 4], outline: '#08121c' },
  navygold: { pal: ['#102a43', '#f0b429', '#e9e4d8', '#2f4f73', '#d9822b'], seq: [0, 3, 0, 1, 0, 2, 3, 4], outline: '#0a1c2e' },
  wine:   { pal: ['#1a0b1a', '#4a1c34', '#e07a5f', '#f4e3c1', '#8c2f4a'], seq: [0, 1, 0, 4, 0, 2, 1, 3], outline: '#100610' },
  sea:    { pal: ['#051719', '#0f3d3e', '#5fb3a1', '#f2c46d', '#1f6f6b'], seq: [0, 1, 0, 4, 0, 2, 1, 3], outline: '#020c0d' },
};

function createSwirl(gl, opts = {}) {
  const o = Object.assign({
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
    simRes: 160, coordRes: 900, palette: 'ocean', freq: 3.0, dir: [0.4, 2.2],
    swirls: [[-0.55, 0.12, 5.5, 0.75], [0.7, -0.3, -4.5, 0.6], [0.15, 0.75, 2.5, 0.4]],
    curl: 4, velDecay: 1.1, heal: 0.1, cycle: 0.07, ambient: 1,
  }, opts);
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
  `;
  const INIT = `
  uniform vec4 sw[6]; uniform int nsw; uniform float aspect;
  vec2 swirl(vec2 p, vec4 s){ vec2 d=p-s.xy; float r=length(d);
    float an=s.z*exp(-r*r/(s.w*s.w)); return s.xy+mat2(cos(an),-sin(an),sin(an),cos(an))*d; }
  vec2 initP(vec2 uv){ vec2 p=(uv-.5)*vec2(aspect,1.)*2.;
    for(int i=0;i<6;i++) if(i<nsw) p=swirl(p,sw[i]); return p; }
  `;
  const FS = {
    init: INIT + `void main(){ o=vec4(initP(vUv),0.,1.); }`,
    advect: `uniform sampler2D uVel, uSrc; uniform vec2 simTexel; uniform float dt, diss;
      void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*simTexel; o=diss*texture(uSrc,c); }`,
    advectP: INIT + `uniform sampler2D uVel, uSrc; uniform vec2 simTexel; uniform float dt, relax;
      void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*simTexel;
        o=vec4(mix(texture(uSrc,c).xy, initP(vUv), relax),0.,1.); }`,
    splat: `uniform sampler2D uTarget; uniform vec2 point, force; uniform float radius, aspect, spin;
      void main(){ vec2 d=vUv-point; d.x*=aspect; float g=exp(-dot(d,d)/radius);
        float r2=dot(d,d);
        // whirlpool profile: fast near the centre, slowly falling off, so the bands wind into spirals
        vec2 tan_=vec2(-d.y,d.x)*radius/(r2+radius)*exp(-r2/(radius*5.));
        vec2 v=texture(uTarget,vUv).xy + force*g + spin*tan_*.6; o=vec4(v,0.,1.); }`,
    curl: `uniform sampler2D uVel;
      void main(){ float L=texture(uVel,vL).y, R=texture(uVel,vR).y, T=texture(uVel,vT).x, B=texture(uVel,vB).x;
        o=vec4(.5*(R-L-T+B),0.,0.,1.); }`,
    vort: `uniform sampler2D uVel, uCurl; uniform float curl, dt;
      void main(){ float L=texture(uCurl,vL).x, R=texture(uCurl,vR).x, T=texture(uCurl,vT).x, B=texture(uCurl,vB).x, C=texture(uCurl,vUv).x;
        vec2 f=.5*vec2(abs(T)-abs(B), abs(R)-abs(L)); f/=length(f)+1e-4; f*=curl*C; f.y*=-1.;
        o=vec4(texture(uVel,vUv).xy+f*dt,0.,1.); }`,
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
    display: `uniform sampler2D uP; uniform float time, freq, cycle, seqLen; uniform vec2 dir, res;
      uniform vec3 pal[5]; uniform float seq[8]; uniform vec3 outline, starC;
      vec3 colAt(float k){ int i=int(mod(k,seqLen)); return pal[int(seq[i])]; }
      void main(){
        vec2 p=texture(uP,vUv).xy;
        float b=(dot(p,dir)+(vnoise(p*1.2)-.5)*.35)*freq;
        float k=floor(b);
        // every band runs its own colour clock, so parts of the fluid change colour at different times
        float hk=hash(vec2(k*.731,3.17));
        float ph=time*cycle*(.6+.8*hk)+hk*9.;
        float sh=floor(ph);
        vec3 col=mix(colAt(k+sh), colAt(k+sh+1.), smoothstep(.97,1.,fract(ph)));
        float fr=fract(b), w=fwidth(b);
        col=mix(col,outline,smoothstep(w*1.4,0.,min(fr,1.-fr)-.015));
        // stars: fixed in the sky, twinkling, only over dark paint
        vec2 g=gl_FragCoord.xy/res.y*14.; vec2 i=floor(g), f=fract(g)-.5;
        float rr=hash(i); vec2 q=abs(f-(vec2(hash(i+2.),hash(i+9.))-.5)*.5);
        float sz=(.06+.12*hash(i+4.))*(.75+.25*sin(time*(1.+2.*hash(i+5.))+rr*40.));
        float px=1.2/(res.y/14.);
        float star=max(smoothstep(px,0.,q.x)*smoothstep(sz,0.,q.y), smoothstep(px,0.,q.y)*smoothstep(sz,0.,q.x));
        star=max(star, smoothstep(.035,.02,length(q)));
        float dark=1.-smoothstep(.12,.22,dot(col,vec3(.3,.59,.11)));
        col=mix(col,starC,step(.86,rr)*star*dark);
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
    S = { vel: dbl(sw_, sh_), press: dbl(sw_, sh_), div: fbo(sw_, sh_), curl: fbo(sw_, sh_), P: dbl(cw, ch), sw: sw_, sh: sh_ };
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
    return pr.u;
  }
  function blit(target) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, o.width, o.height); }
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const clear = f => { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  function reset() {
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    [S.vel.read, S.vel.write, S.press.read, S.press.write].forEach(clear);
    use('init', S.P.write); blit(S.P.write); S.P.swap();
  }
  const simTexel = (u) => gl.uniform2f(u.simTexel, 1 / S.sw, 1 / S.sh);

  // x,y in 0..1 (y up). force in uv/sec, spin in rad-ish units; radius in uv^2
  function splat(x, y, fx, fy, spin = 0, radius = 0.0025) {
    const u = use('splat', S.vel.write);
    gl.uniform1i(u.uTarget, tex(0, S.vel.read)); gl.uniform2f(u.point, x, y);
    gl.uniform2f(u.force, fx * S.sw, fy * S.sh); gl.uniform1f(u.spin, spin * S.sh); gl.uniform1f(u.radius, radius);
    blit(S.vel.write); S.vel.swap();
  }
  let ambT = 0;
  function step(dt) {
    dt = Math.min(dt, 1 / 30);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    ambT += dt;
    if (o.ambient > 0) for (let i = 0; i < 3; i++) {   // three slow drifting eddies keep it alive when idle
      const t = ambT * (0.05 + i * 0.017) + i * 2.1;
      splat(0.5 + 0.35 * Math.cos(t * 1.3 + i), 0.5 + 0.32 * Math.sin(t * 0.9 + i * 2), 0, 0, (i % 2 ? -1 : 1) * 0.4 * o.ambient * dt, 0.02);
    }
    let u = use('curl', S.curl, S.vel.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); blit(S.curl);
    u = use('vort', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uCurl, tex(1, S.curl));
    gl.uniform1f(u.curl, o.curl); gl.uniform1f(u.dt, dt); blit(S.vel.write); S.vel.swap();
    u = use('div', S.div, S.vel.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); blit(S.div);
    u = use('scale', S.press.write); gl.uniform1i(u.uSrc, tex(0, S.press.read)); gl.uniform1f(u.k, 0.8); blit(S.press.write); S.press.swap();
    for (let i = 0; i < 24; i++) {
      u = use('press', S.press.write); gl.uniform1i(u.uP, tex(0, S.press.read)); gl.uniform1i(u.uDiv, tex(1, S.div));
      blit(S.press.write); S.press.swap();
    }
    u = use('grad', S.vel.write); gl.uniform1i(u.uP, tex(0, S.press.read)); gl.uniform1i(u.uVel, tex(1, S.vel.read)); blit(S.vel.write); S.vel.swap();
    u = use('advect', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.vel.read));
    simTexel(u); gl.uniform1f(u.dt, dt); gl.uniform1f(u.diss, Math.exp(-dt * o.velDecay)); blit(S.vel.write); S.vel.swap();
    u = use('advectP', S.P.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.P.read));
    simTexel(u); gl.uniform1f(u.dt, dt); gl.uniform1f(u.relax, 1 - Math.exp(-dt * o.heal)); blit(S.P.write); S.P.swap();
  }
  function render(time, target = null) {
    const pl = SWIRL_PALETTES[o.palette] || o.palette;
    const u = use('display', target || { w: o.width, h: o.height });
    gl.uniform1i(u.uP, tex(0, S.P.read)); gl.uniform1f(u.time, time); gl.uniform1f(u.freq, o.freq);
    gl.uniform1f(u.cycle, o.cycle); gl.uniform2f(u.dir, o.dir[0], o.dir[1]); gl.uniform2f(u.res, o.width, o.height);
    gl.uniform3fv(u.pal, new Float32Array(pl.pal.flatMap(hex))); gl.uniform1fv(u.seq, new Float32Array(pl.seq));
    gl.uniform1f(u.seqLen, pl.seq.length); gl.uniform3fv(u.outline, hex(pl.outline)); gl.uniform3fv(u.starC, hex(pl.star || '#f7f1e1'));
    blit(target);
  }
  function resize(w, h) { o.width = w; o.height = h; alloc(); }
  alloc();
  return { step, render, splat, reset, resize, opts: o };
}
if (typeof window !== 'undefined') { window.createSwirl = createSwirl; window.SWIRL_PALETTES = SWIRL_PALETTES; }
