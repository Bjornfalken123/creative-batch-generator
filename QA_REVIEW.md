# QA Review — v2.0

## Static/type checks

- `tsc --noEmit`: pass
- Hawk template schema/header check added
- Hawk template capacity/version read dynamically
- ZIP production path removed

## Parser regression tests with supplied files

Tests run against the Hawk template currently bundled with the project.

| Delivery | Detected source | Source items | Creatives | Auto-included with current template |
|---|---:|---:|---:|---:|
| MOOD Wellness | SeenThis | 7 | 7 | 6 |
| Friskis Riks | SeenThis | 2 | 2 | 1 |
| Fältöversten | SeenThis | 7 | 7 | 6 |
| Västermalmsgallerian | SeenThis | 28 | 28 | 24 |
| Arbetsförmedlingen official tags | SeenThis | 3 | 3 | 3 |
| Arlanda Express / Azerion | Adform | 11 | 11 | 6 |

Current exclusions are expected from template coverage or ambiguity, not parser loss.

### Future-size regression

When test size entries for `980x240` and `1080x1920` are added to the size list:

- Västermalmsgallerian becomes 28/28 included
- Friskis becomes 2/2 included

No parser change is required when those sizes are added to the real Hawk template.

### Ambiguous-size regression

Adform `160x600` resolves to two Hawk options:

- `160x600 (desktop)`
- `160x600 (smartphone)`

The row is excluded until the operator selects one. The app does not guess.

### SeenThis clicktag regression

- existing `${HAWK_CLICK}...` → replaced with final URL-encoded Landing Page
- official empty `data-clicktag=""` → populated correctly
- missing `data-clicktag` attribute → row warning; tag is not rewritten silently

## Excel/template verification

The bundled template is identical to the original empty template supplied for the project. The completed Västermalmsgallerian workbook confirms that:

- comments are intentionally retained in the Script cell
- Creative Type is `javascript` for SeenThis tags
- `Other` is used as the SeenThis AdServer
- Hawk size labels such as `Square banner(300x250)` / `Full screen portrait (320x480)` are valid where required

The generator preserves the Hawk formulas and updates workbook recalculation flags.

## Production limitation

Google `.xls/.xlsx` support depends on SheetJS at build time. Full browser build could not be executed in the isolated QA environment because the environment cannot resolve the official SheetJS CDN dependency. TypeScript validation passes; Cloudflare/GitHub build remains the final dependency-resolution check.
