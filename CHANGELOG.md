# Changelog

## v1.2.0

- Fixed HTML5 ZIP asset detection. Minified JavaScript expressions such as `window.location.href` and JavaScript helper calls named `url(...)` are no longer mistaken for local package files.
- Local-asset validation now inspects actual HTML asset attributes (`src`, `href`, `poster`, `data`, `srcset`) and CSS `url(...)` references only inside CSS contexts.
- The supplied Arbetsförmedlingen bundle now identifies all three HTML creatives as self-contained for the batch template: 300x250, 320x320 and 300x600.
- HTML5 ZIP rows still remain excluded when the HTML really references local package files that cannot be represented in the single Script cell.

## v1.1.0 — Automatic source + creative type

- Removed the manual source selector. The app now detects:
  - SeenThis text tags
  - Adform text tag sheets
  - Google Campaign Manager XLS/XLSX
  - HTML5 ZIP packages
- Removed the global Creative Type selector.
- Creative Type is now assigned per creative:
  - SeenThis / Adform / Google JavaScript tags → `javascript`
  - HTML5 ZIP → `html`
  - ORMMA packages → `ormma`
  - MRAID packages → `mraid1` / `mraid2` when confidently detectable
  - ambiguous MRAID versions require a row-level choice instead of a global setting
- HTML5 ZIP content is no longer converted into JavaScript.
- The original `index.html` is preserved in the exported tag/content cell.
- HTML5 ZIP packages that reference required local files are excluded because a single Excel cell cannot carry those assets.
- AdServer is auto-selected from the detected source and remains editable.
