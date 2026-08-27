# Architecture

## Flöde

```text
Customer .txt
   ↓
Browser File API
   ↓
SeenThis/Hawk parser
   ├─ creative name
   ├─ full script
   ├─ width / height
   └─ current clicktag URL
   ↓
Template validation
   ├─ IAB categories
   ├─ creative types
   ├─ adservers
   └─ creative size dropdown
   ↓
Strict dimension validation
   ├─ match → OK
   └─ missing → warning + export blocked
   ↓
Landing Page / clicktag transformation
   ↓
XLSX template mutation in browser
   ↓
BatchUploadCreatives-filled.xlsx
```

## Design principle

Template-filen är source of truth. Storlekar ska inte hårdkodas i appen. Det innebär att nya dimensioner, till exempel `980x240` och `1080x1920`, börjar fungera när de läggs till i template-dropdownen utan kodändring.

Om en dimension inte kan hittas i templaten får appen inte välja en närliggande storlek. Exporten stoppas tills templaten är uppdaterad.

## Hosting

Vite bygger statiska filer till `dist/`. Cloudflare Workers Static Assets hostar resultatet. Ingen backend eller databas krävs för MVP:n.
