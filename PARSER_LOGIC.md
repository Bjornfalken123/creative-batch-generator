# Parser logic

## Automatic source detection

The user uploads one file. No source selection is required.

- `.zip` → HTML5 ZIP parser
- `.xls` / `.xlsx` → Google Campaign Manager parser
- text/HTML/JS → content detection:
  - SeenThis loader/build structure → SeenThis
  - Adform `Tag N.` / `track.adform.net` structure → Adform
  - otherwise import is rejected rather than guessed

## Creative Type detection

Creative Type is stored per creative and written per row in Excel.

- SeenThis tag → `javascript`
- Adform standard JavaScript tag → `javascript`
- Google Campaign Manager JavaScript tag → `javascript`
- HTML5 ZIP with no MRAID/ORMMA API → `html`
- HTML5 ZIP using ORMMA → `ormma`
- HTML5 ZIP using MRAID 2-only APIs → `mraid2`
- HTML5 ZIP using MRAID where the version cannot be proven → row is excluded until the user chooses `mraid1` or `mraid2`

The parser never converts HTML to JavaScript merely because the HTML references SeenThis resources.

## HTML5 ZIP safety

The ZIP parser finds `manifest.json` + its source `index.html`, including nested creative ZIPs.

A package is exportable into this Excel workflow when:

- width and height can be identified,
- the size exists in the template,
- Creative Type can be resolved,
- `index.html` is within Excel's 32,767-character cell limit,
- the HTML does not depend on local package assets.

HTTP(S), protocol-relative, data/blob URLs and platform-provided `mraid.js`/`ormma.js` are not treated as local asset dependencies.
