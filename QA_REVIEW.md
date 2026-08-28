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
