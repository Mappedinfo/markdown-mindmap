export const MARKDOWN_MINDMAP_STATE_BEGIN = "<!-- BEGIN MARKDOWN-MINDMAP-STATE";
export const MARKDOWN_MINDMAP_STATE_END = "END MARKDOWN-MINDMAP-STATE -->";
export const LEGACY_MINDMAP_STATE_BEGIN = "<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE";
export const LEGACY_MINDMAP_STATE_END = "END LOCAL-OBSIDIAN-MINDMAP-STATE -->";

export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
}

export interface MindmapBlock {
  id: string;
  title: string;
  rootTitle: string;
  startLine: number;
  endLine: number;
  contentStartLine: number;
  contentEndLine: number;
  rawContent: string;
  nodes: OutlineNode[];
  contentHash: string;
  metadataMissing: boolean;
  warning?: string;
}

export interface MindmapIndexEntry {
  id: string;
  title: string;
  rootTitle: string;
  filePath: string;
  line: number;
  contentHash: string;
}

export interface MindmapStateData {
  schemaVersion: 1;
  blocks: Record<
    string,
    {
      collapsedIds: string[];
      scale?: number;
      scrollLeft?: number;
      scrollTop?: number;
      updatedAt: string;
    }
  >;
}

export type OutlineOperationResult =
  | { ok: true; nodes: OutlineNode[]; focusId?: string }
  | { ok: false; reason: string };

interface ParseMindmapOptions {
  sourcePath?: string;
  fallbackTitle?: string;
}

interface BlockCandidate {
  startLine: number;
  endLine: number;
  contentStartLine: number;
  contentEndLine: number;
  fence: string;
  attrs: Record<string, string>;
  rawAttrs: string;
  rawContent: string;
}

export function parseMindmapBlocks(markdown: string, options: ParseMindmapOptions = {}): MindmapBlock[] {
  const normalized = normalizeNewlines(stripMindmapStateBlock(markdown));
  const lines = normalized.split("\n");
  const candidates = findMindmapFences(lines);
  return candidates.map((candidate, index) => {
    const parsed = parseOutlineBlockLines(candidate.rawContent.split("\n"));
    const nodes = parsed.ok ? parsed.nodes : [];
    const rootTitle = firstRootTitle(nodes);
    const generatedId = stableMindmapId(options.sourcePath ?? "", index, candidate.rawContent);
    const id = candidate.attrs.id?.trim() || generatedId;
    const title = candidate.attrs.title?.trim() || rootTitle || options.fallbackTitle || "Mindmap";
    return {
      id,
      title,
      rootTitle,
      startLine: candidate.startLine,
      endLine: candidate.endLine,
      contentStartLine: candidate.contentStartLine,
      contentEndLine: candidate.contentEndLine,
      rawContent: candidate.rawContent,
      nodes,
      contentHash: hashString(candidate.rawContent),
      metadataMissing: !candidate.attrs.id || !candidate.attrs.title,
      warning: parsed.ok ? undefined : parsed.reason
    };
  });
}

export function buildMindmapIndex(markdown: string, filePath: string, fallbackTitle?: string): MindmapIndexEntry[] {
  return parseMindmapBlocks(markdown, { sourcePath: filePath, fallbackTitle }).map((block) => ({
    id: block.id,
    title: block.title,
    rootTitle: block.rootTitle,
    filePath,
    line: block.startLine + 1,
    contentHash: block.contentHash
  }));
}

export function normalizeMindmapBlockMetadata(markdown: string, options: ParseMindmapOptions = {}): string {
  const normalized = normalizeNewlines(markdown);
  const blocks = parseMindmapBlocks(normalized, options);
  if (!blocks.some((block) => block.metadataMissing)) return normalized;

  const lines = normalized.split("\n");
  for (const block of blocks) {
    if (!block.metadataMissing) continue;
    lines[block.startLine] = `\`\`\`mindmap id="${escapeAttribute(block.id)}" title="${escapeAttribute(block.title)}"`;
  }
  return restoreFinalNewline(markdown, lines.join("\n"));
}

export function replaceMindmapBlock(markdown: string, block: Pick<MindmapBlock, "startLine" | "endLine" | "id" | "title">, nodes: OutlineNode[], title = block.title): string {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.split("\n");
  const replacement = serializeMindmapBlock({ id: block.id, title }, nodes).split("\n");
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...replacement);
  return restoreFinalNewline(markdown, lines.join("\n"));
}

export function insertMindmapBlockAtLine(markdown: string, line: number, options: { id: string; title: string; nodes?: OutlineNode[] }): string {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const targetLine = Math.max(0, Math.min(line, lines.length));
  const nodes = options.nodes?.length
    ? options.nodes
    : [{ id: "n-0", title: options.title || "Mindmap", children: [] }];
  const block = serializeMindmapBlock({ id: options.id, title: options.title || "Mindmap" }, nodes);
  const prefix = targetLine > 0 && lines[targetLine - 1]?.trim() ? [""] : [];
  const suffix = lines[targetLine]?.trim() ? [""] : [];
  lines.splice(targetLine, 0, ...prefix, ...block.split("\n"), ...suffix);
  return restoreFinalNewline(markdown, lines.join("\n"));
}

export function serializeMindmapBlock(metadata: { id: string; title: string }, nodes: OutlineNode[]): string {
  return [
    `\`\`\`mindmap id="${escapeAttribute(metadata.id)}" title="${escapeAttribute(metadata.title)}"`,
    serializeOutline(nodes),
    "```"
  ].join("\n");
}

export function serializeOutline(nodes: OutlineNode[], indent = "\t"): string {
  const lines: string[] = [];
  const visit = (node: OutlineNode, depth: number) => {
    lines.push(`${indent.repeat(depth)}- ${node.title}`);
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
  return normalizeNewlines(markdown)
    .replace(mindmapStateBlockRegExp(), "")
    .replace(legacyMindmapStateBlockRegExp(), "")
    .replace(/\n{3,}$/g, "\n\n");
}

export function readMindmapState(markdown: string): MindmapStateData {
  const normalized = normalizeNewlines(markdown);
  const match = mindmapStateBlockRegExp().exec(normalized) ?? legacyMindmapStateBlockRegExp().exec(normalized);
  if (!match) return emptyMindmapState();
  try {
    const parsed = JSON.parse(match[1].trim()) as MindmapStateData;
    if (parsed.schemaVersion !== 1 || typeof parsed.blocks !== "object" || parsed.blocks === null) {
      return emptyMindmapState();
    }
    return parsed;
  } catch {
    return emptyMindmapState();
  }
}

export function upsertMindmapStateBlock(markdown: string, state: MindmapStateData): string {
  let normalized = normalizeNewlines(markdown).trimEnd();
  normalized = normalized.replace(legacyMindmapStateBlockRegExp(), "").trimEnd();
  const block = `${MARKDOWN_MINDMAP_STATE_BEGIN}\n${JSON.stringify(state, null, 2)}\n${MARKDOWN_MINDMAP_STATE_END}`;
  if (mindmapStateBlockRegExp().test(normalized)) {
    return `${normalized.replace(mindmapStateBlockRegExp(), block)}\n`;
  }
  return `${normalized}\n\n${block}\n`;
}

export function hashString(value: string): string {
  let hash = 2166136261;
  for (const char of normalizeNewlines(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createMindmapId(seed: string): string {
  return `mindmap-${hashString(`${seed}:${Date.now()}`).slice(0, 10)}`;
}

function findMindmapFences(lines: string[]): BlockCandidate[] {
  const blocks: BlockCandidate[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    const open = lines[line].match(/^(`{3,}|~{3,})\s*mindmap(?:\s+(.*))?\s*$/);
    if (!open) continue;
    const fence = open[1];
    const fenceChar = fence[0];
    const minFenceLength = fence.length;
    let closeLine = -1;
    for (let cursor = line + 1; cursor < lines.length; cursor += 1) {
      if (new RegExp(`^${escapeRegExp(fenceChar)}{${minFenceLength},}\\s*$`).test(lines[cursor])) {
        closeLine = cursor;
        break;
      }
    }
    if (closeLine === -1) continue;
    const rawAttrs = open[2] ?? "";
    const contentLines = lines.slice(line + 1, closeLine);
    blocks.push({
      startLine: line,
      endLine: closeLine,
      contentStartLine: line + 1,
      contentEndLine: closeLine - 1,
      fence,
      attrs: parseAttributes(rawAttrs),
      rawAttrs,
      rawContent: contentLines.join("\n")
    });
    line = closeLine;
  }
  return blocks;
}

function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regexp = /([A-Za-z_][\w-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regexp.exec(rawAttrs)) !== null) {
    attrs[match[1]] = unescapeAttribute(match[2]);
  }
  return attrs;
}

function parseOutlineBlockLines(
  blockLines: string[]
): { ok: true; nodes: OutlineNode[] } | { ok: false; reason: string } {
  const meaningfulLines = blockLines.filter((line) => line.trim().length > 0);
  if (meaningfulLines.length === 0) return { ok: true, nodes: [] };

  const roots: OutlineNode[] = [];
  const stack: Array<{ node: OutlineNode; depth: number }> = [];
  let previousDepth = 0;

  for (let lineIndex = 0; lineIndex < meaningfulLines.length; lineIndex += 1) {
    const parsed = parsePlainListItem(meaningfulLines[lineIndex]);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (lineIndex === 0 && parsed.depth !== 0) return { ok: false, reason: "The mindmap list must start at depth 0." };
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

function parsePlainListItem(line: string):
  | { ok: true; depth: number; title: string }
  | { ok: false; reason: string } {
  if (/^\s*\d+\.\s+/.test(line)) return { ok: false, reason: "Ordered lists are not supported." };
  const match = line.match(/^([ \t]*)-\s?(.*)$/);
  if (!match) return { ok: false, reason: "Only plain unordered list items are supported in mindmap blocks." };
  const indent = match[1];
  if (indent.includes("\t") && indent.includes(" ")) return { ok: false, reason: "Do not mix tabs and spaces for mindmap indentation." };
  let depth = 0;
  if (indent.includes("\t")) {
    depth = indent.length;
  } else {
    if (indent.length % 2 !== 0) return { ok: false, reason: "Legacy space indentation must use multiples of two spaces." };
    depth = indent.length / 2;
  }
  const title = match[2] ?? "";
  if (/^\[[ xX]\]\s+/.test(title)) return { ok: false, reason: "Task list items are not supported in mindmap blocks." };
  return { ok: true, depth, title };
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

function emptyMindmapState(): MindmapStateData {
  return { schemaVersion: 1, blocks: {} };
}

function stableMindmapId(sourcePath: string, index: number, content: string): string {
  return `mindmap-${hashString(`${sourcePath}:${index}:${content}`).slice(0, 10)}`;
}

function firstRootTitle(nodes: OutlineNode[]): string {
  return nodes[0]?.title?.trim() ?? "";
}

let generatedIdCounter = 0;
function createGeneratedNodeId(): string {
  generatedIdCounter += 1;
  return `node-${Date.now().toString(36)}-${generatedIdCounter}`;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreFinalNewline(original: string, next: string): string {
  return normalizeNewlines(original).endsWith("\n") && !next.endsWith("\n") ? `${next}\n` : next;
}

function mindmapStateBlockRegExp(): RegExp {
  return new RegExp(`${escapeRegExp(MARKDOWN_MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(MARKDOWN_MINDMAP_STATE_END)}`, "m");
}

function legacyMindmapStateBlockRegExp(): RegExp {
  return new RegExp(`${escapeRegExp(LEGACY_MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(LEGACY_MINDMAP_STATE_END)}`, "m");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function unescapeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
