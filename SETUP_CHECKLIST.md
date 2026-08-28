# To do – GitHub + Cloudflare

Use this checklist to take the ZIP package from ChatGPT and get the tool live without changing the code.

## Supported customer files

The source is selected before upload:

- **SeenThis**: `.txt`, `.html`, `.js`
- **Adform**: `.txt`, `.html`
- **Google Campaign Manager**: `.xls`, `.xlsx`

Google legacy `.xls` support uses SheetJS CE 0.20.3 from the official SheetJS distribution. It is installed automatically during the Cloudflare/GitHub build when `npm install` runs.


## A. Add the project to GitHub

- [ ] Download the latest `creative-batch-generator-...-github-ready.zip` file.
- [ ] Unzip it on your computer. GitHub does **not** automatically unpack a ZIP when you upload the ZIP itself to a repository.
- [ ] Sign in to GitHub.
- [ ] Click **New repository**.
- [ ] Name it, for example `creative-batch-generator`.
- [ ] Choose **Private** if the tool is for internal use only.
- [ ] Create the repository without adding a README, `.gitignore` or license because the package already contains the project files.
- [ ] In the empty repository, choose **Add file → Upload files**.
- [ ] Drag in the **contents of the unzipped folder** — not the ZIP as a single file.
- [ ] Confirm that `package.json`, `src/`, `public/` and `wrangler.jsonc` are visible at the repository root.
- [ ] Commit the changes.

GitHub guide: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

## B. Verify the Excel template

- [ ] Open `public/BatchUploadCreatives-template.xlsx` locally and confirm that it is the template you want the app to use.
- [ ] When the Hawk template is updated with `980x240` and `1080x1920`, replace the file in `public/` with the updated version.
- [ ] Keep the filename exactly `BatchUploadCreatives-template.xlsx`.
- [ ] The app reads the size dropdown directly from the template. No hard-coded special size mapping is used.
- [ ] If a customer file contains a dimension that is not in the dropdown, the row is shown as **Missing · excluded** and is automatically left out of the export. Valid rows can still be exported.

## C. Connect GitHub to Cloudflare Workers

- [ ] Sign in to the Cloudflare Dashboard.
- [ ] Open **Workers & Pages**.
- [ ] Click **Create application**.
- [ ] Choose **Import a repository** / Git integration.
- [ ] Connect your GitHub account if Cloudflare asks you to.
- [ ] Give Cloudflare access to the `creative-batch-generator` repository.
- [ ] Select the repository.
- [ ] Set the production branch, usually `main`.
- [ ] Set **Build command** to `npm run build`.
- [ ] Set **Deploy command** to `npx wrangler deploy`.
- [ ] Save and deploy.
- [ ] When the build finishes, open the assigned `*.workers.dev` URL.

Cloudflare Git integration: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/

Cloudflare Static Assets: https://developers.cloudflare.com/workers/static-assets/

## D. First functional test

- [ ] Open the tool through the `workers.dev` URL.
- [ ] Confirm that **Template loaded** is displayed.
- [ ] Test a real **SeenThis** `.txt` file and confirm that the number of detected creatives is correct.
- [ ] Test a real **Adform** `.txt` file and confirm that Tag headers, sizes and tags are detected correctly.
- [ ] Test a **Google Campaign Manager** `.xls` or `.xlsx` file. Standard `JavaScript Tag` should be preferred. If the file only contains `Impression Tag (JavaScript)`, confirm that the tool shows a review warning.
- [ ] With the supplied Telenor Google example, confirm that the `1x1` `trackimpj` row is shown as tracking-only and excluded by default.
- [ ] Review a few generated creative names manually.
- [ ] Check a few dimensions, for example `300x250`, `320x480` and `980x300`.
- [ ] Test a dimension that is **not** in the template and confirm that the row is warned and excluded while the other valid creatives can still be exported.
- [ ] Test an ambiguous dimension such as `160x600` and confirm that export does not silently choose desktop/smartphone; select the correct Hawk size on the row.
- [ ] Confirm that IAB Category starts unselected and must be chosen for the imported campaign.
- [ ] Enter a Landing Page with UTM parameters.
- [ ] Export the Excel file.
- [ ] Open the exported workbook and verify script, creative name, size, landing page and the standard fields.

## E. Add a custom domain in Cloudflare

Do this after the `workers.dev` version works correctly.

- [ ] Open the Worker in Cloudflare.
- [ ] Go to **Settings → Domains & Routes** (the exact wording can change slightly in the dashboard).
- [ ] Add a Custom Domain, for example `creative-tools.yourdomain.com`.
- [ ] Choose a domain that already exists in your Cloudflare account.
- [ ] Confirm the domain and wait until Cloudflare shows it as active.
- [ ] Open the custom domain and repeat the functional test.

## F. Updating the app later

- [ ] Edit files in GitHub or push a new commit.
- [ ] Cloudflare will build and deploy automatically from the production branch.
- [ ] Check the build status in Cloudflare after larger changes.

## G. When Hawk sends a new Excel template

- [ ] Replace only `public/BatchUploadCreatives-template.xlsx`.
- [ ] Commit/push the change to GitHub.
- [ ] Let Cloudflare deploy automatically.
- [ ] Test at least one older customer tag file and one creative using a newly added size.

## Definition of done

- [ ] The tool is live on a Cloudflare URL.
- [ ] SeenThis / Adform text files and Google Campaign Manager `.xls` / `.xlsx` files can be uploaded.
- [ ] Creative name, source tag and dimension are identified correctly.
- [ ] Only sizes that exist in the template dropdown are accepted; ambiguous duplicate dimensions require an explicit choice.
- [ ] Unknown sizes get a clear warning and are excluded from export without blocking valid rows.
- [ ] For SeenThis, the Landing Page can be applied to the `${HAWK_CLICK}` clicktag automatically. Adform and Google tags are preserved unchanged.
- [ ] The exported Excel file opens correctly and can be uploaded to the next system without manual fixes.


## HTML5 ZIP smoke test

After deployment, test one known bundle ZIP:
1. Select **HTML5 ZIP**.
2. Upload a bundle containing multiple nested creative ZIPs.
3. Confirm the creative count and dimensions.
4. Confirm a consistent Landing Page is auto-filled only when the manifests agree.
5. Open **Show** on one row and verify the generated tag starts with an inline `<script>` wrapper and contains an iframe `srcdoc`.
6. Export and validate one creative in Hawk before using ZIP conversion in a live campaign.
7. Also test a ZIP with local assets if available; it should be warned/excluded rather than exported as a broken tag.
