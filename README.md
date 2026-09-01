# Apex Survey Helper

The official SDK for embedding the **Apex Telemed survey-v2 intake flow** on your
own website. It handles survey composition, conditional question visibility,
mid-stream qualification checks, draft persistence, and submission — you supply
the markup.

## Packages

| Package | What it is | Install |
| --- | --- | --- |
| [`@apextelemed/survey-core`](./packages/core) | Framework-agnostic state machine + API client. Zero runtime dependencies. | `npm i @apextelemed/survey-core` |
| [`@apextelemed/survey-react`](./packages/react) | React hook (`useSurveyV2Flow`) over the core. | `npm i @apextelemed/survey-core @apextelemed/survey-react` |
| [`@apextelemed/survey-solid`](./packages/solid) | Solid hook (`useSurveyV2Flow`) over the core. | `npm i @apextelemed/survey-core @apextelemed/survey-solid` |

No framework? Drive `@apextelemed/survey-core` directly — see the
[headless core guide](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/headless/).

## Documentation

Full documentation lives on the Apex Telemed developer docs site, alongside the
Partner API and partner-core docs:

**https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/**

- [Getting started](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/)
- [Authentication and modes](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/auth-and-modes/)
- [React adapter](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/react/)
- [Solid adapter](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/solid/)
- [Headless core](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/headless/)
- [Theming](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/theming/)
- [API contract](https://thefortifiedgrp.github.io/apex-devdocs/survey-helper/api-contract/)

The HTTP API the SDK calls is documented under
[Survey v2: embed API](https://thefortifiedgrp.github.io/apex-devdocs/api/survey-v2-embed/) and
[Survey v2: server-side API](https://thefortifiedgrp.github.io/apex-devdocs/api/survey-v2-server/).

The docs source is the public
[apex-devdocs](https://github.com/thefortifiedgrp/apex-devdocs) repo; open
documentation PRs there.

## Examples

Runnable minimal integrations live in [`examples/`](./examples):

- [`examples/react-vite`](./examples/react-vite)
- [`examples/solid-vite`](./examples/solid-vite)

## Development

This is an npm-workspaces monorepo.

```bash
npm install
npm run build      # tsup build every package → dist/ (ESM + CJS + d.ts)
npm test           # vitest across all packages
npm run typecheck
```

Releases are managed with [changesets](https://github.com/changesets/changesets):
`npm run changeset` to record a version bump, then the release workflow runs
`changeset publish`.

## License

Source-available under the Apex Telemed Platform Integration License — see
[`LICENSE`](./LICENSE). Use, modify, and redistribute freely, but only to
build and operate software that integrates with Apex Telemed's platform on
behalf of an Apex Telemed customer. Not an open source license; there is no
conversion to one. Versions `0.1.0` and earlier were published under MIT and
stay MIT.
