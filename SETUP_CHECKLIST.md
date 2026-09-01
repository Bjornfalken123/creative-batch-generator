# GitHub + Cloudflare setup checklist

## 1. Create the GitHub repository

- Create a new **private** GitHub repository, for example `creative-batch-generator`.
- Extract the release ZIP locally.
- Upload the **contents of the extracted project folder** to the repository root. Do not upload the release ZIP as a single file.
- Confirm the repository root contains at least:
  - `package.json`
  - `index.html`
  - `src/`
  - `public/`
  - `wrangler.jsonc`

## 2. Confirm the Hawk template

The active template is:

`public/BatchUploadCreatives-template.xlsx`

When Hawk supplies an updated template (for example with new sizes such as `980x240` or `1080x1920`):

1. replace this file
2. keep the exact filename
3. commit/push
4. test one known delivery after Cloudflare redeploys

The app reads size/category/type/adserver configuration from the template automatically. If Hawk changes the column structure, the app will stop and report the schema mismatch.

## 3. Create the Cloudflare Worker

In Cloudflare, create a Worker application from the GitHub repository.

Use:

```text
Build command:  npm run build
Deploy command: npx wrangler deploy
```

`wrangler.jsonc` serves the generated `dist` directory as Workers Static Assets.

## 4. First deployment test

Open the generated `workers.dev` address and confirm:

- Hawk template status shows as loaded
- template version, size count and row capacity are displayed
- SeenThis `.txt` can be imported
- Adform `.txt` can be imported
- Google CM `.xls/.xlsx` can be imported
- `.zip` is rejected with the tag-export instruction
- export becomes available only after valid campaign fields are completed

## 5. Regression test files

Recommended smoke tests:

- Västermalmsgallerian SeenThis file: names + partial export behavior
- Friskis SeenThis file: `100vw/100vh` dimension fallback
- Arlanda Express Adform file: 11 tags + ambiguous `160x600`
- Google Campaign Manager sample: tag-sheet detection and tracking-only exclusions

## 6. Protect the internal tool

Recommended for an internal deployment:

- connect a dedicated subdomain, e.g. `creative-tools.example.com`
- protect it with your existing Cloudflare access controls / organization login
- keep the GitHub repository private

Customer files are processed locally in the browser and are not stored by the application.

## 7. Ongoing updates

GitHub becomes the source of truth. After future code/template updates:

1. commit the change
2. push to the connected branch
3. let Cloudflare rebuild/deploy
4. run one known-good SeenThis test and one exception test before normal use
