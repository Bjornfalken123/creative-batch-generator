# GitHub + Cloudflare setup checklist

1. Create a private GitHub repository.
2. Upload the contents of this project folder to the repository root.
3. Confirm `package.json`, `src/`, `public/`, and `wrangler.jsonc` are visible at repository root.
4. Replace `public/BatchUploadCreatives-template.xlsx` whenever a new Hawk template is released, keeping the same filename.
5. In Cloudflare, create/import a **Worker** from the GitHub repository.
6. Use `npm run build` as the build command.
7. Use `npx wrangler deploy` as the deploy command.
8. Test on the generated `workers.dev` URL.
9. Upload one file from each source type and verify detected source/type, names, sizes and exported rows.
10. Add a custom domain when testing is complete.
