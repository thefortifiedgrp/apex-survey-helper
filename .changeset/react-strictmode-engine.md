---
'@apextelemed/survey-react': patch
---

Fix `useSurveyV2Flow` hanging on "loading" under React StrictMode in development.

The hook built its engine during render and destroyed it in an effect cleanup.
StrictMode mounts, cleans up and remounts every effect in development, so the
remount kept the destroyed engine: its load never ran, no request went out, and
the survey sat on "loading" forever. Production builds were not affected.

The engine is now created in the mount effect and destroyed by that effect's
cleanup. Until it exists (the first render, and server rendering) the hook
returns a static "loading" state and `flow.engine` is an inert placeholder.
The hook's options and return shape are unchanged.
