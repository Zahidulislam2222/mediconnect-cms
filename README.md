# MediConnect CMS — Strapi 5 content management

![Licence: MIT](https://img.shields.io/badge/licence-MIT-2563EB)
![Strapi](https://img.shields.io/badge/Strapi-5.33.1-4945FF)
![Status](https://img.shields.io/badge/status-local_build_verified%2C_not_deployed-64748B)

**Live showcase:** <https://mediconnect.zahidul-islam.com> · **Platform docs:** [documentation index](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/README.md)

The MediConnect CMS lets editors and clinicians publish patient-facing health content. Its content
types are articles, diseases, doctors, drugs, FAQs, health tips and wellness programmes (`src/api/`).
A migration tool copies published articles into the platform's regional content store
([scripts/ARTICLE-MIGRATION.md](scripts/ARTICLE-MIGRATION.md)).

## Status (2026-09-24)

| Area | Status |
|---|---|
| Admin build and TypeScript check | Verified locally |
| Article migration tool | Tests pass locally; `--execute` (which writes to the cloud) needs explicit owner approval |
| Production deployment | **Not deployed.** Needs a persistent database, upload storage, backups with a restore test, and an admin security review. |

## Quick start

```bash
npm ci
cp .env.example .env     # fill in your own secrets; never commit .env
npm run develop          # admin panel at http://localhost:1337/admin
npm test                 # migration tool tests
```

## Content safety rules

- A licensed clinician reviews health content before it is published, and the content shows its review date.
- No patient data is ever stored in the CMS.
- The admin panel must sit behind MFA and must not be exposed publicly without rate limiting.

## Documentation, security and licence

- Platform docs: [architecture](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/ARCHITECTURE.md), [security](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/SECURITY-ARCHITECTURE.md), [compliance](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/COMPLIANCE-AND-LAW.md), [roadmap](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md)
- Code is released under the [MIT Licence](LICENSE). Strapi and dependencies keep their own licences: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

---

## Original README (preserved)

> Below is the original Strapi starter README, kept word for word.


# 🚀 Getting started with Strapi

> **MediConnect release review:** this repository is the retained CMS implementation.
> Build success alone does not verify published articles, media access controls or live clinical
> integration. Historical capabilities are preserved; current authenticated/public content flows
> require fresh verification. Shared status definitions and scale targets are documented in the
> sibling infrastructure repository's `REVIEWER-GUIDE.md`.

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
