# Schema UI workspace

This workspace hosts the schema-driven UI library effort.

## Packages

- `packages/core`: framework-agnostic schema contracts and validation runtime.
- `packages/svelte`: Svelte renderer for core schema nodes.
- `apps/playground`: integration app for examples and validation UX.

## Requirements

- Node.js 22.17.0 or newer
- pnpm 10+

## Commands

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @catrolling/playground run dev
```

## Package consumption and publish readiness

Library packages are configured to publish built artifacts from `dist/`:

- `@catrolling/ui-schema-core`
- `@catrolling/ui-schema-svelte`

Build and verify publish artifacts locally:

```sh
corepack pnpm build
```

Start release/versioning flow with changesets:

```sh
corepack pnpm changeset
corepack pnpm version-packages
corepack pnpm release
```

## Core schema contract (v1)

`@catrolling/ui-schema-core` exposes framework-agnostic node contracts for:

- Primitive fields: `text`, `number`, `date`, `boolean`
- Media: `image`, `video`
- Layout/composition: `section`, `column`, `list`

All nodes require a stable `id`. Validation APIs:

- `validateSchemaNode(input)`
- `parseSchemaNode(input)`

Validation errors use the shared shape:

```ts
{ path: (string | number)[]; code: string; message: string }
```

## Quick API usage

```ts
import { parseSchemaNode, validateSchemaNode } from "@catrolling/ui-schema-core";
import { createRenderPlan } from "@catrolling/ui-schema-svelte";

const validation = validateSchemaNode(schemaInput);
if (!validation.success) {
  console.error(validation.errors);
} else {
  const parsed = parseSchemaNode(schemaInput);
  const plan = createRenderPlan(parsed, {
    mode: "field",
    values: { "profile-name": "Jane Doe" },
  });
  console.log(plan.component, plan.path);
}
```

Install (once published):

```sh
pnpm add @catrolling/ui-schema-core @catrolling/ui-schema-svelte
```

## Execution order

1. Workspace foundation
2. Core schema contracts
3. Svelte renderer
4. Playground integration
5. Convergence pass

## Svelte render plans (v1)

`@catrolling/ui-schema-svelte` provides a typed, framework-agnostic render-plan
layer for both Svelte integration and the playground:

```ts
import { createRenderPlan } from "@catrolling/ui-schema-svelte";

const plan = createRenderPlan(schemaNode, {
  mode: "field",
  values: { name: "Ada" },
  errors,
});
```

The plan switches its component contract between `view` and `field` modes and
uses a registry for the initial `text`, `number`, `date`, `boolean`, `image`,
`video`, `section`, `column`, and `list` node kinds. Validation errors are
attached to plans by node id and schema path.

## Playground integration (v1)

`@catrolling/playground` exports typed integration helpers to exercise the
core + svelte APIs in Node tests:

- `playgroundExamples` (4 examples): simple profile form, media-rich layout,
  nested list/section schema, kitchen sink layout
- `toggleRenderMode(mode)` helper for `view`/`field` switching
- `runPlaygroundExample(exampleId, mode)` for `parseSchemaNode` /
  `validateSchemaNode` + `createRenderPlan`
- `inspectRenderPlan(plan)` and `inspectRenderPlanLines(plan)` for deterministic
  render-plan inspection output
- localStorage helpers: `createDefaultPersistedState`,
  `loadPersistedState`, `savePersistedState`, `clearPersistedState`
- storage adapter entry point: `createLocalStorageAdapter` plus optional adapter
  parameters on persistence helpers for future backend swaps
- visual Svelte playground page (`apps/playground/src/App.svelte`) wiring
  selected example, mode, and values to localStorage persistence
- UX includes per-example dirty detection and reset controls
- styling now uses playground CSS design tokens (colors, spacing, radius)
  defined in `apps/playground/src/App.svelte` and consumed by child components
- list nodes support interactive add/remove item instances, row-level duplicate/remove
  controls, and persisted counts
