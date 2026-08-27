# To do – GitHub + Cloudflare

Den här checklistan är skriven för att du ska kunna ta ZIP-filen från ChatGPT och få verktyget live utan att behöva bygga om något.

## A. Lägg projektet i GitHub

- [ ] Ladda ner ZIP-filen `creative-batch-generator-github-ready.zip`.
- [ ] Packa upp ZIP-filen på datorn. GitHub packar **inte** upp en ZIP automatiskt om du laddar upp själva ZIP-filen i ett repo.
- [ ] Logga in på GitHub.
- [ ] Klicka **New repository**.
- [ ] Döp repot, exempelvis `creative-batch-generator`.
- [ ] Välj **Private** om verktyget bara ska användas internt.
- [ ] Skapa repot utan README/gitignore/license eftersom dessa redan finns i paketet.
- [ ] I det tomma repot: välj **Add file → Upload files**.
- [ ] Dra in **innehållet i den uppackade mappen** (inte ZIP-filen som en enda fil).
- [ ] Kontrollera att bland annat `package.json`, `src/`, `public/` och `wrangler.jsonc` syns i rooten.
- [ ] Commit changes.

GitHub guide: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

## B. Testa template-filen

- [ ] Öppna `public/BatchUploadCreatives-template.xlsx` lokalt och säkerställ att det är den template som ska användas.
- [ ] När Hawk-templaten uppdateras med `980x240` och `1080x1920`, ersätt filen i `public/` med den nya versionen.
- [ ] Behåll filnamnet exakt `BatchUploadCreatives-template.xlsx`.
- [ ] Appen läser dropdown-listan direkt ur templaten. Ingen hårdkodad specialmapping används.
- [ ] Om en kundfil innehåller en dimension som inte finns i dropdown-listan visas **Saknas i template**, raden markeras och exportknappen blockeras.

## C. Koppla GitHub till Cloudflare Workers

- [ ] Logga in på Cloudflare Dashboard.
- [ ] Gå till **Workers & Pages**.
- [ ] Klicka **Create application**.
- [ ] Välj **Import a repository** / Git integration.
- [ ] Anslut ditt GitHub-konto om Cloudflare ber om det.
- [ ] Ge Cloudflare åtkomst till repot `creative-batch-generator`.
- [ ] Välj repot.
- [ ] Production branch: vanligtvis `main`.
- [ ] Build command: `npm run build`.
- [ ] Deploy command: `npx wrangler deploy`.
- [ ] Spara och deploya.
- [ ] När builden är klar, öppna den tilldelade `*.workers.dev`-adressen.

Cloudflare Git integration: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/

Cloudflare Static Assets: https://developers.cloudflare.com/workers/static-assets/

## D. Första funktionstestet

- [ ] Öppna verktyget via `workers.dev`.
- [ ] Kontrollera att texten **Template laddad** visas.
- [ ] Ladda upp en riktig SeenThis/Hawk `.txt`-fil.
- [ ] Kontrollera att antal creatives stämmer.
- [ ] Kontrollera några creative names manuellt.
- [ ] Kontrollera några dimensioner, exempelvis `300x250`, `320x480` och `980x300`.
- [ ] Testa en dimension som **inte** finns i templaten och bekräfta att varningen visas och export blockeras.
- [ ] Fyll i Landing Page med UTM-parametrar.
- [ ] Exportera Excel.
- [ ] Öppna Excel-filen och kontrollera script, creative name, size, landing page och övriga standardfält.

## E. Lägg på egen domän i Cloudflare

Gör detta först när `workers.dev`-versionen fungerar.

- [ ] Öppna din Worker i Cloudflare.
- [ ] Gå till **Settings → Domains & Routes** (namnet kan ändras något i dashboarden).
- [ ] Lägg till en Custom Domain, exempelvis `creative-tools.dindoman.se`.
- [ ] Välj en domän som redan ligger i ditt Cloudflare-konto.
- [ ] Bekräfta domänen och vänta tills Cloudflare visar den som aktiv.
- [ ] Öppna den nya domänen och kör samma funktionstest igen.

## F. När du vill uppdatera appen

- [ ] Ändra filer i GitHub eller pusha en ny commit.
- [ ] Cloudflare bygger och deployar automatiskt från produktionsbranchen.
- [ ] Kontrollera build-status i Cloudflare efter större ändringar.

## G. När Hawk skickar en ny Excel-template

- [ ] Ersätt endast `public/BatchUploadCreatives-template.xlsx`.
- [ ] Commit/pusha ändringen till GitHub.
- [ ] Låt Cloudflare deploya automatiskt.
- [ ] Testa minst en gammal kundfil och en creative i en ny storlek.

## Definition of done

- [ ] Verktyget är live på en Cloudflare-adress.
- [ ] Kundens `.txt` kan laddas in.
- [ ] Creative name, script och dimension identifieras korrekt.
- [ ] Endast storlekar i template-dropdownen godkänns.
- [ ] Okända storlekar ger tydlig varning och blockerar export.
- [ ] Landing Page kan appliceras på clicktag automatiskt.
- [ ] Exporterad Excel går att öppna och ladda upp i nästa system utan manuella justeringar.
