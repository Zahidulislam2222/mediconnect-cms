# ⚠️ Retired — kept for the record, not active

This folder keeps code that is no longer part of the running CMS. The files are **inactive**:
Strapi only loads content types from `src/api/`, and `tsconfig.json` excludes `retired/` from
compilation.

## `medical-report/`

| Item | Detail |
|---|---|
| What it was | A "Medical Report" content type (Title, File upload, ReportDate) with its default controller, routes and service |
| Original location | `src/api/medical-report/` |
| Retired | Removed from `src/api/` in commit `a2af0c7`; restored here unchanged on 2026-09-24 so nothing is lost |
| Why it stays off | Patient health records must not live in the CMS. They belong in the encrypted, access-controlled patient record services. The CMS holds public health content only. |
| Re-enabling | Do not move it back into `src/api/` without a privacy review, encryption at rest and access controls that meet the platform's [privacy rules](https://github.com/Zahidulislam2222/mediconnect-infrastructure-production/blob/main/docs/PRIVACY-AND-DATA.md). |

The four files are byte-for-byte identical to the versions on `main` before the removal.
