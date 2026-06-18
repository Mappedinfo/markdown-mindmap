export const MINDMAP_STATE_BEGIN = "<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE";
export const MINDMAP_STATE_END = "END LOCAL-OBSIDIAN-MINDMAP-STATE -->";

export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
}

export interface OutlineBlock {
  startLine: number;
  endLine: number;
  markdown: string;
  nodes: OutlineNode[];
  blockHash: string;
}

export type OutlineParseResult =
  | { ok: true; block: OutlineBlock; warnings: string[] }
  | { ok: false; reason: string; startLine?: number; endLine?: number };

export interface MindmapSettingsData {
  schemaVersion: 1;
  blocks: Record<string, { collapsedIds: string[]; updatedAt: string }>;
}

export type OutlineOperationResult =
  | { ok: true; nodes: OutlineNode[]; focusId?: string }
  | { ok: false; reason: string };

export function parseOutlineAtLine(
  markdown: string,
  cursorLine: number,
  options: { indentUnit?: number } = {}
): OutlineParseResult {
  const indentUnit = options.indentUnit ?? 2;
  const normalized = normalizeNewlines(stripMindmapStateBlock(markdown));
  const lines = normalized.split("\n");
  if (cursorLine < 0 || cursorLine >= lines.length) {
    return { ok: false, reason: "Cursor is outside the document." };
  }

  const current = parsePlainListItem(lines[cursorLine], indentUnit);
  if (!current.ok) {
    return { ok: false, reason: "Put the cursor on a plain unordered list item (`- item`) first." };
  }

  const startLine = findListBlockStart(lines, cursorLine);
  const endLine = findListBlockEnd(lines, cursorLine);
  const blockLines = lines.slice(startLine, endLine + 1);
  const parsed = parseOutlineBlockLines(blockLines, indentUnit);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, startLine, endLine };
  }

  const markdownBlock = blockLines.join("\n");
  return {
    ok: true,
    block: {
      startLine,
      endLine,
      markdown: markdownBlock,
      nodes: parsed.nodes,
      blockHash: hashOutlineBlock(markdownBlock)
    },
    warnings: []
  };
}

export function replaceOutlineBlock(
  markdown: string,
  block: Pick<OutlineBlock, "startLine" | "endLine">,
  nodes: OutlineNode[],
  options: { indentUnit?: number } = {}
): string {
  const indentUnit = options.indentUnit ?? 2;
  const normalized = normalizeNewlines(markdown);
  const hadFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  const replacement = serializeOutline(nodes, indentUnit).split("\n");
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...replacement);
  const next = lines.join("\n");
  return hadFinalNewline && !next.endsWith("\n") ? `${next}\n` : next;
}

export function serializeOutline(nodes: OutlineNode[], indentUnit = 2): string {
  const lines: string[] = [];
  const visit = (node: OutlineNode, depth: number) => {
    lines.push(`${" ".repeat(depth * indentUnit)}- ${node.title}`);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const node of nodes) visit(node, 0);
  return lines.join("\n");
}

export function updateNodeTitle(nodes: OutlineNode[], nodeId: string, title: string): OutlineOperationResult {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  location.node.title = title;
  return { ok: true, nodes: next, focusId: nodeId };
}

export function insertSiblingAfter(
  nodes: OutlineNode[],
  nodeId: string,
  title = "",
  newId = createGeneratedNodeId()
): OutlineOperationResult {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  location.siblings.splice(location.index + 1, 0, { id: newId, title, children: [] });
  return { ok: true, nodes: next, focusId: newId };
}

export function indentNode(nodes: OutlineNode[], nodeId: string): OutlineOperationResult {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  if (location.index === 0) return { ok: false, reason: "Cannot indent: there is no previous sibling." };
  const [node] = location.siblings.splice(location.index, 1);
  location.siblings[location.index - 1].children.push(node);
  return { ok: true, nodes: next, focusId: nodeId };
}

export function outdentNode(nodes: OutlineNode[], nodeId: string): OutlineOperationResult {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  if (!location.parentId) return { ok: false, reason: "Cannot outdent a top-level node." };
  const parentLocation = findLocation(next, location.parentId);
  if (!parentLocation) return { ok: false, reason: "Parent node not found." };
  const freshLocation = findLocation(next, nodeId);
  if (!freshLocation) return { ok: false, reason: "Node not found." };
  const [node] = freshLocation.siblings.splice(freshLocation.index, 1);
  parentLocation.siblings.splice(parentLocation.index + 1, 0, node);
  return { ok: true, nodes: next, focusId: nodeId };
}

export function deleteEmptyNode(nodes: OutlineNode[], nodeId: string): OutlineOperationResult {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  if (location.node.title.trim() || location.node.children.length > 0) {
    return { ok: false, reason: "Only empty leaf nodes can be deleted with Backspace/Delete." };
  }
  location.siblings.splice(location.index, 1);
  const focusId = location.siblings[Math.max(0, location.index - 1)]?.id ?? location.siblings[0]?.id;
  return { ok: true, nodes: next, focusId };
}

export function induceParentFromSelected(
  nodes: OutlineNode[],
  selectedIds: string[],
  title = "归纳",
  newId = createGeneratedNodeId()
): OutlineOperationResult {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length < 2) return { ok: false, reason: "Select at least two sibling nodes." };

  const next = cloneNodes(nodes);
  const locations = uniqueIds.map((id) => findLocation(next, id));
  if (locations.some((location) => !location)) return { ok: false, reason: "Some selected nodes no longer exist." };
  const concrete = locations as NonNullable<ReturnType<typeof findLocation>>[];
  const parentKey = concrete[0].parentId ?? "__root__";
  if (concrete.some((location) => (location.parentId ?? "__root__") !== parentKey)) {
    return { ok: false, reason: "Reverse induction only supports nodes with the same parent." };
  }

  const siblings = concrete[0].siblings;
  if (concrete.some((location) => location.siblings !== siblings)) {
    return { ok: false, reason: "Reverse induction only supports nodes with the same parent." };
  }

  const sorted = concrete.slice().sort((a, b) => a.index - b.index);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].index !== sorted[index - 1].index + 1) {
      return { ok: false, reason: "Reverse induction only supports adjacent sibling nodes." };
    }
  }

  const firstIndex = sorted[0].index;
  const selectedNodes = siblings.splice(firstIndex, sorted.length);
  siblings.splice(firstIndex, 0, { id: newId, title, children: selectedNodes });
  return { ok: true, nodes: next, focusId: newId };
}

export function stripMindmapStateBlock(markdown: string): string {
  return normalizeNewlines(markdown).replace(mindmapStateBlockRegExp(), "").replace(/\n{3,}$/g, "\n\n");
}

export function readMindmapState(markdown: string): MindmapSettingsData {
  const match = mindmapStateBlockRegExp().exec(normalizeNewlines(markdown));
  if (!match) return emptyMindmapState();
  try {
    const parsed = JSON.parse(match[1].trim()) as MindmapSettingsData;
    if (parsed.schemaVersion !== 1 || typeof parsed.blocks !== "object" || parsed.blocks === null) {
      return emptyMindmapState();
    }
    return parsed;
  } catch {
    return emptyMindmapState();
  }
}

export function upsertMindmapStateBlock(markdown: string, state: MindmapSettingsData): string {
  const normalized = normalizeNewlines(markdown).trimEnd();
  const block = `${MINDMAP_STATE_BEGIN}\n${JSON.stringify(state, null, 2)}\n${MINDMAP_STATE_END}`;
  if (mindmapStateBlockRegExp().test(normalized)) {
    return `${normalized.replace(mindmapStateBlockRegExp(), block)}\n`;
  }
  return `${normalized}\n\n${block}\n`;
}

export function hashOutlineBlock(markdown: string): string {
  let hash = 2166136261;
  for (const char of normalizeNewlines(markdown)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseOutlineBlockLines(
  blockLines: string[],
  indentUnit: number
): { ok: true; nodes: OutlineNode[] } | { ok: false; reason: string } {
  const roots: OutlineNode[] = [];
  const stack: Array<{ node: OutlineNode; depth: number }> = [];
  let previousDepth = 0;

  for (let lineIndex = 0; lineIndex < blockLines.length; lineIndex += 1) {
    const parsed = parsePlainListItem(blockLines[lineIndex], indentUnit);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (lineIndex === 0 && parsed.depth !== 0) return { ok: false, reason: "The outline block must start at depth 0." };
    if (parsed.depth > previousDepth + 1) return { ok: false, reason: "Indentation jumps more than one level." };
    const parent = parsed.depth === 0 ? null : stack[parsed.depth - 1]?.node;
    if (parsed.depth > 0 && !parent) return { ok: false, reason: "Missing parent list item." };
    const siblings = parent ? parent.children : roots;
    const node: OutlineNode = {
      id: `n-${[...stack.slice(0, parsed.depth).map((entry) => entry.node.id), siblings.length].join("-")}`,
      title: parsed.title,
      children: []
    };
    siblings.push(node);
    stack[parsed.depth] = { node, depth: parsed.depth };
    stack.length = parsed.depth + 1;
    previousDepth = parsed.depth;
  }

  return { ok: true, nodes: roots };
}

function parsePlainListItem(
  line: string,
  indentUnit: number
):
  | { ok: true; depth: number; title: string }
  | { ok: false; reason: string } {
  if (/^\s*\d+\.\s+/.test(line)) return { ok: false, reason: "Ordered lists are not supported in v1." };
  const match = line.match(/^(\s*)-\s?(.*)$/);
  if (!match) return { ok: false, reason: "Only plain unordered list items are supported." };
  const indent = match[1];
  if (indent.includes("\t")) return { ok: false, reason: "Tab indentation is not supported; use spaces." };
  if (indent.length % indentUnit !== 0) return { ok: false, reason: `Indentation must use ${indentUnit} spaces.` };
  const title = match[2] ?? "";
  if (/^\[[ xX]\]\s+/.test(title)) return { ok: false, reason: "Task list items are not supported in v1." };
  return { ok: true, depth: indent.length / indentUnit, title };
}

function findListBlockStart(lines: string[], cursorLine: number): number {
  let line = cursorLine;
  while (line > 0) {
    const previous = lines[line - 1];
    if (!previous.trim()) break;
    if (/^\s*-\s?/.test(previous) || /^\s+\S/.test(previous)) {
      line -= 1;
      continue;
    }
    break;
  }
  return line;
}

function findListBlockEnd(lines: string[], cursorLine: number): number {
  let line = cursorLine;
  while (line + 1 < lines.length) {
    const next = lines[line + 1];
    if (!next.trim()) break;
    if (/^\s*-\s?/.test(next) || /^\s+\S/.test(next)) {
      line += 1;
      continue;
    }
    break;
  }
  return line;
}

function findLocation(
  nodes: OutlineNode[],
  nodeId: string,
  parentId: string | null = null
): { node: OutlineNode; siblings: OutlineNode[]; index: number; parentId: string | null } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === nodeId) return { node, siblings: nodes, index, parentId };
    const child = findLocation(node.children, nodeId, node.id);
    if (child) return child;
  }
  return null;
}

function cloneNodes(nodes: OutlineNode[]): OutlineNode[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    children: cloneNodes(node.children)
  }));
}

function emptyMindmapState(): MindmapSettingsData {
  return { schemaVersion: 1, blocks: {} };
}

function mindmapStateBlockRegExp(): RegExp {
  return new RegExp(`${escapeRegExp(MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(MINDMAP_STATE_END)}`, "m");
}

let generatedIdCounter = 0;
function createGeneratedNodeId(): string {
  generatedIdCounter += 1;
  return `node-${Date.now().toString(36)}-${generatedIdCounter}`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
