import { describe, expect, it } from "vitest";
import {
  booleanNode,
  dateNode,
  imageNode,
  listNode,
  numberNode,
  coreFoundationReady,
  parseSchemaNode,
  sectionNode,
  textNode,
  validateSchemaNode,
  videoNode,
} from "../src/index.js";

describe("core foundation", () => {
  it("boots with a baseline export", () => {
    expect(coreFoundationReady).toBe(true);
  });

  it("parses a valid section tree with supported node kinds", () => {
    const schema = {
      id: "profile-section",
      kind: "section",
      label: "Profile",
      children: [
        { id: "full-name", kind: "text", required: true },
        { id: "age", kind: "number", min: 0 },
        { id: "birthday", kind: "date" },
        { id: "is-active", kind: "boolean", defaultValue: true },
        { id: "avatar", kind: "image", src: "/avatar.png", alt: "Avatar" },
        { id: "intro-video", kind: "video", src: "/intro.mp4" },
        {
          id: "two-col",
          kind: "column",
          children: [{ id: "nickname", kind: "text" }],
        },
        {
          id: "tags",
          kind: "list",
          item: { id: "tag-value", kind: "text" },
          minItems: 0,
        },
      ],
    } as const;

    const parsed = parseSchemaNode(schema);
    expect(parsed.kind).toBe("section");
  });

  it("returns structured validation errors with an addressable path", () => {
    const result = validateSchemaNode({
      id: "bad-node",
      kind: "text",
      defaultValue: 42,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.errors).toContainEqual({
      path: ["defaultValue"],
      code: "invalid_type",
      message: "defaultValue must be a string",
    });

    expect(
      result.errors.every((error) =>
        error.path.every(
          (segment) =>
            typeof segment === "string" || typeof segment === "number",
        ),
      ),
    ).toBe(true);
  });

  it("detects duplicate stable ids in nested nodes", () => {
    const result = validateSchemaNode({
      id: "root",
      kind: "section",
      children: [
        { id: "dup", kind: "text" },
        { id: "dup", kind: "number" },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.errors).toContainEqual({
      path: ["children", 1, "id"],
      code: "duplicate_id",
      message: 'Duplicate id "dup"',
    });
  });

  it("enforces stable id format", () => {
    const result = validateSchemaNode({
      id: "bad id",
      kind: "text",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    expect(result.errors).toContainEqual({
      path: ["id"],
      code: "invalid_id",
      message: "id must be a stable string",
    });
  });

  it("maps required-field errors with stable codes/messages", () => {
    const sectionMissingChildren = validateSchemaNode({
      id: "root",
      kind: "section",
    });
    const listMissingItem = validateSchemaNode({
      id: "list",
      kind: "list",
    });
    const imageMissingSrc = validateSchemaNode({
      id: "image",
      kind: "image",
    });

    expect(sectionMissingChildren.success).toBe(false);
    expect(listMissingItem.success).toBe(false);
    expect(imageMissingSrc.success).toBe(false);

    if (sectionMissingChildren.success || listMissingItem.success || imageMissingSrc.success) {
      throw new Error("Expected required-field validations to fail");
    }

    expect(sectionMissingChildren.errors).toContainEqual({
      path: ["children"],
      code: "required",
      message: "children is required and must be an array",
    });
    expect(listMissingItem.errors).toContainEqual({
      path: ["item"],
      code: "required",
      message: "item is required",
    });
    expect(imageMissingSrc.errors).toContainEqual({
      path: ["src"],
      code: "required",
      message: "src is required",
    });
  });

  it("provides schema authoring helper factories", () => {
    const schema = sectionNode({
      id: "factory-root",
      label: "Factory root",
      children: [
        textNode({ id: "factory-text", label: "Text", defaultValue: "value" }),
        numberNode({ id: "factory-number", label: "Number", defaultValue: 1 }),
        dateNode({ id: "factory-date", label: "Date" }),
        booleanNode({ id: "factory-boolean", label: "Boolean", defaultValue: true }),
        imageNode({ id: "factory-image", label: "Image", src: "/img.png" }),
        videoNode({ id: "factory-video", label: "Video", src: "/vid.mp4" }),
        listNode({
          id: "factory-list",
          label: "List",
          item: textNode({ id: "factory-item", label: "Item" }),
          minItems: 1,
        }),
      ],
    });

    const parsed = parseSchemaNode(schema);
    expect(parsed.kind).toBe("section");
    if (parsed.kind !== "section") {
      throw new Error("Expected parsed schema to be a section");
    }
    expect(parsed.children).toHaveLength(7);
  });
});
