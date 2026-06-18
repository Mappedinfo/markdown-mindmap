import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMindmapIndex,
  deleteEmptyNode,
  indentNode,
  induceParentFromSelected,
  insertMindmapBlockAtLine,
  insertSiblingAfter,
  normalizeMindmapBlockMetadata,
  outdentNode,
  parseMindmapBlocks,
  readMindmapState,
  replaceMindmapBlock,
  serializeMindmapBlock,
  serializeOutline,
  stripMindmapStateBlock,
  updateNodeTitle,
  upsertMindmapStateBlock,
  type OutlineNode
} from "../src/outline.ts";

test("parseMindmapBlocks parses explicit fenced mindmap blocks only", () => {
  const markdown = [
    "- ordinary list",
    "",
    '```mindmap id="research" title="博士研究"',
    "- 博士研究",
    "\t- 研究问题",
    "\t- 文献综述",
    "```",
    "",
    "- another ordinary list"
  ].join("\n");

  const blocks = parseMindmapBlocks(markdown, { sourcePath: "note.md" });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].id, "research");
  assert.equal(blocks[0].title, "博士研究");
  assert.equal(blocks[0].startLine, 2);
  assert.equal(blocks[0].nodes[0].children[0].title, "研究问题");
  assert.equal(buildMindmapIndex("- A", "plain.md").length, 0);
});

test("parseMindmapBlocks supports multiple mindmaps in one Markdown file", () => {
  const markdown = [
    '```mindmap id="a" title="A"',
    "- A",
    "```",
    "",
    '```mindmap id="b" title="B"',
    "- B",
    "\t- B1",
    "```"
  ].join("\n");

  const blocks = parseMindmapBlocks(markdown);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].rootTitle, "A");
  assert.equal(blocks[1].nodes[0].children[0].title, "B1");
});

test("parseMindmapBlocks accepts a space between fence and mindmap info string", () => {
  const blocks = parseMindmapBlocks(["``` mindmap", "- map", "```"].join("\n"));

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].nodes[0].title, "map");
});

test("missing mindmap metadata can be normalized without changing content", () => {
  const markdown = ["```mindmap", "- 博士研究", "\t- 问题", "```"].join("\n");
  const next = normalizeMindmapBlockMetadata(markdown, {
    sourcePath: "Untitled 1.md",
    fallbackTitle: "Untitled 1"
  });

  assert.match(next, /^```mindmap id="mindmap-[a-f0-9]{8,10}" title="博士研究"/);
  assert.match(next, /\n- 博士研究\n\t- 问题\n```$/);
  assert.equal(parseMindmapBlocks(next)[0].metadataMissing, false);
});

test("serializeMindmapBlock writes tab-indented list content", () => {
  const block = serializeMindmapBlock({ id: "x", title: "X" }, [
    { id: "a", title: "A", children: [{ id: "a1", title: "A1", children: [] }] }
  ]);

  assert.equal(block, ['```mindmap id="x" title="X"', "- A", "\t- A1", "```"].join("\n"));
});

test("replaceMindmapBlock only replaces the target fenced block", () => {
  const markdown = ["Intro", "", '```mindmap id="a" title="A"', "- A", "```", "", "Outro"].join("\n");
  const block = parseMindmapBlocks(markdown)[0];
  const next = replaceMindmapBlock(markdown, block, [
    { id: "x", title: "X", children: [{ id: "y", title: "Y", children: [] }] }
  ]);

  assert.equal(next, ["Intro", "", '```mindmap id="a" title="A"', "- X", "\t- Y", "```", "", "Outro"].join("\n"));
});

test("insertMindmapBlockAtLine inserts a complete fenced block", () => {
  const next = insertMindmapBlockAtLine("Intro\nOutro", 1, { id: "new", title: "New" });

  assert.equal(next, ["Intro", "", '```mindmap id="new" title="New"', "- New", "```", "", "Outro"].join("\n"));
});

test("parser reports unsupported complex list content without treating ordinary Markdown as mindmap", () => {
  assert.equal(parseMindmapBlocks("1. ordered").length, 0);
  assert.equal(parseMindmapBlocks("```mindmap\n- [ ] task\n```")[0].warning, "Task list items are not supported in mindmap blocks.");
  assert.equal(parseMindmapBlocks("```mindmap\n- A\n\t\t\t- jump\n```")[0].warning, "Indentation jumps more than one level.");
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
  assert.equal(serializeOutline(indented.nodes), "- A\n- B\n\t- \n- C");

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
  assert.equal(serializeOutline(result.nodes), "- New\n\t- Child");
});

test("reverse induction wraps adjacent sibling nodes under a new parent", () => {
  const result = induceParentFromSelected(nodes(), ["b", "c"], "归纳", "wrap");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(serializeOutline(result.nodes), "- A\n- 归纳\n\t- B\n\t- C");
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

test("state block is hidden from parsing and new state marker replaces legacy marker", () => {
  const markdown = upsertMindmapStateBlock("```mindmap\n- A\n```\n", {
    schemaVersion: 1,
    blocks: { abc: { collapsedIds: ["n-0"], scale: 1.2, updatedAt: "2026-06-18T00:00:00.000Z" } }
  });

  assert.match(markdown, /BEGIN MARKDOWN-MINDMAP-STATE/);
  assert.equal(stripMindmapStateBlock(markdown).trim(), "```mindmap\n- A\n```");
  assert.deepEqual(readMindmapState(markdown).blocks.abc.collapsedIds, ["n-0"]);
  assert.equal(parseMindmapBlocks(markdown).length, 1);

  const legacy = [
    "```mindmap",
    "- A",
    "```",
    "<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE",
    JSON.stringify({ schemaVersion: 1, blocks: { legacy: { collapsedIds: ["x"], updatedAt: "now" } } }),
    "END LOCAL-OBSIDIAN-MINDMAP-STATE -->"
  ].join("\n");
  assert.deepEqual(readMindmapState(legacy).blocks.legacy.collapsedIds, ["x"]);
  assert.doesNotMatch(upsertMindmapStateBlock(legacy, readMindmapState(legacy)), /LOCAL-OBSIDIAN-MINDMAP-STATE/);
});

function nodes(): OutlineNode[] {
  return [
    { id: "a", title: "A", children: [] },
    { id: "b", title: "B", children: [] },
    { id: "c", title: "C", children: [] }
  ];
}
