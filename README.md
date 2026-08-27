# Creative Batch Generator

Ett internt verktyg för att konvertera kundens SeenThis/Hawk JavaScript-tagfil till en färdig `BatchUploadCreatives.xlsx`.

UI:t är Hawk-inspirerat: mörk marinblå grund, turkos accent, stora typografiska rubriker och rena operativa arbetsytor.

## Vad den gör

- Läser `<!-- creative name - size -->` + `<script>...</script>`-block från kundens `.txt`.
- Hämtar bredd/höjd från `data-width` / `data-height` med kommentaren som fallback.
- Hämtar IAB-kategorier, creative types, adservers och giltiga creative sizes direkt från Excel-templaten.
- Förifyller creative name och matchar dimensionen mot storlekarna som faktiskt finns i template-dropdownen.
- Ingen specialmappning eller fallback till en annan storlek görs.
- `980x240` och `1080x1920` fungerar automatiskt när de finns i template-dropdownen.
- Om en dimension saknas i templaten får raden en tydlig varning och export blockeras.
- Kan URL-koda Landing Page och ersätta URL-delen efter `${HAWK_CLICK}` i varje SeenThis-script.
- Modifierar den riktiga `.xlsx`-templaten i webbläsaren och bevarar övriga workbook-delar.
- Inga kundfiler skickas till en server.

## Lokal utveckling

Kräver Node.js.

```bash
npm install
npm run dev
```

Produktionsbuild:

```bash
npm run build
```

Output hamnar i `dist/`.

## Template

Appen använder:

`public/BatchUploadCreatives-template.xlsx`

När Hawk skickar en uppdaterad template ersätter du den filen och behåller samma filnamn. Appen läser storleks-dropdownen dynamiskt varje gång den laddas.

Förutsättning: workbooken fortsätter använda bladen:

- `creatives`
- `validation`
- `data`
- `metadata`

## Cloudflare

Projektet är konfigurerat för Cloudflare Workers Static Assets via `wrangler.jsonc`.

```bash
npm run deploy
```

För GitHub + Cloudflare steg för steg, se **SETUP_CHECKLIST.md**.

## Säkerhet / data

All parsing och Excel-generering sker client-side i browsern. Kundens scriptfil skickas inte till Cloudflare eller någon extern backend av appen.
