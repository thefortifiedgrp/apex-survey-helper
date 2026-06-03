# Solid + Vite example

A minimal, unstyled integration of `@apextelemed/survey-solid`.

## Run

From the monorepo root (so the workspace packages are linked and built):

```bash
npm install
npm run build            # build the survey packages first
cp examples/solid-vite/.env.example examples/solid-vite/.env
# edit .env: set VITE_APEX_PUBLISHABLE_KEY (and drug IDs / API base)
npm run dev --workspace=@apextelemed/example-solid-vite
```

Then open the printed URL (default http://localhost:5181).

The integration lives in [`src/Survey.tsx`](./src/Survey.tsx). See
[docs/partners/solid.md](../../docs/partners/solid.md) and
[docs/partners/auth-and-modes.md](../../docs/partners/auth-and-modes.md).
