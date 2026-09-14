# Article migration

This explicit tool plans or copies published Strapi editorial articles and local cover files into an operator-selected DynamoDB table and S3 bucket. It does not deploy Strapi, activate the website backend, make uploaded objects public, or certify clinical content.

Run from the CMS repository root. Configure every `CMS_SYNC_` setting in `.env.example` through your environment or an explicitly selected environment file. Destination names in the example are placeholders. The optional Strapi token is a secret. Use the AWS SDK standard credential chain for authorized execution; do not put keys in source or arguments. No environment file is loaded on module import.

```bash
npm test
npm run typecheck:migration
node --env-file=.env scripts/sync-articles.js --plan
```

`--plan` reads the configured Strapi endpoint and local media, validates every page and article, and emits counts without instantiating cloud clients or writing objects/records. The configured articles path is appended to the Strapi base URL, including any mount path. HTTPS is required for remote endpoints; HTTP is accepted only for literal loopback/localhost. Redirects and ambient proxies are disabled to keep the token at the configured origin.

`--execute` is the separately explicit mutation mode. It can incur AWS usage charges and must not be run until the owner has reviewed the exact destinations, current provider pricing and the plan, and provided the required fresh spending authorization. It is not part of a test or deployment command. The automated suite exercises it only against a loopback fixture with unmistakably fake credentials.

The complete source plan is validated before the first cloud write. The tool checks page numbers, page sizes/counts, totals, row counts, repeated identities and configured byte/page limits. A null publication timestamp is counted as a skipped draft; missing, invalid or non-canonical publication metadata is rejected. No current timestamp, author or external placeholder image is fabricated. Local cover references must stay beneath the configured public uploads prefix; missing files, traversal and symlink components fail the plan. Remote cover URLs are unsupported and rejected rather than silently replaced.

Freeze source editing and keep the configured media tree operator-owned while planning/executing. Filesystem checks reject static symlinks and bounded reads detect size changes, but do not claim a sandbox against hostile concurrent directory renames or same-size content mutation. Files are not malware-scanned or clinically reviewed by this tool.

Execution writes deterministic content-hash media keys followed by each article. A failure stops execution, returns a nonzero CLI exit and reports the stage and completed/uploaded counts without dumping provider response data. Earlier writes remain; there is no distributed rollback. Preserve the failed summary and reconcile the destination before retrying. Do not delete existing objects or assume an uncertain provider response means no write occurred.

The existing `ARTICLE#id` key contract is preserved. Strapi v5 numeric record IDs are not a replacement for stable document IDs; reconcile any previous destination records and publication-version changes before a real migration. No records are deleted or unpublished automatically. The current public knowledge consumer does not filter publication status, which is why this migration never writes draft rows. Changing that consumer remains separate backend work.

Validation evidence is scoped: the new package test command covers the migration, not every Strapi administrative feature. A full CMS deployment additionally needs database/uploads persistence, credential configuration, admin/content/upload verification, backup/restore, server capacity/DNS checks and rollback.

References: [Strapi pagination](https://docs.strapi.io/cms/api/rest/sort-pagination), [Strapi publication status](https://docs.strapi.io/cms/api/rest/status), [Node filesystem](https://nodejs.org/api/fs.html).
