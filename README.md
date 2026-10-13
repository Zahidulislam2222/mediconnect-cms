# MediConnect CMS

Strapi editorial service for public articles, diseases, doctors, drugs, FAQs, health tips and wellness programs. Patient records belong in the authorized clinical services, outside the CMS.

**Website:** [MediConnect](https://mediconnect.zahidul-islam.com) · **Maintainer:** Zahidul Islam · [Platform documentation](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/README.md)

## Current delivery — 2026-10-13

The scoped CMS release is deployed on the existing host. Verification covered 53 source files, a nonroot runtime and durable database/upload mounts. The public website preserved five original articles, all 51 ordered paragraphs and three decoded covers. Two legacy covers remain unavailable. Application-consistent live backup and off-host restore remain open; see [release acceptance](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/RELEASE-STATUS.md).

## Development and checks

Copy `.env.example` to an ignored local environment file, configure approved database/upload/bootstrap settings and use the package's supported Node version.

```bash
npm ci
npm run dev
npm test
npm run typecheck:migration
npm run typecheck:runtime
npm run build
```

`npm start` requires the approved runtime configuration. The tests cover migration, runtime/proxy behavior and container packaging. The package has no generic lint script. Do not use the cloud deployment command as a local startup step.

For admin compilation without runtime credentials, run `node scripts/container-build.cjs`. It supplies the maintained build-only placeholders to the compiler child process; those values are never runtime credentials. The normal `npm run build` requires valid configuration.

Article and asset migrations require a plan, explicit authorization for writes and verification of destination content/media. See [article migration](scripts/ARTICLE-MIGRATION.md). Preserve originals and reconcile partial writes before retrying.

## Editorial and operational controls

Require qualified review, provenance and review dates for health content. Restrict editor/admin permissions, protect administration with the approved identity/access policy and verify public delivery separately. Never upload patient records or private recovery material. Back up the database and referenced media consistently and prove restoration before closing operational acceptance.

The [retired content type](retired/README.md) remains inactive. Configuration, source/live parity and complete content/media recovery are independent checks.

[Security](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/SECURITY-ARCHITECTURE.md) · [Privacy](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/PRIVACY-AND-DATA.md) · [Law](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/COMPLIANCE-AND-LAW.md) · [Operations](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/OPERATIONS.md) · [Roadmap](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/ROADMAP.md)

[Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Private vulnerability reporting](SECURITY.md) · [MIT license](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md)
