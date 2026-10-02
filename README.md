# swirlfluid

Stir a posterized swirl fluid in your browser. **Live: https://angusforbes.github.io/swirlfluid/**

![swirlfluid](screenshot.jpg)

Flat poster-coloured swirl bands painted onto a real fluid simulation: stirring marbles them like paper, and when
left alone the picture slowly heals back to its original pattern. Each colour band changes colour on its own clock.

## Controls

| | desktop | phone / tablet |
|---|---|---|
| stir | drag | one finger |
| spin a whirlpool | hold `Shift`+`→` (clockwise) or `Shift`+`←` (anticlockwise); spins under the cursor | press and hold still; or twist two fingers (either way) |
| presets | `1`–`9` or the buttons | buttons |
| palette | `p` or the dots in **tune** | dots in **tune** |
| tune panel | `t` | **tune** button |
| reset / save PNG / hide help | `space` / `s` / `h` | buttons in **tune**; tap to bring the help back |

**copy link** in the tune panel copies a URL with your settings, e.g. `?preset=Jupiter&palette=sea&curl=12`.

## Presets and knobs

Nine presets: Poster, Tar, Ice Cracks, Cubism, Silk, Kaleidoscope, Jupiter, Watercolour, Milky Way.
The knobs take ideas from [Fluid Automata](https://github.com/CreativeCodingLab/FluidAutomataJS)
(Forbes, Höllerer, Legrady, *Generative fluid profiles for interactive media arts projects*, CAe 2013), reworked
for this renderer:

- **fluidity**: how long motion lasts · **thickness**: velocity spreads into its neighbours (tar)
- **branching** / **branch angle**: part of the motion peels off sideways at an angle
- **energy**: how far paint is carried · **curl**: how hard small eddies are kept spinning
- **heal**: how fast the picture relaxes back
- **lattice**: off = a smooth fluid; N = Fluid Automata's own lattice (used by Ice Cracks and Cubism): N×N cells,
  each holding a vector that is handed on to its neighbours by overlap, and the picture is redrawn each frame through
  that coarse mesh with every vertex shifted by its vector, so it tears along triangle edges · **memory**: how much of
  the last frame survives each lattice frame
- **carry**: how hard the lattice drags the bands underneath · **jitter**: irregular lattice · **facets**: each triangle
  moves its piece rigidly with its own shade (Cubism)
- **crisp ink**: pulls smeared ink back toward the palette so it keeps hard edges · **wash**: draw bands as watercolour
- **bands**: band density · **colour drift**: how fast bands change colour
- **fluids** off: motion stays where you put it (a displacement) instead of flowing on
- **ink**: colours smear and blend instead of staying crisp poster bands

## How it works

`swirl2.js` is a stable-fluids solver in WebGL2 (advection, vorticity confinement, pressure projection). Instead
of dye it carries a texture of *material coordinates*; the display shader turns those coordinates into flat colour
bands with outlines, so the bands stay crisp however much they are stirred. Ink mode carries a colour image instead.
No dependencies or build step: open `index.html` straight from disk. The first version lives at [`classic/`](classic/).

## Fluid Automata ([`automata/`](automata/))

A loose re-creation of Fluid Automata (Forbes, Höllerer, Legrady, CAe 2013) on the GPU: a grid of 8-bit energy
vectors (256 orientations x 256 magnitudes); each step a cell's energy splits into forward / left / right streams
(forward share, left:right split, angularity), each stream displaces a copy of the cell and hands partials to the cells
it overlaps, then everything is damped (fluidity). Optional max outflow, jitter, wrap-around or bouncing walls. The
image is a feedback loop: the previous frame distorted by the field, blended with a background (colour / grey / b&w
noise, palette noise fields, live noise, camera, or a dropped image), then saturation, brightness and contrast.
Profiles are the original JS presets plus a few from the paper (fine grids, max outflow, jitter, low-res b/w smear).
`v` shows the vectors.

## Licence

Apache-2.0
