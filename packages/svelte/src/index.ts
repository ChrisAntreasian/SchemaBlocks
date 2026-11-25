import type {
  NodePath,
  NodePathSegment,
  SchemaNode,
  SchemaNodeKind,
  ValidationError,
} from "@catrolling/ui-schema-core";

export const svelteFoundationReady = true;

export type SvelteRenderMode = "view" | "field";
export type RenderMode = SvelteRenderMode;
export type SvelteRenderOptions = RenderPlanOptions;
export type RenderPlan = RenderPlanNode;

export type RenderValueMap = Readonly<Record<string, unknown>>;

export interface RenderPlanOptions {
  mode: SvelteRenderMode;
  values?: RenderValueMap;
  errors?: readonly ValidationError[];
}

export interface RenderPlanNode {
  id: string;
  kind: SchemaNodeKind;
  mode: SvelteRenderMode;
  path: NodePath;
  label?: string;
  description?: string;
  value?: unknown;
  component: string;
  props: Readonly<Record<string, unknown>>;
  errors: ValidationError[];
  children?: RenderPlanNode[];
  item?: RenderPlanNode;
}

export type NodeRenderContext = {
  node: SchemaNode;
  mode: SvelteRenderMode;
  path: NodePath;
  value: unknown;
  errors: readonly ValidationError[];
};

export type NodeRenderer = (context: NodeRenderContext) => RenderPlanNode;
export type NodeRenderRegistry = Record<SchemaNodeKind, NodeRenderer>;

const getValue = (
  values: RenderValueMap | undefined,
  node: SchemaNode,
): unknown => values?.[node.id] ?? ("defaultValue" in node ? node.defaultValue : undefined);

const common = (
  context: NodeRenderContext,
  component: string,
  props: Record<string, unknown> = {},
): RenderPlanNode => ({
  id: context.node.id,
  kind: context.node.kind,
  mode: context.mode,
  path: [...context.path],
  label: context.node.label,
  description: context.node.description,
  value: context.value,
  component,
  props,
  errors: [...context.errors],
});

const primitiveText = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "text") return common(context, "text");
  if (context.mode === "field") {
    return common(context, "input", {
      type: "text",
      value: context.value,
      placeholder: node.placeholder,
      required: node.required === true,
    });
  }
  return common(context, "text", { value: context.value });
};

const primitiveNumber = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "number") return common(context, "text");
  if (context.mode === "field") {
    return common(context, "input", {
      type: "number",
      value: context.value,
      min: node.min,
      max: node.max,
      step: node.step,
    });
  }
  return common(context, "text", { value: context.value });
};

const primitiveDate = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "date") return common(context, "text");
  if (context.mode === "field") {
    return common(context, "input", {
      type: "date",
      value: context.value,
      min: node.min,
      max: node.max,
    });
  }
  return common(context, "text", { value: context.value });
};

const primitiveBoolean = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "boolean") return common(context, "text");
  if (context.mode === "field") {
    return common(context, "checkbox", {
      checked: context.value,
    });
  }
  return common(context, "boolean", { value: context.value });
};

const imageRenderer = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "image") return common(context, "image");
  return common(context, "image", {
    src: node.src,
    alt: node.alt,
  });
};

const videoRenderer = (context: NodeRenderContext): RenderPlanNode => {
  const node = context.node;
  if (node.kind !== "video") return common(context, "video");
  return common(context, "video", {
    src: node.src,
    poster: node.poster,
  });
};

export const defaultNodeRenderRegistry: NodeRenderRegistry = {
  text: primitiveText,
  number: primitiveNumber,
  date: primitiveDate,
  boolean: primitiveBoolean,
  image: imageRenderer,
  video: videoRenderer,
  section: (context) => common(context, "section"),
  column: (context) => common(context, "column"),
  list: (context) => common(context, "list"),
};

export const nodeRenderRegistry = defaultNodeRenderRegistry;

export function createRenderRegistry(
  overrides: Partial<NodeRenderRegistry> = {},
): NodeRenderRegistry {
  return { ...defaultNodeRenderRegistry, ...overrides };
}

export function getNodeRenderer(
  registry: NodeRenderRegistry,
  kind: SchemaNodeKind,
): NodeRenderer {
  return registry[kind];
}

const pathStartsWith = (path: NodePath, prefix: NodePath): boolean =>
  prefix.every((segment, index) => path[index] === segment);

export function getErrorsForNode(
  nodeId: string,
  nodePath: NodePath,
  errors: readonly ValidationError[] = [],
): ValidationError[] {
  return errors.filter((error) => {
    if (nodePath.length === 0) {
      const firstSegment = error.path[0];
      return firstSegment !== "children" && firstSegment !== "item";
    }
    if (pathStartsWith(error.path, nodePath) && error.path.length >= nodePath.length) {
      return true;
    }
    const lastSegment: NodePathSegment | undefined = error.path.at(-1);
    return lastSegment === nodeId || error.path.includes(nodeId);
  });
}

export const getValidationErrorsForNode = getErrorsForNode;

function buildPlan(
  node: SchemaNode,
  options: RenderPlanOptions,
  registry: NodeRenderRegistry,
  path: NodePath,
  values: RenderValueMap | undefined,
): RenderPlanNode {
  const errors = getErrorsForNode(
    node.id,
    path,
    options.errors,
  );
  const context: NodeRenderContext = {
    node,
    mode: options.mode,
    path,
    value: getValue(values, node),
    errors,
  };
  const plan = registry[node.kind](context);

  if (node.kind === "section" || node.kind === "column") {
    plan.children = node.children.map((child, index) =>
      buildPlan(
        child,
        options,
        registry,
        [...path, "children", index],
        values,
      ),
    );
  } else if (node.kind === "list") {
    plan.props = {
      minItems: node.minItems,
      maxItems: node.maxItems,
    };
    plan.item = buildPlan(
      node.item,
      options,
      registry,
      [...path, "item"],
      values,
    );
  }

  return plan;
}

export function createRenderPlan(
  node: SchemaNode,
  options: RenderPlanOptions,
  registry: NodeRenderRegistry = defaultNodeRenderRegistry,
): RenderPlanNode {
  return buildPlan(node, options, registry, [], options.values);
}

export const createNodeRenderPlan = createRenderPlan;
