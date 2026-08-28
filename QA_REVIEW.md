# QA Review – v0.7

Reviewed against the customer examples supplied during development.

## SeenThis fixtures

| File | Tags found | Included with current template | Expected exception |
|---|---:|---:|---|
| MOOD Wellness | 7 | 6 | `980x240` missing in current template |
| Friskis & Svettis | 2 | 1 | `1080x1920` missing in current template |
| Fältöversten | 7 | 6 | `980x240` missing in current template |
| Västermalmsgallerian | 28 | 24 | four `980x240` rows missing in current template |

When the future Hawk template contains `980x240` and `1080x1920`, those rows should become normal automatic matches without code changes.

## Adform fixture

11 tag blocks detected.

Current-template result:
- 6 unique matches included automatically.
- 4 dimensions missing: `336x280`, `970x90`, `980x240`, `600x300`.
- `160x600` is ambiguous because the current Hawk template contains separate desktop / smartphone choices. v0.7 requires an explicit user choice instead of silently picking one.

## Google Campaign Manager fixture

The supplied XLS is a Campaign Manager tag sheet using `Impression Tag (JavaScript)`. The detected example is a `1x1` tracking/impression tag (`trackimpj`), so v0.7 treats it as tracking-only and excludes it by default.

The Google parser also supports normal Campaign Manager sheets that expose a standard `JavaScript Tag` column.

## Export safeguards reviewed

- Unknown sizes do not block valid rows.
- Ambiguous dimensions do not silently map to one Hawk ID.
- Landing Page is cleared on every new file import.
- IAB Category is required per import.
- Source-specific AdServer defaults are applied.
- SeenThis is the only source with automatic Hawk clicktag URL rewriting.
- Customer Adform / Google tag code is not rewritten.
- Google JavaScript tag whitespace is preserved.
- Names over 200 characters block export until corrected.
- Maximum included rows: 200.
- Script/tag length is checked against Excel's 32,767-character cell limit.
- Wrong text-source selection is detected for SeenThis vs Adform.
- Import exceptions are shown in the UI rather than becoming unhandled errors.


## HTML5 ZIP fixture — Arbetsförmedlingen bundle

Expected structure:
- Outer bundle contains fallback JPEGs plus `300x250.zip`, `320x320.zip`, `300x600.zip`.
- Each nested ZIP contains `manifest.json`, `index.html`, `poster.jpeg`.

Expected import:
- 3 creative packages detected.
- Dimensions: 300x250, 320x320, 300x600.
- One consistent Landing Page detected: `https://arbetsformedlingen.se/`.
- `manifest.json` and `<meta name="ad.size">` agree for all three.
- No required local asset references are present in the supplied `index.html` files; external SeenThis resources are used.
- Converted wrapper lengths are approximately 20,301–20,302 characters, below Excel's 32,767-character cell limit.
- All three sizes exist in the current template and should be includable.
- The original ZIP/fallback customer files must not be copied into the GitHub repository.

Negative tests:
- ZIP with required relative assets in `index.html` → visible warning + excluded by default.
- ZIP whose converted JavaScript exceeds 32,767 chars → excluded.
- ZIP with multiple distinct click destinations → Landing Page is not auto-filled and an import warning is shown.
- ZIP with malformed / missing manifest source → skip affected creative and show issue.
- ZIP bomb / excessive uncompressed size / ZIP64 → reject safely before normal parsing.
