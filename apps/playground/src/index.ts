import {
  booleanNode as createBooleanNode,
  columnNode as createColumnNode,
  coreFoundationReady,
  dateNode as createDateNode,
  imageNode as createImageNode,
  listNode as createListNode,
  numberNode as createNumberNode,
  parseSchemaNode,
  sectionNode as createSectionNode,
  type NodePath,
  type SchemaNode,
  type ValidationError,
  textNode as createTextNode,
  validateSchemaNode,
  videoNode as createVideoNode,
} from "@catrolling/ui-schema-core";
import {
  createRenderPlan,
  svelteFoundationReady,
  type RenderPlanNode,
  type RenderValueMap,
  type SvelteRenderMode,
} from "@catrolling/ui-schema-svelte";

export const playgroundFoundationReady = coreFoundationReady && svelteFoundationReady;

export interface PlaygroundExample {
  id: string;
  title: string;
  description: string;
  schema: SchemaNode;
  values?: RenderValueMap;
}

export interface RenderPlanInspectionNode {
  id: string;
  kind: SchemaNode["kind"];
  component: string;
  mode: SvelteRenderMode;
  path: readonly (string | number)[];
  errorCodes: readonly string[];
  children?: readonly RenderPlanInspectionNode[];
  item?: RenderPlanInspectionNode;
}

export interface PlaygroundIntegrationSuccess {
  success: true;
  example: PlaygroundExample;
  mode: SvelteRenderMode;
  schema: SchemaNode;
  renderPlan: RenderPlanNode;
  inspection: RenderPlanInspectionNode;
  inspectionLines: readonly string[];
}

export interface PlaygroundIntegrationFailure {
  success: false;
  example: PlaygroundExample;
  mode: SvelteRenderMode;
  errors: readonly ValidationError[];
}

export type PlaygroundIntegrationResult =
  | PlaygroundIntegrationSuccess
  | PlaygroundIntegrationFailure;

export interface PlaygroundPersistedState {
  selectedExampleId: string;
  mode: SvelteRenderMode;
  valuesByExample: Record<string, RenderValueMap>;
}

export interface PlaygroundStorageError {
  code: "storage_unavailable" | "storage_parse_failed" | "storage_write_failed";
  message: string;
}

export interface PlaygroundStorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export type PlaygroundStorageResult<T> =
  | { success: true; value: T }
  | { success: false; error: PlaygroundStorageError };

export type ListMutationAction = "append" | "remove" | "duplicate";

type DecodedValueKey =
  | { kind: "listCount"; path: (string | number)[] }
  | { kind: "value"; path: (string | number)[] };

const parsePath = (pathKey: string): (string | number)[] =>
  pathKey
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

const toPathKey = (segments: readonly (string | number)[]): string =>
  segments.map((segment) => String(segment)).join("/");

export const listCountKeyFromPath = (path: NodePath): string =>
  `__listCount__:${toPathKey(path)}`;

export const decodeValueKey = (key: string): DecodedValueKey => {
  if (key.startsWith("__listCount__:")) {
    return {
      kind: "listCount",
      path: parsePath(key.slice("__listCount__:".length)),
    };
  }
  return { kind: "value", path: parsePath(key) };
};

const encodeValueKey = (decoded: DecodedValueKey): string => {
  const pathKey = toPathKey(decoded.path);
  return decoded.kind === "listCount" ? `__listCount__:${pathKey}` : pathKey;
};

export const getListItemIndexAtPath = (
  path: readonly (string | number)[],
  listPath: readonly (string | number)[],
): number | null => {
  if (path.length <= listPath.length) {
    return null;
  }
  for (let index = 0; index < listPath.length; index += 1) {
    if (path[index] !== listPath[index]) {
      return null;
    }
  }
  const candidate = path[listPath.length];
  return typeof candidate === "number" ? candidate : null;
};

export const applyListMutation = (
  values: RenderValueMap,
  listPath: NodePath,
  action: ListMutationAction,
  index?: number,
): RenderValueMap => {
  const listCountKey = listCountKeyFromPath(listPath);
  const persistedCount = values[listCountKey];
  const currentCount =
    typeof persistedCount === "number" && Number.isFinite(persistedCount) ? persistedCount : 1;

  const nextEntries: Record<string, unknown> = {};
  const decodedEntries = Object.entries(values).map(([key, value]) => ({
    decoded: decodeValueKey(key),
    value,
  }));

  const setDecodedEntry = (decoded: DecodedValueKey, value: unknown): void => {
    nextEntries[encodeValueKey(decoded)] = value;
  };

  if (action === "append") {
    decodedEntries.forEach(({ decoded, value }) => {
      setDecodedEntry(decoded, value);
    });
    nextEntries[listCountKey] = currentCount + 1;
    return nextEntries;
  }

  if (action === "remove") {
    const removeIndex = typeof index === "number" ? index : currentCount - 1;
    decodedEntries.forEach(({ decoded, value }) => {
      const itemIndex = getListItemIndexAtPath(decoded.path, listPath);
      if (itemIndex === null) {
        setDecodedEntry(decoded, value);
        return;
      }
      if (itemIndex === removeIndex) {
        return;
      }
      if (itemIndex > removeIndex) {
        const shifted = [...decoded.path];
        shifted[listPath.length] = itemIndex - 1;
        setDecodedEntry({ ...decoded, path: shifted }, value);
        return;
      }
      setDecodedEntry(decoded, value);
    });
    nextEntries[listCountKey] = Math.max(0, currentCount - 1);
    return nextEntries;
  }

  const duplicateIndex = typeof index === "number" ? index : currentCount - 1;
  decodedEntries.forEach(({ decoded, value }) => {
    const itemIndex = getListItemIndexAtPath(decoded.path, listPath);
    if (itemIndex === null) {
      setDecodedEntry(decoded, value);
      return;
    }
    if (itemIndex > duplicateIndex) {
      const shifted = [...decoded.path];
      shifted[listPath.length] = itemIndex + 1;
      setDecodedEntry({ ...decoded, path: shifted }, value);
      return;
    }
    setDecodedEntry(decoded, value);
  });

  decodedEntries.forEach(({ decoded, value }) => {
    const itemIndex = getListItemIndexAtPath(decoded.path, listPath);
    if (itemIndex !== duplicateIndex) {
      return;
    }
    const duplicated = [...decoded.path];
    duplicated[listPath.length] = duplicateIndex + 1;
    setDecodedEntry({ ...decoded, path: duplicated }, value);
  });

  nextEntries[listCountKey] = currentCount + 1;
  return nextEntries;
};

const composeSection = (
  id: string,
  label: string,
  ...fragments: readonly (readonly SchemaNode[])[]
): SchemaNode =>
  createSectionNode({
    id,
    label,
    children: fragments.flat(),
  });

const profileIdentityFields = [
  createTextNode({
    id: "profile-name",
    label: "Display name",
    required: true,
    placeholder: "Jane Doe",
  }),
  createTextNode({
    id: "profile-bio",
    label: "Bio",
    placeholder: "Tell people what you build",
  }),
  createDateNode({
    id: "profile-birthdate",
    label: "Birth date",
  }),
] as const;

const profilePreferenceFields = [
  createBooleanNode({
    id: "profile-newsletter",
    label: "Newsletter",
    defaultValue: true,
  }),
  createNumberNode({
    id: "profile-experience-years",
    label: "Years of experience",
    min: 0,
    max: 50,
    step: 1,
    defaultValue: 5,
  }),
] as const;

const simpleProfileSchema = composeSection(
  "profile-root",
  "Simple profile form",
  profileIdentityFields,
  profilePreferenceFields,
);

const mediaRichSchema = createSectionNode({
  id: "media-root",
  label: "Media-rich layout",
  children: [
    createTextNode({
      id: "media-title",
      label: "Feature title",
      defaultValue: "Launch recap",
    }),
    createColumnNode({
      id: "media-column",
      label: "Hero assets",
      children: [
        createImageNode({
          id: "media-cover",
          label: "Cover image",
          src: "/assets/cover.png",
          alt: "Product hero image",
        }),
        createVideoNode({
          id: "media-demo",
          label: "Demo clip",
          src: "/assets/demo.mp4",
          poster: "/assets/demo-poster.png",
        }),
      ],
    }),
    createTextNode({
      id: "media-caption",
      label: "Caption",
      defaultValue: "Highlights from this week's product update.",
    }),
  ],
});

const nestedListSectionSchema = createSectionNode({
  id: "content-plan-root",
  label: "Nested list + section schema",
  children: [
    createListNode({
      id: "content-sections",
      label: "Sections",
      minItems: 1,
      maxItems: 8,
      item: createSectionNode({
        id: "content-section-item",
        label: "Section",
        children: [
          createTextNode({
            id: "content-section-title",
            label: "Title",
            required: true,
          }),
          createListNode({
            id: "content-section-bullets",
            label: "Bullets",
            minItems: 1,
            item: createTextNode({
              id: "content-bullet-item",
              label: "Bullet",
              required: true,
            }),
          }),
        ],
      }),
    }),
  ],
});

const kitchenSinkSchema = createSectionNode({
  id: "kitchen-sink-root",
  label: "Kitchen sink",
  children: [
    createTextNode({
      id: "kitchen-title",
      label: "Title",
      required: true,
      defaultValue: "Schema-driven UI",
    }),
    createDateNode({
      id: "kitchen-release-date",
      label: "Release date",
    }),
    createBooleanNode({
      id: "kitchen-featured",
      label: "Featured",
      defaultValue: false,
    }),
    createNumberNode({
      id: "kitchen-score",
      label: "Score",
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 88,
    }),
    createColumnNode({
      id: "kitchen-media-column",
      label: "Media",
      children: [
        createImageNode({
          id: "kitchen-image",
          label: "Image",
          src: "/assets/kitchen.png",
          alt: "Kitchen sink preview",
        }),
        createVideoNode({
          id: "kitchen-video",
          label: "Video",
          src: "/assets/kitchen.mp4",
        }),
      ],
    }),
    createListNode({
      id: "kitchen-items",
      label: "Checklist items",
      minItems: 1,
      maxItems: 5,
      item: createSectionNode({
        id: "kitchen-item",
        label: "Item",
        children: [
          createTextNode({
            id: "kitchen-item-name",
            label: "Item name",
            required: true,
          }),
          createBooleanNode({
            id: "kitchen-item-done",
            label: "Done",
            defaultValue: false,
          }),
        ],
      }),
    }),
  ],
});

export const playgroundExamples: readonly PlaygroundExample[] = [
  {
    id: "simple-profile-form",
    title: "Simple profile form",
    description: "Composes identity + preference fragments into one profile section.",
    schema: simpleProfileSchema,
    values: {
      "profile-name": "Jane Doe",
      "profile-bio": "Type-safe UI schema explorer",
      "profile-newsletter": true,
      "profile-experience-years": 7,
    },
  },
  {
    id: "media-rich-layout",
    title: "Media-rich layout",
    description: "Combines text fields with image/video nodes in a column layout.",
    schema: mediaRichSchema,
    values: {
      "media-title": "Launch recap",
      "media-caption": "Highlights from this week's product update.",
    },
  },
  {
    id: "nested-list-section-schema",
    title: "Nested list/section schema",
    description: "Shows list templates that nest section + list composition.",
    schema: nestedListSectionSchema,
  },
  {
    id: "kitchen-sink-layout",
    title: "Kitchen sink layout",
    description: "Exercises all current node types in one schema.",
    schema: kitchenSinkSchema,
    values: {
      "kitchen-title": "Kitchen sink demo",
      "kitchen-featured": true,
      "kitchen-score": 91,
      "kitchen-item-name": "Ship docs",
      "kitchen-item-done": false,
    },
  },
] as const;

export const toggleRenderMode = (mode: SvelteRenderMode): SvelteRenderMode =>
  mode === "view" ? "field" : "view";

const inspectRenderPlanNode = (node: RenderPlanNode): RenderPlanInspectionNode => ({
  id: node.id,
  kind: node.kind,
  component: node.component,
  mode: node.mode,
  path: [...node.path],
  errorCodes: node.errors.map((error) => error.code),
  ...(node.children
    ? { children: node.children.map((child) => inspectRenderPlanNode(child)) }
    : {}),
  ...(node.item ? { item: inspectRenderPlanNode(node.item) } : {}),
});

const toPathString = (path: readonly (string | number)[]): string =>
  path.length === 0 ? "/" : `/${path.join("/")}`;

export const inspectRenderPlan = (plan: RenderPlanNode): RenderPlanInspectionNode =>
  inspectRenderPlanNode(plan);

const pushInspectionLines = (
  node: RenderPlanInspectionNode,
  lines: string[],
  depth: number,
): void => {
  const indent = "  ".repeat(depth);
  lines.push(
    `${indent}[${node.mode}] ${node.kind}#${node.id} -> ${node.component} @ ${toPathString(
      node.path,
    )}`,
  );
  node.children?.forEach((child) => {
    pushInspectionLines(child, lines, depth + 1);
  });
  if (node.item) {
    pushInspectionLines(node.item, lines, depth + 1);
  }
};

export const inspectRenderPlanLines = (plan: RenderPlanNode): readonly string[] => {
  const lines: string[] = [];
  pushInspectionLines(inspectRenderPlan(plan), lines, 0);
  return lines;
};

export const getPlaygroundExample = (id: string): PlaygroundExample | undefined =>
  playgroundExamples.find((example) => example.id === id);

export const runPlaygroundExample = (
  exampleId: string,
  mode: SvelteRenderMode,
  overrides: {
    values?: RenderValueMap;
    errors?: readonly ValidationError[];
  } = {},
): PlaygroundIntegrationResult => {
  const example = getPlaygroundExample(exampleId);
  if (!example) {
    throw new Error(`Unknown playground example "${exampleId}"`);
  }

  const validation = validateSchemaNode(example.schema);
  if (!validation.success) {
    return {
      success: false,
      example,
      mode,
      errors: validation.errors,
    };
  }

  const parsedSchema = parseSchemaNode(example.schema);
  const renderPlan = createRenderPlan(parsedSchema, {
    mode,
    values: overrides.values ?? example.values,
    errors: overrides.errors,
  });

  return {
    success: true,
    example,
    mode,
    schema: parsedSchema,
    renderPlan,
    inspection: inspectRenderPlan(renderPlan),
    inspectionLines: inspectRenderPlanLines(renderPlan),
  };
};

const PLAYGROUND_STORAGE_KEY = "catrolling.schemaUi.playground.v1";

const createStorageUnavailableError = (): PlaygroundStorageResult<never> => ({
  success: false,
  error: {
    code: "storage_unavailable",
    message: "localStorage is not available in this environment",
  },
});

const createStorageWriteFailedError = (message: string): PlaygroundStorageResult<never> => ({
  success: false,
  error: {
    code: "storage_write_failed",
    message,
  },
});

const getBrowserStorage = (): PlaygroundStorageResult<PlaygroundStorageAdapter> => {
  if (typeof globalThis.localStorage === "undefined") {
    return createStorageUnavailableError();
  }
  return { success: true, value: globalThis.localStorage };
};

export const createLocalStorageAdapter = (): PlaygroundStorageResult<PlaygroundStorageAdapter> =>
  getBrowserStorage();

const isRenderMode = (value: unknown): value is SvelteRenderMode =>
  value === "view" || value === "field";

const isValuesByExample = (value: unknown): value is Record<string, RenderValueMap> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
};

const isPersistedState = (value: unknown): value is PlaygroundPersistedState => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PlaygroundPersistedState>;
  return (
    typeof candidate.selectedExampleId === "string" &&
    isRenderMode(candidate.mode) &&
    isValuesByExample(candidate.valuesByExample)
  );
};

export const createDefaultPersistedState = (): PlaygroundPersistedState => ({
  selectedExampleId: playgroundExamples[0].id,
  mode: "view",
  valuesByExample: {},
});

export const loadPersistedState = (
  adapter?: PlaygroundStorageAdapter,
): PlaygroundStorageResult<PlaygroundPersistedState | null> => {
  const storageResult = adapter
    ? { success: true as const, value: adapter }
    : createLocalStorageAdapter();
  if (!storageResult.success) {
    return storageResult;
  }

  const raw = storageResult.value.getItem(PLAYGROUND_STORAGE_KEY);
  if (raw === null) {
    return { success: true, value: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      success: false,
      error: {
        code: "storage_parse_failed",
        message: "Could not parse persisted playground state JSON",
      },
    };
  }

  if (!isPersistedState(parsed)) {
    return {
      success: false,
      error: {
        code: "storage_parse_failed",
        message: "Persisted playground state has an invalid shape",
      },
    };
  }

  return { success: true, value: parsed };
};

export const savePersistedState = (
  state: PlaygroundPersistedState,
  adapter?: PlaygroundStorageAdapter,
): PlaygroundStorageResult<PlaygroundPersistedState> => {
  const storageResult = adapter
    ? { success: true as const, value: adapter }
    : createLocalStorageAdapter();
  if (!storageResult.success) {
    return storageResult;
  }

  try {
    storageResult.value.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return createStorageWriteFailedError("Could not persist playground state to storage");
  }

  return { success: true, value: state };
};

export const clearPersistedState = (
  adapter?: PlaygroundStorageAdapter,
): PlaygroundStorageResult<null> => {
  const storageResult = adapter
    ? { success: true as const, value: adapter }
    : createLocalStorageAdapter();
  if (!storageResult.success) {
    return storageResult;
  }

  try {
    storageResult.value.removeItem(PLAYGROUND_STORAGE_KEY);
  } catch {
    return createStorageWriteFailedError("Could not clear persisted playground state from storage");
  }

  return { success: true, value: null };
};
