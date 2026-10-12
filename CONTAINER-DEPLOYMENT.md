# Container verification and deployment prerequisites

Build locally with `docker build -t mediconnect-cms:local .`. The base image is
owned by the `NODE_IMAGE` build argument (default official Node22); use a reviewed
immutable digest for a release. Dependency installation uses the lockfile.
The source allowlist excludes credentials, database files, uploads, Git history,
exports and host dependencies before sending context to Docker.

Build-only synthetic values in `container-build.json` let Strapi compile its admin
without real credentials. Never use that fixture as deployment configuration.
Runtime requires the existing variables documented in `.env.example` and the
runtime configuration guide. Inject them from a private environment file/secret
store; do not add secret build arguments or copy `.env` into an image.

For a separate HTTPS hostname, set `CMS_PUBLIC_URL` to its origin and set
`CMS_TRUST_PROXY=true` at runtime. Build the admin using the same origin with
`--build-arg CMS_PUBLIC_URL=...`; changing it requires a rebuild. Public origin
metadata is the only added build argument; runtime secrets stay external.
Direct local operation leaves the URL empty and proxy trust disabled.
The installed Strapi 5.33.1 supports `server.proxy.koa` but does not read newer
`proxy.ipHeader` or `proxy.maxIpsCount` settings. Keep the backend reachable only
by the trusted proxy, and configure that proxy to replace forwarded client IP,
scheme and host headers. Do not expose the trusting CMS port publicly.

The runtime process is the unprivileged `node` user. Persist `/opt/app/.tmp` when
using the default SQLite path, or set `DATABASE_FILENAME` to a writable persistent
mount. Persist `/opt/app/public/uploads` for the default local upload storage;
explicitly selecting the S3 provider requires separately verified bucket access.
Mount ownership must allow the container user to write. Do not replace an existing
database with the image's empty directories.

Before any production deployment: inventory the existing host, confirm capacity,
select the approved hostname and TLS/reverse-proxy routing, preserve a consistent
database backup and previous image/config, and verify source/live drift. Verify
admin login, content permissions and upload/read behavior against the approved
storage without paid calls. Recreate the container against its persistent mount
and prove retained data, then compare deployed source/image identifiers with the
reviewed local release. Rollback must restore the matching database/config when
schema migrations occurred; swapping an old image alone is not sufficient.

No deployment, cloud resource creation, paid service, or RAG stack operation is
performed by this packaging change. Local fixture evidence belongs in project
memory. Independent review and operational deployment remain separate gates.
# Local media on an existing host

`CMS_UPLOAD_PROVIDER=local` is the default and uses Strapi's installed filesystem
provider. It requires no AWS credentials or S3 requests. Keep both the SQLite
database directory and `public/uploads` on their existing separate persistent
mounts, writable by the container's `node` user. Preserve both in a consistent
backup before replacing a container; do not mount over application source.

Local uploads are public editorial assets. `CMS_UPLOAD_VISIBILITY=private` is
rejected with the local provider. Keep private clinical documents in their
separately authorized storage; never migrate them into the public media folder.

The legacy S3 provider requires explicit `CMS_UPLOAD_PROVIDER=aws-s3` and its
documented AWS settings. It can incur storage/request charges and must have
separate approval. Selecting local storage does not copy or delete existing
S3 objects or rewrite their stored URLs; migrate any remote article media with
verified backups and URL parity before retiring its storage.

