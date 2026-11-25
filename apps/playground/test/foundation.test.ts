import { describe, expect, it } from "vitest";
import {
  applyListMutation,
  clearPersistedState,
  createLocalStorageAdapter,
  createDefaultPersistedState,
  listCountKeyFromPath,
  loadPersistedState,
  playgroundExamples,
  playgroundFoundationReady,
  runPlaygroundExample,
  savePersistedState,
  toggleRenderMode,
} from "../src/index.js";

describe("playground foundation", () => {
  it("links to workspace packages", () => {
    expect(playgroundFoundationReady).toBe(true);
  });

  it("ships three integration examples", () => {
    expect(playgroundExamples).toHaveLength(4);
    expect(playgroundExamples.map((example) => example.id)).toEqual([
      "simple-profile-form",
      "media-rich-layout",
      "nested-list-section-schema",
      "kitchen-sink-layout",
    ]);
  });

  it("validates and renders all examples in both modes", () => {
    playgroundExamples.forEach((example) => {
      const viewResult = runPlaygroundExample(example.id, "view");
      const fieldResult = runPlaygroundExample(example.id, "field");

      expect(viewResult.success).toBe(true);
      expect(fieldResult.success).toBe(true);

      if (!viewResult.success || !fieldResult.success) {
        throw new Error("Expected valid playground example");
      }

      expect(viewResult.renderPlan.mode).toBe("view");
      expect(fieldResult.renderPlan.mode).toBe("field");
      expect(viewResult.inspectionLines.length).toBeGreaterThan(0);
      expect(fieldResult.inspectionLines.length).toBeGreaterThan(0);
    });
  });

  it("switches render mode between view and field", () => {
    expect(toggleRenderMode("view")).toBe("field");
    expect(toggleRenderMode("field")).toBe("view");
  });

  it("exposes render-plan inspection output for mode behavior", () => {
    const viewResult = runPlaygroundExample("simple-profile-form", "view");
    const fieldResult = runPlaygroundExample("simple-profile-form", "field");

    if (!viewResult.success || !fieldResult.success) {
      throw new Error("Expected valid playground example");
    }

    expect(viewResult.inspectionLines).toContain(
      "  [view] text#profile-name -> text @ /children/0",
    );
    expect(fieldResult.inspectionLines).toContain(
      "  [field] text#profile-name -> input @ /children/0",
    );
  });

  it("inspects nested list + section plans for traversal tests", () => {
    const result = runPlaygroundExample("nested-list-section-schema", "field");
    if (!result.success) {
      throw new Error("Expected valid playground example");
    }

    expect(result.inspectionLines).toContain(
      "  [field] list#content-sections -> list @ /children/0",
    );
    expect(result.inspectionLines).toContain(
      "    [field] section#content-section-item -> section @ /children/0/item",
    );
    expect(result.inspectionLines).toContain(
      "        [field] text#content-bullet-item -> input @ /children/0/item/children/1/item",
    );
  });

  it("persists and loads playground state from localStorage", () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return storage.has(key) ? (storage.get(key) ?? null) : null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
    });

    const state = createDefaultPersistedState();
    state.mode = "field";
    state.selectedExampleId = "simple-profile-form";
    state.valuesByExample = {
      "simple-profile-form": {
        "profile-name": "Jane Doe",
      },
    };

    const save = savePersistedState(state);
    expect(save.success).toBe(true);

    const load = loadPersistedState();
    expect(load.success).toBe(true);
    if (!load.success) {
      throw new Error("Expected persisted state to load");
    }
    expect(load.value).toEqual(state);

    const clear = clearPersistedState();
    expect(clear.success).toBe(true);

    const afterClear = loadPersistedState();
    expect(afterClear.success).toBe(true);
    if (!afterClear.success) {
      throw new Error("Expected persisted state to load after clear");
    }
    expect(afterClear.value).toBeNull();
  });

  it("supports persistence via an injected storage adapter", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem(key: string) {
        return storage.has(key) ? (storage.get(key) ?? null) : null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    };

    const state = createDefaultPersistedState();
    state.selectedExampleId = "media-rich-layout";

    const save = savePersistedState(state, adapter);
    expect(save.success).toBe(true);

    const load = loadPersistedState(adapter);
    expect(load.success).toBe(true);
    if (!load.success) {
      throw new Error("Expected adapter-backed state to load");
    }
    expect(load.value).toEqual(state);

    const clear = clearPersistedState(adapter);
    expect(clear.success).toBe(true);
  });

  it("returns storage_unavailable when localStorage adapter cannot be created", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: undefined,
    });

    const adapterResult = createLocalStorageAdapter();
    expect(adapterResult.success).toBe(false);
    if (adapterResult.success) {
      throw new Error("Expected adapter creation to fail");
    }
    expect(adapterResult.error.code).toBe("storage_unavailable");
  });

  it("duplicates and removes list rows while preserving path-keyed values", () => {
    const listPath = ["children", 0] as const;
    const listCountKey = listCountKeyFromPath(listPath);
    const initialValues = {
      [listCountKey]: 2,
      "children/0/0/title": "first",
      "children/0/1/title": "second",
      "children/9/meta": "outside",
    };

    const duplicated = applyListMutation(initialValues, listPath, "duplicate", 0);
    expect(duplicated[listCountKey]).toBe(3);
    expect(duplicated["children/0/0/title"]).toBe("first");
    expect(duplicated["children/0/1/title"]).toBe("first");
    expect(duplicated["children/0/2/title"]).toBe("second");
    expect(duplicated["children/9/meta"]).toBe("outside");

    const removed = applyListMutation(duplicated, listPath, "remove", 1);
    expect(removed[listCountKey]).toBe(2);
    expect(removed["children/0/0/title"]).toBe("first");
    expect(removed["children/0/1/title"]).toBe("second");
  });

  it("persists edited values and reuses them in a fresh render pass", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem(key: string) {
        return storage.has(key) ? (storage.get(key) ?? null) : null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
    };

    const persisted = createDefaultPersistedState();
    persisted.mode = "view";
    persisted.selectedExampleId = "simple-profile-form";
    persisted.valuesByExample = {
      "simple-profile-form": {
        "profile-name": "Reloaded Name",
      },
    };

    const save = savePersistedState(persisted, adapter);
    expect(save.success).toBe(true);

    const loaded = loadPersistedState(adapter);
    expect(loaded.success).toBe(true);
    if (!loaded.success || loaded.value === null) {
      throw new Error("Expected persisted state to load");
    }

    const rendered = runPlaygroundExample(loaded.value.selectedExampleId, loaded.value.mode, {
      values: loaded.value.valuesByExample[loaded.value.selectedExampleId],
    });

    expect(rendered.success).toBe(true);
    if (!rendered.success) {
      throw new Error("Expected rendered result to succeed");
    }

    expect(rendered.renderPlan.children?.[0]?.value).toBe("Reloaded Name");
  });
});
