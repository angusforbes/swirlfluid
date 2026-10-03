// swirl2.js: swirlfluid v2, the posterized swirl fluid with "fluid profile" controls.
// Builds on v1 (../swirl.js) and borrows ideas from Fluid Automata (Forbes, Höllerer, Legrady,
// "Generative fluid profiles for interactive media arts projects", CAe 2013):
//   fluidity    how long motion lasts (per-frame retention, 1 = forever)
//   viscosity   how thick it is: velocity diffuses into its neighbours (tar)
//   momentum    share of each cell's energy that branches sideways instead of flowing straight on
//   angularity  the angle of those side branches
//   energy      how far the paint is carried per unit of motion
//   grid        0: smooth fluid. N: Fluid Automata's lattice, N x N cells of vectors passing energy to their
//               neighbours, the picture warped through the lattice mesh each frame (cracks, facets)
//   memory      lattice only: how much of the last frame survives each frame (the rest is the fluid underneath)
//   carry       lattice + ink: how strongly the lattice also drags the band pattern underneath along
//   fluids      on: motion propagates (advects itself, incompressible); off: it stays where you put it
//   heal        how fast the picture relaxes back to the original pattern (the automaton's "blend")
//   facets      lattice: each triangle moves its piece of the picture rigidly (hard-edged planes) · jitter: irregular lattice
//   wash        bands drawn as watercolour (soft bleeding edges, pooled pigment, paper grain) instead of poster
//   hold        fluids off: when you stop stirring the picture freezes exactly as it is, and the next stir
//               pushes that picture on (instead of springing back to the original pattern)
//   paint       'bands': poster bands drawn from stirred coordinates (crisp forever)
//               'ink': a colour image is smeared with feedback (brightness, contrast, saturation per frame)
// Classic script: defines createSwirl2(gl, opts), SWIRL2_PALETTES, SWIRL2_PRESETS.

// what the fluid stirs: poster bands, or a noise field coloured by the palette
const SWIRL2_FILLS = ['bands', 'field', 'blobs', 'squares', 'colour noise'];
// palettes: up to 8 colours; seq = the order of colours across the bands (up to 12 steps); squares use every colour
const SWIRL2_PALETTES = {
  ocean:  { pal: ['#0d1b2a', '#1b4965', '#5fa8d3', '#f4d35e', '#ee964b', '#cae9ff', '#62b6cb', '#f95738'], seq: [0, 1, 0, 2, 1, 0, 3, 4, 0, 6, 5, 7], outline: '#08121c' },
  dusk:   { pal: ['#1d1a3a', '#4b3a78', '#c86b8a', '#f2b880', '#7a5aa6', '#ff8fab', '#ffd6a5', '#2f6690'], seq: [0, 1, 0, 2, 1, 0, 3, 4, 5, 0, 6, 7], outline: '#12102a' },
  navygold: { pal: ['#102a43', '#f0b429', '#e9e4d8', '#2f4f73', '#d9822b', '#829ab1', '#f7d070', '#9b2915'], seq: [0, 3, 0, 1, 0, 2, 3, 4, 5, 0, 6, 7], outline: '#0a1c2e' },
  wine:   { pal: ['#1a0b1a', '#4a1c34', '#e07a5f', '#f4e3c1', '#8c2f4a', '#f2a65a', '#c9ada7', '#6d597a'], seq: [0, 1, 0, 4, 0, 2, 1, 3, 5, 0, 7, 6], outline: '#100610' },
  sea:    { pal: ['#051719', '#0f3d3e', '#5fb3a1', '#f2c46d', '#1f6f6b', '#a8dadc', '#e76f51', '#2a9d8f'], seq: [0, 1, 0, 4, 0, 2, 1, 3, 7, 0, 5, 6], outline: '#020c0d' },
  ice:    { pal: ['#0a1622', '#dfeaf2', '#7fa7c4', '#294a66', '#b9d3e6', '#4a7fa8', '#f0f6fa', '#a3c4dc'], seq: [0, 3, 0, 2, 3, 0, 4, 1, 5, 0, 7, 6], outline: '#050c14' },
  cubist: { pal: ['#2b2620', '#8a6f4d', '#d2bf94', '#5d6b6a', '#a3542f', '#c9a227', '#3e5c76', '#e8dcc2'], seq: [0, 1, 3, 2, 1, 4, 3, 2, 5, 6, 7, 4], outline: '#1a1612' },
  tar:    { pal: ['#0b0907', '#2a211b', '#6b4e3a', '#c08a52', '#3d2f25', '#8c5a3c', '#e0b07a', '#4f3a2c'], seq: [0, 1, 0, 4, 1, 0, 2, 3, 7, 5, 0, 6], outline: '#050403' },
  // bright
  pop:    { pal: ['#14111f', '#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#f8f7ff'], seq: [0, 1, 2, 3, 0, 4, 5, 0, 6, 7, 3, 1], outline: '#0a0812' },
  candy:  { pal: ['#011627', '#ff4365', '#00d9c0', '#fffb46', '#7b2cbf', '#ff9f1c', '#2ec4ff', '#fdfffc'], seq: [0, 1, 2, 3, 4, 5, 0, 6, 7, 1, 3, 2], outline: '#000b14' },
  tropic: { pal: ['#0b3954', '#00a6a6', '#efca08', '#f49f0a', '#d81159', '#8f2d56', '#7ae582', '#ffe8d6'], seq: [0, 1, 2, 3, 4, 0, 5, 6, 7, 1, 2, 4], outline: '#05202f' },
  neon:   { pal: ['#0b0b16', '#39ff14', '#ff073a', '#00f0ff', '#fffc00', '#bc13fe', '#ff6ec7', '#1f1f3a'], seq: [0, 1, 7, 2, 0, 3, 7, 4, 0, 5, 6, 7], outline: '#000000' },
  jelly:  { pal: ['#2b2a4f', '#7e5bb5', '#5c72c6', '#d8637a', '#efc38e', '#ead35b', '#bdd36f', '#557258'], seq: [0, 1, 3, 2, 4, 1, 5, 6, 7, 3, 2, 4], outline: '#1c1b33' },
  // pastel
  pastel: { pal: ['#ffc8dd', '#bde0fe', '#cdb4db', '#ffafcc', '#a2d2ff', '#fdffb6', '#caffbf', '#9bf6ff'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 2, 5, 0, 4], outline: '#8d7a99' },
  sorbet: { pal: ['#f7ede2', '#f6bd60', '#f5cac3', '#84a59d', '#f28482', '#b8e0d2', '#eac4d5', '#95b8d1'], seq: [0, 1, 2, 3, 0, 4, 5, 6, 0, 7, 2, 1], outline: '#6b705c' },
  mint:   { pal: ['#e0fbfc', '#b5ead7', '#c7ceea', '#ffdac1', '#e2f0cb', '#9db4c0', '#ffb7b2', '#5c8d89'], seq: [0, 1, 2, 3, 0, 4, 5, 6, 0, 7, 1, 3], outline: '#3d5a58' },
  'light pastel': { pal: ['#f8c8dc', '#c3e8f7', '#fde2c0', '#d9c8f5', '#c8f2dc', '#fff4b8', '#f9d0c4', '#bfd8f8'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 3, 0, 4, 2], outline: '#9a8fae' },
};

const SWIRL2_PRESETS = {
  'Poster':      { fluids: true,  fluidity: 0.982, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1,  paint: 'bands' },
  'Tar':         { fluids: true,  fluidity: 0.99,  viscosity: 2.5, momentum: 0.4,  angularity: 0.785, energy: 0.3, grid: 0, curl: 0, heal: 0.02, paint: 'bands', palette: 'tar', freq: 2.6 },
  'Ice Cracks':  { fluids: false, fluidity: 1.0,   viscosity: 0,   momentum: 0,    angularity: 0,     energy: 0.25, grid: 14, curl: 0, heal: 0.05, memory: 0.92, carry: 0.6, paint: 'ink', crisp: 0.12, palette: 'ice', freq: 3.4 },
  'Cubism':      { fluids: true,  fluidity: 0.94,  viscosity: 0,   momentum: 0.3,  angularity: 0.785, energy: 0.6, grid: 8, curl: 0, heal: 0.04, memory: 0.99, carry: 0.35, facets: true, jitter: 0.32, paint: 'bands', palette: 'cubist', freq: 2.6 },
  'Silk':        { fluids: true,  fluidity: 0.99,  viscosity: 0,   momentum: 0,    angularity: 0,     energy: 0.5, grid: 13, curl: 0, heal: 0.1, memory: 0.785, carry: 0, paint: 'ink', crisp: 0.1, palette: 'navygold' },
  'Kaleidoscope':{ fluids: true,  fluidity: 0.99,  viscosity: 0,   momentum: 0.45, angularity: 0.785, energy: 1,   grid: 0, curl: 0, heal: 0.08, paint: 'bands', palette: 'dusk' },
  "Jupiter":     { fluids: true,  fluidity: 0.95,  viscosity: 0.2, momentum: 0.3, angularity: 1.571, energy: 1.2, grid: 0, curl: 10, heal: 0.06, paint: 'bands', palette: 'wine', freq: 4.2 },
  'Watercolour': { fluids: true,  fluidity: 0.985, viscosity: 0.9, momentum: 0.26, angularity: 1.18,  energy: 0.8, grid: 0, curl: 1.5, heal: 0.04, paint: 'ink', wash: true, palette: 'sea', freq: 3.2 },
  'Milky Way':   { fluids: true,  fluidity: 0.998, viscosity: 0,   momentum: 0.16, angularity: 0.785, energy: 0.8, grid: 0, curl: 6, heal: 0.02, paint: 'ink', crisp: 0.02, palette: 'ocean' },
  // Angus's picture (2026-10-02): big 8-row squares melted into soft, crisp-edged watercolour jelly
  'Jelly':       { fluids: true,  fluidity: 0.985, viscosity: 2,   momentum: 0.4,  angularity: 1.18,  energy: 0.7, grid: 0, curl: 2, heal: 0.02, paint: 'ink', wash: true, crisp: 0.1, palette: 'jelly', freq: 3.2, fill: 'squares', rows: 8 },
  // Angus's phone find (2026-10-03): fluids off, so stirring winds the squares into concentric tunnel rings
  'Wormhole':    { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0, palette: 'pop', freq: 4.9, cycle: 0.07, fill: 'squares', rows: 4 },
  // Angus's second phone find (2026-10-03): Wormhole with little carry and crisp ink: big marbled continents ringed by contour lines
  'Topography':  { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1, jitter: 0, memory: 0.985, carry: 0.2, paint: 'ink', wash: true, facets: false, crisp: 0.3, palette: 'pop', freq: 4.9, cycle: 0.07, fill: 'squares', rows: 28 },
  // Angus's third and fourth phone finds (2026-10-03), both on colour noise at 11 rows
  "Bird's Nest": { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0.27, palette: 'pop', freq: 4.9, cycle: 0.07, fill: 'colour noise', rows: 11 },
  'Sails':       { fluids: false, fluidity: 0.999, viscosity: 0.2, momentum: 0.1,  angularity: 0.576, energy: 2.5, grid: 0, curl: 1.5, heal: 0.5, jitter: 0, memory: 0.5,   carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0.3,  palette: 'sea', freq: 3.2, cycle: 0.07, fill: 'colour noise', rows: 11 },
  'Mosaic':      { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.3, grid: 0, curl: 15,  heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: true, facets: false, crisp: 0, palette: 'jelly', freq: 3.2, cycle: 0, fill: 'squares', rows: 8 },
};

function createSwirl2(gl, opts = {}) {
  const o = Object.assign({
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
    simRes: 160, coordRes: 900, palette: 'ocean', freq: 3.0, dir: [0.4, 2.2],
    swirls: [[-0.55, 0.12, 5.5, 0.75], [0.7, -0.3, -4.5, 0.6], [0.15, 0.75, 2.5, 0.4]],
    cycle: 0.07, ambient: 1, hold: true, saturation: 1, brightness: 1, contrast: 1, memory: 0.82, carry: 0.6, crisp: 0, wash: false, facets: false, jitter: 0,
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
  // integer hash for the noise fills: random everywhere (no repeating tiles)
  uint ih(uint x){ x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; x^=x>>16; return x; }
  float rnd(vec2 c, float k){ uvec2 u=uvec2(ivec2(floor(c))+ivec2(65536)); return float(ih(u.x^ih(u.y^ih(uint(k)))))/4294967295.; }
  float fbm(vec2 p){ float f=0., a=.55; for(int i=0;i<5;i++){ f+=a*vnoise(p); p=p*2.03+vec2(7.1,3.7); a*=.5; } return f; }
  mat2 rot(float a){ return mat2(cos(a),sin(a),-sin(a),cos(a)); }
  `;
  const INIT = `
  uniform vec4 sw[6]; uniform int nsw; uniform float aspect;
  vec2 swirl(vec2 p, vec4 s){ vec2 d=p-s.xy; float r=length(d);
    float an=s.z*exp(-r*r/(s.w*s.w)); return s.xy+mat2(cos(an),-sin(an),sin(an),cos(an))*d; }
  // the coordinate field stores each pixel's ORIGINAL (unswirled) position; the swirls are applied when drawing,
  // so the background can be pixelated in square cells first (resolution) and then swirled
  vec2 initP(vec2 uv){ return (uv-.5)*vec2(aspect,1.)*2.; }
  vec2 swirled(vec2 p){ for(int i=0;i<6;i++) if(i<nsw) p=swirl(p,sw[i]); return p; }
  `;
  const VELAT = `
  uniform sampler2D uVel;
  vec2 velAt(vec2 uv){ return texture(uVel,uv).xy; }`;
  const SNAP = `
  uniform vec3 pal[8]; uniform float snap, npal;
  // crisp: pull each pixel part of the way to the nearest palette colour, so smears keep hard edges instead of blurring
  vec3 crisp(vec3 c){ vec3 b=pal[0]; float bd=9.; for(int i=0;i<8;i++){ if(float(i)>=npal) break; vec3 d=c-pal[i]; float dd=dot(d,d); if(dd<bd){ bd=dd; b=pal[i]; } } return mix(c,b,snap); }
`;
  const FS = {
    init: INIT + `void main(){ o=vec4(initP(vUv),0.,1.); }`,
    advect: `uniform sampler2D uVel, uSrc; uniform vec2 simTexel; uniform float dt;
      void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*simTexel; o=texture(uSrc,c); }`,
    advectP: INIT + VELAT + `uniform sampler2D uSrc, uBase; uniform vec2 simTexel, texel; uniform float dt, relax, flow, disp, based;
      void main(){
        // fluids off: the motion field is a displacement of the original picture (stays put, no smearing)
        if(flow<.5){ vec2 q=vUv-velAt(vUv)*simTexel*disp;
          o=based>.5 ? vec4(texelFetch(uBase, ivec2(clamp(q,0.,1.)/texel), 0).xy,0.,1.) : vec4(initP(q),0.,1.); return; }
        vec2 c=vUv-dt*velAt(vUv)*simTexel;
        o=vec4(mix(texture(uSrc,c).xy, initP(vUv), relax),0.,1.); }`,
    inkFwd: VELAT + `uniform sampler2D uSrc; uniform vec2 simTexel; uniform float dt;
      void main(){ o=texture(uSrc, vUv-dt*velAt(vUv)*simTexel); }`,
    // MacCormack: forward step, backward check, correct half the error, clamp to the source texels (keeps ink sharp)
    advectInk: INIT + VELAT + SNAP + `uniform sampler2D uSrc, uFresh, uFwd; uniform vec2 simTexel, texel; uniform float dt, relax, sat, bright, contrast, flow, disp, mac;
      void main(){ vec2 d=dt*velAt(vUv)*simTexel, c=vUv-d;
        vec3 col;
        if(flow<.5) col=mix(texture(uSrc,vUv).rgb, texture(uFresh,vUv-velAt(vUv)*simTexel*disp).rgb, .2);
        else {
          vec3 fwd=texture(uFwd,vUv).rgb, back=texture(uFwd,vUv+d).rgb;
          vec3 m=fwd+.5*(texture(uSrc,vUv).rgb-back);
          vec2 p=c/texel-.5, i=floor(p);
          vec3 a=texture(uSrc,(i+.5)*texel).rgb, b=texture(uSrc,(i+vec2(1.5,.5))*texel).rgb,
               e=texture(uSrc,(i+vec2(.5,1.5))*texel).rgb, f=texture(uSrc,(i+1.5)*texel).rgb;
          m=clamp(m, min(min(a,b),min(e,f)), max(max(a,b),max(e,f)));
          if(mac<.5) m=fwd;   // smooth: plain advection (soft, rounded shapes, no speckle) instead of MacCormack
          col=mix(m, texture(uFresh,vUv).rgb, relax);
        }
        float l=dot(col,vec3(.2125,.7154,.0721));
        col=mix(vec3(l),col,sat); col*=bright; col=mix(vec3(.5),col,contrast);
        o=vec4(clamp(crisp(col),0.,1.),1.); }`,
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
    // Fluid Automata feedback: the last frame redrawn through the coarse lattice mesh, each vertex shifted by its vector
    meshP: INIT + `in vec2 vUv2; flat in vec2 vFlat; flat in float vFace; uniform float facet; vec2 uv2(){ return facet>.5 ? vUv+vFlat : vUv2; }
      uniform sampler2D uSrc; uniform float blend;
      void main(){ vec3 s=texture(uSrc,uv2()).xyz;
        // facets: a moving plane takes on its own flat light/dark tone (stored in z, carried along with the plane)
        float mv=facet>.5 ? clamp(length(vFlat)*80.,0.,1.) : 0.;
        o=vec4(mix(initP(vUv), s.xy, blend), mix(s.z, vFace-.5, mv*.25)*blend, 1.); }`,
    meshInk: SNAP + `in vec2 vUv2; flat in vec2 vFlat; flat in float vFace; uniform float facet; vec2 uv2(){ return facet>.5 ? vUv+vFlat : vUv2; }
      uniform sampler2D uSrc, uFresh; uniform float blend, sat, bright, contrast;
      void main(){ vec3 c=mix(texture(uFresh,vUv).rgb, texture(uSrc,uv2()).rgb, blend);
        c=mix(vec3(dot(c,vec3(.2125,.7154,.0721))),c,sat); c*=bright; c=mix(vec3(.5),c,contrast);
        o=vec4(clamp(crisp(c),0.,1.),1.); }`,
    display: INIT + `uniform sampler2D uP, uInk; uniform float time, freq, cycle, seqLen, inkOn, starsOn, wash, fill, cells, seed, blocky; uniform vec2 dir, res;
      uniform vec3 pal[8]; uniform float seq[12], npal; uniform vec3 outline, starC;
      vec3 colAt(float k){ int i=int(mod(k,seqLen)); return pal[int(seq[i])]; }
      void main(){
        vec3 col;
        if(inkOn>.5){
          col=texture(uInk,vUv).rgb;
          if(wash>.5){
            // watercolour on the ink: a slightly wet (blurred) wash, pigment pooling darker where colours meet,
            // granulation in the pigment, and paper grain showing through
            vec2 t=1./vec2(textureSize(uInk,0));
            vec3 l=texture(uInk,vUv-vec2(t.x,0.)*1.5).rgb, r=texture(uInk,vUv+vec2(t.x,0.)*1.5).rgb,
                 d=texture(uInk,vUv-vec2(0.,t.y)*1.5).rgb, u=texture(uInk,vUv+vec2(0.,t.y)*1.5).rgb;
            vec3 wet=(col*2.+l+r+d+u)/6.;
            float edge=length(r-l)+length(u-d);
            col=wet*(1.-.55*smoothstep(.04,.5,edge));
            float lum=dot(col,vec3(.3,.59,.11));
            col*=.9+.16*vnoise(gl_FragCoord.xy*.35)*(1.-lum*.5);
            col=mix(col,vec3(.96,.94,.88),.06);
            col*=.95+.06*hash(floor(gl_FragCoord.xy*.6));
          }
        }
        else {
          vec2 p=texture(uP,vUv).xy;
          if(blocky>.5) p=(floor(p*cells)+.5)/cells;   // resolution: one colour per cell, the cells move with the fluid
          p=swirled(p);
          // fill: 0 bands, 1 field (smooth noise), 2 blobs (posterized noise), 3 squares (a palette colour per square),
          // 4 colour noise (a random colour per square); squares are "cells" per unit of p, new every reset (seed)
          // every seed: a new offset, scale, rotation and stretch for the noise, a new wobble for the bands
          vec2 so=vec2(fract(seed*.00131),fract(seed*.00173))*97.;
          float sc=.55+1.1*fract(seed*.000713), ra=fract(seed*.000917)*6.283, st=.7+.6*fract(seed*.00057);
          vec2 pn=rot(ra)*p*vec2(st,1./st)*sc;
          float b = fill<.5 ? (dot(p,dir)+(vnoise(p*1.2+so)-.5)*(.2+.4*fract(seed*.00211)))*freq
                  : fill<2.5 ? fbm(pn*(.35+.25*freq)+so)*(2.+2.*freq)
                  : floor(rnd(p*cells,seed)*8.)+.5;
          float k=floor(b);
          // every band runs its own colour clock, so parts of the fluid change colour at different times
          float hk=hash(vec2(k*.731,3.17));
          float ph=time*cycle*(.6+.8*hk)+hk*9.;
          float sh=floor(ph);
          col=mix(colAt(k+sh), colAt(k+sh+1.), smoothstep(.97,1.,fract(ph)));
          float fr=fract(b), w=fwidth(b);
          if(fill>3.5){ vec2 c=p*cells; col=vec3(rnd(c,seed+2.),rnd(c,seed+3.),rnd(c,seed+4.)); }
          else if(fill>2.5){   // squares: one palette colour per square (any of the palette's colours), no outlines
            float kk=floor(rnd(p*cells,seed+7.)*npal); col=pal[int(mod(kk+sh,npal))]; }
          else if(fill>.5&&fill<1.5){   // field: soft gradients between the palette levels, a little paper grain
            vec3 nxt=mix(colAt(k+1.+sh), colAt(k+2.+sh), smoothstep(.97,1.,fract(ph)));
            col=mix(col,nxt,smoothstep(.15,.85,fr))*(.95+.08*vnoise(p*40.));
          } else if(wash>.5){
            // watercolour: no ink outline; the next colour bleeds in softly, pigment pools darker along each edge,
            // granulates inside the band, and paper grain shows through
            vec3 nxt=mix(colAt(k+1.+sh), colAt(k+2.+sh), smoothstep(.97,1.,fract(ph)));
            float wide=smoothstep(.35,.08,w);   // edge effects only where bands are wide enough to hold them
            col=mix(col, nxt, smoothstep(1.-max(.06,w*3.),1.,fr)*.85*wide);
            float px=min(fr,1.-fr)/max(w,1e-4);
            col*=1.-.32*exp(-px/2.5)*wide;
            col*=.9+.14*vnoise(p*9.+k);
            col*=.96+.05*hash(floor(gl_FragCoord.xy*.7));
          } else if(blocky<.5) col=mix(col,outline,smoothstep(w*1.4,0.,min(fr,1.-fr)-.015));
          float shade=texture(uP,vUv).z; col=shade>0. ? mix(col,vec3(1.,.97,.9),shade*.7) : col*(1.+shade*1.1);
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
  const meshVs = sh(gl.VERTEX_SHADER, `#version 300 es
  in vec2 a, off; uniform float offScale; out vec2 vUv, vUv2, vL, vR, vT, vB; flat out vec2 vFlat; flat out float vFace;
  void main(){ vUv=a*.5+.5; vUv2=vUv+off*offScale; vFlat=off*offScale; vFace=fract(sin(dot(a,vec2(12.9898,78.233)))*43758.5453); vL=vUv; vR=vUv; vT=vUv; vB=vUv; gl_Position=vec4(a,0.,1.); }`);
  const P = {};
  for (const [name, src] of Object.entries(FS)) {
    const p = gl.createProgram(); gl.attachShader(p, name.startsWith('mesh') ? meshVs : vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + src));
    gl.bindAttribLocation(p, 0, 'a'); gl.bindAttribLocation(p, 1, 'off'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('swirl link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    P[name] = { p, u };
  }
  const vao_ = gl.createVertexArray(), vao = vao_; gl.bindVertexArray(vao);
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
          P: dbl(cw, ch), P0: fbo(cw, ch), ink: dbl(cw, ch), fresh: fbo(cw, ch), tmp: fbo(cw, ch), baseP: fbo(cw, ch), baseInk: fbo(cw, ch),
          cw, ch, sw: sw_, sh: sh_ };
    reset();
  }
  const palArr = pl => { const a = new Float32Array(24); pl.pal.slice(0, 8).forEach((c, i) => a.set(hex(c), i * 3)); return a; };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const tex = (unit, f) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, f.t); return unit; };
  function use(name, target, texelOf) {
    const pr = P[name]; gl.useProgram(pr.p);
    const tw = texelOf || target;
    if (pr.u.texel) gl.uniform2f(pr.u.texel, 1 / tw.w, 1 / tw.h);
    if (pr.u.aspect) gl.uniform1f(pr.u.aspect, aspect());
    if (pr.u.sw) { const a = new Float32Array(24); o.swirls.slice(0, 6).forEach((s, i) => a.set(s, i * 4));
      gl.uniform4fv(pr.u.sw, a); gl.uniform1i(pr.u.nsw, o.fill && o.fill !== 'bands' ? 0 : Math.min(6, o.swirls.length)); }   // noise fills start straight
    if (pr.u.simTexel) gl.uniform2f(pr.u.simTexel, 1 / S.sw, 1 / S.sh);
    if (pr.u.facet) gl.uniform1f(pr.u.facet, o.facets ? 1 : 0);
    if (pr.u.snap && name !== 'display') { const pl = SWIRL2_PALETTES[o.palette] || o.palette;
      gl.uniform3fv(pr.u.pal, palArr(pl)); gl.uniform1f(pr.u.snap, o.crisp); gl.uniform1f(pr.u.npal, pl.pal.length); }
    return pr.u;
  }
  function blit(target) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, o.width, o.height); }
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const clear = f => { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb); gl.viewport(0, 0, f.w, f.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  let time = 0, seed = 1 + Math.floor(Math.random() * 1e5), resets = 0;
  // a fresh start: new noise, and (after the first) a new random swirl layout for the bands
  const rndSwirl = (sgn) => [(Math.random() * 2 - 1) * aspect() * 0.8, (Math.random() * 2 - 1) * 0.75, sgn * (2.5 + Math.random() * 3.5), 0.35 + Math.random() * 0.45];
  function reset() {
    seed = 1 + Math.floor(Math.random() * 1e5);
    if (resets++ && !o.fixedSwirls) {
      const n = 2 + Math.floor(Math.random() * 3); o.swirls = Array.from({ length: n }, (_, i) => rndSwirl(i % 2 ? -1 : 1));
      const a = Math.random() * Math.PI * 2, m = 1.8 + Math.random() * 0.9; o.dir = [Math.cos(a) * m, Math.sin(a) * m];
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    [S.vel.read, S.vel.write, S.press.read, S.press.write].forEach(clear);
    if (L) { L.ms.fill(0); L.os.fill(0); }
    based = frozen = false; stirred = false; idle = 0;
    use('init', S.P.write); blit(S.P.write); S.P.swap();
    use('init', S.P0); blit(S.P0);
    renderBands(S.P0, S.ink.read, time, false); blit(S.ink.read);
  }
  function renderBands(src, target, t, stars) {
    const pl = SWIRL2_PALETTES[o.palette] || o.palette;
    const u = use('display', target || { w: o.width, h: o.height });
    gl.uniform1i(u.uP, tex(0, src)); gl.uniform1i(u.uInk, tex(1, S.div));   // placeholder: never sample the target
    gl.uniform1f(u.inkOn, 0); gl.uniform1f(u.starsOn, stars && !o.wash ? 1 : 0); gl.uniform1f(u.wash, o.wash ? 1 : 0);
    gl.uniform1f(u.time, t); gl.uniform1f(u.freq, o.freq); gl.uniform1f(u.fill, Math.max(0, SWIRL2_FILLS.indexOf(o.fill)));
    const cellPx = Math.max(1, (o.cell || 1) * (o.height / Math.max(1, o.cssHeight || o.height)));   // in device pixels
    gl.uniform1f(u.seed, seed); gl.uniform1f(u.cells, o.height / 2 / cellPx); gl.uniform1f(u.blocky, cellPx > 1.5 || o.fill === 'squares' || o.fill === 'colour noise' ? 1 : 0);
    gl.uniform1f(u.cycle, o.cycle); gl.uniform2f(u.dir, o.dir[0], o.dir[1]); gl.uniform2f(u.res, o.width, o.height);
    gl.uniform3fv(u.pal, palArr(pl)); gl.uniform1f(u.npal, pl.pal.length);
    const sq = new Float32Array(12); sq.set(pl.seq.slice(0, 12)); gl.uniform1fv(u.seq, sq);
    gl.uniform1f(u.seqLen, pl.seq.length); gl.uniform3fv(u.outline, hex(pl.outline)); gl.uniform3fv(u.starC, hex(pl.star || '#f7f1e1'));
    return u;
  }

  // ---- lattice mode (grid >= 2): a port of Fluid Automata (Forbes, Hollerer, Legrady 2013) ----
  // (N+1)^2 vertices on a wrapping lattice, each holding a vector (magnitude ms, orientation os, the way the paint moves).
  // fluids on: every frame each cell's square is pushed along its vector and its energy is handed to the neighbours
  // the pushed square overlaps (straight on, plus two side branches at +-angularity). fluids off: vectors stay put.
  // The picture is redrawn through the lattice mesh with each vertex's texture coordinate shifted by its vector,
  // so the warp is piecewise-linear over triangles: that is where the cracks and facets come from.
  let L = null;
  function lattice() {
    const N = Math.max(2, Math.round(o.grid));
    if (L && L.N === N && L.jitter === o.jitter) return L;
    const nv = N + 1, n = nv * nv;
    const pos = new Float32Array(n * 2), idx = [];
    const jit = (c, r, k) => { const v = Math.sin(c * 127.1 + r * 311.7 + k * 74.7) * 43758.5453; return (v - Math.floor(v) - 0.5) * 2 * o.jitter; };
    for (let r = 0; r < nv; r++) for (let c = 0; c < nv; c++) {
      pos[(r * nv + c) * 2] = (c + (c > 0 && c < N ? jit(c, r, 1) : 0)) / N * 2 - 1;
      pos[(r * nv + c) * 2 + 1] = (r + (r > 0 && r < N ? jit(c, r, 2) : 0)) / N * 2 - 1; }
    // the last vertex of each triangle sets its flat (facet) offset: two different vertices per cell, so two facets
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const i = r * nv + c;
      if ((r + c) % 2) idx.push(i + 1, i + nv, i, i + nv, i + 1, i + nv + 1);
      else idx.push(i + nv, i + nv + 1, i, i, i + nv + 1, i + 1); }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ob = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ob); gl.bufferData(gl.ARRAY_BUFFER, n * 8, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(vao_);
    L = { N, jitter: o.jitter, nv, n, vao, ob, count: idx.length, ms: new Float32Array(n), os: new Float32Array(n), off: new Float32Array(n * 2),
          inM: new Float32Array(n * 27), inO: new Float32Array(n * 27), inN: new Uint8Array(n), acc: 0 };
    return L;
  }
  const TAU = Math.PI * 2, wrap = (v, m) => ((v % m) + m) % m;
  const angDist = (a, b) => wrap(wrap(b - a, TAU) + Math.PI * 3, TAU) - Math.PI;
  function latticeAutomaton() {
    const { nv, n, ms, os, inM, inO, inN } = L; inN.fill(0);
    const side = Math.min(1, Math.max(0, o.momentum));
    const pass = (share, turn) => {
      if (share <= 0) return;
      for (let i = 0; i < n; i++) {
        if (ms[i] === 0) continue;
        const uM = ms[i] * share, uO = os[i] + turn, sx = uM * Math.cos(uO), sy = uM * Math.sin(uO);
        const c = i % nv, r = (i / nv) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const p = Math.max(0, 1 - Math.abs(sx - dx)) * Math.max(0, 1 - Math.abs(sy - dy));   // overlap of the pushed unit square
          if (p <= 0) continue;
          const j = wrap(r + dy, nv) * nv + wrap(c + dx, nv), k = j * 27 + inN[j]++;
          inM[k] = uM * p; inO[k] = uO;
        }
      }
    };
    pass(1 - side, 0); pass(side / 2, o.angularity); pass(side / 2, -o.angularity);
    for (let i = 0; i < n; i++) {
      let nm = 0, no = os[i];
      for (let q = 0; q < inN[i]; q++) { const cm = inM[i * 27 + q], w = (cm > nm || nm === 0) ? 1 : cm / nm; no += angDist(no, inO[i * 27 + q]) * w; nm += cm; }
      ms[i] = nm; os[i] = wrap(no, TAU);
    }
  }
  function drawMesh(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h);
    gl.bindVertexArray(L.vao); gl.drawElements(gl.TRIANGLES, L.count, gl.UNSIGNED_SHORT, 0); gl.bindVertexArray(vao_);
  }
  function latticeStep(dt) {
    lattice();
    L.acc = Math.min(L.acc + dt * 60, 3);              // the automaton runs at 60 frames a second whatever the display rate
    const ink = o.paint === 'ink';
    while (L.acc >= 1) {
      L.acc -= 1;
      if (o.fluids) latticeAutomaton();
      const { n, ms, os, off } = L, e = o.energy;
      for (let i = 0; i < n; i++) { off[i * 2] = -ms[i] * e * Math.cos(os[i]); off[i * 2 + 1] = -ms[i] * e * Math.sin(os[i]); }
      gl.bindBuffer(gl.ARRAY_BUFFER, L.ob); gl.bufferSubData(gl.ARRAY_BUFFER, 0, off);
      let u;
      if (ink) {
        // the lattice also carries the band pattern underneath (healing back slowly), and the smear blends toward
        // that moving pattern, so the cracks drag the fluid with them instead of sitting on top of a still picture
        u = use('meshP', S.P.write); gl.uniform1i(u.uSrc, tex(0, S.P.read)); gl.uniform1f(u.blend, Math.exp(-o.heal / 60));
        gl.uniform1f(u.offScale, o.carry); drawMesh(S.P.write); S.P.swap();
        renderBands(S.P.read, S.fresh, time, false); blit(S.fresh);
        u = use('meshInk', S.ink.write); gl.uniform1f(u.offScale, 1); gl.uniform1i(u.uSrc, tex(0, S.ink.read)); gl.uniform1i(u.uFresh, tex(1, S.fresh));
        gl.uniform1f(u.blend, o.memory); gl.uniform1f(u.sat, o.saturation); gl.uniform1f(u.bright, o.brightness); gl.uniform1f(u.contrast, o.contrast);
        drawMesh(S.ink.write); S.ink.swap();
      } else {
        u = use('meshP', S.P.write); gl.uniform1i(u.uSrc, tex(0, S.P.read)); gl.uniform1f(u.blend, o.memory); gl.uniform1f(u.offScale, 1);
        drawMesh(S.P.write); S.P.swap();
      }
      for (let i = 0; i < n; i++) ms[i] *= o.fluidity;
    }
  }
  // pointer input on the lattice, as in Fluid Automata: dragging charges the nearest vertex (0.25) and points it
  // along the drag; hovering only turns it; spinning charges the ring around the nearest vertex tangentially
  function latticeSplat(x, y, fx, fy, spin, radius) {
    const { N, nv, ms, os } = lattice();
    const c = Math.round(x * N), r = Math.round(y * N), at = (cc, rr) => wrap(rr, nv) * nv + wrap(cc, nv);
    if (spin) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const i = at(c + dx, r + dy); os[i] = wrap(Math.atan2(dy, dx) + Math.sign(spin) * Math.PI / 2, TAU); ms[i] = Math.max(ms[i], 0.25);
      }
      return;
    }
    if (!fx && !fy) return;
    const i = at(c, r); os[i] = wrap(Math.atan2(fy, fx), TAU);
    if (radius > 0.004) ms[i] = 0.25;
  }

  // x,y in 0..1 (y up). force in uv/sec; spin is per-call strength; radius in uv^2
  function splat(x, y, fx, fy, spin = 0, radius = 0.0025, ambient = false) {
    if (!ambient) { stirred = true; idle = 0; frozen = false; }
    if (o.grid >= 2) return latticeSplat(x, y, fx, fy, spin, radius);
    const u = use('splat', S.vel.write);
    gl.uniform1i(u.uTarget, tex(0, S.vel.read)); gl.uniform2f(u.point, x, y);
    gl.uniform2f(u.force, fx * S.sw, fy * S.sh); gl.uniform1f(u.spin, spin * S.sh); gl.uniform1f(u.radius, radius);
    blit(S.vel.write); S.vel.swap();
  }
  let ambT = 0;
  // hold (fluids off): a quarter second after the last stir, keep the picture as it is: copy it as the new base the
  // motion displaces, stop all motion, and stop stepping until the next stir
  let based = false, frozen = false, stirred = false, idle = 0;
  const holds = () => o.hold && !o.fluids && o.grid < 2;
  function freeze() {
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    let u = use('scale', S.baseP); gl.uniform1i(u.uSrc, tex(0, S.P.read)); gl.uniform1f(u.k, 1); blit(S.baseP);
    u = use('scale', S.baseInk); gl.uniform1i(u.uSrc, tex(0, S.ink.read)); gl.uniform1f(u.k, 1); blit(S.baseInk);
    [S.vel.read, S.vel.write].forEach(clear);
    based = frozen = true;
  }
  function step(dt) {
    if (holds() && stirred && !frozen && ++idle > 15) freeze();
    if (frozen) return;
    dt = Math.min(dt, 1 / 30); time += dt;
    if (o.grid >= 2) { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); latticeStep(dt); return; }
    const f60 = dt * 60;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    ambT += dt;
    if (o.ambient > 0) for (let i = 0; i < 3; i++) {   // three slow drifting eddies keep it alive when idle
      const t = ambT * (0.05 + i * 0.017) + i * 2.1;
      splat(0.5 + 0.35 * Math.cos(t * 1.3 + i), 0.5 + 0.32 * Math.sin(t * 0.9 + i * 2), 0, 0, (i % 2 ? -1 : 1) * 0.4 * o.ambient * dt, 0.02, true);
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
      const useBase = based && !o.fluids;
      if (!useBase) { renderBands(S.P0, S.fresh, time, false); blit(S.fresh); }
      u = use('inkFwd', S.tmp); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.ink.read)); gl.uniform1f(u.dt, dt * o.energy); blit(S.tmp);
      u = use('advectInk', S.ink.write); gl.uniform1i(u.uFwd, tex(3, S.tmp)); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.ink.read)); gl.uniform1i(u.uFresh, tex(2, useBase ? S.baseInk : S.fresh));
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06); gl.uniform1f(u.mac, o.smooth ? 0 : 1);
      gl.uniform1f(u.sat, Math.pow(o.saturation, f60)); gl.uniform1f(u.bright, Math.pow(o.brightness, f60)); gl.uniform1f(u.contrast, Math.pow(o.contrast, f60));
      blit(S.ink.write); S.ink.swap();
    } else {
      u = use('advectP', S.P.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.P.read));
      gl.uniform1i(u.uBase, tex(2, S.baseP)); gl.uniform2f(u.texel, 1 / S.cw, 1 / S.ch); gl.uniform1f(u.based, based && !o.fluids ? 1 : 0);
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06);
      blit(S.P.write); S.P.swap();
    }
  }
  let heldT = 0;
  function render(t = time, target = null) {
    if (frozen) t = heldT; else heldT = t;
    const u = renderBands(S.P.read, target, t, true);
    gl.uniform1f(u.inkOn, o.paint === 'ink' ? 1 : 0); gl.uniform1i(u.uInk, tex(1, S.ink.read));
    blit(target);
  }
  // switching paint mode: start the ink from the current bands so nothing jumps
  function set(params) {
    const wasInk = o.paint === 'ink', fillWas = o.fill;
    Object.assign(o, params);
    if (o.fill !== fillWas) { reset(); return; }
    if (based && o.paint === 'ink' && ['palette', 'freq', 'cell', 'saturation', 'brightness', 'contrast'].some(k => k in params)) based = frozen = false;   // held ink has the old colours
    if (!holds()) frozen = false;   // the starting picture differs (noise fills start unswirled)
    if (o.paint === 'ink' && !wasInk) { renderBands(S.P.read, S.ink.read, time, false); blit(S.ink.read); }
  }
  function resize(w, h) { o.width = w; o.height = h; alloc(); }
  alloc();
  return { step, render, splat, reset, resize, set, opts: o };
}
if (typeof window !== 'undefined') { window.createSwirl2 = createSwirl2; window.SWIRL2_PALETTES = SWIRL2_PALETTES; window.SWIRL2_PRESETS = SWIRL2_PRESETS; window.SWIRL2_FILLS = SWIRL2_FILLS; }
