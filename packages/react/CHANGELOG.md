# @apextelemed/survey-react

## 0.2.1

### Patch Changes

- 242a715: Fix `useSurveyV2Flow` hanging on "loading" under React StrictMode in development.

  The hook built its engine during render and destroyed it in an effect cleanup.
  StrictMode mounts, cleans up and remounts every effect in development, so the
  remount kept the destroyed engine: its load never ran, no request went out, and
  the survey sat on "loading" forever. Production builds were not affected.

  The engine is now created in the mount effect and destroyed by that effect's
  cleanup. Until it exists (the first render, and server rendering) the hook
  returns a static "loading" state and `flow.engine` is an inert placeholder.
  The hook's options and return shape are unchanged.

## 0.2.0

### Minor Changes

- 3a6b942: Relicense from MIT to the Apex Telemed Platform Integration License.

  From this version on, the packages are source-available rather than open
  source: you may use, modify, and redistribute them freely, but only to build
  and operate software that integrates with Apex Telemed's platform on behalf of
  an Apex Telemed customer. Versions published before this one remain MIT.

## 1.0.0

### Minor Changes

- 2f24214: Initial extraction of the Apex survey-v2 embed SDK into a standalone monorepo:
  the framework-agnostic `@apextelemed/survey-core` engine plus `@apextelemed/survey-react`
  and `@apextelemed/survey-solid` adapters, with partner-facing docs and runnable examples.

### Patch Changes

- Updated dependencies [2f24214]
  - @apextelemed/survey-core@1.0.0
