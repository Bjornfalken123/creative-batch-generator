# QA review — v1.1

## Automation checks

- Manual source selector removed.
- Global Creative Type selector removed.
- Creative Type is stored/exported per creative.
- SeenThis / Adform / Google JS parsers assign `javascript`.
- HTML5 ZIP parser assigns `html` when no MRAID/ORMMA API is present.
- Ambiguous MRAID does not guess a version.

## Arbetsförmedlingen ZIP

The supplied campaign bundle contains three nested creative ZIPs:

- 300x250
- 320x320
- 300x600

Each `index.html` is approximately 19.2k characters, below Excel's 32,767-character cell limit.

The inspected HTML does not reference MRAID and does not depend on required local package assets. It uses external SeenThis/Sting resources and data URLs. Therefore the expected Creative Type is `html`, and the original HTML is preserved rather than converted to JavaScript.

## Existing parser regression

- SeenThis tags remain `javascript`.
- Adform standard JS tags remain `javascript`.
- Google Campaign Manager JS tags remain `javascript`.
- Unsupported template sizes remain excluded without blocking valid rows.


## v1.3 regression: Arbetsförmedlingen HTML5 bundle

The v1.1 local-asset scanner produced false positives from minified JavaScript (`window.location.href` and a JS `url(...)` helper), causing all three rows to be excluded before export. v1.3 limits asset scanning to real HTML asset attributes and CSS contexts. Expected import result with the current template:

- 300x250 → Creative Type `html`, included
- 320x320 → Creative Type `html`, included
- 300x600 → Creative Type `html`, included
- detected Landing Page → `https://arbetsformedlingen.se/`
- no false local-asset warning

IAB Category is intentionally still required as a campaign-level user choice before the Export button becomes enabled.
