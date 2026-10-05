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
//   grain       wash only: pigment granulation and paper grain (off: solid colours, the soft pooled edges stay)
//   outline     a thin black line (one pixel) around every colour region of the finished picture; the colours inside stay clean
//   paint       'bands': poster bands drawn from stirred coordinates (crisp forever)
//               'ink': a colour image is smeared with feedback (brightness, contrast, saturation per frame)
// Classic script: defines createSwirl2(gl, opts), SWIRL2_PALETTES, SWIRL2_PRESETS.

// what the fluid stirs: poster bands, or a noise field coloured by the palette
const SWIRL2_FILLS = ['bands', 'field', 'blobs', 'squares', 'mixed squares', 'colour noise', 'image'];
// the shader's fill number for each (mixed squares are squares in mixed sizes: big ones split at random, 67%)
const FILL_NUM = { bands: 0, field: 1, blobs: 2, squares: 3, 'mixed squares': 3, 'colour noise': 4, image: 5 };
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
  food:   { pal: ['#d7262e', '#ffcc00', '#1d4fd8', '#1d9a48', '#ff4f9a', '#7a3dc2', '#ff7a00', '#00a3b4'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3], outline: '#1a1a1a' },
  pop:    { pal: ['#14111f', '#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0', '#f8f7ff'], seq: [0, 1, 2, 3, 0, 4, 5, 0, 6, 7, 3, 1], outline: '#0a0812' },
  candy:  { pal: ['#011627', '#ff4365', '#00d9c0', '#fffb46', '#7b2cbf', '#ff9f1c', '#2ec4ff', '#fdfffc'], seq: [0, 1, 2, 3, 4, 5, 0, 6, 7, 1, 3, 2], outline: '#000b14' },
  tropic: { pal: ['#0b3954', '#00a6a6', '#efca08', '#f49f0a', '#d81159', '#8f2d56', '#7ae582', '#ffe8d6'], seq: [0, 1, 2, 3, 4, 0, 5, 6, 7, 1, 2, 4], outline: '#05202f' },
  neon:   { pal: ['#0b0b16', '#39ff14', '#ff073a', '#00f0ff', '#fffc00', '#bc13fe', '#ff6ec7', '#1f1f3a'], seq: [0, 1, 7, 2, 0, 3, 7, 4, 0, 5, 6, 7], outline: '#000000' },
  jelly:  { pal: ['#2b2a4f', '#7e5bb5', '#5c72c6', '#d8637a', '#efc38e', '#ead35b', '#bdd36f', '#557258'], seq: [0, 1, 3, 2, 4, 1, 5, 6, 7, 3, 2, 4], outline: '#1c1b33' },
  // high contrast (Angus 2026-10-04): bands alternate dark and light so every edge is hard
  contrast: { hard: true, pal: ['#000000', '#ffffff', '#ff1a1a', '#ffd400', '#0033ff', '#00c853', '#ff2bd6', '#00e5ff'], seq: [0, 2, 1, 4, 0, 3, 1, 5, 0, 6, 1, 7], outline: '#000000' },
  'black & white': { hard: true, pal: ['#000000', '#ffffff', '#000000', '#ffffff', '#000000', '#ffffff', '#000000', '#ffffff'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3], outline: '#000000' },
  'ink & paper': { hard: true, pal: ['#050505', '#fbfaf6', '#14110e', '#e9e4d8', '#0c1016', '#f2f5f8', '#22201e', '#dcd8cf'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 2, 1, 0, 5], outline: '#000000' },
  greys: { hard: true, pal: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff'], seq: [0, 4, 7, 2, 5, 1, 6, 3, 0, 5, 2, 7], outline: '#000000' },
  // pastel
  pastel: { pal: ['#ffc8dd', '#bde0fe', '#cdb4db', '#ffafcc', '#a2d2ff', '#fdffb6', '#caffbf', '#9bf6ff'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 2, 5, 0, 4], outline: '#8d7a99' },
  sorbet: { pal: ['#f7ede2', '#f6bd60', '#f5cac3', '#84a59d', '#f28482', '#b8e0d2', '#eac4d5', '#95b8d1'], seq: [0, 1, 2, 3, 0, 4, 5, 6, 0, 7, 2, 1], outline: '#6b705c' },
  mint:   { pal: ['#e0fbfc', '#b5ead7', '#c7ceea', '#ffdac1', '#e2f0cb', '#9db4c0', '#ffb7b2', '#5c8d89'], seq: [0, 1, 2, 3, 0, 4, 5, 6, 0, 7, 1, 3], outline: '#3d5a58' },
  'light pastel': { pal: ['#f8c8dc', '#c3e8f7', '#fde2c0', '#d9c8f5', '#c8f2dc', '#fff4b8', '#f9d0c4', '#bfd8f8'], seq: [0, 1, 2, 3, 4, 5, 6, 7, 3, 0, 4, 2], outline: '#9a8fae' },
};

const SWIRL2_PRESETS = {
  'Poster':      { fluids: true,  fluidity: 0.982, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1,  paint: 'bands' },
  'Tar':         { fluids: true,  fluidity: 0.99,  viscosity: 2.5, momentum: 0.4,  angularity: 0.785, energy: 0.3, grid: 0, curl: 0, heal: 0.02, paint: 'bands', palette: 'tar', freq: 2.6 },
  // (lattice, hidden for now) 'Ice Cracks':  { fluids: false, fluidity: 1.0,   viscosity: 0,   momentum: 0,    angularity: 0,     energy: 0.25, grid: 14, curl: 0, heal: 0.05, memory: 0.92, carry: 0.6, paint: 'ink', crisp: 0.12, palette: 'ice', freq: 3.4 },
  // (lattice, hidden for now) 'Cubism':      { fluids: true,  fluidity: 0.94,  viscosity: 0,   momentum: 0.3,  angularity: 0.785, energy: 0.6, grid: 8, curl: 0, heal: 0.04, memory: 0.99, carry: 0.35, facets: true, jitter: 0.32, paint: 'bands', palette: 'cubist', freq: 2.6 },
  // (lattice, hidden for now) 'Silk':        { fluids: true,  fluidity: 0.99,  viscosity: 0,   momentum: 0,    angularity: 0,     energy: 0.5, grid: 13, curl: 0, heal: 0.1, memory: 0.785, carry: 0, paint: 'ink', crisp: 0.1, palette: 'navygold' },
  'Kaleidoscope':{ fluids: true,  fluidity: 0.99,  viscosity: 0,   momentum: 0.45, angularity: 0.785, energy: 1,   grid: 0, curl: 0, heal: 0.08, paint: 'bands', palette: 'dusk' },
  "Jupiter":     { fluids: true,  fluidity: 0.95,  viscosity: 0.2, momentum: 0.3, angularity: 1.571, energy: 1.2, grid: 0, curl: 10, heal: 0.06, paint: 'bands', palette: 'wine', freq: 4.2 },
  'Watercolour': { fluids: true,  fluidity: 0.985, viscosity: 0.9, momentum: 0.26, angularity: 1.18,  energy: 0.8, grid: 0, curl: 1.5, heal: 0.04, paint: 'ink', wash: true, palette: 'sea', freq: 3.2 },
  'Milky Way':   { fluids: true,  fluidity: 0.998, viscosity: 0,   momentum: 0.16, angularity: 0.785, energy: 0.8, grid: 0, curl: 6, heal: 0.02, paint: 'ink', crisp: 0.02, palette: 'ocean' },
  // Angus's picture (2026-10-02): big 8-row squares melted into soft, crisp-edged watercolour jelly
  'Jelly':       { fluids: true,  fluidity: 0.985, viscosity: 2,   momentum: 0.4,  angularity: 1.18,  energy: 0.7, grid: 0, curl: 2, heal: 0.02, paint: 'ink', wash: true, crisp: 0.1, palette: 'jelly', freq: 3.2, fill: 'squares', rows: 8 },
  // Angus's phone find (2026-10-03): fluids off, so stirring winds the squares into concentric tunnel rings
  'Wormhole':    { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'squares', rows: 4 },
  // Angus's second phone find (2026-10-03): Wormhole with little carry and crisp ink: big marbled continents ringed by contour lines
  'Topography':  { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1, jitter: 0, memory: 0.985, carry: 0.2, paint: 'ink', wash: true, facets: false, crisp: 0.3, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'squares', rows: 28 },
  // Angus's third and fourth phone finds (2026-10-03), both on colour noise at 11 rows
  "Bird's Nest": { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0.27, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'colour noise', rows: 11 },
  'Sails':       { fluids: false, fluidity: 0.999, viscosity: 0.2, momentum: 0.1,  angularity: 0.576, energy: 2.5, grid: 0, curl: 1.5, heal: 0.5, jitter: 0, memory: 0.5,   carry: 1.5, paint: 'ink', wash: true, facets: false, crisp: 0.3,  palette: 'sea', freq: 3.2, fadeMin: 8, fadeMax: 22, fill: 'colour noise', rows: 11 },
  'Mosaic':      { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.3, grid: 0, curl: 15,  heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: true, facets: false, crisp: 0, palette: 'jelly', freq: 3.2, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 2, grain: false },
  // Mosaic that stays put: the picture is the squares displaced by the motion, so keep the motion exactly
  // as you leave it (fluidity 1: no fading, and no idle eddies) and the picture stays
  'Sanka 2':     { fluids: false, fluidity: 1,     viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.3, grid: 0, curl: 15,  heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: true, facets: false, crisp: 0, palette: 'jelly', freq: 3.2, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 8, grain: false },
  // Angus's phone find: candy squares, everything off, thick branching motion at full energy
  'Cosmic':      { fluids: false, fluidity: 0.995, viscosity: 3,   momentum: 1,    angularity: 0,     energy: 2.5, grid: 0, curl: 0,   heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'candy', freq: 2.4, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 10 },
  // Angus's phone find: Wormhole's motion, thicker, in plain pop squares (5 rows), ink and wash off, colours fading
  'Al Held':     { fluids: false, fluidity: 0.999, viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'squares', rows: 5 },
  // Al Held that stays where you put it, like Mosaic (Angus): fluidity 1 (no fading, no idle eddies) and instant
  // thickness (each push is broad and soft the moment you make it; nothing creeps or stops abruptly); colours still fade
  // Angus 2026-10-05: "drops of food colouring into water or milk": tap to drop colour onto milk, drag to marble it
  // Angus 2026-10-05: ink dropped into a dish of water, from above: tap to drop, it blooms and curls by itself
  'Ink in Water':{ fluids: true,  fluidity: 0.985, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 3,   heal: 0, jitter: 0, ambient: 0.15, paint: 'bands', palette: 'food', fadeMin: 0, fill: 'squares', water: true, drops: true },
  // pour (2026-10): press and hold (not just a tap) to keep pouring ink while you drag, like moving a pipette over the water
  // (hidden 2026-10-05, Angus) 'Ink Ribbons': { fluids: true,  fluidity: 0.985, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 3,   heal: 0, jitter: 0, ambient: 0.15, paint: 'bands', palette: 'food', fadeMin: 0, fill: 'squares', water: true, drops: true, pour: true },
  // Angus 2026-10-06, render-only: Ink in Water seen through a shallow glass dish (shadow, caustic shimmer, a gentle highlight); the ink itself moves exactly as it does in Ink in Water
  // (hidden 2026-10-05, Angus) 'Glass Dish': { fluids: true,  fluidity: 0.985, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 3,   heal: 0, jitter: 0, ambient: 0.15, paint: 'bands', palette: 'food', fadeMin: 0, fill: 'squares', water: true, drops: true, dish: true },
  // Angus 2026-10-05: Mandala: Ink in Water in a kaleidoscope (6 copies, each mirrored): every drop and stir is repeated around the centre
  // (hidden 2026-10-05, Angus) 'Mandala':     { fluids: true,  fluidity: 0.985, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 3,   heal: 0, jitter: 0, ambient: 0, paint: 'bands', palette: 'food', fadeMin: 0, fill: 'squares', water: true, drops: true, sym: 6, symMirror: true, dropSize: 0.06 },
  // the other families in a kaleidoscope (Angus 2026-10-05: "a few different mandala versions")
  'Mosaic Mandala':{ fluids: false, fluidity: 1,   viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 4, sym: 6, symMirror: true },
  // (hidden 2026-10-05, Angus) 'Fluid Mandala':{ fluids: true,  fluidity: 0.982, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4, heal: 0.1,  paint: 'bands', palette: 'candy', sym: 6, symMirror: true },
  // Angus 2026-10-06, fountains: Ink in Water with 3 little springs already pouring colour and push, so it keeps
  // blooming and curling on its own without a single tap; taps and drags still work as in Ink in Water
  // (hidden 2026-10-05, Angus) 'Springs':     { fluids: true,  fluidity: 0.985, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 3,   heal: 0, jitter: 0, ambient: 0.1, paint: 'bands', palette: 'tropic', fadeMin: 0, fill: 'squares', water: true, drops: true, fountains: true, fountainStrength: 1, startFountains: 3 },
  // (hidden 2026-10-05, Angus) 'Milk Drops':  { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 0.15,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'food', freq: 4.9, fadeMin: 0, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, compose: true, drops: true, milk: true },
  'Mosaic 2':    { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6 },   // starts as if you pressed n, then m 6 times
  // Angus 2026-10-06, render-only: Mosaic 2 lit as raised glossy paint / enamel; the motion and squares are exactly Mosaic 2's
  'Enamel':      { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, gloss: 0.7 },
  // a pair to compare (Angus): high energy, fluids off. jag1 follows the motion with straight lines between its grid
  // points (sawtooth edges where it bends hard); jag2 is the same with smooth on (cubic B-spline)
  // fold (2026-10-05): Mosaic and Mosaic 2 drawn through the folding triangle mesh (straight-edged shards); hidden, the fold button stays
  // (hidden 2026-10-05, Angus: "don't work so well") 'Shards':      { fluids: false, fluidity: 0.999, viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.3, grid: 0, curl: 15,  heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: true, facets: false, crisp: 0, palette: 'jelly', freq: 3.2, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 2, grain: false, fold: true, foldRows: 12 },
  // (hidden 2026-10-05, Angus: "don't work so well") 'Shards 2':    { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, fold: true, foldRows: 16 },
  // compose and motion colour (2026-10-05): Mosaic 2 where each stroke drags the picture as it is now, and Mosaic 2
  // coloured by its motion (rings around every whirl, crossings where they meet)
  'Smudge':      { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, compose: true },
  'Contours':    { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, motion: 1 },
  // more of them (2026-10-05): rings only over the squares; pinwheels; Smudge with no thickness (moves only while you
  // stroke) on Mosaic's big squares; Smudge with rings riding on the smears
  'Topography 2':{ fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, motion: 0.6, motionRings: 3, motionSectors: 0 },
  'Compass':     { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, motion: 1, motionRings: 1, motionSectors: 12 },
  // (hidden 2026-10-05, Angus) 'Smudge 2':    { fluids: false, fluidity: 1,     viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1.3, grid: 0, curl: 15,  heal: 0,   jitter: 0, memory: 0.99,  carry: 0,   paint: 'bands', wash: true, facets: false, crisp: 0, palette: 'jelly', freq: 3.2, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 2, grain: false, compose: true },
  // Angus 2026-10-05 "smudge squares": Smudge from the clean squares (no start stir), no thickness, so each stroke
  // smears the squares only while you drag and the rest stay crisp
  // (hidden 2026-10-05, Angus) 'Smudge Squares':{ fluids: false, fluidity: 1,   viscosity: 0,   momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 0,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, compose: true, box: true, axisSnap: true },
  'Smudge Rings':{ fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, compose: true, motion: 0.5 },
  'jag1':        { fluids: false, fluidity: 0.9999, viscosity: 0, momentum: 0, angularity: 0, energy: 2.5, grid: 0, curl: 0, heal: 0, jitter: 0, memory: 0.99, carry: 0, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'sorbet', freq: 2.4, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 3, spline: false },
  'jag2':        { fluids: false, fluidity: 0.9999, viscosity: 0, momentum: 0, angularity: 0, energy: 2.5, grid: 0, curl: 0, heal: 0, jitter: 0, memory: 0.99, carry: 0, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'sorbet', freq: 2.4, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 3, spline: true },
  // test pair for the sharpest PNG (Angus 2026-10-04): Mosaic 2 and jag2 exactly, plus smoothPng: Save PNG draws the
  // picture at 3x and averages it back down, so square edges come out smooth instead of stair-stepped (screen unchanged).
  // Since then every preset saves this way (smoothPng: true in index.html's BASE), so these now equal Mosaic 2 / jag2
  'Mosaic 3':    { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, smoothPng: true },
  'jag3':        { fluids: false, fluidity: 0.9999, viscosity: 0, momentum: 0, angularity: 0, energy: 2.5, grid: 0, curl: 0, heal: 0, jitter: 0, memory: 0.99, carry: 0, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'sorbet', freq: 2.4, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 3, spline: true, smoothPng: true },
  // fx: colour split / hair streaks, each a post pass on the finished picture along the local flow velocity (off by
  // default everywhere else). Prism Flow: Mosaic 2's motion with full colour split so every whirl trails a rainbow
  // fringe. Fur: Al Held's branching motion combed into fine hair streaks, like brushed fur, no colour split
  'Prism Flow':  { fluids: false, fluidity: 1,     viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'pop', freq: 4.9, fadeMin: 8, fadeMax: 22, fill: 'mixed squares', rows: 5, instant: true, startStir: 6, split: 1 },
  // (hidden 2026-10-05, Angus) 'Fur':         { fluids: false, fluidity: 0.999, viscosity: 1.4, momentum: 0,    angularity: 0,     energy: 1,   grid: 0, curl: 4,   heal: 0.1, jitter: 0, memory: 0.985, carry: 1.5, paint: 'bands', wash: false, facets: false, outline: false, grain: false, crisp: 0, palette: 'tar', freq: 4.9, fadeMin: 0, fadeMax: 0, fill: 'squares', rows: 5, hair: 1 },
};

function createSwirl2(gl, opts = {}) {
  const o = Object.assign({
    width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
    simRes: 160, coordRes: 900, palette: 'ocean', freq: 3.0, dir: [0.4, 2.2],
    swirls: [[-0.55, 0.12, 5.5, 0.75], [0.7, -0.3, -4.5, 0.6], [0.15, 0.75, 2.5, 0.4]],
    fadeMin: 8, fadeMax: 22, ambient: 1, saturation: 1, brightness: 1, contrast: 1, memory: 0.82, carry: 0.6, crisp: 0, driftSpin: 0.5, driftPush: 0.3, wash: false, facets: false, jitter: 0,
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
  // pxs: the export scale (Save PNG at 2x draws the same picture with twice the pixels); FC = the pixel position as
  // if on screen, so grain and other per-pixel textures keep their size. Unset (0) = 1
  uniform float pxs;
  #define FC (gl_FragCoord.xy/max(pxs,1.))
  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  // outside: colours the stirring pulled in from beyond the screen (revealed) drawn differently from colours that
  // were on screen and moved (the main motion, the same with ink on or off). mode 1 dimmed, 2 grey, 3 washed, 4 solid black, 5 solid white
  vec3 outsideStyle(vec3 c, float a, float mode){ if(mode<.5||a<=0.) return c;
    vec3 s = mode>4.5 ? vec3(1.) : mode>3.5 ? vec3(0.) : mode<1.5 ? c*.38 : mode<2.5 ? vec3(dot(c,vec3(.3,.59,.11)))*.85+.06
      : mix(c, vec3(.96,.94,.9), .5)*(.86+.22*vnoise(FC*.33))*(.95+.08*hash(floor(FC*.7)));
    return mix(c, s, a); }
  // integer hash for the noise fills: random everywhere (no repeating tiles)
  uint ih(uint x){ x^=x>>16; x*=0x7feb352du; x^=x>>15; x*=0x846ca68bu; x^=x>>16; return x; }
  float rnd(vec2 c, float k){ uvec2 u=uvec2(ivec2(floor(c))+ivec2(65536)); return float(ih(u.x^ih(u.y^ih(uint(k)))))/4294967295.; }
  float fbm(vec2 p){ float f=0., a=.55; for(int i=0;i<5;i++){ f+=a*vnoise(p); p=p*2.03+vec2(7.1,3.7); a*=.5; } return f; }
  mat2 rot(float a){ return mat2(cos(a),sin(a),-sin(a),cos(a)); }
  `;
  const INIT = `
  uniform vec4 sw[6]; uniform int nsw; uniform float aspect, zA; uniform vec2 zB;
  vec2 swirl(vec2 p, vec4 s){ vec2 d=p-s.xy; float r=length(d);
    float an=s.z*exp(-r*r/(s.w*s.w)); return s.xy+mat2(cos(an),-sin(an),sin(an),cos(an))*d; }
  // the coordinate field stores each pixel's ORIGINAL (unswirled) position; the swirls are applied when drawing,
  // so the background can be pixelated in square cells first (resolution) and then swirled
  // zoom (diving in): the screen shows the region zA*uv+zB of the original picture
  vec2 initP(vec2 uv){ return (zA*uv+zB-.5)*vec2(aspect,1.)*2.; }
  vec2 swirled(vec2 p){ for(int i=0;i<6;i++) if(i<nsw) p=swirl(p,sw[i]); return p; }
  `;
  // the drop label of the map (w; 1 = none), from the nearest pixel (never blended)
  const LABEL = `
  float label(sampler2D s, vec2 uv){ ivec2 z=textureSize(s,0); return texelFetch(s, clamp(ivec2(uv*vec2(z)),ivec2(0),z-1), 0).w; }`;
  const VELAT = `
  uniform sampler2D uVel;
  vec2 velAt(vec2 uv){ return texture(uVel,uv).xy; }`;
  // spline (off by default, so presets look as they always did): with fluids off, look the motion up with a cubic
  // B-spline instead of straight lines between grid points. Straight-line lookup bends at every grid line; high
  // energy magnifies those bends into sawtooth edges. The B-spline bends smoothly (4 linear taps)
  const BSPL = `uniform float spline;
  vec2 velS(vec2 uv){
    if(spline<.5) return velAt(uv);
    vec2 st=uv/simTexel-.5, i=floor(st), f=st-i, f2=f*f, f3=f2*f;
    vec2 w0=(1.-3.*f+3.*f2-f3)/6., w1=(4.-6.*f2+3.*f3)/6., w2=(1.+3.*f+3.*f2-3.*f3)/6., w3=f3/6.;
    vec2 g0=w0+w1, g1=w2+w3, h0=(i-.5+w1/g0)*simTexel, h1=(i+1.5+w3/g1)*simTexel;
    return g0.y*(g0.x*velAt(h0)+g1.x*velAt(vec2(h1.x,h0.y)))+g1.y*(g0.x*velAt(vec2(h0.x,h1.y))+g1.x*velAt(h1)); }
  `;
  const SNAP = `
  uniform vec3 pal[8]; uniform float snap, npal;
  // crisp: pull each pixel part of the way to the nearest palette colour, so smears keep hard edges instead of blurring
  // f: the colour the picture is drifting towards (colour fade fades between palette colours); it counts as a
  // palette colour, so in-between colours of a fade are kept instead of snapping (which made the fade blink)
  vec3 crisp(vec3 c, vec3 f){ vec3 b=f; float bd=dot(c-f,c-f); for(int i=0;i<8;i++){ if(float(i)>=npal) break; vec3 d=c-pal[i]; float dd=dot(d,d); if(dd<bd){ bd=dd; b=pal[i]; } } return mix(c,b,snap); }
`;
  const FS = {
    init: INIT + `void main(){ o=vec4(initP(vUv),0.,1.); }`,
    // dive: everything grows outward from zc by zs (what was at zc+(uv-zc)/zs is now at uv); motion grows with it
    // (mul scales the vectors). What comes in from outside (zooming out) is taken from uFb, or nothing
    zoomTex: `uniform sampler2D uSrc, uFb; uniform vec2 zc; uniform float zs, fb; uniform vec4 mul;
      void main(){ vec2 y=zc+(vUv-zc)/zs;
        if(any(lessThan(y,vec2(0.)))||any(greaterThan(y,vec2(1.)))) o = fb>.5 ? texture(uFb,vUv) : vec4(0.,0.,0.,1.);
        else o=texture(uSrc,y)*mul; }`,
    // dive for the stirred coordinates: keep the map, grow how far each point was carried (by zs, from zc)
    zoomP: INIT + `uniform sampler2D uSrc, uFb; uniform vec2 zc; uniform float zs, fb;
      void main(){ vec2 y=zc+(vUv-zc)/zs; vec4 s=texture(uSrc,clamp(y,0.,1.));
        bool out_=any(lessThan(y,vec2(0.)))||any(greaterThan(y,vec2(1.)));
        o=vec4(out_ ? initP(vUv) : initP(vUv)+(s.xy-initP(y))*zs, out_ ? 0. : s.z, 1.); }`,
    advect: `uniform sampler2D uVel, uSrc; uniform vec2 simTexel; uniform float dt;
      void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*simTexel; o=texture(uSrc,c); }`,
    advectP: INIT + VELAT + LABEL + `uniform sampler2D uSrc; uniform vec2 simTexel; uniform float dt, relax, flow, disp;` + BSPL + `
      void main(){
        // fluids off: the motion field is a displacement of the original picture (stays put, no smearing)
        if(flow<.5){ o=vec4(initP(vUv-velS(vUv)*simTexel*disp),0.,1.); return; }
        vec2 c=vUv-dt*velAt(vUv)*simTexel;
        o=vec4(mix(texture(uSrc,c).xy, initP(vUv), relax),0.,label(uSrc,c)); }`,
    inkFwd: VELAT + `uniform sampler2D uSrc; uniform vec2 simTexel; uniform float dt;
      void main(){ o=texture(uSrc, vUv-dt*velAt(vUv)*simTexel); }`,
    // MacCormack: forward step, backward check, correct half the error, clamp to the source texels (keeps ink sharp)
    advectInk: INIT + VELAT + SNAP + `uniform sampler2D uSrc, uFresh, uFwd; uniform vec2 simTexel, texel; uniform float dt, relax, sat, bright, contrast, flow, disp, mac, reveal;` + BSPL + `
      void main(){ vec2 d=dt*velAt(vUv)*simTexel, c=vUv-d;
        vec3 col;
        vec3 fr=vec3(9.); float ins=1.;   // ins (the ink's alpha): how much of this pixel was on screen (inside), carried like the colour
        if(flow<.5){ vec2 lu=vUv-velS(vUv)*simTexel*disp, e=max(-lu, lu-1.); float ao=clamp(max(e.x,e.y)*300.,0.,1.);
          fr=outsideStyle(texture(uFresh,lu).rgb, ao, reveal); vec4 s0=texture(uSrc,vUv); col=mix(s0.rgb, fr, .2); ins=mix(s0.a, 1.-ao, .2); }
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
        o=vec4(clamp(crisp(col,fr),0.,1.),ins); }`,
    // box (2026-10-05): the push falls off in squares (distance = the larger of the two gaps) instead of circles
    splat: `uniform sampler2D uTarget; uniform vec2 point, force; uniform float radius, aspect, spin, box;
      void main(){ vec2 d=vUv-point; d.x*=aspect; float r2=dot(d,d); if(box>.5){ float c=max(abs(d.x),abs(d.y)); r2=c*c; } float g=exp(-r2/radius);
        vec2 tan_=vec2(-d.y,d.x)*radius/(r2+radius)*exp(-r2/(radius*5.));
        o=vec4(texture(uTarget,vUv).xy + force*g + spin*tan_*.6,0.,1.); }`,
    // text that stays still: no motion inside the letters, and motion heading into them turned along their edge, so the
    // colours go around (uTxt: r = the letters, g = a blurred copy whose slope points into them)
    // drift: the motion under each letter (one output pixel per letter): its push (in screen heights per unit) and
    // its swirl (curl), from five samples over the letter
    probe: VELAT + `uniform vec4 pr[32]; uniform vec2 simTexel; uniform float aspect;
      void main(){ vec4 q=pr[int(gl_FragCoord.x)]; vec2 a=vec2(aspect,1.);
        vec2 c=velAt(q.xy)*simTexel*a, r=velAt(q.xy+vec2(q.z,0.))*simTexel*a, l=velAt(q.xy-vec2(q.z,0.))*simTexel*a,
             t=velAt(q.xy+vec2(0.,q.w))*simTexel*a, b=velAt(q.xy-vec2(0.,q.w))*simTexel*a;
        o=vec4((c*2.+r+l+t+b)/6., (r.y-l.y)/(2.*q.z*aspect)-(t.x-b.x)/(2.*q.w), 1.); }`,
    // inside: the fluid only moves within the letters (no motion outside them, so nothing crosses an outline)
    walls: `uniform sampler2D uVel, uTxt;
      void main(){ o=vec4(texture(uVel,vUv).xy*smoothstep(.35,.65,texture(uTxt,vUv).r),0.,1.); }`,
    obstacle: `uniform sampler2D uVel, uTxt;
      void main(){ vec2 v=texture(uVel,vUv).xy; vec2 t=1./vec2(textureSize(uTxt,0))*3.;
        float m=texture(uTxt,vUv).g;
        vec2 g=vec2(texture(uTxt,vUv+vec2(t.x,0.)).g-texture(uTxt,vUv-vec2(t.x,0.)).g, texture(uTxt,vUv+vec2(0.,t.y)).g-texture(uTxt,vUv-vec2(0.,t.y)).g);
        if(length(g)>1e-5){ vec2 n=normalize(g); float vin=dot(v,n); if(vin>0.) v-=n*vin*smoothstep(.0,.25,m); }
        v*=1.-smoothstep(.3,.6,texture(uTxt,vUv).r);
        o=vec4(v,0.,1.); }`,
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
    // compose (2026-10-05): with fluids off, move the picture as it is now by only what the motion changed this frame,
    // so each stroke drags the already-stirred picture (folds on folds) instead of adding to one total displacement
    composeP: VELAT + LABEL + `uniform sampler2D uSrc, uPrev; uniform vec2 simTexel; uniform float disp;
      void main(){ vec2 d=(velAt(vUv)-texture(uPrev,vUv).xy)*simTexel*disp; o=vec4(texture(uSrc,vUv-d).xyz,label(uSrc,vUv-d)); }`,
    // ink drops (2026-10-05, Angus: "drops of food colouring into water or milk"): a drop of area a1 (growing from a0)
    // at c pushes everything outward without mixing (marbling: what was at distance sqrt(r^2-(a1-a0)) is now at r);
    // inside, the drop's label (w = 2 + palette colour). Labels are moved nearest-pixel, so drops stay crisp
    drop: LABEL + `uniform sampler2D uSrc; uniform vec2 c; uniform float aspect, a0, a1, lab;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float L2=dot(d,d);
        if(L2<a1){ o=vec4(texture(uSrc,c).xyz, lab); return; }
        vec2 p=c+(vUv-c)*sqrt(max(0.,1.-(a1-a0)/L2)); o=vec4(texture(uSrc,p).xyz, label(uSrc,p)); }`,
    // water (2026-10-05, Angus: ink dropped into a dish of water, seen from above): dye is stored as how much each
    // colour is absorbed (so thin dye is pale, dense dye dark, and overlapping dyes mix like real ones); it rides the
    // fluid and spreads very slowly
    waterAdv: VELAT + `uniform sampler2D uSrc; uniform vec2 simTexel, texel; uniform float dt, diff;
      void main(){ vec2 c=vUv-dt*velAt(vUv)*simTexel; vec3 a=texture(uSrc,c).rgb;
        vec3 n=(texture(uSrc,c+vec2(texel.x,0.)).rgb+texture(uSrc,c-vec2(texel.x,0.)).rgb+texture(uSrc,c+vec2(0.,texel.y)).rgb+texture(uSrc,c-vec2(0.,texel.y)).rgb)*.25;
        o=vec4(mix(a,n,diff),1.); }`,
    // a drop's dye: a ragged disc (its edge wobbles with angle), denser and streaky inside
    // rag (raggedness, 0.5 = as first made): how much the edge wobbles, and how unevenly the drop blooms
    waterDye: `uniform sampler2D uSrc; uniform vec2 c; uniform float aspect, R, sd, rag; uniform vec3 ab;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float r=length(d), an=atan(d.y,d.x);
        float e=R*(1.115+2.*rag*(.45*(vnoise(vec2(cos(an),sin(an))*2.2+sd)-.5)+.18*(vnoise(vec2(cos(an),sin(an))*7.+sd*1.7)-.5)));
        float m=smoothstep(e,e*.55,r)*(.7+.5*vnoise(d/R*3.+sd));
        o=vec4(mix(texture(uSrc,vUv).rgb, ab, clamp(m,0.,1.)),1.); }`,   // replaces what was there: new ink pushes the old aside, never piles on it
    // a drop's bloom: flow outward from its centre (like a spreading source), stronger in some directions than
    // others, so the rim pushes out unevenly and curls into fingers
    waterPush: `uniform sampler2D uVel; uniform vec2 c; uniform float aspect, R, sp, sd, rag;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float r=max(length(d),1e-4), an=atan(d.y,d.x);
        float f=r<R ? r/R : R/r; f*=exp(-max(0.,r-R)/(R*1.5));
        float k=max(0., 1.25+2.*rag*(1.3*(vnoise(vec2(cos(an),sin(an))*2.5+sd)-.5)+.5*(vnoise(vec2(cos(an),sin(an))*9.+sd*2.3)-.5)));
        o=vec4(texture(uVel,vUv).xy+d/r*sp*f*k,0.,1.); }`,
    // however much dye piles up it never goes black: the absorbance levels off at 0.9 (each colour keeps 40% of the light)
    // soap: clears a growing hole (ragged edge) in the dye, while its push sends the colours to the rim
    waterClear: `uniform sampler2D uSrc; uniform vec2 c; uniform float aspect, R, sd;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float r=length(d), an=atan(d.y,d.x);
        float e=R*(1.+.25*(vnoise(vec2(cos(an),sin(an))*3.+sd)-.5));
        o=vec4(texture(uSrc,vUv).rgb*smoothstep(e*.75,e,r),1.); }`,
    waterShow: `uniform sampler2D uSrc; void main(){ vec3 a=texture(uSrc,vUv).rgb; a=.9*(1.-exp(-a/.9)); o=vec4(vec3(.985,.98,.965)*exp(-a),1.); }`,
    // fountains (2026-10-06, Angus: "points that keep pouring out colour and push"): in water mode each fountain
    // trickles its own colour every frame instead of dropping it all at once; rate (0..1, how far this frame moves
    // toward full ab) is a per-frame blend, so the dye eases in and never overshoots ab however long it runs
    fountainDye: `uniform sampler2D uSrc; uniform vec2 c; uniform float aspect, R, sd, rate; uniform vec3 ab;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float r=length(d), an=atan(d.y,d.x);
        float m=smoothstep(R,R*.4,r)*(.65+.5*vnoise(vec2(cos(an),sin(an))*2.5+sd));
        o=vec4(mix(texture(uSrc,vUv).rgb, ab, clamp(m*rate,0.,1.)),1.); }`,
    // glass dish (2026-10-06, render-only, Angus: "ink in a shallow glass dish of water seen from above"): the same
    // dye absorption as waterShow, plus a faint shadow of the ink cast a little below it on the dish bottom (as if lit
    // from the upper left), a soft drifting caustic shimmer (light focused by the ripples) that shows more on the bare
    // wet glass than through the ink, and a gentle highlight across one side of the dish. time drives the shimmer (the
    // engine's own clock, not the wall clock, so a seeded replay still matches); FC (device px, pxs-scaled) keeps the
    // shimmer's apparent size the same on screen and in a 2x/3x Save PNG.
    waterDish: `uniform sampler2D uSrc; uniform float time;
      void main(){ vec3 a=texture(uSrc,vUv).rgb; vec3 absorb=.9*(1.-exp(-a/.9));
        vec3 base=vec3(.985,.98,.965)*exp(-absorb);
        // a faint grey-blue shadow of the ink, cast a little down-right on the dish bottom (as if lit from the upper
        // left): a cool tint, not just more ink, so it reads as a shadow and not as denser colour
        vec3 ash=texture(uSrc,vUv-vec2(.035,-.05)).rgb; float sh=clamp(max(ash.r,max(ash.g,ash.b))*1.3,0.,1.);
        base=mix(base, base*vec3(.76,.8,.86), smoothstep(0.,.6,sh)*.5);
        vec2 p=FC*.016;
        float c1=vnoise(p*2.3+vec2(time*.11,-time*.08)), c2=vnoise(p*4.1-vec2(time*.07,time*.09)+11.3);
        float caustic=pow(clamp(c1*.55+c2*.55-.18,0.,1.),2.2), ink=max(a.r,max(a.g,a.b));
        base+=vec3(1.,.99,.95)*caustic*.11*(1.-smoothstep(0.,.4,ink));
        vec2 nn=vUv*2.-1.; float sheen=smoothstep(1.5,.1,length(nn-vec2(-.4,.5)));
        base+=vec3(1.)*sheen*.06;
        o=vec4(clamp(base,0.,1.),1.); }`,
    dropInk: `uniform sampler2D uSrc; uniform vec2 c; uniform float aspect, a0, a1; uniform vec3 col;
      void main(){ vec2 d=vUv-c; d.x*=aspect; float L2=dot(d,d);
        if(L2<a1){ o=vec4(col,1.); return; }
        o=texture(uSrc, c+(vUv-c)*sqrt(max(0.,1.-(a1-a0)/L2))); }`,
    press: `uniform sampler2D uP, uDiv;
      void main(){ float L=texture(uP,vL).x, R=texture(uP,vR).x, T=texture(uP,vT).x, B=texture(uP,vB).x;
        o=vec4((L+R+B+T-texture(uDiv,vUv).x)*.25,0.,0.,1.); }`,
    // outline: a dark line wherever the finished picture changes colour (around every colour region), the
    // colours inside left exactly as they are. Small differences (paper grain, a fade in progress) draw no line
    // one device pixel wide and black: only the pixel on one side of each edge (compared with its right and upper neighbour)
    outline: `uniform sampler2D uSrc;
      void main(){ ivec2 q=ivec2(gl_FragCoord.xy), m=textureSize(uSrc,0)-1; vec3 c=texelFetch(uSrc,q,0).rgb; int k=int(max(pxs,1.)+.5);
        float e=max(length(texelFetch(uSrc,min(q+ivec2(k,0),m),0).rgb-c), length(texelFetch(uSrc,min(q+ivec2(0,k),m),0).rgb-c));
        o=vec4(mix(c, vec3(0.), smoothstep(.1,.25,e)), 1.); }`,
    // ==== fx: COLOUR SPLIT (o.split, 0..1, off by default) ====================================================
    // a post pass over the finished picture: red, green and blue are each sampled at an offset along the LOCAL
    // FLOW VELOCITY (uVelD, the same field the 'motion colour' option already samples), so moving regions fringe
    // like chromatic aberration and still regions stay sharp. Render-only: the motion itself is untouched.
    split: `uniform sampler2D uSrc, uVelD; uniform vec2 mvTexel; uniform float split;
      void main(){ vec2 duv=texture(uVelD,vUv).xy*mvTexel; float m=length(duv);
        vec2 dir=m>1e-6 ? duv/m : vec2(0.);
        vec2 off=dir*split*clamp(m*22.,0.,1.)*0.02;
        float r=texture(uSrc,vUv+off).r, g=texture(uSrc,vUv).g, b=texture(uSrc,vUv-off).b;
        o=vec4(r,g,b,1.); }`,
    // ==== fx: HAIR STREAKS (o.hair, 0..1, off by default) ======================================================
    // a post pass over the finished picture: fine streaks combed along the flow, like brush bristles or combed fur.
    // A line integral convolution of fixed fine noise (hash(), no time/seed: always the same fibres) along the
    // LOCAL FLOW VELOCITY direction (uVelD, same field as colour split above), fading where there is no motion.
    // Render-only: the motion itself is untouched. FC (not gl_FragCoord) keeps the fibre size the same at any
    // Save PNG export scale. Keep this block separate from any other post pass so passes can be chained in order.
    hair: `uniform sampler2D uSrc, uVelD; uniform vec2 mvTexel; uniform float hair;
      void main(){ vec2 duv=texture(uVelD,vUv).xy*mvTexel; float m=length(duv);
        vec2 dir=m>1e-6 ? duv/m : vec2(1.,0.);
        float sum=0., wsum=0.;
        for(int i=-12;i<=12;i++){ vec2 p=FC+dir*float(i)*1.15; float w=1.-abs(float(i))/13.;
          sum+=hash(floor(p)+.5)*w; wsum+=w; }
        float fiber=smoothstep(.38,.62,sum/max(wsum,1e-5));
        vec3 c=texture(uSrc,vUv).rgb;
        float amt=hair*clamp(m*26.,0.,1.);
        o=vec4(c*mix(1., .55+.9*fiber, amt*.65), 1.); }`,
    // gloss (2026-10-06, render-only, Angus: "raised paint / enamel"): post pass over the finished picture. Its
    // luminance stands in for a height field (colour boundaries become ridges); a normal built from that height is lit
    // from a fixed direction (soft diffuse shading) with a tight specular highlight on top, like thick glossy paint or
    // enamel catching the light. amt (o.gloss, 0..1) fades the whole effect in; 0 leaves the picture untouched.
    // Neighbour taps step by k device pixels (pxs-scaled, as outline does) so the paint's "grain" stays the same size
    // whether this draws to the screen or into a 2x/3x Save PNG target.
    gloss: `uniform sampler2D uSrc; uniform float amt;
      float glum(ivec2 q, ivec2 m){ return dot(texelFetch(uSrc,clamp(q,ivec2(0),m),0).rgb, vec3(.299,.587,.114)); }
      void main(){ ivec2 q=ivec2(gl_FragCoord.xy), m=textureSize(uSrc,0)-1; float kk=max(pxs,1.);
        vec3 c=texelFetch(uSrc,q,0).rgb;
        // a few radii, not just a 1px hairline: the height drop at a colour edge is felt over several pixels, like a
        // rounded bead of paint built up along the seam, instead of a razor-thin ridge
        vec2 g=vec2(0.);
        for(int i=0;i<3;i++){ float r=i==0?2.:i==1?5.:9.; float w=i==0?1.:i==1?.7:.45; int k=int(kk*r+.5);
          g += w*vec2(glum(q+ivec2(k,0),m)-glum(q-ivec2(k,0),m), glum(q+ivec2(0,k),m)-glum(q-ivec2(0,k),m))/r; }
        g *= 5.5;
        vec3 n=normalize(vec3(-g,1.));
        vec3 Ld=normalize(vec3(-.5,.6,.65)), H=normalize(Ld+vec3(0.,0.,1.));
        float diff=max(dot(n,Ld),0.), spec=pow(max(dot(n,H),0.),40.);
        vec3 shaded=c*(.62+.5*diff)+vec3(1.,.97,.9)*spec*1.2;
        o=vec4(mix(c, clamp(shaded,0.,1.), amt), 1.); }`,
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
      void main(){ vec3 fr=texture(uFresh,vUv).rgb, c=mix(fr, texture(uSrc,uv2()).rgb, blend);
        c=mix(vec3(dot(c,vec3(.2125,.7154,.0721))),c,sat); c*=bright; c=mix(vec3(.5),c,contrast);
        o=vec4(clamp(crisp(c,fr),0.,1.),1.); }`,
    display: INIT + LABEL + `uniform float milk; uniform sampler2D uP, uInk; uniform sampler2D uImgT; uniform float imgAspect, imgCells; uniform float sizeMix, inside; uniform sampler2D uTxt, uTxtA; uniform float txtMode; uniform vec3 txtCol; uniform vec4 LP[32], LA[32]; uniform vec2 LH[32]; uniform int nL; uniform float reveal, mapCells, tilePx, peek, time, freq, fadeMin, fadeMax, grain, seqLen, inkOn, starsOn, wash, fill, cells, seed, blocky; uniform vec2 dir, res;
      uniform vec3 pal[8]; uniform float seq[12], npal, hard; uniform vec3 outline, starC;
      uniform sampler2D uVelD; uniform vec2 mvTexel; uniform float motion, mvDisp, mvRings, mvSect;
      vec3 colAt(float k){ int i=int(mod(k,seqLen)); return pal[int(seq[i])]; }
      // colour fade: every square (or band) fades from its colour into a randomly chosen palette colour, each
      // taking its own time between fadeMin and fadeMax seconds (fadeMin 0 = off). Returns (colour step, fade 0..1);
      // step 0 is the starting colour
      vec2 clock(float r){ if(fadeMin<=0.) return vec2(0.);
        float q=time/max(.5, mix(fadeMin, max(fadeMin, fadeMax), r)); return vec2(floor(q), smoothstep(0.,1.,fract(q))); }
      // the palette colour of step n of a square: random, but never the same as the step before
      float raw(vec2 c, float n, float first){ return n<.5 ? first : floor(rnd(c,seed+20.+n)*npal); }
      float pick(vec2 c, float n, float first){ if(n<.5) return first;
        float a=raw(c,n,first); return a==raw(c,n-1.,first) ? mod(a+1.,npal) : a; }
      // the colour of one square (squares and colour noise fills), from its cell in the stirred coordinates
      vec3 cellCol(vec2 cell, float n){
        vec2 c=swirled((cell+.5)/n)*n; vec2 ck=clock(rnd(c,seed+11.));
        if(fill>3.5){ float qs=ck.x;
          vec3 a=vec3(rnd(c,seed+2.+qs*3.),rnd(c,seed+3.+qs*3.),rnd(c,seed+4.+qs*3.)),
               b=vec3(rnd(c,seed+5.+qs*3.),rnd(c,seed+6.+qs*3.),rnd(c,seed+7.+qs*3.));
          return mix(a,b,ck.y); }
        float kk=floor(rnd(c,seed+7.)*npal);
        return mix(pal[int(pick(c,ck.x,kk))], pal[int(pick(c,ck.x+1.,kk))], ck.y); }
      // peek: show the hidden map unstirred, zoomed out PZ times around the screen centre, the screen framed in white
      const float PZ=4.;
      // tiles: the screen in square tiles of tilePx device pixels, each one colour, looked up at the tile's centre
      vec2 TU(){ return tilePx>1.5&&peek<.5 ? (floor(gl_FragCoord.xy/tilePx)+.5)*tilePx/res : vUv; }
      vec2 PU(){ return peek>.5 ? initP(vec2(.5))+(initP(vUv)-initP(vec2(.5)))*PZ : texture(uP,TU()).xy; }
      void main(){
        vec3 col;
        if(inkOn>.5&&peek<.5){
          col=texture(uInk,TU()).rgb;
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
            col*=mix(1., .9+.16*vnoise(FC*.35)*(1.-lum*.5), grain);
            col=mix(col,vec3(.96,.94,.88),.06);
            col*=mix(1., .95+.06*hash(floor(FC*.6)), grain);
          }
          if(inside>.5) col=outsideStyle(col, texture(uInk,TU()).a, inside);   // inside with ink: what the ink says was on screen (its alpha)
        }
        else {
          vec2 p=PU(); vec2 p0=p;
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
          vec2 ck=clock(hk); float sh=ck.x, fade=ck.y;
          col=mix(colAt(k+sh), colAt(k+sh+1.), fade);
          float fr=fract(b), w=fwidth(b);
          if(fill>4.5){   // image: your picture is the hidden map, fitted to cover the screen and mirrored beyond its
            // edges (so the map is endless); the stirring looks it up like the squares
            float hp=max(2., 2.*aspect/imgAspect);
            if(imgCells>0.&&peek<.5){   // image pixelate: the picture itself in square blocks (which the stirring then moves),
              // each block the picture's average colour over it (a mipmap level about the block's size)
              vec2 pq=(floor(p*imgCells)+.5)/imgCells;
              float lod=log2(max(1., float(textureSize(uImgT,0).y)/(hp*imgCells)));
              col=textureLod(uImgT, vec2(.5+pq.x/(hp*imgAspect), .5-pq.y/hp), lod).rgb;
            } else col=texture(uImgT, vec2(.5+p.x/(hp*imgAspect), .5-p.y/hp)).rgb;
          } else if(fill>2.5){   // squares / colour noise: one colour per square, each drifting on its own clock
            // map: the hidden squares can have their own size (mapCells; 0 = the same as the main grid). At rest
            // each main square shows the map's colour at its centre; stirring carries each pixel smoothly across
            // the map from there, so the swirl's stripes have the map's size while the resting grid keeps its own
            float mc=mapCells>0. ? mapCells : cells; vec2 raw;
            if(mapCells>0.&&peek<.5){ vec2 q0=initP(TU()); raw=((floor(q0*cells)+.5)/cells+PU()-q0)*mc; }
            else raw=PU()*mc;
            vec2 cell=floor(raw); float cn=mc;
            if(sizeMix>0.){   // mixed sizes: squares 4x the size, each split into four with chance sizeMix, and
              // again, three times, down to half the size: big and small squares scattered together
              cn=mc*.25; vec2 q=raw*.25;
              for(int l=0;l<3;l++){ if(rnd(floor(q), seed+21.+float(l)*7.)>=sizeMix) break; q*=2.; cn*=2.; }
              cell=floor(q); }
            col=cellCol(cell, cn);
            if(wash>.5){   // watercolour on squares: grain only (no darker edges: only outline draws lines)
              col*=mix(1., .9+.14*vnoise(raw*1.7), grain);
              col*=mix(1., .96+.05*hash(floor(FC*.7)), grain);
            } }
          else if(fill>.5&&fill<1.5){   // field: soft gradients between the palette levels, a little paper grain
            vec3 nxt=mix(colAt(k+1.+sh), colAt(k+2.+sh), fade);
            col=mix(col,nxt,smoothstep(.15,.85,fr))*mix(1., .95+.08*vnoise(p*40.), grain);
          } else if(wash>.5){
            // watercolour: no ink outline; the next colour bleeds in softly, pigment pools darker along each edge,
            // granulates inside the band, and paper grain shows through
            vec3 nxt=mix(colAt(k+1.+sh), colAt(k+2.+sh), fade);
            float wide=smoothstep(.35,.08,w);   // edge effects only where bands are wide enough to hold them
            col=mix(col, nxt, smoothstep(1.-max(.06,w*3.),1.,fr)*.85*wide);
            float px=min(fr,1.-fr)/max(w,1e-4);
            col*=1.-.32*exp(-px/2.5)*wide;
            col*=mix(1., .9+.14*vnoise(p*9.+k), grain);
            col*=mix(1., .96+.05*hash(floor(FC*.7)), grain);
          } else if(blocky<.5) col=mix(col,outline,smoothstep(w*1.4,0.,min(fr,1.-fr)-.015));
          if(txtMode>1.5&&txtMode<2.5){   // text that flows: written into the picture at rest, so the stirring carries it
            vec2 tu=p0/(vec2(aspect,1.)*2.)+.5;   // (in the picture, so diving in enlarges it too)
            if(all(greaterThan(tu,vec2(0.)))&&all(lessThan(tu,vec2(1.)))) col=mix(col, txtCol, texture(uTxt,tu).r); }
          if(peek<.5){ float lb=label(uP,TU()); if(lb>1.5) col=pal[int(mod(lb-2.+.5,npal))]; else if(milk>.5) col=vec3(.975,.965,.94); }   // ink drops on the map
          float shade=peek>.5 ? 0. : texture(uP,vUv).z; col=shade>0. ? mix(col,vec3(1.,.97,.9),shade*.7) : col*(1.+shade*1.1);
          // outside: what the stirring pulled in from beyond the screen; inside: what was on screen and moved
          // (the same six styles, applied to the other part)
          if((reveal>.5||inside>.5)&&peek<.5){ vec2 q=texture(uP,TU()).xy, e=max(initP(vec2(0.))-q, q-initP(vec2(1.)));
            float a=clamp(max(e.x,e.y)*res.y/6.,0.,1.);
            col=outsideStyle(outsideStyle(col, a, reveal), 1.-a, inside); }
        }
        // motion colour (2026-10-05): every spot coloured by the motion under it, its direction in 6 sectors and its
        // strength in rings (2 per halving), so every whirl is a set of rings and whirls meet in crossings
        if(motion>0.&&peek<.5){ vec2 d=texture(uVelD,vUv).xy*mvTexel*mvDisp*vec2(aspect,1.); float m=length(d);
          if(m>1e-5){ float k=floor(fract(atan(d.y,d.x)/6.28318530718+1.)*mvSect)+floor(log2(m)*mvRings);
            col=mix(col, colAt(k), motion*smoothstep(1e-4,2e-3,m)); } }
        if(hard>.5&&peek<.5){ vec3 b=pal[0]; float bd=9.; for(int i=0;i<8;i++){ if(float(i)>=npal) break; vec3 d=col-pal[i]; float dd=dot(d,d); if(dd<bd){ bd=dd; b=pal[i]; } } col=b; }   // high-contrast palettes: only their own colours, no in-betweens
        if(txtMode>.5&&txtMode<1.5&&peek<.5) col=mix(col, txtCol, texture(uTxt,vUv).r);   // text that stays still, on top
        if(txtMode>3.5&&peek<.5){ vec4 tm=texture(uTxt,vUv);   // inside: the picture only within the letters, with a thin outline
          vec2 d=2.5*max(pxs,1.)/res; float near=max(max(texture(uTxt,vUv+vec2(d.x,0.)).r, texture(uTxt,vUv-vec2(d.x,0.)).r), max(texture(uTxt,vUv+vec2(0.,d.y)).r, texture(uTxt,vUv-vec2(0.,d.y)).r));
          vec3 bg=mix(txtCol, 1.-txtCol, near*(1.-tm.r)*.85); col=mix(bg, col, tm.r); }
        if(txtMode>2.5&&peek<.5) for(int i=0;i<32;i++){ if(i>=nL) break;   // drift: each letter whole, where the fluid pushed it, turned by its swirl
          vec2 l=rot(-LP[i].z)*((vUv-LP[i].xy)*vec2(aspect,1.)), h=LH[i];
          if(abs(l.x)<h.x&&abs(l.y)<h.y) col=mix(col, txtCol, texture(uTxtA, LA[i].xy+(l/h*.5+.5)*LA[i].zw).r); }
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
        if(peek>.5){   // the screen's frame, and the map outside it a little dimmed
          vec2 e=abs(vUv-.5)*PZ*2., px=fwidth(vUv)*PZ*2.;
          bool in_=all(lessThan(e,vec2(1.)));
          if(!in_) col*=.72;
          float fr=min(abs(e.x-1.)/px.x, abs(e.y-1.)/px.y);
          if(max(e.x,e.y)<1.+3.*max(px.x,px.y)) col=mix(col,vec3(1.),smoothstep(2.5,1.,fr));
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
  // fold (2026-10-05, after the iOS Fluid Automata): with fluids off, instead of each pixel looking its picture
  // position up, a triangle mesh (foldRows rows) is pushed forward by the same displacement and drawn in order, so
  // where the motion crosses itself the triangles fold over each other: straight-edged shards. Borders stay pinned;
  // a still pass underneath fills any gap with the unmoved picture
  const foldVs = sh(gl.VERTEX_SHADER, `#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 a; out vec2 vUv, vRest; uniform sampler2D uVel; uniform vec2 simTexel; uniform float disp;
  void main(){ vRest=a; vUv=a; vec2 p=a; if(a.x>0.&&a.x<1.&&a.y>0.&&a.y<1.) p+=texture(uVel,a).xy*simTexel*disp; gl_Position=vec4(p*2.-1.,0.,1.); }`);
  const foldP = (() => { const p = gl.createProgram(); gl.attachShader(p, foldVs);
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + INIT + `in vec2 vRest; void main(){ o=vec4(initP(vRest),0.,1.); }`));
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('swirl fold link: ' + gl.getProgramInfoLog(p));
    const u = {}; for (const nm of ['uVel', 'simTexel', 'disp', 'aspect', 'zA', 'zB']) u[nm] = gl.getUniformLocation(p, nm); return { p, u }; })();
  const foldVao = gl.createVertexArray(), foldBuf = gl.createBuffer(); let foldN = 0, foldKey = '';
  function buildFold() {
    const rows = Math.max(2, Math.round(o.foldRows || 16)), cols = Math.max(2, Math.round(rows * aspect())), key = cols + 'x' + rows;
    if (key === foldKey) return; foldKey = key;
    const v = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {   // columns, then rows (as iOS): later triangles cover
      const L = i / cols, R = (i + 1) / cols, B = j / rows, T = (j + 1) / rows; v.push(L, B, L, T, R, B, R, B, L, T, R, T); }
    foldN = v.length / 2;
    gl.bindVertexArray(foldVao); gl.bindBuffer(gl.ARRAY_BUFFER, foldBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(vao_);
  }
  function foldStep() {
    buildFold(); const t = S.P.write; gl.useProgram(foldP.p); const u = foldP.u;
    gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform2f(u.simTexel, 1 / S.sw, 1 / S.sh);
    gl.uniform1f(u.aspect, aspect()); gl.uniform1f(u.zA, zoomA); gl.uniform2f(u.zB, zoomB[0], zoomB[1]);
    gl.bindVertexArray(foldVao); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h);
    gl.uniform1f(u.disp, 0); gl.drawArrays(gl.TRIANGLES, 0, foldN);                // underneath: the unmoved picture
    gl.uniform1f(u.disp, o.energy * 0.06); gl.drawArrays(gl.TRIANGLES, 0, foldN);  // the folded mesh on top
    gl.bindVertexArray(vao_); S.P.swap();
  }
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

  // full float for the picture's coordinates where the GPU can (deep zooms need the precision), else half float
  const f32 = !!(gl.getExtension('EXT_color_buffer_float') && gl.getExtension('OES_texture_float_linear'));
  const fbo = (w, h, hi) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (hi && f32) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h }; };
  const dbl = (w, h, hi) => { let a = fbo(w, h, hi), b = fbo(w, h, hi);
    return { get read() { return a; }, get write() { return b; }, swap() { [a, b] = [b, a]; } }; };

  let S = {};
  let drops = [], lastLab = -1;   // ink drops (see drop())
  let fountains = [];   // fountains (see plantFountain()): { x, y, ang, spin, ab, sd }, up to FOUNTAIN_MAX
  const aspect = () => o.width / o.height;
  function alloc() {
    const sh_ = o.simRes, sw_ = Math.round(sh_ * aspect());
    const ch = Math.min(o.coordRes, o.height), cw = Math.round(ch * aspect());
    S = { vel: dbl(sw_, sh_, true), velPrev: fbo(sw_, sh_, true),   // full float: fluidity can be 0.99999, which half float would round to 1
      press: dbl(sw_, sh_), div: fbo(sw_, sh_), curl: fbo(sw_, sh_), v0: fbo(sw_, sh_),
          P: dbl(cw, ch, true), P0: fbo(cw, ch, true), ink: dbl(cw, ch), dye: dbl(cw, ch), fresh: fbo(cw, ch), tmp: fbo(cw, ch), out: fbo(o.width, o.height), out2: fbo(o.width, o.height), sw: sw_, sh: sh_ };   // out/out2: scratch for post passes (outline, fx: colour split, fx: hair streaks)
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
    if (pr.u.zA) { gl.uniform1f(pr.u.zA, zoomA); gl.uniform2f(pr.u.zB, zoomB[0], zoomB[1]); }
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
  let zoomA = 1, zoomB = [0, 0], peeking = false;
  let time = 0, seed = 1 + Math.floor(Math.random() * 1e5), resets = 0;
  // a fresh start: new noise, and (after the first) a new random swirl layout for the bands
  const rndSwirl = (sgn) => [(Math.random() * 2 - 1) * aspect() * 0.8, (Math.random() * 2 - 1) * 0.75, sgn * (2.5 + Math.random() * 3.5), 0.35 + Math.random() * 0.45];
  // reset: new squares (new seed) and no motion; reset(true) (r): back to the unstirred grid, the same squares
  function reset(same = false) {
    drops = []; fountains = [];
    if (S.dye) [S.dye.read, S.dye.write].forEach(clear);
    if (!same) seed = 1 + Math.floor(Math.random() * 1e5);
    for (const L of letters) { L.pos = L.home.slice(); L.ang = 0; }
    if (!same && resets++ && !o.fixedSwirls) {
      const n = 2 + Math.floor(Math.random() * 3); o.swirls = Array.from({ length: n }, (_, i) => rndSwirl(i % 2 ? -1 : 1));
      const a = Math.random() * Math.PI * 2, m = 1.8 + Math.random() * 0.9; o.dir = [Math.cos(a) * m, Math.sin(a) * m];
    }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
    zoomA = 1; zoomB = [0, 0]; depth = 1;
    [S.vel.read, S.vel.write, S.press.read, S.press.write, S.velPrev].forEach(clear); composing = true;   // fresh picture and no motion: in step, so a start stir composes in
    if (L) { L.ms.fill(0); L.os.fill(0); }
    use('init', S.P.write); blit(S.P.write); S.P.swap();
    use('init', S.P0); blit(S.P0);
    renderBands(S.P0, S.ink.read, time, false); blit(S.ink.read);
  }
  function renderBands(src, target, t, stars) {
    const pl = SWIRL2_PALETTES[o.palette] || o.palette;
    const u = use('display', target || { w: o.width, h: o.height });
    gl.uniform1i(u.uP, tex(0, src)); gl.uniform1i(u.uInk, tex(1, S.div));   // placeholder: never sample the target
    gl.uniform1i(u.uTxt, tex(6, { t: txtT })); gl.uniform1i(u.uTxtA, tex(7, { t: atlasT }));
    gl.uniform1i(u.uVelD, tex(8, S.vel.read)); gl.uniform2f(u.mvTexel, 1 / S.sw, 1 / S.sh); gl.uniform1f(u.motion, o.motion || 0); gl.uniform1f(u.mvRings, o.motionRings ?? 2); gl.uniform1f(u.mvSect, o.motionSectors ?? 6); gl.uniform1f(u.mvDisp, o.fluids ? 0.06 : o.energy * 0.06);
    if (o.textMode === 3 && letters.length) { const n = letters.length, lp = new Float32Array(128), la = new Float32Array(128), lh = new Float32Array(64);
      letters.forEach((L, i) => { lp.set([L.pos[0], L.pos[1], L.ang, 0], i * 4); la.set(L.atlas, i * 4); lh.set(L.hs, i * 2); });
      gl.uniform4fv(u.LP, lp); gl.uniform4fv(u.LA, la); gl.uniform2fv(u.LH, lh); gl.uniform1i(u.nL, n); } else gl.uniform1i(u.nL, 0); gl.uniform1f(u.txtMode, o.text && o.textMode ? o.textMode : 0); gl.uniform3fv(u.txtCol, o.textColour === 'black' ? [0.02, 0.02, 0.03] : [1, 1, 1]);
    gl.uniform1f(u.inkOn, 0); gl.uniform1f(u.starsOn, stars && o.stars && !o.wash && o.fill !== 'image' ? 1 : 0); gl.uniform1f(u.wash, o.wash ? 1 : 0);
    gl.uniform1i(u.uImgT, tex(5, { t: imgT })); gl.uniform1f(u.imgAspect, imgAspect); gl.uniform1f(u.imgCells, o.imgTile > 1 ? o.height / 2 / (o.imgTile * (o.height / Math.max(1, o.cssHeight || o.height))) : 0); gl.uniform1f(u.time, t); gl.uniform1f(u.freq, o.freq); gl.uniform1f(u.fill, FILL_NUM[o.fill] ?? 0);
    // tiles: tile 1 = off (not 1 CSS px: on a phone that is ~3 device px and pixelated everything)
    const cellPx = Math.max(1, (o.cell || 1) * (o.height / Math.max(1, o.cssHeight || o.height)));   // in device pixels
    gl.uniform1f(u.sizeMix, o.fill === 'mixed squares' ? 0.67 : 0);   // (the mixed sizes slider, o.sizeMix, is commented out)
    gl.uniform1f(u.seed, seed); gl.uniform1f(u.peek, peeking ? 1 : 0); gl.uniform1f(u.reveal, o.reveal || 0); gl.uniform1f(u.inside, o.inside || 0); gl.uniform1f(u.mapCells, o.mapCell > 1 ? o.height / 2 / (o.mapCell * (o.height / Math.max(1, o.cssHeight || o.height))) : 0); gl.uniform1f(u.tilePx, o.tile > 1 ? o.tile * pxs * (o.height / Math.max(1, o.cssHeight || o.height)) : 0); gl.uniform1f(u.cells, o.height / 2 / cellPx); gl.uniform1f(u.blocky, o.fill !== 'image' && (cellPx > 1.5 || o.fill === 'squares' || o.fill === 'colour noise') ? 1 : 0);   // a picture is never cut into the preset's squares (pixelate does that)
    gl.uniform1f(u.grain, o.grain === false ? 0 : 1); gl.uniform1f(u.fadeMin, o.fadeMin); gl.uniform1f(u.fadeMax, o.fadeMax); gl.uniform2f(u.dir, o.dir[0], o.dir[1]); gl.uniform2f(u.res, o.width * pxs, o.height * pxs); gl.uniform1f(u.pxs, pxs);
    gl.uniform1f(u.milk, o.milk ? 1 : 0); gl.uniform3fv(u.pal, palArr(pl)); gl.uniform1f(u.npal, pl.pal.length); gl.uniform1f(u.hard, pl.hard ? 1 : 0);
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
  const INSTANT = (typeof window !== 'undefined' && window.INSTANT_K) || 0.008;   // instant thickness: added splat radius per unit of thickness
  // symmetry (2026-10-05, Angus: "Mandala"): every stroke, drop and random stir copied sym times around the screen's
  // centre, and with symMirror each copy also mirrored (a kaleidoscope). Positions in uv, vectors in square units
  let inSym = false, noSym = false;
  const symOn = () => o.sym > 1 && o.grid < 2 && !inSym && !noSym;
  // mirror points (symCentres, default the screen centre): a stroke is measured from the point nearest it and repeated
  // around every point, so several points give several identical mandalas
  function symCopies(x, y, vx = 0, vy = 0) {
    const n = Math.round(o.sym), a = aspect(), C = o.symCentres && o.symCentres.length ? o.symCentres : [[0.5, 0.5]], out = [];
    let c0 = C[0], best = Infinity;
    for (const c of C) { const d = ((x - c[0]) * a) ** 2 + (y - c[1]) ** 2; if (d < best) { best = d; c0 = c; } }
    const dx = (x - c0[0]) * a, dy = y - c0[1];
    for (const [cx, cy] of C) for (let m = 0; m < (o.symMirror ? 2 : 1); m++) for (let k = 0; k < n; k++) {
      const t = 2 * Math.PI * k / n, c = Math.cos(t), s = Math.sin(t), ry = m ? -dy : dy, rvy = m ? -vy : vy;
      out.push([cx + (c * dx - s * ry) / a, cy + s * dx + c * ry, c * vx - s * rvy, s * vx + c * rvy, m]);
    }
    return out;
  }
  function splat(x, y, fx, fy, spin = 0, radius = 0.0025, ambient = false) {
    if (symOn()) { inSym = true;
      try { for (const [X, Y, VX, VY, m] of symCopies(x, y, fx * S.sw, fy * S.sh)) splat(X, Y, VX / S.sw, VY / S.sh, m ? -spin : spin, radius, ambient); }
      finally { inSym = false; } return; }
    if (!ambient) { idleT = 0; radius *= (o.reach || 1) ** 2; }   // reach: how far your presses spread (radius is in uv^2)
    // instant: thickness acts on each push as you make it (spread once into a broad soft blob of the same total
    // motion) instead of spreading the motion every frame, so nothing creeps while you move and nothing is cut off
    // when you stop
    if (!ambient && o.instant && o.viscosity > 0) { const r1 = radius + o.viscosity * INSTANT, k = radius / r1; fx *= k; fy *= k; spin *= k; radius = r1; }
    if (o.grid >= 2) return latticeSplat(x, y, fx, fy, spin, radius);
    if (o.axisSnap) { spin = 0; if (Math.abs(fx * S.sw) > Math.abs(fy * S.sh)) fy = 0; else fx = 0; }   // axis snap: straight pushes only, along the nearest axis
    const u = use('splat', S.vel.write); gl.uniform1f(u.box, o.box ? 1 : 0);
    gl.uniform1i(u.uTarget, tex(0, S.vel.read)); gl.uniform2f(u.point, x, y);
    gl.uniform2f(u.force, fx * S.sw, fy * S.sh); gl.uniform1f(u.spin, spin * S.sh); gl.uniform1f(u.radius, radius);
    blit(S.vel.write); S.vel.swap();
  }
  // n: replace all the motion at once with a random field (a little energy): many whirlpools and pushes of every
  // size and both turns, scattered over the screen; on the lattice presets every vertex gets a random direction
  function randomize(energy = 1) {
    const R = Math.random;
    if (o.grid >= 2) { const { ms, os } = lattice(); for (let i = 0; i < os.length; i++) { os[i] = R() * TAU; ms[i] = 0.06 * energy * (0.5 + R()); } return; }
    if (o.water) { for (let k = 0; k < (o.sym > 1 ? 2 : 5); k++) drop(0.15 + 0.7 * R(), 0.15 + 0.7 * R()); return; }   // water: n drops a few at random
    [S.vel.read, S.vel.write].forEach(clear); idleT = 0;
    if (o.compose && !o.fluids) {   // compose: n starts the picture over too, so it looks as when the preset is chosen
      clear(S.velPrev); composing = true; use('init', S.P.write); blit(S.P.write); S.P.swap(); }
    for (let k = 0; k < 60; k++) { const r = 0.0015 + R() ** 2 * 0.03, x = R(), y = R();
      if (k % 3) splat(x, y, 0, 0, (R() < 0.5 ? -1 : 1) * energy * (6 + R() * 18), r, true);
      else { const a = R() * TAU, f = energy * (0.3 + R() * 0.9); splat(x, y, Math.cos(a) * f, Math.sin(a) * f, 0, r, true); } }
  }
  // m: more energy, same directions: every vector k times as long (lattice: every vertex's charge)
  function boost(k = 1.5) {
    idleT = 0;
    if (o.grid >= 2) { const { ms } = lattice(); for (let i = 0; i < ms.length; i++) ms[i] = Math.min(1, ms[i] * k); return; }
    const u = use('scale', S.vel.write); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, k); blit(S.vel.write); S.vel.swap();
  }
  // burst: a press held still pushes outward in every direction, on a ring of radius r (in screen heights) around
  // (x, y), each push pointing away from the press, like drags out from it; strength from o.burst
  function burst(x, y, r) {
    const a = o.width / o.height, n = Math.max(10, Math.round(r * 160)), f = 6 * (o.burst ?? 1);
    for (let k = 0; k < n; k++) { const t = k * 2 * Math.PI / n, c = Math.cos(t), s = Math.sin(t);
      splat(x + c * r / a, y + s * r, c * f / a, s * f, 0, 0.0025); }
  }
  // dive into the fluid at (x, y) (0..1, y up) by factor s (>1 in, <1 out). The hidden map of squares stays as it
  // is (squares keep their size, new stirring is normal); only the motion grows outward from that point, keeping
  // its direction: a whirlpool stays a whirlpool, just bigger, still made of normal-size squares. Ink with fluids
  // on is paint, so there the paint itself is enlarged
  // text: drawn into a texture the size of the screen (r = the letters, g = a blurred copy for the edges)
  const txtT = gl.createTexture(), atlasT = gl.createTexture(); let letters = [];
  gl.bindTexture(gl.TEXTURE_2D, atlasT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  // drift: every letter its own object (home = where it sits in the text, pos, turn), its glyph in an atlas
  function makeLetters(lines, fs, w, h) {
    letters = [];
    const font = `900 ${fs}px system-ui, sans-serif`, m = document.createElement('canvas').getContext('2d'); m.font = font;
    const items = []; lines.forEach((ln, li) => { const lw = m.measureText(ln).width, cy = h / 2 + (li - (lines.length - 1) / 2) * fs * 1.05; let x = w / 2 - lw / 2;
      for (const ch of ln) { const cw = m.measureText(ch).width; if (ch.trim() && items.length < 32) items.push({ ch, cx: x + cw / 2, cy, cw }); x += cw; } });
    const pad = Math.ceil(fs * 0.12), ch = Math.ceil(fs * 1.25), AW = Math.min(4096, items.reduce((a, it) => a + Math.ceil(it.cw) + 2 * pad, 0) || 1);
    let ax = 0, ay = 0; const pos = items.map(it => { const cw = Math.ceil(it.cw) + 2 * pad; if (ax + cw > AW) { ax = 0; ay += ch; } const r = [ax, ay, cw]; ax += cw; return r; });
    const AH = ay + ch, a = document.createElement('canvas'); a.width = AW; a.height = AH; const x = a.getContext('2d');
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#f00';
    items.forEach((it, i) => { const [px, py, cw] = pos[i]; x.fillText(it.ch, px + cw / 2, py + ch / 2);
      const mt = x.measureText(it.ch), ink = [(mt.actualBoundingBoxRight - mt.actualBoundingBoxLeft) / 2 / h, (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2 / h, (mt.actualBoundingBoxRight + mt.actualBoundingBoxLeft) / 2 / h, (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) / 2 / h];   // the glyph's ink: centre offset, half size
      letters.push({ ink, home: [it.cx / w, 1 - it.cy / h], pos: [it.cx / w, 1 - it.cy / h], ang: 0, hs: [cw / 2 / h, ch / 2 / h], atlas: [px / AW, 1 - (py + ch) / AH, cw / AW, ch / AH] }); });
    gl.bindTexture(gl.TEXTURE_2D, atlasT); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  // each frame: measure the motion under every letter (a tiny render, read back), then move and turn it. Fluids on:
  // it travels with the flow; fluids off (the picture is the original shifted by the motion): it sits at its home
  // shifted the same way, so it stays with the colours around it
  let probeT = null, composing = false;
  function driftLetters(dt) {
    if (!letters.length || !f32) return;
    if (!probeT) probeT = fbo(32, 1, true);
    const pr = new Float32Array(128), n = letters.length;
    letters.forEach((L, i) => { const at = o.fluids ? L.pos : L.home; pr.set([at[0], at[1], Math.max(0.004, L.hs[0] / aspect()), Math.max(0.004, L.hs[1])], i * 4); });
    const u = use('probe', probeT); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform4fv(u.pr, pr); gl.uniform2f(u.simTexel, 1 / S.sw, 1 / S.sh); blit(probeT);
    const out = new Float32Array(n * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, probeT.fb); gl.readPixels(0, 0, n, 1, gl.RGBA, gl.FLOAT, out);
    // soft caps (Angus: letters spun too frantically in Mosaic / Jags): tanh keeps small motions as they are and levels
    // big ones off at driftPush (screen heights) and driftSpin (radians); then ease toward that, at a limited turn speed.
    // Only the letters are capped, never the motion field itself.
    const a = aspect(), k = o.fluids ? dt * o.energy : o.energy * 0.06, P = o.driftPush, R = o.driftSpin, e = Math.min(1, dt * 3);
    const cap = (x, m) => m * Math.tanh(x / Math.max(m, 1e-6));
    letters.forEach((L, i) => { let vx = out[i * 4] * k, vy = out[i * 4 + 1] * k; const curl = out[i * 4 + 2];
      const len = Math.hypot(vx, vy);
      if (o.fluids) { const step = P * dt * 2, s = len > 0 ? cap(len, step) / len : 0;   // fluids on: a capped speed
        L.pos[0] += vx * s / a; L.pos[1] += vy * s; L.ang += cap(0.5 * curl * k, R * dt * 2); }
      else { const s = len > 0 ? cap(len, P) / len : 0, tx = L.home[0] + vx * s / a, ty = L.home[1] + vy * s;   // fluids off: settle onto the shifted home
        L.pos[0] += (tx - L.pos[0]) * e; L.pos[1] += (ty - L.pos[1]) * e;
        const d = cap(0.5 * curl * k, R) - L.ang; L.ang += Math.max(-R * dt * 2, Math.min(R * dt * 2, d * e)); }
      // the screen edges: the whole letter (its box as turned now) stays on screen
      const [ox, oy, hx, hy] = L.ink, cs = Math.cos(L.ang), sn = Math.sin(L.ang), c = Math.abs(cs), s = Math.abs(sn);
      const dx = (cs * ox - sn * oy) / a, dy = sn * ox + cs * oy, ex = Math.min(0.5, (c * hx + s * hy) / a), ey = Math.min(0.5, s * hx + c * hy);
      L.pos[0] = Math.min(1 - ex - dx, Math.max(ex - dx, L.pos[0])); L.pos[1] = Math.min(1 - ey - dy, Math.max(ey - dy, L.pos[1])); });
  }
  gl.bindTexture(gl.TEXTURE_2D, txtT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let textDrawnBig = false;
  function setText() {
    textDrawnBig = o.textMode === 4;
    if (typeof document === 'undefined') return;
    const h = Math.min(1080, o.height), w = Math.round(h * o.width / o.height), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), str = (o.text || '').trim();
    if (str) {
      const lines = str.split(/\s*\/\s*|\n/);   // "a / b" for two lines
      const big = o.textMode === 4, fit = big ? 0.96 : 0.84;   // inside: big letters that hold the fluid
      let fs = h * (big ? 0.8 : 0.34) / lines.length; x.font = `900 ${fs}px system-ui, sans-serif`;
      const widest = Math.max(...lines.map(l => x.measureText(l).width)); if (widest > w * fit) fs *= w * fit / widest;
      x.font = `900 ${fs}px system-ui, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const draw = (col, blur) => { x.filter = blur ? `blur(${Math.round(h * 0.02)}px)` : 'none'; x.fillStyle = col;
        lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05)); };
      x.globalCompositeOperation = 'lighter'; draw('#00ff00', true); draw('#00ff00', true); draw('#ff0000', false);
      makeLetters(lines, fs, w, h);
    } else letters = [];
    gl.bindTexture(gl.TEXTURE_2D, txtT); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  // image fill: a picture (an <img>, later a <video>) as the hidden map
  const imgT = gl.createTexture(); let imgAspect = 1, hasImage = false;
  gl.bindTexture(gl.TEXTURE_2D, imgT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
  function setImage(src) {
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height; if (!w || !h) return;
    gl.bindTexture(gl.TEXTURE_2D, imgT); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    imgAspect = w / h; hasImage = true;
  }
  let depth = 1;
  function zoom(x, y, s) {
    if (o.grid >= 2 || !(s > 0)) return;
    s = Math.min(s, 2000 / depth); s = Math.max(s, 1 / depth); if (Math.abs(s - 1) < 1e-6) return;   // between the start and 2000x
    depth *= s;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    const z = (prog, src, dst, fb, mul) => { const u = use(prog, dst); gl.uniform1i(u.uSrc, tex(0, src)); gl.uniform1i(u.uFb, tex(1, fb || src));
      gl.uniform2f(u.zc, x, y); gl.uniform1f(u.zs, s); gl.uniform1f(u.fb, fb ? 1 : 0); if (u.mul) gl.uniform4fv(u.mul, mul); blit(dst); };
    z('zoomTex', S.vel.read, S.vel.write, null, [s, s, 1, 1]); S.vel.swap();
    if (o.fluids) {
      z('zoomP', S.P.read, S.P.write); S.P.swap();
      if (o.paint === 'ink') { z('zoomTex', S.ink.read, S.ink.write, S.fresh, [1, 1, 1, 1]); S.ink.swap(); }
    }
  }
  let ambT = 0, idleT = 0;
  // ink drops: each grows over DROP_T seconds (easing out, like a drop spreading) to radius r (screen heights)
  const DROP_T = 0.6;
  // colour order (2026-10, Angus: a tune button for how drop colours are picked): 'random' (default, never repeats
  // the last one), 'cycle' (palette order), 'one' (always the first palette colour, like a single pot of ink).
  // opts.k forces a colour (pour reuses the colour its stream started with); opts.splash scales the landing splash
  // (a continuous pour uses a lighter splash per tick than a single tap). Returns the colour index used.
  function drop(x, y, size, opts) {
    opts = opts || {};
    const pl = SWIRL2_PALETTES[o.palette] || o.palette, n = pl.pal.length;
    let k;
    if (opts.k !== undefined) k = opts.k;
    else if (o.dropColours === 'cycle') k = n > 1 ? (lastLab + 1) % n : 0;
    else if (o.dropColours === 'one') k = 0;
    else { do k = Math.floor(Math.random() * n); while (n > 1 && k === lastLab); }
    lastLab = k;
    const r = (size || o.dropSize || 0.09) * (0.75 + 0.5 * Math.random()), sd = Math.random() * 50, sp = opts.splash ?? o.splash ?? 1;
    const ed = []; for (let i = 0; i < Math.round(5 * sp); i++) ed.push([Math.random() * TAU, r * (0.4 + 0.6 * Math.random()), (Math.random() < 0.5 ? -1 : 1) * (3 + 5 * Math.random()) * (0.5 + 0.5 * sp)]);
    const at = symOn() ? symCopies(x, y) : [[x, y, 0, 0, 0]];
    for (const [X, Y, , , m] of at) {   // symmetry: the same drop (colour, size, splash) at every copy
      drops.push({ x: X, y: Y, r, t: 0, a: 0, k, col: hex(pl.pal[k]), sd, bloom: opts.bloom ?? 1, life: opts.life });
      if (o.water) { idleT = 0; noSym = true; for (const [a0, rr, s] of ed) {   // splash: a few small eddies around the landing spot (5 at 1)
        const a = m ? -a0 : a0; splat(X + Math.cos(a) * rr * o.height / o.width, Y + Math.sin(a) * rr, 0, 0, m ? -s : s, 0.0006, true); } noSym = false; }
    }
    return k;
  }
  // water: each drop puts in its dye at once, then blooms outward for WATER_T seconds, the push easing off
  const WATER_T = 1.6, SOAP_T = 2.2;
  // soap (shift+i): a drop of dish soap: no colour, a strong wide push that makes the colours rush away from it
  // (water); on milk drops (marbling) a clear drop that pushes the rings aside and leaves bare milk
  function soap(x, y) {
    if (symOn()) { inSym = true; try { for (const [X, Y] of symCopies(x, y)) soap(X, Y); } finally { inSym = false; } return; }
    if (o.water) drops.push({ x, y, r: 0.18, t: 0, a: 0, k: 0, sd: Math.random() * 50, soap: true, inked: true });
    else drops.push({ x, y, r: 0.12, t: 0, a: 0, k: -1, col: [1, 1, 1], sd: 0 });
    idleT = 0;
  }
  function waterStep(dt) {
    let u;
    for (const d of drops) {
      if (!d.inked && !d.soap) { d.inked = true; const ab = d.col.map(v => -Math.log(Math.max(0.04, v)) * 1.4 * (o.inkStrength ?? 1));   // ink strength: scales absorbance (pale wash .. deep dye); waterShow still never lets it go black
        u = use('waterDye', S.dye.write); gl.uniform1i(u.uSrc, tex(0, S.dye.read)); gl.uniform2f(u.c, d.x, d.y);
        gl.uniform1f(u.R, d.r * 0.6); gl.uniform1f(u.sd, d.sd); gl.uniform1f(u.rag, o.ragged ?? 0.5); gl.uniform3fv(u.ab, ab); blit(S.dye.write); S.dye.swap(); }
      const T = d.soap ? SOAP_T : (d.life || WATER_T); d.t = Math.min(T, d.t + dt); const q = 1 - d.t / T, Rt = d.r * (0.45 + 0.55 * (1 - q * q));
      u = use('waterPush', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform2f(u.c, d.x, d.y);
      gl.uniform1f(u.R, Rt); gl.uniform1f(u.sd, d.sd); gl.uniform1f(u.rag, d.soap ? 0.15 : (o.ragged ?? 0.5));
      gl.uniform1f(u.sp, (d.soap ? 0.6 : (o.bloom ?? 1) * (d.bloom ?? 1)) * d.r * S.sh * 1.6 * q * q * dt * 12); blit(S.vel.write); S.vel.swap();
      if (d.soap) { u = use('waterClear', S.dye.write); gl.uniform1i(u.uSrc, tex(0, S.dye.read)); gl.uniform2f(u.c, d.x, d.y);
        gl.uniform1f(u.R, Rt * 0.55); gl.uniform1f(u.sd, d.sd); blit(S.dye.write); S.dye.swap(); }
    }
    drops = drops.filter(d => d.t < (d.soap ? SOAP_T : (d.life || WATER_T)));
    u = use('waterAdv', S.dye.write, S.dye.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.dye.read));
    gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.diff, Math.min(1, (o.spread ?? 0.01) * dt * 60)); blit(S.dye.write); S.dye.swap();
  }
  // fountains (2026-10-06, Angus: "points that keep pouring out colour and push, so the picture keeps evolving
  // without strokes"): each fountain is a steady push in a slowly rotating direction; in water mode it also trickles
  // its own palette colour every frame. Placed at the mouse (u), cleared all at once (shift+u) or by reset (r/R).
  const FOUNTAIN_MAX = 8, FOUNTAIN_PUSH = 2.6, FOUNTAIN_R = 0.011, FOUNTAIN_DYE_R = 0.045, FOUNTAIN_TRICKLE = 0.9;
  // ang0 / forceK let a preset (plantSprings) place fountains at fixed angles and colours, deterministic every time;
  // left out (the u key), each fountain gets its own random start angle, spin and colour, like a drop's splash
  function plantFountain(x, y, ang0, forceK) {
    if (!o.fountains || fountains.length >= FOUNTAIN_MAX) return;
    const pl = SWIRL2_PALETTES[o.palette] || o.palette, n = pl.pal.length;
    const k = forceK == null ? Math.floor(Math.random() * n) : forceK % n, col = hex(pl.pal[k]);
    const ab = col.map(v => -Math.log(Math.max(0.04, v)) * 1.4);
    const a0 = ang0 ?? Math.random() * TAU, spin = (forceK == null ? (Math.random() < 0.5 ? -1 : 1) : (k % 2 ? -1 : 1)) * (0.12 + 0.22 * ((k % 5) / 5 + (forceK == null ? Math.random() : 0.4)));
    const at = symOn() ? symCopies(x, y, Math.cos(a0), Math.sin(a0)) : [[x, y, Math.cos(a0), Math.sin(a0), 0]];
    for (const [X, Y, VX, VY, m] of at) {
      if (fountains.length >= FOUNTAIN_MAX) break;
      fountains.push({ x: X, y: Y, ang: Math.atan2(VY, VX), spin: m ? -spin : spin, ab, sd: Math.random() * 50 });
    }
  }
  function clearFountains() { fountains = []; }
  // a preset's starting fountains (startFountains n): fixed spots and angles, so the preset looks the same every time
  function plantSprings(n = 3) {
    if (!o.fountains) return;
    fountains = [];
    const spots = [[0.32, 0.6, 0.3], [0.7, 0.58, 2.65], [0.5, 0.27, 4.55]];
    for (let i = 0; i < Math.min(n, spots.length); i++) { const [x, y, a] = spots[i]; plantFountain(x, y, a, i); }
  }
  function stepFountains(dt) {
    if (!o.fountains || !fountains.length) return;
    const str = o.fountainStrength ?? 1;
    noSym = true;   // each fountain already holds its symmetry copies from when it was placed
    for (const fnt of fountains) {
      fnt.ang += fnt.spin * dt;
      const fx = Math.cos(fnt.ang), fy = Math.sin(fnt.ang);
      splat(fnt.x, fnt.y, fx * FOUNTAIN_PUSH * str * dt, fy * FOUNTAIN_PUSH * str * dt, 0, FOUNTAIN_R, true);
      if (o.water) {
        const u = use('fountainDye', S.dye.write); gl.uniform1i(u.uSrc, tex(0, S.dye.read)); gl.uniform2f(u.c, fnt.x, fnt.y);
        gl.uniform1f(u.R, FOUNTAIN_DYE_R); gl.uniform1f(u.sd, fnt.sd); gl.uniform1f(u.rate, 1 - Math.exp(-FOUNTAIN_TRICKLE * str * dt));
        gl.uniform3fv(u.ab, fnt.ab); blit(S.dye.write); S.dye.swap();
      }
    }
    noSym = false;
  }
  function stepDrops(dt) {
    if (!drops.length || o.grid >= 2) { drops = []; return; }
    for (const d of drops) {
      d.t = Math.min(DROP_T, d.t + dt); const f = 1 - (1 - d.t / DROP_T) ** 3, a1 = (d.r * f) ** 2;
      if (a1 <= d.a) continue;
      const ink = o.paint === 'ink', T = ink ? S.ink : S.P, u = use(ink ? 'dropInk' : 'drop', T.write);
      gl.uniform1i(u.uSrc, tex(0, T.read)); gl.uniform2f(u.c, d.x, d.y); gl.uniform1f(u.a0, d.a); gl.uniform1f(u.a1, a1);
      if (ink) gl.uniform3fv(u.col, d.k < 0 ? [0.975, 0.965, 0.94] : d.col); else gl.uniform1f(u.lab, 2 + d.k);
      blit(T.write); T.swap(); d.a = a1;
    }
    drops = drops.filter(d => d.t < DROP_T);
  }
  function step(dt) {
    dt = Math.min(dt, 1 / 30); time += dt;
    if (o.grid >= 2) { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); latticeStep(dt); return; }
    const f60 = dt * 60;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    ambT += dt;
    noSym = true;   // (the idle eddies are not copied by symmetry)
    if (o.ambient > 0 && o.fluidity < 1) for (let i = 0; i < 3; i++) {   // three slow drifting eddies keep it alive when idle (not at fluidity 1: then it stays as you leave it)
      const t = ambT * (0.05 + i * 0.017) + i * 2.1;
      splat(0.5 + 0.35 * Math.cos(t * 1.3 + i), 0.5 + 0.32 * Math.sin(t * 0.9 + i * 2), 0, 0, (i % 2 ? -1 : 1) * 0.4 * o.ambient * dt, 0.02, true);
    }
    noSym = false;
    let u;
    if (o.fluids) {
      if (o.curl > 0) {
        u = use('curl', S.curl, S.vel.read); gl.uniform1i(u.uVel, tex(0, S.vel.read)); blit(S.curl);
        u = use('vort', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uCurl, tex(1, S.curl));
        gl.uniform1f(u.curl, o.curl); gl.uniform1f(u.dt, dt); blit(S.vel.write); S.vel.swap();
      }
    }
    // fluidity 1 with fluids off: the motion stays exactly as you leave it, so thickness and branching shape your
    // stroke while you stir and stop a moment after you let go (otherwise they keep reshaping it and it drifts back)
    idleT += dt;
    const settled = o.fluidity >= 1 && !o.fluids && idleT > 0.25;
    if (o.viscosity > 0 && !settled && !o.instant) {
      u = use('scale', S.v0); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, 1); blit(S.v0);
      for (let i = 0; i < 12; i++) {
        u = use('visc', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uV0, tex(1, S.v0));
        gl.uniform1f(u.alpha, o.viscosity * f60); blit(S.vel.write); S.vel.swap();
      }
    }
    if (o.momentum > 0 && !settled) {
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
    if (o.text && o.textMode === 3) driftLetters(dt);
    if (o.text && o.textMode === 4) { u = use('walls', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uTxt, tex(1, { t: txtT })); blit(S.vel.write); S.vel.swap(); }
    if (o.text && o.textMode === 1) { u = use('obstacle', S.vel.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uTxt, tex(1, { t: txtT })); blit(S.vel.write); S.vel.swap(); }
    // fluidity: per-frame retention of motion
    u = use('scale', S.vel.write); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, Math.pow(o.fluidity, f60)); blit(S.vel.write); S.vel.swap();
    stepFountains(dt);   // fountains: a steady push (and, in water, a trickle of dye) every frame, after fluidity so it doesn't fade away

    const relax = 1 - Math.exp(-dt * o.heal);
    if (!(o.compose && !o.fluids && o.paint !== 'ink')) composing = false;
    if (o.water) waterStep(dt);
    else if (o.paint === 'ink') {
      renderBands(S.P0, S.fresh, time, false); blit(S.fresh);
      u = use('inkFwd', S.tmp); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.ink.read)); gl.uniform1f(u.dt, dt * o.energy); blit(S.tmp);
      u = use('advectInk', S.ink.write); gl.uniform1i(u.uFwd, tex(3, S.tmp)); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.ink.read)); gl.uniform1i(u.uFresh, tex(2, S.fresh));
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06); gl.uniform1f(u.spline, o.spline ? 1 : 0); gl.uniform1f(u.reveal, o.reveal || 0); gl.uniform1f(u.mac, o.smooth ? 0 : 1);
      gl.uniform1f(u.sat, Math.pow(o.saturation, f60)); gl.uniform1f(u.bright, Math.pow(o.brightness, f60)); gl.uniform1f(u.contrast, Math.pow(o.contrast, f60));
      blit(S.ink.write); S.ink.swap();
    } else if (o.compose && !o.fluids) {
      if (!composing) { u = use('scale', S.velPrev); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, 1); blit(S.velPrev); composing = true; }   // just switched on: start from now
      u = use('composeP', S.P.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.P.read)); gl.uniform1i(u.uPrev, tex(2, S.velPrev));
      gl.uniform1f(u.disp, o.energy * 0.06); blit(S.P.write); S.P.swap();
      u = use('scale', S.velPrev); gl.uniform1i(u.uSrc, tex(0, S.vel.read)); gl.uniform1f(u.k, 1); blit(S.velPrev);
    } else if (o.fold && !o.fluids) foldStep();
    else {
      u = use('advectP', S.P.write); gl.uniform1i(u.uVel, tex(0, S.vel.read)); gl.uniform1i(u.uSrc, tex(1, S.P.read));
      gl.uniform1f(u.dt, dt * o.energy); gl.uniform1f(u.relax, relax); gl.uniform1f(u.flow, o.fluids ? 1 : 0); gl.uniform1f(u.disp, o.energy * 0.06); gl.uniform1f(u.spline, o.spline ? 1 : 0);
      blit(S.P.write); S.P.swap();
    }
    if (!o.water) stepDrops(dt);
  }
  // Save PNG (Angus: it shouldn't lose resolution): draw the current picture again, scale times the canvas size, into
  // a separate 8-bit target, and return its pixels (bottom row first). Nothing moves; the screen is untouched.
  let pxs = 1, lastT = 0;
  function exportPixels(scale = 1) {
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    const s = Math.max(0.1, Math.min(scale, max / o.width, max / o.height)), W = Math.round(o.width * s), H = Math.round(o.height * s);
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { t, fb, w: W, h: H }; };
    // fx: colour split / hair streaks are post passes too (same as outline): give them the same full-resolution
    // scratch-buffer swap so Save PNG draws them at export resolution, not screen resolution
    const needPost = o.outline || o.gloss > 0 || o.split > 0 || o.hair > 0;
    const tgt = mk(), out = needPost ? mk() : null, out2 = needPost ? mk() : null, keep = S.out, keep2 = S.out2;
    try {
      pxs = s; if (out) { S.out = out; S.out2 = out2; }
      render(lastT, tgt);
      const data = new Uint8Array(W * H * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fb); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return { width: W, height: H, scale: s, data };
    } finally { pxs = 1; S.out = keep; S.out2 = keep2; for (const f of [tgt, out, out2]) if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.t); } gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
  }
  function render(t = time, target = null) {
    if (!target) lastT = t;
    if (o.water) {   // glass dish (o.dish): the same dye render, with a shadow, a caustic shimmer and a highlight on top
      const u = use(o.dish ? 'waterDish' : 'waterShow', target || { w: o.width, h: o.height });
      gl.uniform1i(u.uSrc, tex(0, S.dye.read)); if (o.dish) gl.uniform1f(u.time, t);
      blit(target); return;
    }
    const to0 = target || { w: o.width, h: o.height };
    const line = o.outline && S.out, doGloss = (o.gloss || 0) > 0 && S.out2, doSplit = o.split > 0 && S.out2, doHair = o.hair > 0 && S.out2;
    const stages = (line ? 1 : 0) + (doGloss ? 1 : 0) + (doSplit ? 1 : 0) + (doHair ? 1 : 0);   // post passes, in this order
    const bufs = [S.out, S.out2]; let bi = 0, done = 0;
    const base = stages ? bufs[bi] : target;
    const u = renderBands(S.P.read, base, t, true);
    gl.uniform1f(u.inkOn, o.paint === 'ink' ? 1 : 0); gl.uniform1i(u.uInk, tex(1, S.ink.read));
    blit(base);
    let cur = base;
    if (line) {   // outline: draw the picture, then the lines around its colour regions on top
      done++; const nxt = done < stages ? bufs[(bi = 1 - bi)] : target;
      const v = use('outline', to0); gl.uniform1i(v.uSrc, tex(0, cur)); gl.uniform1f(v.pxs, pxs); blit(nxt); cur = nxt;
    }
    // gloss (o.gloss, post pass): the finished picture (outline included, if on) lit as raised glossy paint
    if (doGloss) {
      done++; const nxt = done < stages ? bufs[(bi = 1 - bi)] : target;
      const v = use('gloss', to0); gl.uniform1i(v.uSrc, tex(0, cur)); gl.uniform1f(v.amt, o.gloss); gl.uniform1f(v.pxs, pxs); blit(nxt); cur = nxt;
    }
    // ==== fx: COLOUR SPLIT (o.split, off by default) ===========================================================
    // a post pass over the finished picture (chromatic fringing along the local flow velocity, see the 'split'
    // shader above). Kept as its own clearly-delimited step so another post pass (e.g. a 'gloss' pass on another
    // branch) can be chained before or after it without touching this block.
    if (doSplit) {
      done++; const nxt = done < stages ? bufs[(bi = 1 - bi)] : target;
      const v = use('split', to0);
      gl.uniform1i(v.uSrc, tex(0, cur)); gl.uniform1i(v.uVelD, tex(8, S.vel.read)); gl.uniform2f(v.mvTexel, 1 / S.sw, 1 / S.sh);
      gl.uniform1f(v.split, o.split); gl.uniform1f(v.pxs, pxs); blit(nxt); cur = nxt;
    }
    // ==== fx: HAIR STREAKS (o.hair, off by default) =============================================================
    // a post pass over the finished picture (fine LIC-style streaks along the local flow velocity, see the 'hair'
    // shader above). Kept as its own clearly-delimited step, same reason as colour split above.
    if (doHair) {
      done++; const nxt = done < stages ? bufs[(bi = 1 - bi)] : target;
      const v = use('hair', to0);
      gl.uniform1i(v.uSrc, tex(0, cur)); gl.uniform1i(v.uVelD, tex(8, S.vel.read)); gl.uniform2f(v.mvTexel, 1 / S.sw, 1 / S.sh);
      gl.uniform1f(v.hair, o.hair); gl.uniform1f(v.pxs, pxs); blit(nxt); cur = nxt;
    }
  }
  // switching paint mode: start the ink from the current bands so nothing jumps
  function set(params) {
    const wasInk = o.paint === 'ink', fillWas = o.fill;
    Object.assign(o, params);
    if ('text' in params || ('textMode' in params && (params.textMode === 4) !== (textDrawnBig))) setText();
    // a new fill keeps your motion and the stirred coordinates (the pattern you made, now in the new fill / picture);
    // only the ink is redrawn from them. Clicking the same fill again (re-roll) and presets still reset
    if (o.fill !== fillWas) { gl.disable(gl.BLEND); renderBands(S.P0, S.fresh, time, false); blit(S.fresh);
      if (o.paint === 'ink') { renderBands(S.P.read, S.ink.read, time, false); blit(S.ink.read); } return; }
    if (o.paint === 'ink' && !wasInk) { renderBands(S.P.read, S.ink.read, time, false); blit(S.ink.read); }
  }
  function resize(w, h) { o.width = w; o.height = h; alloc(); setText(); }
  alloc(); setText();
  return { step, render, exportPixels, splat, drop, soap, get dropping() { return drops.length > 0; }, randomize, boost, burst, zoom, reset, resize, set, opts: o, get depth() { return depth; }, setImage, get hasImage() { return hasImage; }, get peek() { return peeking; }, set peek(v) { peeking = !!v; },
    plantFountain, clearFountains, plantSprings, get fountainCount() { return fountains.length; } };
}
if (typeof window !== 'undefined') { window.createSwirl2 = createSwirl2; window.SWIRL2_PALETTES = SWIRL2_PALETTES; window.SWIRL2_PRESETS = SWIRL2_PRESETS; window.SWIRL2_FILLS = SWIRL2_FILLS; }
