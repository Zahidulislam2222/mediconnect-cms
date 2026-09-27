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

The runtime process is the unprivileged `node` user. Persist `/opt/app/.tmp` when
using the default SQLite path, or set `DATABASE_FILENAME` to a writable persistent
mount. If using local upload storage, persist `/opt/app/public/uploads`; the
current configured S3 upload provider requires separately verified bucket access.
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
