# Theming

The adapters are **headless**. They ship **no markup and no CSS** — you render
every element and own 100% of the styling. There is nothing to override, reset,
or fight with.

This is deliberate: a survey embedded in your site should look like *your* site.
The SDK gives you data and behavior; your design system gives it a body.

## What you control

Everything visual:

- The layout of each step, the question controls (inputs, selects, radios,
  checkboxes), buttons, progress indicators, error/validation text, the
  patient-info form, and the disqualified / complete screens.
- How you map `question.type` to a control. The SDK gives you `type`,
  `options`, `required`, `helpText`, etc. on each `V2Question` — render them with
  your own components.

## Optional branding from Apex

A composed survey may include a `branding` block you can apply if you want the
survey to reflect the partner's brand:

```ts
flow.state.composed?.branding
// → { logoUrl?, primaryColor?, companyDisplayName? }
```

Use it or ignore it — it's just data.

## Accessibility & UX notes

Because you own the markup, you also own accessibility. A few suggestions:

- Render `validationError` in an element with `role="alert"` so screen readers
  announce it.
- Associate `helpText` with its control via `aria-describedby`.
- Disable Next/Submit while `submitting` is true to prevent double-submits.
- Use `question.text` as the visible label and submit `option.value`, displaying
  `option.text ?? option.value` for choices.

## Wanting a pre-styled drop-in?

This package intentionally doesn't ship one. If you need a zero-build,
`<script>`-tag widget with default styles, talk to Apex — that's a separate
deliverable, not part of these headless packages.
