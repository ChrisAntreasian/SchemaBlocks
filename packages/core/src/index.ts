export const coreFoundationReady = true;

import { Result, Schema, SchemaIssue } from "effect";

export type NodePathSegment = string | number;
export type NodePath = readonly NodePathSegment[];

export interface ValidationError {
  path: NodePath;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      errors: ValidationError[];
    };

export interface ValidatorContract<T> {
  validate(input: unknown): ValidationResult<T>;
  parse(input: unknown): T;
}

export type SchemaNodeKind =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "image"
  | "video"
  | "section"
  | "column"
  | "list";

export interface BaseNode {
  id: string;
  kind: SchemaNodeKind;
  label?: string;
  description?: string;
}

export interface TextNode extends BaseNode {
  kind: "text";
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}

export interface NumberNode extends BaseNode {
  kind: "number";
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface DateNode extends BaseNode {
  kind: "date";
  defaultValue?: string;
  min?: string;
  max?: string;
}

export interface BooleanNode extends BaseNode {
  kind: "boolean";
  defaultValue?: boolean;
}

export interface ImageNode extends BaseNode {
  kind: "image";
  src: string;
  alt?: string;
}

export interface VideoNode extends BaseNode {
  kind: "video";
  src: string;
  poster?: string;
}

export interface SectionNode extends BaseNode {
  kind: "section";
  children: readonly SchemaNode[];
}

export interface ColumnNode extends BaseNode {
  kind: "column";
  children: readonly SchemaNode[];
}

export interface ListNode extends BaseNode {
  kind: "list";
  item: SchemaNode;
  minItems?: number;
  maxItems?: number;
}

export type SchemaNode =
  | TextNode
  | NumberNode
  | DateNode
  | BooleanNode
  | ImageNode
  | VideoNode
  | SectionNode
  | ColumnNode
  | ListNode;

export const textNode = (node: Omit<TextNode, "kind">): TextNode => ({
  ...node,
  kind: "text"
});

export const numberNode = (node: Omit<NumberNode, "kind">): NumberNode => ({
  ...node,
  kind: "number"
});

export const dateNode = (node: Omit<DateNode, "kind">): DateNode => ({
  ...node,
  kind: "date"
});

export const booleanNode = (node: Omit<BooleanNode, "kind">): BooleanNode => ({
  ...node,
  kind: "boolean"
});

export const imageNode = (node: Omit<ImageNode, "kind">): ImageNode => ({
  ...node,
  kind: "image"
});

export const videoNode = (node: Omit<VideoNode, "kind">): VideoNode => ({
  ...node,
  kind: "video"
});

export const sectionNode = (node: Omit<SectionNode, "kind">): SectionNode => ({
  ...node,
  kind: "section"
});

export const columnNode = (node: Omit<ColumnNode, "kind">): ColumnNode => ({
  ...node,
  kind: "column"
});

export const listNode = (node: Omit<ListNode, "kind">): ListNode => ({
  ...node,
  kind: "list"
});

export const schemaNodeFactory = {
  text: textNode,
  number: numberNode,
  date: dateNode,
  boolean: booleanNode,
  image: imageNode,
  video: videoNode,
  section: sectionNode,
  column: columnNode,
  list: listNode
} as const;

const nodeKinds: Record<SchemaNodeKind, true> = {
  text: true,
  number: true,
  date: true,
  boolean: true,
  image: true,
  video: true,
  section: true,
  column: true,
  list: true
};

const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

class SchemaValidationException extends Error {
  public readonly errors: ValidationError[];

  public constructor(errors: ValidationError[]) {
    super("Schema validation failed");
    this.name = "SchemaValidationException";
    this.errors = errors;
  }
}

export { SchemaValidationException };
const StableIdContract = Schema.String;

const BaseNodeFields = {
  id: StableIdContract,
  label: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String)
};

const TextNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("text"),
  defaultValue: Schema.optional(Schema.String),
  placeholder: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean)
});

const NumberNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("number"),
  defaultValue: Schema.optional(Schema.Number),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  step: Schema.optional(Schema.Number)
});

const DateNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("date"),
  defaultValue: Schema.optional(Schema.String),
  min: Schema.optional(Schema.String),
  max: Schema.optional(Schema.String)
});

const BooleanNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("boolean"),
  defaultValue: Schema.optional(Schema.Boolean)
});

const ImageNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("image"),
  src: Schema.String,
  alt: Schema.optional(Schema.String)
});

const VideoNodeContract = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("video"),
  src: Schema.String,
  poster: Schema.optional(Schema.String)
});

const SchemaNodeContract: Schema.Decoder<SchemaNode> = Schema.suspend(
  (): Schema.Decoder<SchemaNode> =>
  Schema.Union([
    TextNodeContract,
    NumberNodeContract,
    DateNodeContract,
    BooleanNodeContract,
    ImageNodeContract,
    VideoNodeContract,
    SectionNodeContract,
    ColumnNodeContract,
    ListNodeContract
  ])
);

const SectionNodeContract: Schema.Decoder<SectionNode> = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("section"),
  children: Schema.Array(Schema.suspend(() => SchemaNodeContract))
});

const ColumnNodeContract: Schema.Decoder<ColumnNode> = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("column"),
  children: Schema.Array(Schema.suspend(() => SchemaNodeContract))
});

const ListNodeContract: Schema.Decoder<ListNode> = Schema.Struct({
  ...BaseNodeFields,
  kind: Schema.Literal("list"),
  item: Schema.suspend(() => SchemaNodeContract),
  minItems: Schema.optional(Schema.Number),
  maxItems: Schema.optional(Schema.Number)
});

const decodeSchemaNode = Schema.decodeUnknownResult(SchemaNodeContract);
const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizePath = (path: ReadonlyArray<unknown> | undefined): NodePath =>
  (path ?? []).map((segment) =>
    typeof segment === "number" || typeof segment === "string"
      ? segment
      : isRecord(segment) &&
          "key" in segment &&
          (typeof segment.key === "number" || typeof segment.key === "string")
        ? segment.key
        : String(segment)
  );

const getValueAtPath = (input: unknown, path: NodePath): unknown => {
  let current: unknown = input;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const getNodeKindAtPath = (
  input: unknown,
  pathToNode: NodePath
): SchemaNodeKind | undefined => {
  const node = getValueAtPath(input, pathToNode);
  if (!isRecord(node)) {
    return undefined;
  }

  const kind = node.kind;
  if (typeof kind === "string" && kind in nodeKinds) {
    return kind as SchemaNodeKind;
  }
  return undefined;
};

type ExpectedType = "string" | "number" | "boolean";

const getExpectedType = (input: unknown, path: NodePath): ExpectedType | undefined => {
  const lastSegment = path[path.length - 1];
  if (typeof lastSegment !== "string") {
    return undefined;
  }

  switch (lastSegment) {
    case "id":
    case "label":
    case "description":
    case "placeholder":
    case "src":
    case "alt":
    case "poster":
      return "string";
    case "required":
      return "boolean";
    case "step":
    case "minItems":
    case "maxItems":
      return "number";
    case "min":
    case "max": {
      const kind = getNodeKindAtPath(input, path.slice(0, -1));
      if (kind === "date") {
        return "string";
      }
      return "number";
    }
    case "defaultValue": {
      const kind = getNodeKindAtPath(input, path.slice(0, -1));
      if (kind === "text" || kind === "date") {
        return "string";
      }
      if (kind === "number") {
        return "number";
      }
      if (kind === "boolean") {
        return "boolean";
      }
      return undefined;
    }
    default:
      return undefined;
  }
};

const getInvalidTypeMessage = (input: unknown, path: NodePath): string => {
  const lastSegment = path[path.length - 1];
  if (lastSegment === "children") {
    return "children is required and must be an array";
  }
  if (lastSegment === "src") {
    return "src is required";
  }
  if (typeof lastSegment !== "string") {
    return "Invalid node value";
  }

  const expectedType = getExpectedType(input, path);
  if (!expectedType) {
    return `Invalid value for ${lastSegment}`;
  }

  return `${lastSegment} must be a ${expectedType}`;
};

const mapSchemaIssue = (
  input: unknown,
  issue: {
    readonly path?: ReadonlyArray<unknown>;
    readonly message: string;
  }
): ValidationError => {
  const path = normalizePath(issue.path);
  const lastSegment = path[path.length - 1];

  if (issue.message === "Missing key") {
    if (lastSegment === "children") {
      return {
        path,
        code: "required",
        message: "children is required and must be an array"
      };
    }
    if (lastSegment === "item") {
      return { path, code: "required", message: "item is required" };
    }
    if (lastSegment === "src") {
      return { path, code: "required", message: "src is required" };
    }
    return {
      path,
      code: "required",
      message: `${String(lastSegment)} is required`
    };
  }

  if (path.length === 0) {
    return { path, code: "invalid_node", message: "Node must be an object" };
  }
  if (lastSegment === "kind") {
    return { path, code: "invalid_kind", message: "Unsupported node kind" };
  }
  if (lastSegment === "id") {
    return { path, code: "invalid_id", message: "id must be a stable string" };
  }

  return {
    path,
    code: "invalid_type",
    message: getInvalidTypeMessage(input, path)
  };
};

const collectNodeIdErrors = (
  node: SchemaNode,
  path: NodePath,
  seenIds: Map<string, NodePath>,
  errors: ValidationError[]
): void => {
  if (!STABLE_ID_PATTERN.test(node.id)) {
    errors.push({
      path: [...path, "id"],
      code: "invalid_id",
      message: "id must be a stable string"
    });
  } else if (seenIds.has(node.id)) {
    errors.push({
      path: [...path, "id"],
      code: "duplicate_id",
      message: `Duplicate id "${node.id}"`
    });
  } else {
    seenIds.set(node.id, path);
  }

  if (node.kind === "section" || node.kind === "column") {
    node.children.forEach((child, index) => {
      collectNodeIdErrors(child, [...path, "children", index], seenIds, errors);
    });
    return;
  }

  if (node.kind === "list") {
    collectNodeIdErrors(node.item, [...path, "item"], seenIds, errors);
  }
};

const validator: ValidatorContract<SchemaNode> = {
  validate(input: unknown): ValidationResult<SchemaNode> {
    const result = decodeSchemaNode(input, { errors: "all" });
    if (Result.isFailure(result)) {
      const formatted = schemaIssueFormatter(result.failure.issue);
      const errors = formatted.issues.map((issue) => mapSchemaIssue(input, issue));
      return { success: false, errors };
    }

    const value = result.success as SchemaNode;
    const duplicateErrors: ValidationError[] = [];
    collectNodeIdErrors(value, [], new Map<string, NodePath>(), duplicateErrors);
    if (duplicateErrors.length > 0) {
      return { success: false, errors: duplicateErrors };
    }

    return { success: true, value };
  },

  parse(input: unknown): SchemaNode {
    const result = this.validate(input);
    if (!result.success) {
      throw new SchemaValidationException(result.errors);
    }
    return result.value;
  }
};

export const schemaNodeValidator = validator;

export const validateSchemaNode = (input: unknown): ValidationResult<SchemaNode> =>
  schemaNodeValidator.validate(input);

export const parseSchemaNode = (input: unknown): SchemaNode =>
  schemaNodeValidator.parse(input);
