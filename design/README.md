# Vela brand assets

Source vector for the mark and the domain icon set.

**Direction A (Sloop) is the chosen mark.** B and C are kept as the record of what it
was chosen against — don't ship them.

## Marks

Three directions, all on a 48-unit grid, all using the same two coral steps from
`packages/shared/src/tokens.ts` so they compare on drawing rather than on colour:

| File | Direction |
| --- | --- |
| `brand/mark-sloop.svg` | **A — Sloop.** Mainsail + jib on a shared mast. |
| `brand/mark-vsail.svg` | **B — V-Sail.** A monogram V whose right arm is the sail's luff. |
| `brand/mark-constellation.svg` | **C — Constellation.** A, with four stars cut out of the mainsail for Vela the constellation. |

Direction A also has `mark-sloop-mono.svg` (one ink, `currentColor`) and
`mark-sloop-reversed.svg` (cream on transparent, for the coral splash ground).

Each has a matching `lockup-*.svg` (mark + wordmark, **live text** — outline it before
sending anywhere without Outfit installed) and `appicon-*.svg` (1024×1024, full-bleed,
no rounding baked in, artwork inside the 66% safe circle).

The mast slot in A and C is 4 units wide rather than 3: below about 40px a 3-unit gap
closes up and the mark collapses into a single triangle.

## Icons

`icons/*.svg` — nine glyphs on the Lucide grid: 24px box, 2px round strokes,
`currentColor`, no fills except two deliberate solid dots. They are meant to sit beside
the Lucide set the apps already ship, so anything Lucide already does well is *not*
duplicated here.

`sail` · `wake` · `readiness` · `pain-point` · `range-of-motion` · `sets-reps` ·
`tempo` · `program-block` · `trend-wave`

## Where these are used

The path data is duplicated into `apps/web/src/components/VelaMark.tsx` and
`apps/mobile/src/components/VelaMark.tsx` rather than loaded as an asset, so a logo
never costs a request. Edit the SVG here first, then mirror it into both components.

The icon components are generated from `icons/*.svg` into
`apps/web/src/components/icons.tsx` and `apps/mobile/src/components/icons.tsx`.

Rasters come from the SVGs via `qlmanage -t -s <px> -o <dir> <file.svg>`:

| Output | Source | Size |
| --- | --- | --- |
| `apps/mobile/assets/images/icon.png` | `brand/appicon-sloop.svg` | 1024 |
| `apps/mobile/assets/images/splash-icon.png` | `brand/mark-sloop-reversed.svg` | 512 |
| `apps/web/src/app/apple-icon.png` | `brand/appicon-sloop.svg` | 180 |

The web favicon is `apps/web/src/app/icon.svg`, picked up by Next's app-router file
convention. The Next starter `favicon.ico` was removed so only the Vela icon is emitted.

## Into Figma

Figma parses SVG source pasted onto a canvas — copy a file's contents, paste, and it
arrives as editable vector layers. No import step and nothing flattens to an image.
