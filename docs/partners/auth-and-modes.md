# Authentication & integration modes

There are two supported ways to integrate, depending on whether you want the
browser to talk to Apex directly or to route through your own backend.

## Mode A — Browser-direct (publishable key)

The browser calls Apex's `/api/v2/embed/*` endpoints directly, authenticating
with your **publishable key**.

```ts
useSurveyV2Flow({
  apiBaseUrl: 'https://api.apextelemed.com/api',
  publishableKey: 'pk_live_xxx',
  drugIds: ['drug-A'],
});
```

- The publishable key is sent on every request as the `x-apex-publishable-key`
  header.
- This is the simplest integration and is appropriate for most partners.

### Security model

The publishable key is **safe to ship in your client bundle** — same threat
model as a Stripe `pk_*` or a Mapbox public token. Specifically:

- Your **partner ID is never in the browser.** Apex derives it server-side from
  the publishable key. The key is an opaque lookup handle, not a secret grant.
- Every request is checked against your **origin allowlist.** A request whose
  `Origin` isn't on your allow-list is rejected (HTTP 403). Add every site that
  will host the survey (e.g. `https://app.yourco.com`).
- Submissions are **rate-limited per IP** to limit abuse.

If you need to rotate a key (e.g. it leaked somewhere you don't control), ask
Apex to rotate it — the old key stops working immediately.

> The publishable key is **not** an API key. It cannot read data, list
> patients, or call any partner API. It only authorizes composing and
> submitting an embedded survey from an allow-listed origin.

## Mode B — Proxy through your backend (tenant key)

If your platform is multi-tenant, or you'd rather not put any Apex key in the
browser, route the five embed calls through your own backend and inject Apex
credentials server-side. In this mode the browser sends **no publishable key**;
instead it sends a tenant identifier your backend understands.

```ts
useSurveyV2Flow({
  // Your own proxy base — it must expose the same /v2/embed/* paths.
  apiBaseUrl: 'https://app.yourco.com/apex/api',
  tenantKey: 'tnt_yourco',   // sent as X-Tenant-Key; your backend maps it → Apex creds
  drugIds: ['drug-A'],
});
```

- `tenantKey` is sent as the `X-Tenant-Key` header on every request.
- Your backend resolves the tenant, attaches the real Apex credentials, and
  forwards to Apex's `/api/v2/embed/*`.
- `publishableKey` is omitted entirely — nothing sensitive reaches the browser.

Your proxy must preserve the five endpoint paths and methods documented in the
[API contract](./api-contract.md) (it can mount them under any prefix as long as
`apiBaseUrl` points at that prefix).

## Initial vs. refill flows

- **Initial** (default): pass `drugIds` (and optionally `templateId`, `mode`).
- **Refill / returning member**: pass a one-time `token` issued by Apex instead.
  The token resolves the member, pre-fills their patient info, and scopes the
  survey to the refill. `token` overrides `drugIds`/`templateId`/`mode`.

```ts
useSurveyV2Flow({ apiBaseUrl, publishableKey, token: 'the-token-from-apex' });
```

## Draft persistence & privacy

The engine saves an in-progress draft to `localStorage` (keyed per partner +
survey identity) so a page refresh resumes the flow. Drafts expire after 24h by
default — override with `draftTtlMs`. If `localStorage` is unavailable (private
mode, hardened browsers) the survey still works, just without resume.

Pass `draftTtlMs: 0`-style overrides or clear behavior via the core's
`clearDraft` if you need stricter handling; see [headless](./headless.md).
