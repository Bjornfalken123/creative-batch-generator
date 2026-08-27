# Architecture

## Flow

```text
Customer .txt
   ↓
Browser File API
   ↓
SeenThis/Hawk parser
   ├─ global campaign header
   ├─ per-script comment
   ├─ creative name (rich comment OR header + size)
   ├─ full script
   ├─ width / height
   └─ current clicktag URL
   ↓
Template validation
   ├─ IAB categories
   ├─ creative types
   ├─ ad servers
   └─ creative size dropdown
   ↓
Strict dimension validation
   ├─ match → included by default
   └─ missing → warning + automatically excluded
        (other valid rows can still export)
   ↓
Landing Page / clicktag transformation
   ↓
XLSX template mutation in browser
   ↓
BatchUploadCreatives-filled.xlsx
```

## Design principle

The Excel template is the source of truth. Sizes are not hard-coded in the app. New dimensions such as `980x240` and `1080x1920` start working automatically once they are added to the template dropdown, without a code change.

If a dimension cannot be found in the template, the app must not select a nearby size. The row is automatically excluded from export but remains visible for review. Other valid rows can still be exported.

## Hosting

Vite builds static files to `dist/`. Cloudflare Workers Static Assets hosts the result. No backend or database is required for the MVP.
