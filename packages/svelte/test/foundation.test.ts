import { describe, expect, it } from "vitest";
import type { SchemaNode, ValidationError } from "@catrolling/ui-schema-core";
import {
  createRenderPlan,
  createRenderRegistry,
  getErrorsForNode,
  getNodeRenderer,
  svelteFoundationReady,
} from "../src/index.js";

describe("svelte foundation", () => {
  it("boots with a baseline export", () => {
    expect(svelteFoundationReady).toBe(true);
  });

  it("uses the registry for all initial node kinds", () => {
    const kinds = [
      "text",
      "number",
      "date",
      "boolean",
      "image",
      "video",
      "section",
      "column",
      "list",
    ] as const;
    const registry = createRenderRegistry();

    kinds.forEach((kind) => {
      expect(getNodeRenderer(registry, kind)).toBeTypeOf("function");
    });
  });

  it("allows a registry renderer to override a node kind", () => {
    const text = {
      id: "name",
      kind: "text",
      label: "Name",
    } as const;
    const registry = createRenderRegistry({
      text: (context) => ({
        id: context.node.id,
        kind: context.node.kind,
        mode: context.mode,
        path: context.path,
        component: "custom-text",
        props: {},
        errors: [...context.errors],
      }),
    });

    expect(createRenderPlan(text, { mode: "field" }, registry).component).toBe(
      "custom-text",
    );
  });

  it("creates mode-dependent output plans", () => {
    const node: SchemaNode = {
      id: "active",
      kind: "boolean",
      defaultValue: false,
    };

    const view = createRenderPlan(node, { mode: "view" });
    const field = createRenderPlan(node, { mode: "field" });

    expect(view.component).toBe("boolean");
    expect(view.props).toEqual({ value: false });
    expect(field.component).toBe("checkbox");
    expect(field.props).toEqual({ checked: false });
  });

  it("builds nested plans and attaches validation errors by id or path", () => {
    const node: SchemaNode = {
      id: "profile",
      kind: "section",
      children: [
        {
          id: "name",
          kind: "text",
          label: "Name",
          required: true,
        },
      ],
    };
    const errors: ValidationError[] = [
      {
        path: ["children", 0, "required"],
        code: "required",
        message: "Name is required",
      },
    ];

    const plan = createRenderPlan(node, { mode: "field", errors });
    expect(plan.children).toHaveLength(1);
    expect(plan.children?.[0].component).toBe("input");
    expect(plan.children?.[0].props.required).toBe(true);

    expect(getErrorsForNode("name", ["children", 0], errors)).toEqual(errors);
  });
});
