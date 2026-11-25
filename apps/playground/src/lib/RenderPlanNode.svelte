<script lang="ts">
  import type { NodePath } from "@catrolling/ui-schema-core";
  import type { RenderPlanNode } from "@catrolling/ui-schema-svelte";

  type PrimitiveValue = string | number | boolean | null | undefined;

  export let node: RenderPlanNode;
  export let values: Record<string, unknown>;
  export let onValueChange: (key: string, value: PrimitiveValue) => void;
  export let onListMutation: (
    listPath: NodePath,
    action: "append" | "remove" | "duplicate",
    index?: number,
  ) => void;
  export let instancePath: NodePath = [];

  $: effectivePath = instancePath.length > 0 ? instancePath : node.path;

  const listCountKey = (path: NodePath): string => `__listCount__:${path.join("/")}`;
  const valueKey = (path: NodePath): string => path.join("/");

  const getPathValue = (path: NodePath): unknown => values[valueKey(path)];
  const getListCount = (path: NodePath): number | undefined => {
    const raw = values[listCountKey(path)];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  };

  const getDisplayValue = (): unknown => {
    const byPath = getPathValue(effectivePath);
    return byPath === undefined ? node.value : byPath;
  };

  const setPathValue = (path: NodePath, value: PrimitiveValue): void => {
    onValueChange(valueKey(path), value);
  };

  const numberValue = (value: unknown): string =>
    typeof value === "number" && Number.isFinite(value) ? String(value) : "";

  const stringValue = (value: unknown): string => (typeof value === "string" ? value : "");

  const boolValue = (value: unknown): boolean => value === true;

  const changeNumberValue = (path: NodePath, raw: string): void => {
    if (raw.trim() === "") {
      setPathValue(path, undefined);
      return;
    }
    const parsed = Number(raw);
    setPathValue(path, Number.isFinite(parsed) ? parsed : undefined);
  };

  const buildListItemPath = (
    listPath: NodePath,
    itemTemplatePath: NodePath,
    index: number,
  ): NodePath => {
    const sharedPrefixLength = listPath.length;
    const suffix = itemTemplatePath.slice(sharedPrefixLength + 1);
    return [...listPath, index, ...suffix];
  };

  const resolveListCount = (): number => {
    const minItems = typeof node.props.minItems === "number" ? node.props.minItems : 0;
    const persisted = getListCount(effectivePath);
    if (persisted !== undefined) {
      return Math.max(persisted, minItems);
    }
    return Math.max(minItems, 1);
  };

  const currentListCount = (): number =>
    node.component === "list" ? resolveListCount() : 0;

  const canAddListItem = (): boolean => {
    if (node.component !== "list") return false;
    const maxItems =
      typeof node.props.maxItems === "number" ? node.props.maxItems : Number.POSITIVE_INFINITY;
    return currentListCount() < maxItems;
  };

  const canRemoveListItem = (): boolean => {
    if (node.component !== "list") return false;
    const minItems = typeof node.props.minItems === "number" ? node.props.minItems : 0;
    return currentListCount() > minItems;
  };

  const addListItem = (): void => {
    if (!canAddListItem()) return;
    onListMutation(effectivePath, "append");
  };

  const removeListItem = (): void => {
    if (!canRemoveListItem()) return;
    onListMutation(effectivePath, "remove", currentListCount() - 1);
  };

  const duplicateListItem = (index: number): void => {
    if (!canAddListItem()) return;
    onListMutation(effectivePath, "duplicate", index);
  };

  const removeListItemAt = (index: number): void => {
    if (!canRemoveListItem()) return;
    onListMutation(effectivePath, "remove", index);
  };
</script>

<div class="node">
  <div class="node-header">
    <span class="node-kind">{node.kind}</span>
    <strong>{node.label ?? node.id}</strong>
    <small>{node.id}</small>
    <span class="component">{node.component}</span>
  </div>

  {#if node.mode === "field" && node.component === "input"}
    <label class="field">
      <span>{node.label ?? node.id}</span>
      {#if node.props.type === "number"}
        <input
          type="number"
          value={numberValue(getDisplayValue())}
          oninput={(event) => {
            changeNumberValue(effectivePath, (event.currentTarget as HTMLInputElement).value);
          }}
        />
      {:else if node.props.type === "date"}
        <input
          type="date"
          value={stringValue(getDisplayValue())}
          oninput={(event) => {
            setPathValue(effectivePath, (event.currentTarget as HTMLInputElement).value);
          }}
        />
      {:else}
        <input
          type="text"
          value={stringValue(getDisplayValue())}
          oninput={(event) => {
            setPathValue(effectivePath, (event.currentTarget as HTMLInputElement).value);
          }}
        />
      {/if}
    </label>
  {:else if node.mode === "field" && node.component === "checkbox"}
    <label class="field checkbox">
      <input
        type="checkbox"
        checked={boolValue(getDisplayValue())}
        oninput={(event) => {
          setPathValue(effectivePath, (event.currentTarget as HTMLInputElement).checked);
        }}
      />
      <span>{node.label ?? node.id}</span>
    </label>
  {:else if node.component === "image"}
    <figure>
      <img src={String(node.props.src ?? "")} alt={String(node.props.alt ?? node.label ?? node.id)} />
      <figcaption>{node.label ?? node.id}</figcaption>
    </figure>
  {:else if node.component === "video"}
    <div class="video-placeholder">
      <strong>{node.label ?? node.id}</strong>
      <span>{String(node.props.src ?? "")}</span>
    </div>
  {:else if node.component !== "section" && node.component !== "column" && node.component !== "list"}
    <div class="value">
      <span>{String(getDisplayValue() ?? "")}</span>
    </div>
  {/if}

  {#if node.component === "list" && node.item}
    <div class="list-controls">
      <button type="button" onclick={addListItem} disabled={!canAddListItem()}>Add item</button>
      <button type="button" onclick={removeListItem} disabled={!canRemoveListItem()}>
        Remove last
      </button>
      <span>{currentListCount()} item(s)</span>
    </div>
  {/if}

  {#if node.errors.length > 0}
    <ul class="errors">
      {#each node.errors as error}
        <li>{error.code}: {error.message}</li>
      {/each}
    </ul>
  {/if}

  {#if node.item}
    <div class="children">
      {#if node.component === "list"}
        {#each Array(currentListCount()) as _, index (index)}
          <div class="list-row">
            <div class="list-row-header">
              <strong>Item {index + 1}</strong>
              <div class="list-row-actions">
                <button
                  type="button"
                  onclick={() => {
                    duplicateListItem(index);
                  }}
                  disabled={!canAddListItem()}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onclick={() => {
                    removeListItemAt(index);
                  }}
                  disabled={!canRemoveListItem()}
                >
                  Remove
                </button>
              </div>
            </div>
            <svelte:self
              node={node.item}
              {values}
              {onValueChange}
              {onListMutation}
              instancePath={buildListItemPath(effectivePath, node.item.path, index)}
            />
          </div>
        {/each}
      {:else}
        <svelte:self
          node={node.item}
          {values}
          {onValueChange}
          {onListMutation}
          instancePath={effectivePath}
        />
      {/if}
    </div>
  {/if}

  {#if node.children}
    <div class="children">
      {#each node.children as child (child.id)}
        <svelte:self
          node={child}
          {values}
          {onValueChange}
          {onListMutation}
          instancePath={[...effectivePath, ...child.path.slice(node.path.length)]}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .node {
    border: 1px solid var(--pg-border);
    border-radius: var(--pg-radius-md);
    padding: var(--pg-space-3);
    margin-bottom: var(--pg-space-3);
    background: var(--pg-surface);
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  }

  .node-header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--pg-space-2);
    margin-bottom: var(--pg-space-2);
  }

  .node-kind {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: var(--pg-text-muted);
  }

  .component {
    margin-left: auto;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--pg-text-muted);
    background: #eef2f8;
    border: 1px solid var(--pg-border);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }

  .field {
    display: grid;
    gap: var(--pg-space-1);
    margin-bottom: var(--pg-space-2);
  }

  .field input[type="text"],
  .field input[type="number"],
  .field input[type="date"] {
    border: 1px solid var(--pg-border-strong);
    border-radius: var(--pg-radius-sm);
    padding: 0.45rem 0.55rem;
    font: inherit;
    background: var(--pg-surface);
  }

  .field input[type="text"]:focus,
  .field input[type="number"]:focus,
  .field input[type="date"]:focus {
    border-color: var(--pg-accent);
    outline: 2px solid var(--pg-accent-soft);
    outline-offset: 0;
  }

  .checkbox {
    display: flex;
    align-items: center;
    gap: var(--pg-space-2);
  }

  figure {
    margin: 0;
  }

  img {
    max-width: 100%;
    border-radius: var(--pg-radius-sm);
    border: 1px solid var(--pg-border);
  }

  .video-placeholder {
    display: grid;
    gap: var(--pg-space-1);
    border: 1px dashed #a6afbd;
    border-radius: var(--pg-radius-sm);
    padding: var(--pg-space-2);
    background: #f7f8fb;
  }

  .errors {
    margin: 0.4rem 0;
    padding: var(--pg-space-2) var(--pg-space-3);
    border-radius: var(--pg-radius-md);
    border: 1px solid var(--pg-danger-border);
    background: var(--pg-danger-soft);
    color: var(--pg-danger);
    list-style-position: inside;
  }

  .children {
    margin-top: var(--pg-space-2);
    padding-left: var(--pg-space-3);
    border-left: 2px solid #ebedf0;
  }

  .list-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--pg-space-2);
    margin-bottom: var(--pg-space-2);
  }

  .list-controls button {
    border: 1px solid var(--pg-border-strong);
    border-radius: var(--pg-radius-sm);
    background: var(--pg-surface);
    padding: 0.3rem 0.55rem;
    font: inherit;
    cursor: pointer;
  }

  .list-controls button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .list-row {
    border: 1px dashed var(--pg-border);
    border-radius: var(--pg-radius-sm);
    padding: var(--pg-space-2);
    margin-bottom: var(--pg-space-2);
    background: var(--pg-surface-muted);
  }

  .list-row-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--pg-space-2);
    margin-bottom: var(--pg-space-2);
  }

  .list-row-actions {
    display: flex;
    gap: var(--pg-space-1);
  }

  .list-row-actions button {
    border: 1px solid var(--pg-border-strong);
    border-radius: var(--pg-radius-sm);
    background: var(--pg-surface);
    padding: 0.2rem 0.5rem;
    font: inherit;
    cursor: pointer;
  }

  .list-row-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
