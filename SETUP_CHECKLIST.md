# Setup checklist

1. Create a private GitHub repository.
2. Upload the contents of this project to the repository root.
3. In Cloudflare Workers, create/import a Worker from the GitHub repository.
4. Build command: `npm run build`.
5. Deploy command: `npx wrangler deploy`.
6. Confirm the Worker is available on its `workers.dev` URL.
7. Test with a SeenThis `.txt` tag file.
8. Test with an Adform `.txt` tag file.
9. Test with a Google Campaign Manager `.xls`/`.xlsx` file.
10. Confirm a `.zip` upload is rejected and does not create exportable rows.
11. Connect a custom domain when the tests pass.
