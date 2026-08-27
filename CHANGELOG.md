# Changelog

## 0.6.0

- Added source selector: SeenThis, Adform, Google Campaign Manager.
- Added Adform text parser using `Tag N. ... Size: WxH` blocks.
- Added Google Campaign Manager `.xls` / `.xlsx` parser.
- Google naming priority: Creative Name → Ad Name → Placement Name.
- Source-specific tags are normalized into the same export workflow.
- SeenThis clicktag rewrite is now explicitly limited to SeenThis tags.
- Adform and Google tags are preserved unchanged.
- Unknown sizes remain visible but are automatically excluded from export.
