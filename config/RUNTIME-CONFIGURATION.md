# Runtime configuration

`src/config/runtime-settings.ts` is the typed environment boundary.
`src/config/runtime-defaults.json` owns maintained defaults and CSP sources.
The Strapi configuration files adapt those values to the framework.
All supported environment names and safe examples are in `.env.example`.

SQLite remains the supported database client. `DATABASE_FILENAME` defaults to
the existing `.tmp/data.db` relative to the process working directory. An
explicit absolute path is accepted for mounted persistent storage. This change
does not migrate, copy, delete or validate the contents of any database. Back up
the real database before changing its configured location.

Runtime requires the existing app keys, token salts, JWT secrets and encryption
key. `CMS_UPLOAD_PROVIDER` defaults to `local`: public editorial media is stored
in `public/uploads`, without reading AWS configuration or making S3 requests.
Persist the database and upload directories independently. Local mode rejects
private visibility; it must not hold private clinical documents. It does not
copy remote objects or rewrite media URLs in existing database records.

Select `CMS_UPLOAD_PROVIDER=aws-s3` explicitly for the legacy provider. This
mode also requires upload region/bucket and can incur storage/request charges.
Missing or malformed configuration fails before service use. Tests use
fictional values, isolated filesystem fixtures and an isolated loopback server.

For the S3 provider, prefer AWS workload roles or the standard SDK credential chain. Empty optional
credential variables leave the chain active. Existing `AWS_ACCESS_SECRET`
continues to work only as a compatibility alias inside the settings boundary.
Do not configure conflicting standard and legacy secrets; partial credentials
are rejected. No credential rotation or cloud configuration occurs here.
The installed provider drops `sessionToken` from a direct credentials object.
Explicit identities therefore use the AWS SDK's public runtime extension API
to preserve the complete identity. When no explicit pair is configured, the
normal SDK credential chain remains in use. Loopback tests assert the actual
security-token header for both standard and legacy credentials.

The installed Strapi upload provider sets a canned ACL internally. Both upload
actions explicitly omit the outgoing ACL so bucket-owner-enforced storage can
accept writes. `CMS_UPLOAD_VISIBILITY=public` preserves public URL behavior; it
does **not** grant public access or change bucket policy. The operator must
verify appropriate object-access policy. Private mode produces signed S3 URLs;
it rejects a public CDN origin because this provider skips signing CDN URLs.

All provider connection/request timeouts, retry attempts, endpoint, origin and
path-style settings come through the typed boundary. Non-HTTPS endpoints are
allowed only on loopback for local testing. The seven-day signed-URL maximum is
an AWS SigV4 protocol constraint, not an environment default.

The provider previously mixed an S3 client and upload helper from incompatible
AWS SDK generations. Scoped npm overrides align its client, upload helper and
presigner with the exact existing application S3 version. A real installed-
provider HTTP test is required when upgrading these packages; mocked commands
did not expose the middleware incompatibility.

Run `npm test`, `npm run typecheck:migration`, `npm run typecheck:runtime`,
`npx tsc --noEmit` and `npm run build`. The repository has no lint script;
security scans and type checks are reported separately. No live upload or CMS
deployment is established by these local checks.
