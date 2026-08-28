# Architecture

## Browser-only workflow

1. Load the Hawk Excel template from `/public`.
2. User selects source: SeenThis, Adform or Google Campaign Manager.
3. Customer file is parsed locally in the browser.
4. Every source is normalized into the same Creative model.
5. Creative dimensions are matched against the size list in the Excel template.
6. User reviews names, exclusions and warnings.
7. Valid selected creatives are written into a copy of the template.
8. The finished `.xlsx` is downloaded locally.

No backend or database is required.

## Source parsers

- `src/parser.ts`: SeenThis + Adform text parsers and shared size utilities.
- `src/google.ts`: Google Campaign Manager `.xls` / `.xlsx` parser using SheetJS (`xlsx`).
- `src/xlsx.ts`: reads the Hawk template and creates the final export.

## Deployment

The Vite build is served as static assets by Cloudflare Workers. GitHub can be connected to Cloudflare for automatic deployment on every push.


## HTML5 ZIP conversion

HTML5 ZIP is still a client-only workflow. The browser inspects and unpacks the archive with `fflate`, reads manifests and source HTML, and creates a JavaScript iframe wrapper in memory. Nothing is uploaded to Cloudflare or persisted. Packages that depend on local assets are deliberately not flattened unless a future version introduces an explicit asset-hosting workflow.
