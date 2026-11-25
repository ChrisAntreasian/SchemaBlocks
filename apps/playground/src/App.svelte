<script lang="ts">
  import RenderPlanNode from "./lib/RenderPlanNode.svelte";
  import {
    applyListMutation,
    clearPersistedState,
    createDefaultPersistedState,
    listCountKeyFromPath,
    loadPersistedState,
    playgroundExamples,
    runPlaygroundExample,
    savePersistedState,
    toggleRenderMode,
    type PlaygroundPersistedState,
  } from "./index.js";
  import type {
    RenderValueMap,
    SvelteRenderMode,
  } from "@catrolling/ui-schema-svelte";
  import type { NodePath, SchemaNode } from "@catrolling/ui-schema-core";
  import { onMount } from "svelte";

  type PrimitiveValue = string | number | boolean | null | undefined;

  let selectedExampleId = createDefaultPersistedState().selectedExampleId;
  let mode: SvelteRenderMode = "view";
  let valuesByExample: Record<string, RenderValueMap> = {};
  let storageErrorMessage: string | null = null;
  let saveStatusMessage = "Saved";
  let isHydrated = false;

  const getExample = (exampleId: string) =>
    playgroundExamples.find((candidate) => candidate.id === exampleId);

  const getExampleValues = (
    exampleId: string,
    overridesByExample: Record<string, RenderValueMap>,
  ): RenderValueMap => {
    const example = getExample(exampleId);
    if (!example) {
      return {};
    }
    return {
      ...(example.values ?? {}),
      ...(overridesByExample[exampleId] ?? {}),
    };
  };

  const isKnownExample = (exampleId: string): boolean =>
    playgroundExamples.some((candidate) => candidate.id === exampleId);

  const isSamePrimitive = (left: unknown, right: unknown): boolean => {
    if (typeof left === "number" && typeof right === "number") {
      return Number.isNaN(left) && Number.isNaN(right) ? true : left === right;
    }
    return left === right;
  };

  const hasExampleOverrides = (exampleId: string): boolean => {
    const example = getExample(exampleId);
    if (!example) {
      return false;
    }
    const defaults = example.values ?? {};
    const overrides = valuesByExample[exampleId] ?? {};
    const keys = new Set([...Object.keys(defaults), ...Object.keys(overrides)]);
    for (const key of keys) {
      if (!isSamePrimitive(defaults[key], overrides[key])) {
        return true;
      }
    }
    return false;
  };

  const collectSchemaPathToIdMap = (
    node: SchemaNode,
    path: (string | number)[],
    map: Record<string, string>,
  ): void => {
    map[path.join("/")] = node.id;
    if (node.kind === "section" || node.kind === "column") {
      node.children.forEach((child, index) => {
        collectSchemaPathToIdMap(child, [...path, "children", index], map);
      });
      return;
    }
    if (node.kind === "list") {
      collectSchemaPathToIdMap(node.item, [...path, "item"], map);
    }
  };

  const persistState = (): void => {
    if (!isHydrated) {
      return;
    }
    const state: PlaygroundPersistedState = {
      selectedExampleId,
      mode,
      valuesByExample,
    };
    const saveResult = savePersistedState(state);
    if (saveResult.success) {
      storageErrorMessage = null;
      saveStatusMessage = "Saved";
      return;
    }
    storageErrorMessage = saveResult.error.message;
    saveStatusMessage = "Save failed";
  };

  onMount(() => {
    const loadResult = loadPersistedState();
    if (loadResult.success && loadResult.value) {
      if (isKnownExample(loadResult.value.selectedExampleId)) {
        selectedExampleId = loadResult.value.selectedExampleId;
      }
      mode = loadResult.value.mode;
      valuesByExample = loadResult.value.valuesByExample;
    } else if (!loadResult.success) {
      storageErrorMessage = loadResult.error.message;
    }
    isHydrated = true;
    persistState();
  });

  $: currentValues = getExampleValues(selectedExampleId, valuesByExample);
  $: integrationResult = runPlaygroundExample(selectedExampleId, mode, {
    values: currentValues,
  });
  $: pathToNodeIdMap =
    (() => {
      const example = getExample(selectedExampleId);
      if (!example) {
        return {} as Record<string, string>;
      }
      const map: Record<string, string> = {};
      collectSchemaPathToIdMap(example.schema, [], map);
      return map;
    })();

  $: if (isHydrated) {
    persistState();
  }

  const updateValue = (key: string, value: PrimitiveValue): void => {
    const mappedNodeId = pathToNodeIdMap[key];
    valuesByExample = {
      ...valuesByExample,
      [selectedExampleId]: {
        ...currentValues,
        [key]: value,
        ...(mappedNodeId ? { [mappedNodeId]: value } : {}),
      },
    };
    saveStatusMessage = "Unsaved changes";
  };

  const mutateListValues = (
    listPath: NodePath,
    action: "append" | "remove" | "duplicate",
    index?: number,
  ): void => {
    const listCountKey = listCountKeyFromPath(listPath);
    const persistedCount = currentValues[listCountKey];
    const currentCount =
      typeof persistedCount === "number" && Number.isFinite(persistedCount)
        ? persistedCount
        : 1;
    if (action === "remove" && currentCount <= 0) {
      return;
    }
    const nextEntries = applyListMutation(currentValues, listPath, action, index);

    valuesByExample = {
      ...valuesByExample,
      [selectedExampleId]: nextEntries,
    };
    saveStatusMessage = "Unsaved changes";
  };

  const switchMode = (): void => {
    mode = toggleRenderMode(mode);
  };

  const resetStorage = (): void => {
    const clearResult = clearPersistedState();
    if (!clearResult.success) {
      storageErrorMessage = clearResult.error.message;
      return;
    }
    const defaults = createDefaultPersistedState();
    selectedExampleId = defaults.selectedExampleId;
    mode = defaults.mode;
    valuesByExample = defaults.valuesByExample;
    storageErrorMessage = null;
    saveStatusMessage = "Saved";
  };

  const resetCurrentExample = (): void => {
    if (!hasExampleOverrides(selectedExampleId)) {
      return;
    }
    const { [selectedExampleId]: _ignored, ...rest } = valuesByExample;
    valuesByExample = rest;
    saveStatusMessage = "Unsaved changes";
  };

  const saveNow = (): void => {
    persistState();
  };
</script>

<main>
  <header>
    <h1>Schema UI Playground</h1>
    <p>State is persisted in localStorage for selected example, mode, and values.</p>
  </header>

  <section class="controls">
    <label>
      Example
      <select bind:value={selectedExampleId}>
        {#each playgroundExamples as example}
          <option value={example.id}>{example.title}</option>
        {/each}
      </select>
    </label>

    <button type="button" onclick={switchMode}>Switch to {toggleRenderMode(mode)} mode</button>
    <button type="button" class="secondary" onclick={resetCurrentExample}>
      Reset current example
    </button>
    <button type="button" class="secondary" onclick={saveNow}>Save changes</button>
    <button type="button" class="secondary" onclick={resetStorage}>
      Reset persisted state
    </button>
  </section>

  <section class="status-grid">
    <div class="status-chip">
      <span>Mode</span>
      <strong>{mode}</strong>
    </div>
    <div class="status-chip">
      <span>Example state</span>
      <strong>{hasExampleOverrides(selectedExampleId) ? "Dirty" : "Clean"}</strong>
    </div>
    <div class="status-chip">
      <span>Storage</span>
      <strong>{storageErrorMessage ? "Unavailable" : "Persisted"}</strong>
    </div>
    <div class="status-chip">
      <span>Save status</span>
      <strong>{saveStatusMessage}</strong>
    </div>
    {#if storageErrorMessage}
      <p class="error">{storageErrorMessage}</p>
    {/if}
  </section>

  {#if integrationResult.success}
    <section class="layout">
      <article>
        <h2>{integrationResult.example.title}</h2>
        <p>{integrationResult.example.description}</p>
        <RenderPlanNode
          node={integrationResult.renderPlan}
          values={currentValues}
          onValueChange={updateValue}
          onListMutation={mutateListValues}
        />
      </article>

      <aside>
        <h3>Render plan inspection</h3>
        <pre>{integrationResult.inspectionLines.join("\n")}</pre>
      </aside>
    </section>
  {:else}
    <section class="error-panel">
      <h2>Schema validation failed</h2>
      <ul>
        {#each integrationResult.errors as error}
          <li>{error.code}: {error.message}</li>
        {/each}
      </ul>
    </section>
  {/if}
</main>

<style>
  :global(:root) {
    --pg-bg: #f5f7fb;
    --pg-surface: #ffffff;
    --pg-surface-muted: #f8fafc;
    --pg-text: #1b2430;
    --pg-text-muted: #5b6575;
    --pg-border: #d8dde6;
    --pg-border-strong: #c2c8d0;
    --pg-accent: #6d7ff2;
    --pg-accent-soft: #d8ddff;
    --pg-danger: #b42318;
    --pg-danger-soft: #fff2f2;
    --pg-danger-border: #f3c7c3;
    --pg-shadow: 0 6px 16px rgba(21, 29, 40, 0.05);
    --pg-radius-sm: 6px;
    --pg-radius-md: 10px;
    --pg-radius-lg: 12px;
    --pg-space-1: 0.25rem;
    --pg-space-2: 0.5rem;
    --pg-space-3: 0.75rem;
    --pg-space-4: 1rem;
  }

  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: var(--pg-bg);
    color: var(--pg-text);
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--pg-space-4);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  header {
    display: grid;
    gap: var(--pg-space-2);
    margin-bottom: var(--pg-space-4);
    padding: 0.2rem 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--pg-space-3);
    align-items: end;
    margin-bottom: var(--pg-space-3);
  }

  label {
    display: grid;
    gap: var(--pg-space-1);
    font-size: 0.92rem;
  }

  select,
  button {
    border: 1px solid var(--pg-border-strong);
    border-radius: var(--pg-radius-sm);
    padding: 0.45rem 0.7rem;
    font: inherit;
    background: var(--pg-surface);
  }

  button {
    cursor: pointer;
  }

  button.secondary {
    background: var(--pg-surface-muted);
  }

  .status-grid {
    margin-bottom: var(--pg-space-3);
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }

  .status-chip {
    display: grid;
    gap: 0.2rem;
    border: 1px solid var(--pg-border);
    border-radius: 999px;
    padding: 0.35rem 0.75rem;
    background: var(--pg-surface);
    font-size: 0.84rem;
  }

  .status-chip span {
    color: var(--pg-text-muted);
  }

  .status-chip strong {
    font-size: 0.9rem;
  }

  .error {
    color: var(--pg-danger);
    margin: 0;
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr minmax(280px, 40%);
    gap: var(--pg-space-4);
    align-items: start;
  }

  article,
  aside,
  .error-panel {
    border: 1px solid var(--pg-border);
    border-radius: var(--pg-radius-lg);
    background: var(--pg-surface);
    padding: var(--pg-space-4);
    display: grid;
    gap: var(--pg-space-3);
    box-shadow: var(--pg-shadow);
  }

  pre {
    margin: 0;
    max-height: 70vh;
    overflow: auto;
    background: #0f172a;
    color: #d8e2ff;
    border-radius: var(--pg-radius-md);
    padding: var(--pg-space-3);
    font-size: 0.8rem;
  }

  @media (max-width: 920px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
