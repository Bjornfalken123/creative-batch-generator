# Changelog

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
