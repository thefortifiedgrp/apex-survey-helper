# React + Vite example

A minimal, unstyled integration of `@apextelemed/survey-react`.

## Run

From the monorepo root (so the workspace packages are linked and built):

```bash
npm install
npm run build            # build the survey packages first
cp examples/react-vite/.env.example examples/react-vite/.env
# edit .env: set VITE_APEX_PUBLISHABLE_KEY (and drug IDs / API base)
npm run dev --workspace=@apextelemed/example-react-vite
```

Then open the printed URL (default http://localhost:5180).

You'll need a publishable key whose partner has the embed enabled and your dev
origin allow-listed. See [docs/partners/auth-and-modes.md](../../docs/partners/auth-and-modes.md).

The integration lives in [`src/Survey.tsx`](./src/Survey.tsx) — it renders each
phase of the flow with plain HTML. Style it however you like.
