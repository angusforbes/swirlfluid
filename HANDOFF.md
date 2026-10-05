# swirlfluid handoff (Prism[a], 2026-10-05)

Live site: https://angusforbes.github.io/swirlfluid/ (GitHub Pages from `main`; push = deploy). Read AGENTS.md first.
Project card: hyprpi board @swirlfluid (world D). Peer: Prism (owns video v1 N61, runs an Intel-GPU check after merges: ask it).

## State at handoff (15:20 CDT)
- `main` = v75 (c6e8372), pushed. **The live site was still serving v73**: GitHub Actions was degraded; Pages runs failed
  (report-build-status timed out), got cancelled, and run 37368075951 was still *queued*. Check with
  `curl -s https://angusforbes.github.io/swirlfluid/index.html | grep -o "swirl2.js?v=[0-9]*"`; if still v73 once
  Actions recovers, re-run it (`gh run rerun <id>`) or push an empty commit. Angus noticed ("I don't see coral,
  milk drops still there"); local copy http://127.0.0.1:8799/ (python http.server pid 46566 on ~/Work/swirlfluid) is current.
- HANDOFF.md itself is committed locally only (not pushed, to avoid cancelling the queued deploy).

## Built this session (all options default OFF; existing presets unchanged unless Angus asked)
- Smudge Squares (then hidden), square brush (`box`) + axis snap toggles.
- FA: hid Columns/Milky Way/Rainbow Drop/Ember/Nebulae; Glassy energy 0.07; fixed the dead top-right mesh triangle
  (corner quad diagonal + all-pinned triangles drawn first).
- Ink drops (`drops`, P.w label carried nearest-pixel; `milk`; palette `food`); water mode (`water`: S.dye absorbance,
  waterAdv/waterDye/waterPush/waterShow, soft cap 0.9 = never black); keys i (ink) / I (soap); sliders bloom, spread,
  dropSize, ragged, splash. Ink in Water preset.
- Symmetry (`sym` 2/3/4/6/8, `symMirror`, `symCentres` via o / O keys): splat, drop, soap, n, fountains copy.
  Mosaic Mandala preset.
- Merged from 6 parallel agents (worktrees ~/Work/swirlfluid-wt/*): fx (colour split; hair slider hidden), fountains
  (u / U, fountainStrength), ink (pour, inkStrength, dropColours), gloss (gloss slider, Enamel; glass dish `dish`),
  grow (Gray-Scott on S.grow, grow button kinds, growSpeed, Coral; finished by hand: advection per mode).
  Post-pass chain in render(): bands -> outline -> gloss -> split -> hair via S.out/S.out2; exportPixels allocates both.
- Hidden at Angus's request (commented out, restorable): Milk Drops, Springs, Mandala, Fluid Mandala, Ink Ribbons,
  Fur, Glass Dish, hair slider.

## Parked
- **Rake / Marbled Paper** on branch `feat/rake` (worktree ~/Work/swirlfluid-wt/rake): Jaffer exact tine shader
  (`comb`) + stone field on n. Angus: "looks really bad, stop working on it". Strokes shear the stones into
  stripy streaks, not chevrons. Don't merge. Remove the worktree when sure it's dead.

## How to test (lightly! the laptop overheated)
- Serve: `python3 -m http.server 8799 --bind 127.0.0.1` in the repo. Playwright scripts in ~/.cache/swirl-pwt
  (chk.mjs presets... = stir/tap/n/exportPixels(3)). ONE browser, few screenshots, kill servers after.
- Never merge in ~/Work/swirlfluid itself (Prism's test server reads it): merge in a temp worktree, test, then
  `git merge --ff-only`. Helpers: ~/.cache/swirl-pwt/fixbase.py (BASE-line conflicts), union.py (keep both),
  linemerge.py (token 3-way merge of one-line conflicts). Bump ?v= on both script tags each engine change.
- Never run in-process Agent subagents that launch headless Chromium in parallel: 6 at once + 2 reworks pegged
  the CPU (Thoughts-D stopped the session).

## Open / next
- Confirm v75 deploys. Ink in Water "needs some tweaking" (Angus, unspecified). Fluid Mandala was weak (hidden now).
- Coral background shows coarse blocks (its fill); maybe smooth.
