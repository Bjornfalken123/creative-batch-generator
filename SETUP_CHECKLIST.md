# To do – GitHub + Cloudflare

Use this checklist to take the ZIP package from ChatGPT and get the tool live without changing the code.

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
- [ ] Upload a real SeenThis/Hawk `.txt` file.
- [ ] Confirm that the number of detected creatives is correct.
- [ ] Review a few generated creative names manually.
- [ ] Check a few dimensions, for example `300x250`, `320x480` and `980x300`.
- [ ] Test a dimension that is **not** in the template and confirm that the row is warned and excluded while the other valid creatives can still be exported.
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
- [ ] Test at least one older customer script file and one creative using a newly added size.

## Definition of done

- [ ] The tool is live on a Cloudflare URL.
- [ ] A customer `.txt` file can be uploaded.
- [ ] Creative name, script and dimension are identified correctly.
- [ ] Only sizes that exist in the template dropdown are accepted.
- [ ] Unknown sizes get a clear warning and are excluded from export without blocking valid rows.
- [ ] The Landing Page can be applied to the clicktag automatically.
- [ ] The exported Excel file opens correctly and can be uploaded to the next system without manual fixes.
