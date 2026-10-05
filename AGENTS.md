# swirlfluid: notes for agents

Live site: https://angusforbes.github.io/swirlfluid/ (GitHub Pages from `main`; push = deploy, give it a minute).
Angus mostly tunes it on his phone and desktop browser; read `~/.pi/agent/notes/working-with-angus.md` too.

## Debug captures (read these instead of asking for screenshots)

The page has a **debug** button (tune panel) and the **d** key. It asks Angus for an optional note, then saves the
canvas plus every setting:

- With the receiver running (`python3 tools/debug-receiver.py`, listens on 127.0.0.1:8790, works from the live https
  site and from local copies on the same machine), each capture lands in this repo:
  `debug/captures/<YYYYmmdd-HHMMSS>-<preset>/shot.png`, `state.json`, `note.md`, and one line in
  `debug/captures.jsonl` (newest last). `debug/` is git-ignored.
- Without it (his phone), the page downloads `swirlfluid-debug-<time>-<preset>.png` and `.json`; he can send those.

`state.json` has the preset, the built-in preset it came from (`base`), whether it is one of his saved presets
(`mine`), the share link, every option (`opts`), the grid sizes in rows (`rows`), screen size, device pixel ratio,
browser and the note. To reproduce: open `link` in a headless browser at the same `screen.css` size and `screen.dpr`.

Start with the newest: `tail -3 debug/captures.jsonl`, then read its `note.md`, `state.json` and `shot.png`.

## Rules learned here

- **Bump the `?v=` on the `<script src>` tags in `index.html` whenever `swirl2.js` or `automata.js` changes.** GitHub
  Pages caches scripts for 10 minutes and browsers keep them longer: Angus saw the new panel (HTML) running old engine
  code, so a new feature (burst) seemed missing.

- **Never change how an existing preset looks** when adding a feature: new behaviour goes behind a toggle or option
  that defaults off (smooth, instant, reach 1, pixelate off, map 'same'). Presets are Angus's finds.
- **Test at phone pixel density** (Playwright `deviceScaleFactor: 2.5`): "1 CSS pixel" bugs only show there (the
  pixelate-off regression made every picture stair-stepped on his phone only).
- **"It looked better before"**: check out the old commit in a worktree (`git worktree add /tmp/old <hash>`) and
  render both side by side with the same stir; find the commit, then fix only that.
- **Measure, don't eyeball**: e.g. the share of pixels that change between two frames tells "stays put" from "drifts".
- The tune panel dims settings that do nothing with the current toggles (IDLE / IDLE_BTNS in `index.html`) and each
  has a tooltip (TIPS). Keep those maps in step with the engine when you change what a setting does.
- The lattice (Ice Cracks, Cubism, Silk; lattice / jitter / memory / carry sliders; facets) is commented out of the
  UI on Angus's request, not deleted: the engine code is still there.
- His saved presets live in localStorage (`swirlfluid.presets`); to make one built-in, he sends its copy link or a
  debug capture.

## Testing

Headless Chromium via `playwright-core` (`executablePath: '/usr/bin/chromium'`, args `--use-angle=swiftshader
--enable-unsafe-swiftshader`). Serve the repo yourself (`python3 -m http.server <port> --bind 127.0.0.1` from the
repo); port 8765 is often taken by another project. Hide `.panel,#tuneBtn,#help` before stirring, or the drag lands
on the panel.

## State as of 2026-10-04 (v39) and open threads

- Keys: n random vectors, m more energy (x1.5), g random stir, space pause (freezes step + time, still renders), R new start (new squares + preset's `startStir`),
  r back to the grid (same squares, `reset(true)`), l hold = peek map, c palette, p pin (fluidity..bands keep values
  across presets), k stars (off by default), Esc hide all panels, hold Shift = mouse hands off.
- Browser-remembered prefs (localStorage): `swirl-mixed-squares` (mixed squares default unless '0'), `swirl-pin`,
  `swirl-stars`, `swirl-text` ({text, textMode 0 off/1 still/2 flows/3 drift/4 inside, driftSpin, driftPush, textColour}).
- Mosaic 2: fill 'mixed squares' (67% split, FILL_NUM maps it to squares), `startStir: 6` (n + m x6).
- Text: still = `obstacle` shader on velocity + overlay; flows = letters in picture space (p0) in display; drift =
  per-letter glyph atlas, `probe` shader + readPixels (needs f32) each frame. Text v2 ideas offered, awaiting Angus:
  font choice, drag to place, palette-coloured letters, stronger bounce, letters pushing colours / colliding.
- Next: camera feed as the image fill (setImage takes a <video>; re-upload per frame).
- Open decisions on the @swirlfluid card: D1 LLM palette route (default bring-your-own-key), D2 map edges
  (default endless), D3 strata file picker crashes Brave on file dialogs (image button, Save PNG; default keep).
- Brave hangs/crashes on any file dialog were strata (`strata --portal`, the FileChooser portal), not the site.
- Test server: `python3 -m http.server 8799 --bind 127.0.0.1`; Playwright scripts in /tmp/pwt.
- Save PNG (v45): `swirl.exportPixels(scale)` re-renders the display pass into an RGBA8 target at scale x canvas
  (uniform `pxs` + `FC` macro keep grain/tiles/outline the same size). scale = device px / canvas px (phones: canvas is
  capped at 1.5 dpr) x the PNG size setting (`swirl-save-scale`: screen / 2x / 3x). Per-pixel effects must use `FC`,
  not `gl_FragCoord`, or they shrink in 2x exports.
- Save PNG smoothing (v47): every preset (BASE smoothPng: true) renders at up to 3x and box-averages in linear light;
  it drops to 2x/1x when over MAX_TEXTURE_SIZE (16384 on Angus's Intel) or 120 Mpx, so PNG 3x has NO smoothing.
  Later: tiled export (N on the card).
