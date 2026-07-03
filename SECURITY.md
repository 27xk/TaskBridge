# Security Policy

TaskBridge is a self-hosted, cross-platform task application. The security boundary is user-owned data across the backend API, Android app, Windows desktop app, Web/PWA client, Docker deployment, and release artifacts.

## Supported Versions

Only the latest published release line is actively supported. Security fixes should be applied to the newest release tag and the default branch first.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities publicly until they have been triaged and a fix or mitigation is available.

Report privately by opening a GitHub Security Advisory for this repository, or by contacting the maintainer through the private channel listed on the repository owner profile. Include:

- Affected component: backend, Android, Windows desktop, Web/PWA, Docker, release workflow, or documentation.
- Exact version or commit.
- Reproduction steps and expected impact.
- Whether user data, tokens, local databases, release artifacts, or deployment secrets are involved.

## Security Baseline

The project expects these controls to remain enabled:

- Backend authentication with Bearer tokens, refresh-token session governance, rate limiting, request IDs, and production secret checks.
- Electron `contextIsolation`, disabled `nodeIntegration`, renderer sandbox, restrictive CSP, trusted-sender IPC validation, and encrypted token storage.
- Android release signing, HTTPS/WSS release endpoints, encrypted token storage, and backup / data extraction exclusions for tokens, device identity, local database, and export cache.
- CI dependency audits for Python and npm dependencies.
- CodeQL, dependency-review, OpenSSF Scorecard, and Trivy scanning for code, dependency, workflow, and container risk.
- Release artifact checksums, provenance attestation, Docker SBOM, and Docker build provenance.

## Artifact Verification

Release artifacts should be verified with the published `SHA256SUMS.txt` and GitHub artifact attestations. Docker images should be pulled by immutable version tags for production deployments; `latest` is convenient but not a deployment control.

## Out of Scope

The following reports are usually not actionable unless they demonstrate an exploit path:

- Vulnerabilities that require control of the user's own machine or private deployment secrets.
- Denial of service against a single self-hosted instance without bypassing documented rate limits or deployment controls.
- Scanner-only reports without reproduction steps.
