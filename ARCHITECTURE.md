# Architecture

The application is a static browser application deployed with Cloudflare Workers Static Assets.

Customer files are processed locally in the browser. No customer delivery is uploaded to a backend.

Flow:

1. Load the Hawk Excel template.
2. User drops one customer file.
3. Detect source automatically.
4. Parse creatives using the source-specific parser.
5. Detect Creative Type per creative.
6. Match dimensions against the template.
7. Review only warnings / ambiguous rows.
8. Export included creatives into the original workbook structure.

HTML5 ZIP packages stay HTML. The application does not host assets and does not turn HTML into JavaScript wrappers.
