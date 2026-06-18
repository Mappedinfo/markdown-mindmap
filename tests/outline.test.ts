import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteEmptyNode,
  indentNode,
  induceParentFromSelected,
  insertSiblingAfter,
  outdentNode,
  parseOutlineAtLine,
  readMindmapState,
  replaceOutlineBlock,
  serializeOutline,
  stripMindmapStateBlock,
  updateNodeTitle,
  upsertMindmapStateBlock,
  type OutlineNode
} from "../src/outline.ts";

test("parseOutlineAtLine parses the current unordered list block", () => {
  const markdown = ["Intro", "", "- A", "  - A1", "- B", "", "Outro"].join("\n");
  const parsed = parseOutlineAtLine(markdown, 3);

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.block.startLine, 2);
  assert.equal(parsed.block.endLine, 4);
  assert.equal(parsed.block.nodes[0].title, "A");
  assert.equal(parsed.block.nodes[0].children[0].title, "A1");
  assert.equal(parsed.block.nodes[1].title, "B");
});

test("replaceOutlineBlock only replaces the parsed list block", () => {
  const markdown = ["Intro", "", "- A", "- B", "", "Outro"].join("\n");
  const parsed = parseOutlineAtLine(markdown, 2);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const next = replaceOutlineBlock(markdown, parsed.block, [
    { id: "x", title: "X", children: [{ id: "y", title: "Y", children: [] }] }
  ]);

  assert.equal(next, ["Intro", "", "- X", "  - Y", "", "Outro"].join("\n"));
});

test("parser rejects complex list items rather than risking destructive writes", () => {
  assert.equal(parseOutlineAtLine("- [ ] task", 0).ok, false);
  assert.equal(parseOutlineAtLine("- A\n  continuation", 0).ok, false);
  assert.equal(parseOutlineAtLine("- A\n      - jump", 0).ok, false);
  assert.equal(parseOutlineAtLine("1. ordered", 0).ok, false);
});

test("keyboard operations support Enter Tab Shift-Tab and empty delete", () => {
  const tree = nodes();
  const inserted = insertSiblingAfter(tree, "b", "", "new");
  assert.equal(inserted.ok, true);
  if (!inserted.ok) return;
  assert.equal(serializeOutline(inserted.nodes), "- A\n- B\n- \n- C");

  const indented = indentNode(inserted.nodes, "new");
  assert.equal(indented.ok, true);
  if (!indented.ok) return;
  assert.equal(serializeOutline(indented.nodes), "- A\n- B\n  - \n- C");

  const outdented = outdentNode(indented.nodes, "new");
  assert.equal(outdented.ok, true);
  if (!outdented.ok) return;
  assert.equal(serializeOutline(outdented.nodes), "- A\n- B\n- \n- C");

  const deleted = deleteEmptyNode(outdented.nodes, "new");
  assert.equal(deleted.ok, true);
  if (!deleted.ok) return;
  assert.equal(serializeOutline(deleted.nodes), "- A\n- B\n- C");
});

test("updateNodeTitle preserves children", () => {
  const result = updateNodeTitle([{ id: "a", title: "Old", children: [{ id: "a1", title: "Child", children: [] }] }], "a", "New");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(serializeOutline(result.nodes), "- New\n  - Child");
});

test("reverse induction wraps adjacent sibling nodes under a new parent", () => {
  const result = induceParentFromSelected(nodes(), ["b", "c"], "归纳", "wrap");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(serializeOutline(result.nodes), "- A\n- 归纳\n  - B\n  - C");
});

test("reverse induction rejects non-adjacent or cross-level selections", () => {
  assert.equal(induceParentFromSelected(nodes(), ["a", "c"], "归纳").ok, false);
  assert.equal(
    induceParentFromSelected(
      [{ id: "a", title: "A", children: [{ id: "a1", title: "A1", children: [] }] }, { id: "b", title: "B", children: [] }],
      ["a1", "b"],
      "归纳"
    ).ok,
    false
  );
});

test("state block is hidden from parsing and can be upserted", () => {
  const markdown = upsertMindmapStateBlock("- A\n", {
    schemaVersion: 1,
    blocks: { abc: { collapsedIds: ["n-0"], updatedAt: "2026-06-18T00:00:00.000Z" } }
  });

  assert.match(markdown, /BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE/);
  assert.equal(stripMindmapStateBlock(markdown).trim(), "- A");
  assert.deepEqual(readMindmapState(markdown).blocks.abc.collapsedIds, ["n-0"]);
  assert.equal(parseOutlineAtLine(markdown, 0).ok, true);
});

function nodes(): OutlineNode[] {
  return [
    { id: "a", title: "A", children: [] },
    { id: "b", title: "B", children: [] },
    { id: "c", title: "C", children: [] }
  ];
}
