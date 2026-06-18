/* Markdown Mindmap */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MarkdownMindmapPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/outline.ts
var MARKDOWN_MINDMAP_STATE_BEGIN = "<!-- BEGIN MARKDOWN-MINDMAP-STATE";
var MARKDOWN_MINDMAP_STATE_END = "END MARKDOWN-MINDMAP-STATE -->";
var LEGACY_MINDMAP_STATE_BEGIN = "<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE";
var LEGACY_MINDMAP_STATE_END = "END LOCAL-OBSIDIAN-MINDMAP-STATE -->";
function parseMindmapBlocks(markdown, options = {}) {
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
      warning: parsed.ok ? void 0 : parsed.reason
    };
  });
}
function buildMindmapIndex(markdown, filePath, fallbackTitle) {
  return parseMindmapBlocks(markdown, { sourcePath: filePath, fallbackTitle }).map((block) => ({
    id: block.id,
    title: block.title,
    rootTitle: block.rootTitle,
    filePath,
    line: block.startLine + 1,
    contentHash: block.contentHash
  }));
}
function normalizeMindmapBlockMetadata(markdown, options = {}) {
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
function replaceMindmapBlock(markdown, block, nodes, title = block.title) {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.split("\n");
  const replacement = serializeMindmapBlock({ id: block.id, title }, nodes).split("\n");
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...replacement);
  return restoreFinalNewline(markdown, lines.join("\n"));
}
function insertMindmapBlockAtLine(markdown, line, options) {
  const normalized = normalizeNewlines(markdown);
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const targetLine = Math.max(0, Math.min(line, lines.length));
  const nodes = options.nodes?.length ? options.nodes : [{ id: "n-0", title: options.title || "Mindmap", children: [] }];
  const block = serializeMindmapBlock({ id: options.id, title: options.title || "Mindmap" }, nodes);
  const prefix = targetLine > 0 && lines[targetLine - 1]?.trim() ? [""] : [];
  const suffix = lines[targetLine]?.trim() ? [""] : [];
  lines.splice(targetLine, 0, ...prefix, ...block.split("\n"), ...suffix);
  return restoreFinalNewline(markdown, lines.join("\n"));
}
function serializeMindmapBlock(metadata, nodes) {
  return [
    `\`\`\`mindmap id="${escapeAttribute(metadata.id)}" title="${escapeAttribute(metadata.title)}"`,
    serializeOutline(nodes),
    "```"
  ].join("\n");
}
function serializeOutline(nodes, indent = "	") {
  const lines = [];
  const visit = (node, depth) => {
    lines.push(`${indent.repeat(depth)}- ${node.title}`);
    for (const child of node.children) visit(child, depth + 1);
  };
  for (const node of nodes) visit(node, 0);
  return lines.join("\n");
}
function updateNodeTitle(nodes, nodeId, title) {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  location.node.title = title;
  return { ok: true, nodes: next, focusId: nodeId };
}
function insertSiblingAfter(nodes, nodeId, title = "", newId = createGeneratedNodeId()) {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  location.siblings.splice(location.index + 1, 0, { id: newId, title, children: [] });
  return { ok: true, nodes: next, focusId: newId };
}
function indentNode(nodes, nodeId) {
  const next = cloneNodes(nodes);
  const location = findLocation(next, nodeId);
  if (!location) return { ok: false, reason: "Node not found." };
  if (location.index === 0) return { ok: false, reason: "Cannot indent: there is no previous sibling." };
  const [node] = location.siblings.splice(location.index, 1);
  location.siblings[location.index - 1].children.push(node);
  return { ok: true, nodes: next, focusId: nodeId };
}
function outdentNode(nodes, nodeId) {
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
function deleteEmptyNode(nodes, nodeId) {
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
function induceParentFromSelected(nodes, selectedIds, title = "\u5F52\u7EB3", newId = createGeneratedNodeId()) {
  const uniqueIds = [...new Set(selectedIds)];
  if (uniqueIds.length < 2) return { ok: false, reason: "Select at least two sibling nodes." };
  const next = cloneNodes(nodes);
  const locations = uniqueIds.map((id) => findLocation(next, id));
  if (locations.some((location) => !location)) return { ok: false, reason: "Some selected nodes no longer exist." };
  const concrete = locations;
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
function stripMindmapStateBlock(markdown) {
  return normalizeNewlines(markdown).replace(mindmapStateBlockRegExp(), "").replace(legacyMindmapStateBlockRegExp(), "").replace(/\n{3,}$/g, "\n\n");
}
function readMindmapState(markdown) {
  const normalized = normalizeNewlines(markdown);
  const match = mindmapStateBlockRegExp().exec(normalized) ?? legacyMindmapStateBlockRegExp().exec(normalized);
  if (!match) return emptyMindmapState();
  try {
    const parsed = JSON.parse(match[1].trim());
    if (parsed.schemaVersion !== 1 || typeof parsed.blocks !== "object" || parsed.blocks === null) {
      return emptyMindmapState();
    }
    return parsed;
  } catch {
    return emptyMindmapState();
  }
}
function upsertMindmapStateBlock(markdown, state) {
  let normalized = normalizeNewlines(markdown).trimEnd();
  normalized = normalized.replace(legacyMindmapStateBlockRegExp(), "").trimEnd();
  const block = `${MARKDOWN_MINDMAP_STATE_BEGIN}
${JSON.stringify(state, null, 2)}
${MARKDOWN_MINDMAP_STATE_END}`;
  if (mindmapStateBlockRegExp().test(normalized)) {
    return `${normalized.replace(mindmapStateBlockRegExp(), block)}
`;
  }
  return `${normalized}

${block}
`;
}
function hashString(value) {
  let hash = 2166136261;
  for (const char of normalizeNewlines(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function createMindmapId(seed) {
  return `mindmap-${hashString(`${seed}:${Date.now()}`).slice(0, 10)}`;
}
function findMindmapFences(lines) {
  const blocks = [];
  for (let line = 0; line < lines.length; line += 1) {
    const open = lines[line].match(/^(`{3,}|~{3,})mindmap(?:\s+(.*))?\s*$/);
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
function parseAttributes(rawAttrs) {
  const attrs = {};
  const regexp = /([A-Za-z_][\w-]*)="([^"]*)"/g;
  let match;
  while ((match = regexp.exec(rawAttrs)) !== null) {
    attrs[match[1]] = unescapeAttribute(match[2]);
  }
  return attrs;
}
function parseOutlineBlockLines(blockLines) {
  const meaningfulLines = blockLines.filter((line) => line.trim().length > 0);
  if (meaningfulLines.length === 0) return { ok: true, nodes: [] };
  const roots = [];
  const stack = [];
  let previousDepth = 0;
  for (let lineIndex = 0; lineIndex < meaningfulLines.length; lineIndex += 1) {
    const parsed = parsePlainListItem(meaningfulLines[lineIndex]);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (lineIndex === 0 && parsed.depth !== 0) return { ok: false, reason: "The mindmap list must start at depth 0." };
    if (parsed.depth > previousDepth + 1) return { ok: false, reason: "Indentation jumps more than one level." };
    const parent = parsed.depth === 0 ? null : stack[parsed.depth - 1]?.node;
    if (parsed.depth > 0 && !parent) return { ok: false, reason: "Missing parent list item." };
    const siblings = parent ? parent.children : roots;
    const node = {
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
function parsePlainListItem(line) {
  if (/^\s*\d+\.\s+/.test(line)) return { ok: false, reason: "Ordered lists are not supported." };
  const match = line.match(/^([ \t]*)-\s?(.*)$/);
  if (!match) return { ok: false, reason: "Only plain unordered list items are supported in mindmap blocks." };
  const indent = match[1];
  if (indent.includes("	") && indent.includes(" ")) return { ok: false, reason: "Do not mix tabs and spaces for mindmap indentation." };
  let depth = 0;
  if (indent.includes("	")) {
    depth = indent.length;
  } else {
    if (indent.length % 2 !== 0) return { ok: false, reason: "Legacy space indentation must use multiples of two spaces." };
    depth = indent.length / 2;
  }
  const title = match[2] ?? "";
  if (/^\[[ xX]\]\s+/.test(title)) return { ok: false, reason: "Task list items are not supported in mindmap blocks." };
  return { ok: true, depth, title };
}
function findLocation(nodes, nodeId, parentId = null) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === nodeId) return { node, siblings: nodes, index, parentId };
    const child = findLocation(node.children, nodeId, node.id);
    if (child) return child;
  }
  return null;
}
function cloneNodes(nodes) {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    children: cloneNodes(node.children)
  }));
}
function emptyMindmapState() {
  return { schemaVersion: 1, blocks: {} };
}
function stableMindmapId(sourcePath, index, content) {
  return `mindmap-${hashString(`${sourcePath}:${index}:${content}`).slice(0, 10)}`;
}
function firstRootTitle(nodes) {
  return nodes[0]?.title?.trim() ?? "";
}
var generatedIdCounter = 0;
function createGeneratedNodeId() {
  generatedIdCounter += 1;
  return `node-${Date.now().toString(36)}-${generatedIdCounter}`;
}
function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function restoreFinalNewline(original, next) {
  return normalizeNewlines(original).endsWith("\n") && !next.endsWith("\n") ? `${next}
` : next;
}
function mindmapStateBlockRegExp() {
  return new RegExp(`${escapeRegExp(MARKDOWN_MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(MARKDOWN_MINDMAP_STATE_END)}`, "m");
}
function legacyMindmapStateBlockRegExp() {
  return new RegExp(`${escapeRegExp(LEGACY_MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(LEGACY_MINDMAP_STATE_END)}`, "m");
}
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function unescapeAttribute(value) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/main.ts
var VIEW_TYPE_MINDMAP = "markdown-mindmap-workbench";
var DEFAULT_SETTINGS = {
  openInRightSidebar: true,
  persistCollapseState: true,
  followActiveFile: true,
  scanVaultOnOpen: true
};
var MarkdownMindmapPlugin = class extends import_obsidian.Plugin {
  settings = DEFAULT_SETTINGS;
  fileCache = /* @__PURE__ */ new Map();
  mindmapIndex = /* @__PURE__ */ new Map();
  suppressModifyPaths = /* @__PURE__ */ new Set();
  vaultScanTimer = null;
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MarkdownMindmapSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapWorkbenchView(leaf, this));
    this.addRibbonIcon("git-fork", "Open Markdown Mindmap", () => {
      void this.openMindmapPanel();
    });
    this.addCommand({
      id: "open-markdown-mindmap",
      name: "Open Markdown Mindmap",
      callback: () => this.openMindmapPanel()
    });
    this.addCommand({
      id: "open-current-outline-mindmap",
      name: "Open Mindmap for Current Outline",
      callback: () => this.openMindmapPanel()
    });
    this.addCommand({
      id: "create-mindmap-in-current-file",
      name: "Create mindmap in current file",
      callback: () => this.createMindmapInCurrentFile()
    });
    this.addCommand({
      id: "induce-parent-from-selected-nodes",
      name: "Induce Parent from Selected Nodes",
      callback: () => this.withMindmapView((view) => view.promptInduceParent())
    });
    this.addCommand({
      id: "focus-mindmap-node",
      name: "Focus Mindmap Node",
      callback: () => this.withMindmapView((view) => view.focusSelectedNode())
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (!this.settings.followActiveFile) return;
        this.refreshOpenMindmapViews();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        if (!this.settings.followActiveFile) return;
        this.refreshOpenMindmapViews({ preserveSelection: true, fromEditorChange: true });
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") return;
        void this.handleMarkdownFileModified(file);
      })
    );
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.scanVaultOnOpen) void this.refreshVaultIndex();
    });
  }
  onunload() {
    if (this.vaultScanTimer !== null) window.clearTimeout(this.vaultScanTimer);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }
  async loadSettings() {
    const raw = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...raw ?? {},
      followActiveFile: raw?.followActiveFile ?? raw?.followActiveOutline ?? DEFAULT_SETTINGS.followActiveFile
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async openMindmapPanel() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!leaf) {
      leaf = this.settings.openInRightSidebar ? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true) : this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MindmapWorkbenchView) {
      await leaf.view.loadCurrentFile();
    }
  }
  async createMindmapInCurrentFile() {
    const view = this.getActiveMarkdownView();
    if (!view?.file) {
      new import_obsidian.Notice("Open a Markdown file first.");
      return;
    }
    const title = view.file.basename || "Mindmap";
    const id = createMindmapId(`${view.file.path}:${Date.now()}`);
    const markdown = view.getViewData();
    const next = insertMindmapBlockAtLine(markdown, view.editor.getCursor().line, { id, title });
    await this.writeMarkdownFile(view.file, next);
    this.setActiveBlockForFile(view.file.path, id);
    await this.refreshIndexForFile(view.file, next);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) await leaf.view.loadFileBlock(view.file, id);
    }
  }
  getActiveMarkdownView() {
    return this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
  }
  getActiveMarkdownFile() {
    const activeMarkdown = this.getActiveMarkdownView();
    return activeMarkdown?.file ?? this.app.workspace.getActiveFile();
  }
  findMarkdownViewForFile(file) {
    let found = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      if (leaf.view instanceof import_obsidian.MarkdownView && leaf.view.file?.path === file.path) {
        found = leaf.view;
      }
    });
    return found;
  }
  getFileCache(filePath) {
    let cache = this.fileCache.get(filePath);
    if (!cache) {
      cache = { selectedIds: [], collapsedIds: [], scale: 1, scrollLeft: 0, scrollTop: 0 };
      this.fileCache.set(filePath, cache);
    }
    return cache;
  }
  setActiveBlockForFile(filePath, blockId) {
    this.getFileCache(filePath).activeBlockId = blockId;
  }
  getAllIndexEntries() {
    return [...this.mindmapIndex.values()].flat().sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  }
  getIndexEntriesForFile(filePath) {
    return this.mindmapIndex.get(filePath) ?? [];
  }
  async readMarkdownFile(file) {
    const view = this.findMarkdownViewForFile(file);
    return view?.getViewData() ?? this.app.vault.cachedRead(file);
  }
  async writeMarkdownFile(file, markdown) {
    this.suppressModifyPaths.add(file.path);
    const view = this.findMarkdownViewForFile(file);
    if (view) {
      replaceWholeEditorData(view.editor, markdown);
    } else {
      await this.app.vault.modify(file, markdown);
    }
    window.setTimeout(() => this.suppressModifyPaths.delete(file.path), 350);
  }
  async normalizeMindmapMetadata(file, markdown) {
    const next = normalizeMindmapBlockMetadata(markdown, {
      sourcePath: file.path,
      fallbackTitle: file.basename
    });
    if (next === markdown) return markdown;
    await this.writeMarkdownFile(file, next);
    await this.refreshIndexForFile(file, next);
    return next;
  }
  async refreshVaultIndex() {
    if (this.vaultScanTimer !== null) {
      window.clearTimeout(this.vaultScanTimer);
      this.vaultScanTimer = null;
    }
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.refreshIndexForFile(file);
    }
    this.refreshOpenDashboardOnly();
  }
  async refreshIndexForFile(file, knownMarkdown) {
    const markdown = knownMarkdown ?? await this.readMarkdownFile(file);
    const entries = buildMindmapIndex(markdown, file.path, file.basename);
    if (entries.length > 0) this.mindmapIndex.set(file.path, entries);
    else this.mindmapIndex.delete(file.path);
  }
  async handleMarkdownFileModified(file) {
    if (this.suppressModifyPaths.has(file.path)) return;
    await this.refreshIndexForFile(file);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) leaf.view.scheduleMarkdownRefresh(file.path);
    }
  }
  refreshOpenMindmapViews(options = {}) {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) {
        void leaf.view.loadCurrentFile(options);
      }
    }
  }
  refreshOpenDashboardOnly() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) leaf.view.render();
    }
  }
  withMindmapView(callback) {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!(leaf?.view instanceof MindmapWorkbenchView)) {
      new import_obsidian.Notice("Open the Markdown Mindmap panel first.");
      return;
    }
    void callback(leaf.view);
  }
};
var MindmapWorkbenchView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  sourceFile = null;
  block = null;
  nodes = [];
  selectedIds = /* @__PURE__ */ new Set();
  collapsedIds = /* @__PURE__ */ new Set();
  scale = 1;
  scrollLeft = 0;
  scrollTop = 0;
  searchQuery = "";
  refreshTimer = null;
  statePersistTimer = null;
  getViewType() {
    return VIEW_TYPE_MINDMAP;
  }
  getDisplayText() {
    return "Markdown Mindmap";
  }
  getIcon() {
    return "git-fork";
  }
  async onOpen() {
    this.render();
    await this.loadCurrentFile();
  }
  async onClose() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.statePersistTimer !== null) window.clearTimeout(this.statePersistTimer);
    await this.persistState();
  }
  scheduleMarkdownRefresh(filePath) {
    if (filePath && this.sourceFile?.path !== filePath) {
      this.render();
      return;
    }
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshCurrentBlockFromMarkdown();
    }, 180);
  }
  async loadCurrentFile(options = {}) {
    const activeFile = this.plugin.getActiveMarkdownFile();
    if (!activeFile || activeFile.extension !== "md") {
      if (!this.sourceFile) this.render("Open a Markdown file or choose a mindmap from the dashboard.");
      return;
    }
    if (options.fromEditorChange && this.sourceFile?.path === activeFile.path) {
      this.scheduleMarkdownRefresh(activeFile.path);
      return;
    }
    await this.loadFile(activeFile, void 0, options);
  }
  async loadFileBlock(file, blockId) {
    await this.loadFile(file, blockId);
  }
  async promptInduceParent() {
    if (this.selectedIds.size < 2) {
      new import_obsidian.Notice("Select at least two adjacent sibling nodes.");
      return;
    }
    new ParentTitleModal(this.app, "\u5F52\u7EB3", (title) => {
      void this.applyOperation(induceParentFromSelected(this.nodes, [...this.selectedIds], title || "\u5F52\u7EB3"));
    }).open();
  }
  focusSelectedNode() {
    const id = [...this.selectedIds][0];
    if (!id) {
      new import_obsidian.Notice("No mindmap node selected.");
      return;
    }
    const input = this.contentEl.querySelector(`input[data-node-id="${cssEscape(id)}"]`);
    input?.focus();
    input?.select();
  }
  render(status) {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("local-mindmap-workbench");
    const shell = contentEl.createDiv({ cls: "local-mindmap-shell" });
    const dashboard = shell.createDiv({ cls: "local-mindmap-dashboard" });
    const main = shell.createDiv({ cls: "local-mindmap-main" });
    this.renderDashboard(dashboard);
    this.renderMain(main, status);
  }
  async loadFile(file, requestedBlockId, options = {}) {
    let markdown = await this.plugin.readMarkdownFile(file);
    markdown = await this.plugin.normalizeMindmapMetadata(file, markdown);
    const blocks = parseMindmapBlocks(markdown, { sourcePath: file.path, fallbackTitle: file.basename });
    await this.plugin.refreshIndexForFile(file, markdown);
    this.sourceFile = file;
    if (blocks.length === 0) {
      this.block = null;
      this.nodes = [];
      this.selectedIds.clear();
      this.render();
      return;
    }
    const cache = this.plugin.getFileCache(file.path);
    const activeId = requestedBlockId ?? cache.activeBlockId;
    const block = blocks.find((candidate) => candidate.id === activeId) ?? blocks[0];
    this.block = block;
    this.nodes = block.nodes;
    this.plugin.setActiveBlockForFile(file.path, block.id);
    const state = readMindmapState(markdown).blocks[block.id];
    const previousSelection = new Set(this.selectedIds);
    this.collapsedIds = new Set(cache.activeBlockId === block.id ? cache.collapsedIds : state?.collapsedIds ?? []);
    this.scale = cache.activeBlockId === block.id ? cache.scale : state?.scale ?? 1;
    this.scrollLeft = cache.activeBlockId === block.id ? cache.scrollLeft : state?.scrollLeft ?? 0;
    this.scrollTop = cache.activeBlockId === block.id ? cache.scrollTop : state?.scrollTop ?? 0;
    this.selectedIds = options.preserveSelection ? new Set([...previousSelection].filter((id) => findNode(this.nodes, id))) : new Set([this.nodes[0]?.id].filter((id) => Boolean(id)));
    cache.lastContentHash = block.contentHash;
    this.updateCache();
    this.render(block.warning);
  }
  async refreshCurrentBlockFromMarkdown() {
    if (!this.sourceFile) return;
    const markdown = await this.plugin.readMarkdownFile(this.sourceFile);
    await this.plugin.refreshIndexForFile(this.sourceFile, markdown);
    const blocks = parseMindmapBlocks(markdown, { sourcePath: this.sourceFile.path, fallbackTitle: this.sourceFile.basename });
    if (!this.block) {
      this.render();
      return;
    }
    const fresh = blocks.find((candidate) => candidate.id === this.block?.id);
    if (!fresh) {
      this.block = blocks[0] ?? null;
      this.nodes = this.block?.nodes ?? [];
      this.selectedIds = new Set([this.nodes[0]?.id].filter((id) => Boolean(id)));
      this.render(this.block ? this.block.warning : void 0);
      return;
    }
    if (fresh.contentHash === this.block.contentHash && fresh.warning === this.block.warning) {
      this.render();
      return;
    }
    this.block = fresh;
    this.nodes = fresh.nodes;
    this.selectedIds = new Set([...this.selectedIds].filter((id) => findNode(this.nodes, id)));
    if (this.selectedIds.size === 0 && this.nodes[0]) this.selectedIds.add(this.nodes[0].id);
    this.updateCache();
    this.render(fresh.warning);
  }
  renderDashboard(container) {
    const header = container.createDiv({ cls: "local-mindmap-dashboard-header" });
    header.createDiv({ cls: "local-mindmap-dashboard-title", text: "Mindmaps" });
    const refresh = header.createEl("button", { cls: "local-mindmap-icon-button", text: "Refresh" });
    refresh.type = "button";
    refresh.addEventListener("click", (event) => {
      event.preventDefault();
      void this.plugin.refreshVaultIndex();
    });
    const create = container.createEl("button", { cls: "local-mindmap-create-button", text: "Create mindmap in current file" });
    create.type = "button";
    create.addEventListener("click", (event) => {
      event.preventDefault();
      void this.plugin.createMindmapInCurrentFile();
    });
    const search = container.createEl("input", { cls: "local-mindmap-search" });
    search.type = "search";
    search.placeholder = "Search mindmaps";
    search.value = this.searchQuery;
    search.addEventListener("input", () => {
      this.searchQuery = search.value;
      this.render();
    });
    this.renderEntrySection(container, "Current file", this.currentFileEntries());
    const query = this.searchQuery.trim().toLowerCase();
    const allEntries = this.plugin.getAllIndexEntries().filter(
      (entry) => !query || `${entry.title} ${entry.rootTitle} ${entry.filePath}`.toLowerCase().includes(query)
    ).slice(0, 80);
    this.renderEntrySection(container, query ? "Search results" : "Vault", allEntries);
  }
  renderEntrySection(container, title, entries) {
    const section = container.createDiv({ cls: "local-mindmap-section" });
    section.createDiv({ cls: "local-mindmap-section-title", text: `${title} (${entries.length})` });
    if (entries.length === 0) {
      section.createDiv({ cls: "local-mindmap-section-empty", text: title === "Current file" ? "This file has no mindmap block." : "No mindmaps found." });
      return;
    }
    for (const entry of entries) {
      const active = this.sourceFile?.path === entry.filePath && this.block?.id === entry.id;
      const button = section.createEl("button", { cls: active ? "local-mindmap-entry is-active" : "local-mindmap-entry" });
      button.type = "button";
      button.createDiv({ cls: "local-mindmap-entry-title", text: entry.title || entry.rootTitle || "Untitled mindmap" });
      button.createDiv({ cls: "local-mindmap-entry-path", text: `${entry.filePath} \xB7 line ${entry.line}` });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        void this.openIndexEntry(entry);
      });
    }
  }
  renderMain(container, status) {
    const toolbar = container.createDiv({ cls: "local-mindmap-toolbar" });
    const titleGroup = toolbar.createDiv({ cls: "local-mindmap-heading" });
    titleGroup.createDiv({
      cls: "local-mindmap-title",
      text: this.block?.title ?? this.sourceFile?.basename ?? "Markdown Mindmap"
    });
    titleGroup.createDiv({
      cls: "local-mindmap-subtitle",
      text: this.block && this.sourceFile ? `${this.sourceFile.path} \xB7 lines ${this.block.startLine + 1}-${this.block.endLine + 1}` : this.sourceFile ? `${this.sourceFile.path} \xB7 no mindmap block` : "Choose a mindmap or create one in the active file."
    });
    this.addToolbarButton(toolbar, "Induce parent", () => this.promptInduceParent(), this.selectedIds.size >= 2);
    this.addToolbarButton(toolbar, "Focus", () => this.focusSelectedNode(), this.selectedIds.size > 0);
    this.addToolbarButton(toolbar, "-", () => this.setScale(this.scale - 0.1), Boolean(this.block));
    this.addToolbarButton(toolbar, "+", () => this.setScale(this.scale + 0.1), Boolean(this.block));
    if (status) container.createDiv({ cls: "local-mindmap-warning", text: status });
    if (!this.sourceFile) {
      container.createDiv({ cls: "local-mindmap-empty", text: "Open a Markdown file or choose a mindmap from the dashboard." });
      return;
    }
    if (!this.block) {
      const empty = container.createDiv({ cls: "local-mindmap-empty" });
      empty.createDiv({ text: "This file has no mindmap block." });
      const button = empty.createEl("button", { text: "Create mindmap in current file" });
      button.type = "button";
      button.addEventListener("click", () => void this.plugin.createMindmapInCurrentFile());
      return;
    }
    if (this.nodes.length === 0) {
      container.createDiv({ cls: "local-mindmap-empty", text: "The selected mindmap block is empty." });
      return;
    }
    const stage = container.createDiv({ cls: "local-mindmap-stage" });
    stage.scrollLeft = this.scrollLeft;
    stage.scrollTop = this.scrollTop;
    stage.addEventListener("scroll", () => {
      this.scrollLeft = stage.scrollLeft;
      this.scrollTop = stage.scrollTop;
      this.updateCache();
      this.scheduleStatePersist();
    });
    const surface = stage.createDiv({ cls: "local-mindmap-surface" });
    surface.style.transform = `scale(${this.scale})`;
    surface.style.transformOrigin = "top left";
    const layouts = layoutNodes(this.nodes, this.collapsedIds);
    const maxX = Math.max(...layouts.map((entry) => entry.x), 0) + 340;
    const maxY = Math.max(...layouts.map((entry) => entry.y), 0) + 140;
    surface.style.width = `${maxX}px`;
    surface.style.height = `${maxY}px`;
    const svg = surface.createSvg("svg", { cls: "local-mindmap-links" });
    svg.setAttr("width", String(maxX));
    svg.setAttr("height", String(maxY));
    for (const layout of layouts) {
      if (!layout.parentId) continue;
      const parent = layouts.find((entry) => entry.node.id === layout.parentId);
      if (!parent) continue;
      const path = svg.createSvg("path");
      const startX = parent.x + 220;
      const startY = parent.y + 28;
      const endX = layout.x;
      const endY = layout.y + 28;
      const midX = startX + Math.max(40, (endX - startX) / 2);
      path.setAttr("d", `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`);
      path.setAttr("class", "local-mindmap-link");
    }
    for (const layout of layouts) {
      this.renderNode(surface, layout);
    }
    window.setTimeout(() => {
      stage.scrollLeft = this.scrollLeft;
      stage.scrollTop = this.scrollTop;
    }, 0);
  }
  renderNode(surface, layout) {
    const node = layout.node;
    const selected = this.selectedIds.has(node.id);
    const card = surface.createDiv({ cls: selected ? "local-mindmap-node is-selected" : "local-mindmap-node" });
    card.style.left = `${layout.x}px`;
    card.style.top = `${layout.y}px`;
    card.addEventListener("click", (event) => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "BUTTON") return;
      this.selectNode(node.id, event.metaKey || event.ctrlKey || event.shiftKey);
    });
    const row = card.createDiv({ cls: "local-mindmap-node-row" });
    const select = row.createEl("input", { cls: "local-mindmap-select" });
    select.type = "checkbox";
    select.checked = selected;
    select.addEventListener("change", () => this.selectNode(node.id, true));
    const collapse = row.createEl("button", { cls: "local-mindmap-collapse", text: node.children.length > 0 ? this.collapsedIds.has(node.id) ? "+" : "-" : "" });
    collapse.type = "button";
    collapse.disabled = node.children.length === 0;
    collapse.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleCollapse(node.id);
    });
    const input = row.createEl("input", { cls: "local-mindmap-node-title" });
    input.dataset.nodeId = node.id;
    input.value = node.title;
    input.placeholder = "Untitled";
    input.addEventListener("focus", () => {
      this.selectedIds = /* @__PURE__ */ new Set([node.id]);
      this.updateCache();
      card.addClass("is-selected");
      select.checked = true;
    });
    input.addEventListener("blur", () => void this.commitTitle(node.id, input.value));
    input.addEventListener("keydown", (event) => this.handleNodeKeydown(event, node.id, input));
  }
  handleNodeKeydown(event, nodeId, input) {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.commitTitle(nodeId, input.value, { skipRender: true }).then(() => this.applyOperation(insertSiblingAfter(this.nodes, nodeId, "")));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      void this.commitTitle(nodeId, input.value, { skipRender: true }).then(
        () => this.applyOperation(event.shiftKey ? outdentNode(this.nodes, nodeId) : indentNode(this.nodes, nodeId))
      );
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && input.value.trim() === "") {
      event.preventDefault();
      void this.applyOperation(deleteEmptyNode(this.nodes, nodeId));
    }
  }
  async commitTitle(nodeId, title, options = {}) {
    const node = findNode(this.nodes, nodeId);
    if (!node || node.title === title) return;
    await this.applyOperation(updateNodeTitle(this.nodes, nodeId, title), options);
  }
  selectNode(nodeId, additive) {
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
    } else {
      this.selectedIds.add(nodeId);
    }
    this.updateCache();
    this.render();
  }
  toggleCollapse(nodeId) {
    if (this.collapsedIds.has(nodeId)) this.collapsedIds.delete(nodeId);
    else this.collapsedIds.add(nodeId);
    this.updateCache();
    this.render();
    this.scheduleStatePersist();
  }
  setScale(next) {
    this.scale = Math.min(1.8, Math.max(0.5, Number(next.toFixed(2))));
    this.updateCache();
    this.render();
    this.scheduleStatePersist();
  }
  async applyOperation(result, options = {}) {
    if (!result.ok) {
      new import_obsidian.Notice(result.reason);
      return;
    }
    this.nodes = result.nodes;
    this.selectedIds = new Set(result.focusId ? [result.focusId] : [...this.selectedIds].filter((id) => findNode(this.nodes, id)));
    const written = await this.writeNodesToMarkdown();
    if (!written) return;
    this.updateCache();
    if (!options.skipRender) this.render();
    window.setTimeout(() => this.focusSelectedNode(), 0);
  }
  async writeNodesToMarkdown() {
    if (!this.sourceFile || !this.block) {
      new import_obsidian.Notice("No source mindmap block loaded.");
      return false;
    }
    const markdown = await this.plugin.readMarkdownFile(this.sourceFile);
    const blocks = parseMindmapBlocks(markdown, { sourcePath: this.sourceFile.path, fallbackTitle: this.sourceFile.basename });
    const freshBlock = blocks.find((candidate) => candidate.id === this.block?.id);
    if (!freshBlock) {
      new import_obsidian.Notice("The source mindmap block no longer exists.");
      return false;
    }
    const next = replaceMindmapBlock(markdown, freshBlock, this.nodes, freshBlock.title);
    await this.plugin.writeMarkdownFile(this.sourceFile, next);
    await this.plugin.refreshIndexForFile(this.sourceFile, next);
    const nextBlock = parseMindmapBlocks(next, { sourcePath: this.sourceFile.path, fallbackTitle: this.sourceFile.basename }).find(
      (candidate) => candidate.id === freshBlock.id
    );
    if (nextBlock) {
      this.block = nextBlock;
      this.plugin.getFileCache(this.sourceFile.path).lastContentHash = nextBlock.contentHash;
    }
    this.scheduleStatePersist();
    return true;
  }
  async openIndexEntry(entry) {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("Mindmap source file no longer exists.");
      return;
    }
    this.plugin.setActiveBlockForFile(file.path, entry.id);
    const existingView = this.plugin.findMarkdownViewForFile(file);
    if (!existingView) {
      await this.app.workspace.getLeaf(false).openFile(file, { active: false });
    }
    await this.loadFileBlock(file, entry.id);
  }
  currentFileEntries() {
    if (!this.sourceFile) return [];
    return this.plugin.getIndexEntriesForFile(this.sourceFile.path);
  }
  updateCache() {
    if (!this.sourceFile || !this.block) return;
    const cache = this.plugin.getFileCache(this.sourceFile.path);
    cache.activeBlockId = this.block.id;
    cache.selectedIds = [...this.selectedIds];
    cache.collapsedIds = [...this.collapsedIds];
    cache.scale = this.scale;
    cache.scrollLeft = this.scrollLeft;
    cache.scrollTop = this.scrollTop;
    cache.lastContentHash = this.block.contentHash;
  }
  scheduleStatePersist() {
    if (!this.plugin.settings.persistCollapseState) return;
    if (this.statePersistTimer !== null) window.clearTimeout(this.statePersistTimer);
    this.statePersistTimer = window.setTimeout(() => {
      this.statePersistTimer = null;
      void this.persistState();
    }, 500);
  }
  async persistState() {
    if (!this.sourceFile || !this.block || !this.plugin.settings.persistCollapseState) return;
    const markdown = await this.plugin.readMarkdownFile(this.sourceFile);
    const state = readMindmapState(markdown);
    state.blocks[this.block.id] = {
      collapsedIds: [...this.collapsedIds],
      scale: this.scale,
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const next = upsertMindmapStateBlock(markdown, state);
    if (next === markdown) return;
    await this.plugin.writeMarkdownFile(this.sourceFile, next);
    await this.plugin.refreshIndexForFile(this.sourceFile, next);
  }
  addToolbarButton(container, text, onClick, enabled = true) {
    const button = container.createEl("button", { text });
    button.type = "button";
    button.disabled = !enabled;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void onClick();
    });
  }
};
var ParentTitleModal = class extends import_obsidian.Modal {
  constructor(app, defaultTitle, onSubmit) {
    super(app);
    this.defaultTitle = defaultTitle;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Induce parent" });
    const input = contentEl.createEl("input", { cls: "local-mindmap-modal-input" });
    input.value = this.defaultTitle;
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.submit(input.value);
    });
    new import_obsidian.Setting(contentEl).addButton(
      (button) => button.setButtonText("Confirm").setCta().onClick(() => this.submit(input.value))
    );
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }
  submit(title) {
    this.onSubmit(title.trim() || this.defaultTitle);
    this.close();
  }
};
var MarkdownMindmapSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Open in right sidebar").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.openInRightSidebar).onChange(async (value) => {
        this.plugin.settings.openInRightSidebar = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Persist view state").setDesc("Save collapsed nodes, zoom, and scroll in a hidden managed block in the Markdown file.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.persistCollapseState).onChange(async (value) => {
        this.plugin.settings.persistCollapseState = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Follow active file").setDesc("Keep the panel pointed at the active Markdown file without clearing state on cursor movement.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.followActiveFile).onChange(async (value) => {
        this.plugin.settings.followActiveFile = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Scan vault on open").setDesc("Build the dashboard index from all Markdown files after Obsidian layout is ready.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.scanVaultOnOpen).onChange(async (value) => {
        this.plugin.settings.scanVaultOnOpen = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
function replaceWholeEditorData(editor, replacement) {
  const lastLine = Math.max(0, editor.lineCount() - 1);
  const end = { line: lastLine, ch: editor.getLine(lastLine).length };
  editor.replaceRange(replacement, { line: 0, ch: 0 }, end);
}
function layoutNodes(nodes, collapsedIds) {
  const result = [];
  let row = 0;
  const visit = (node, depth, parentId) => {
    result.push({
      node,
      depth,
      parentId,
      x: 36 + depth * 260,
      y: 36 + row * 78
    });
    row += 1;
    if (collapsedIds.has(node.id)) return;
    for (const child of node.children) visit(child, depth + 1, node.id);
  };
  for (const node of nodes) visit(node, 0, null);
  return result;
}
function findNode(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children, nodeId);
    if (child) return child;
  }
  return null;
}
function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL291dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBJdGVtVmlldyxcbiAgTWFya2Rvd25WaWV3LFxuICBNb2RhbCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgYnVpbGRNaW5kbWFwSW5kZXgsXG4gIGNyZWF0ZU1pbmRtYXBJZCxcbiAgZGVsZXRlRW1wdHlOb2RlLFxuICBpbmRlbnROb2RlLFxuICBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQsXG4gIGluc2VydE1pbmRtYXBCbG9ja0F0TGluZSxcbiAgaW5zZXJ0U2libGluZ0FmdGVyLFxuICBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YSxcbiAgb3V0ZGVudE5vZGUsXG4gIHBhcnNlTWluZG1hcEJsb2NrcyxcbiAgcmVhZE1pbmRtYXBTdGF0ZSxcbiAgcmVwbGFjZU1pbmRtYXBCbG9jayxcbiAgdXBkYXRlTm9kZVRpdGxlLFxuICB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayxcbiAgdHlwZSBNaW5kbWFwQmxvY2ssXG4gIHR5cGUgTWluZG1hcEluZGV4RW50cnksXG4gIHR5cGUgTWluZG1hcFN0YXRlRGF0YSxcbiAgdHlwZSBPdXRsaW5lTm9kZSxcbiAgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0XG59IGZyb20gXCIuL291dGxpbmUudHNcIjtcblxuY29uc3QgVklFV19UWVBFX01JTkRNQVAgPSBcIm1hcmtkb3duLW1pbmRtYXAtd29ya2JlbmNoXCI7XG5cbmludGVyZmFjZSBMb2NhbE1pbmRtYXBTZXR0aW5ncyB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogYm9vbGVhbjtcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IGJvb2xlYW47XG4gIGZvbGxvd0FjdGl2ZUZpbGU6IGJvb2xlYW47XG4gIHNjYW5WYXVsdE9uT3BlbjogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogdHJ1ZSxcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IHRydWUsXG4gIGZvbGxvd0FjdGl2ZUZpbGU6IHRydWUsXG4gIHNjYW5WYXVsdE9uT3BlbjogdHJ1ZVxufTtcblxuaW50ZXJmYWNlIEZpbGVNaW5kbWFwQ2FjaGUge1xuICBhY3RpdmVCbG9ja0lkPzogc3RyaW5nO1xuICBzZWxlY3RlZElkczogc3RyaW5nW107XG4gIGNvbGxhcHNlZElkczogc3RyaW5nW107XG4gIHNjYWxlOiBudW1iZXI7XG4gIHNjcm9sbExlZnQ6IG51bWJlcjtcbiAgc2Nyb2xsVG9wOiBudW1iZXI7XG4gIGxhc3RDb250ZW50SGFzaD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE5vZGVMYXlvdXQge1xuICBub2RlOiBPdXRsaW5lTm9kZTtcbiAgZGVwdGg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHBhcmVudElkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXJrZG93bk1pbmRtYXBQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICByZWFkb25seSBmaWxlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgRmlsZU1pbmRtYXBDYWNoZT4oKTtcbiAgcmVhZG9ubHkgbWluZG1hcEluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIE1pbmRtYXBJbmRleEVudHJ5W10+KCk7XG4gIHJlYWRvbmx5IHN1cHByZXNzTW9kaWZ5UGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICBwcml2YXRlIHZhdWx0U2NhblRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuICBhc3luYyBvbmxvYWQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IE1hcmtkb3duTWluZG1hcFNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyVmlldyhWSUVXX1RZUEVfTUlORE1BUCwgKGxlYWYpID0+IG5ldyBNaW5kbWFwV29ya2JlbmNoVmlldyhsZWFmLCB0aGlzKSk7XG5cbiAgICB0aGlzLmFkZFJpYmJvbkljb24oXCJnaXQtZm9ya1wiLCBcIk9wZW4gTWFya2Rvd24gTWluZG1hcFwiLCAoKSA9PiB7XG4gICAgICB2b2lkIHRoaXMub3Blbk1pbmRtYXBQYW5lbCgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcIm9wZW4tbWFya2Rvd24tbWluZG1hcFwiLFxuICAgICAgbmFtZTogXCJPcGVuIE1hcmtkb3duIE1pbmRtYXBcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLm9wZW5NaW5kbWFwUGFuZWwoKVxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcIm9wZW4tY3VycmVudC1vdXRsaW5lLW1pbmRtYXBcIixcbiAgICAgIG5hbWU6IFwiT3BlbiBNaW5kbWFwIGZvciBDdXJyZW50IE91dGxpbmVcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLm9wZW5NaW5kbWFwUGFuZWwoKVxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNyZWF0ZS1taW5kbWFwLWluLWN1cnJlbnQtZmlsZVwiLFxuICAgICAgbmFtZTogXCJDcmVhdGUgbWluZG1hcCBpbiBjdXJyZW50IGZpbGVcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLmNyZWF0ZU1pbmRtYXBJbkN1cnJlbnRGaWxlKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJpbmR1Y2UtcGFyZW50LWZyb20tc2VsZWN0ZWQtbm9kZXNcIixcbiAgICAgIG5hbWU6IFwiSW5kdWNlIFBhcmVudCBmcm9tIFNlbGVjdGVkIE5vZGVzXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy53aXRoTWluZG1hcFZpZXcoKHZpZXcpID0+IHZpZXcucHJvbXB0SW5kdWNlUGFyZW50KCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZm9jdXMtbWluZG1hcC1ub2RlXCIsXG4gICAgICBuYW1lOiBcIkZvY3VzIE1pbmRtYXAgTm9kZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMud2l0aE1pbmRtYXBWaWV3KCh2aWV3KSA9PiB2aWV3LmZvY3VzU2VsZWN0ZWROb2RlKCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJhY3RpdmUtbGVhZi1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZm9sbG93QWN0aXZlRmlsZSkgcmV0dXJuO1xuICAgICAgICB0aGlzLnJlZnJlc2hPcGVuTWluZG1hcFZpZXdzKCk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItY2hhbmdlXCIsICgpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmZvbGxvd0FjdGl2ZUZpbGUpIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWZyZXNoT3Blbk1pbmRtYXBWaWV3cyh7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlLCBmcm9tRWRpdG9yQ2hhbmdlOiB0cnVlIH0pO1xuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHtcbiAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm47XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVNYXJrZG93bkZpbGVNb2RpZmllZChmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgIGlmICh0aGlzLnNldHRpbmdzLnNjYW5WYXVsdE9uT3Blbikgdm9pZCB0aGlzLnJlZnJlc2hWYXVsdEluZGV4KCk7XG4gICAgfSk7XG4gIH1cblxuICBvbnVubG9hZCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy52YXVsdFNjYW5UaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnZhdWx0U2NhblRpbWVyKTtcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2UuZGV0YWNoTGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCByYXcgPSAoYXdhaXQgdGhpcy5sb2FkRGF0YSgpKSBhcyBQYXJ0aWFsPExvY2FsTWluZG1hcFNldHRpbmdzPiAmIHsgZm9sbG93QWN0aXZlT3V0bGluZT86IGJvb2xlYW47IGluZGVudFVuaXQ/OiBudW1iZXIgfSB8IG51bGw7XG4gICAgdGhpcy5zZXR0aW5ncyA9IHtcbiAgICAgIC4uLkRFRkFVTFRfU0VUVElOR1MsXG4gICAgICAuLi4ocmF3ID8/IHt9KSxcbiAgICAgIGZvbGxvd0FjdGl2ZUZpbGU6IHJhdz8uZm9sbG93QWN0aXZlRmlsZSA/PyByYXc/LmZvbGxvd0FjdGl2ZU91dGxpbmUgPz8gREVGQVVMVF9TRVRUSU5HUy5mb2xsb3dBY3RpdmVGaWxlXG4gICAgfTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xuICB9XG5cbiAgYXN5bmMgb3Blbk1pbmRtYXBQYW5lbCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghbGVhZikge1xuICAgICAgbGVhZiA9IHRoaXMuc2V0dGluZ3Mub3BlbkluUmlnaHRTaWRlYmFyXG4gICAgICAgID8gdGhpcy5hcHAud29ya3NwYWNlLmdldFJpZ2h0TGVhZihmYWxzZSkgPz8gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYodHJ1ZSlcbiAgICAgICAgOiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZih0cnVlKTtcbiAgICAgIGF3YWl0IGxlYWYuc2V0Vmlld1N0YXRlKHsgdHlwZTogVklFV19UWVBFX01JTkRNQVAsIGFjdGl2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLnJldmVhbExlYWYobGVhZik7XG4gICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSB7XG4gICAgICBhd2FpdCBsZWFmLnZpZXcubG9hZEN1cnJlbnRGaWxlKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlTWluZG1hcEluQ3VycmVudEZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuZ2V0QWN0aXZlTWFya2Rvd25WaWV3KCk7XG4gICAgaWYgKCF2aWV3Py5maWxlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgZmlyc3QuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0aXRsZSA9IHZpZXcuZmlsZS5iYXNlbmFtZSB8fCBcIk1pbmRtYXBcIjtcbiAgICBjb25zdCBpZCA9IGNyZWF0ZU1pbmRtYXBJZChgJHt2aWV3LmZpbGUucGF0aH06JHtEYXRlLm5vdygpfWApO1xuICAgIGNvbnN0IG1hcmtkb3duID0gdmlldy5nZXRWaWV3RGF0YSgpO1xuICAgIGNvbnN0IG5leHQgPSBpbnNlcnRNaW5kbWFwQmxvY2tBdExpbmUobWFya2Rvd24sIHZpZXcuZWRpdG9yLmdldEN1cnNvcigpLmxpbmUsIHsgaWQsIHRpdGxlIH0pO1xuICAgIGF3YWl0IHRoaXMud3JpdGVNYXJrZG93bkZpbGUodmlldy5maWxlLCBuZXh0KTtcbiAgICB0aGlzLnNldEFjdGl2ZUJsb2NrRm9yRmlsZSh2aWV3LmZpbGUucGF0aCwgaWQpO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEluZGV4Rm9yRmlsZSh2aWV3LmZpbGUsIG5leHQpO1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSBhd2FpdCBsZWFmLnZpZXcubG9hZEZpbGVCbG9jayh2aWV3LmZpbGUsIGlkKTtcbiAgICB9XG4gIH1cblxuICBnZXRBY3RpdmVNYXJrZG93blZpZXcoKTogTWFya2Rvd25WaWV3IHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gIH1cblxuICBnZXRBY3RpdmVNYXJrZG93bkZpbGUoKTogVEZpbGUgfCBudWxsIHtcbiAgICBjb25zdCBhY3RpdmVNYXJrZG93biA9IHRoaXMuZ2V0QWN0aXZlTWFya2Rvd25WaWV3KCk7XG4gICAgcmV0dXJuIGFjdGl2ZU1hcmtkb3duPy5maWxlID8/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gIH1cblxuICBmaW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlOiBURmlsZSk6IE1hcmtkb3duVmlldyB8IG51bGwge1xuICAgIGxldCBmb3VuZDogTWFya2Rvd25WaWV3IHwgbnVsbCA9IG51bGw7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLml0ZXJhdGVBbGxMZWF2ZXMoKGxlYWYpID0+IHtcbiAgICAgIGlmIChmb3VuZCkgcmV0dXJuO1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldyAmJiBsZWFmLnZpZXcuZmlsZT8ucGF0aCA9PT0gZmlsZS5wYXRoKSB7XG4gICAgICAgIGZvdW5kID0gbGVhZi52aWV3O1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBmb3VuZDtcbiAgfVxuXG4gIGdldEZpbGVDYWNoZShmaWxlUGF0aDogc3RyaW5nKTogRmlsZU1pbmRtYXBDYWNoZSB7XG4gICAgbGV0IGNhY2hlID0gdGhpcy5maWxlQ2FjaGUuZ2V0KGZpbGVQYXRoKTtcbiAgICBpZiAoIWNhY2hlKSB7XG4gICAgICBjYWNoZSA9IHsgc2VsZWN0ZWRJZHM6IFtdLCBjb2xsYXBzZWRJZHM6IFtdLCBzY2FsZTogMSwgc2Nyb2xsTGVmdDogMCwgc2Nyb2xsVG9wOiAwIH07XG4gICAgICB0aGlzLmZpbGVDYWNoZS5zZXQoZmlsZVBhdGgsIGNhY2hlKTtcbiAgICB9XG4gICAgcmV0dXJuIGNhY2hlO1xuICB9XG5cbiAgc2V0QWN0aXZlQmxvY2tGb3JGaWxlKGZpbGVQYXRoOiBzdHJpbmcsIGJsb2NrSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuZ2V0RmlsZUNhY2hlKGZpbGVQYXRoKS5hY3RpdmVCbG9ja0lkID0gYmxvY2tJZDtcbiAgfVxuXG4gIGdldEFsbEluZGV4RW50cmllcygpOiBNaW5kbWFwSW5kZXhFbnRyeVtdIHtcbiAgICByZXR1cm4gWy4uLnRoaXMubWluZG1hcEluZGV4LnZhbHVlcygpXS5mbGF0KCkuc29ydCgoYSwgYikgPT4gYS5maWxlUGF0aC5sb2NhbGVDb21wYXJlKGIuZmlsZVBhdGgpIHx8IGEubGluZSAtIGIubGluZSk7XG4gIH1cblxuICBnZXRJbmRleEVudHJpZXNGb3JGaWxlKGZpbGVQYXRoOiBzdHJpbmcpOiBNaW5kbWFwSW5kZXhFbnRyeVtdIHtcbiAgICByZXR1cm4gdGhpcy5taW5kbWFwSW5kZXguZ2V0KGZpbGVQYXRoKSA/PyBbXTtcbiAgfVxuXG4gIGFzeW5jIHJlYWRNYXJrZG93bkZpbGUoZmlsZTogVEZpbGUpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKGZpbGUpO1xuICAgIHJldHVybiB2aWV3Py5nZXRWaWV3RGF0YSgpID8/IHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gIH1cblxuICBhc3luYyB3cml0ZU1hcmtkb3duRmlsZShmaWxlOiBURmlsZSwgbWFya2Rvd246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuc3VwcHJlc3NNb2RpZnlQYXRocy5hZGQoZmlsZS5wYXRoKTtcbiAgICBjb25zdCB2aWV3ID0gdGhpcy5maW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlKTtcbiAgICBpZiAodmlldykge1xuICAgICAgcmVwbGFjZVdob2xlRWRpdG9yRGF0YSh2aWV3LmVkaXRvciwgbWFya2Rvd24pO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgbWFya2Rvd24pO1xuICAgIH1cbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLnN1cHByZXNzTW9kaWZ5UGF0aHMuZGVsZXRlKGZpbGUucGF0aCksIDM1MCk7XG4gIH1cblxuICBhc3luYyBub3JtYWxpemVNaW5kbWFwTWV0YWRhdGEoZmlsZTogVEZpbGUsIG1hcmtkb3duOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGNvbnN0IG5leHQgPSBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YShtYXJrZG93biwge1xuICAgICAgc291cmNlUGF0aDogZmlsZS5wYXRoLFxuICAgICAgZmFsbGJhY2tUaXRsZTogZmlsZS5iYXNlbmFtZVxuICAgIH0pO1xuICAgIGlmIChuZXh0ID09PSBtYXJrZG93bikgcmV0dXJuIG1hcmtkb3duO1xuICAgIGF3YWl0IHRoaXMud3JpdGVNYXJrZG93bkZpbGUoZmlsZSwgbmV4dCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGUsIG5leHQpO1xuICAgIHJldHVybiBuZXh0O1xuICB9XG5cbiAgYXN5bmMgcmVmcmVzaFZhdWx0SW5kZXgoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMudmF1bHRTY2FuVGltZXIgIT09IG51bGwpIHtcbiAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy52YXVsdFNjYW5UaW1lcik7XG4gICAgICB0aGlzLnZhdWx0U2NhblRpbWVyID0gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCk7XG4gICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICBhd2FpdCB0aGlzLnJlZnJlc2hJbmRleEZvckZpbGUoZmlsZSk7XG4gICAgfVxuICAgIHRoaXMucmVmcmVzaE9wZW5EYXNoYm9hcmRPbmx5KCk7XG4gIH1cblxuICBhc3luYyByZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGU6IFRGaWxlLCBrbm93bk1hcmtkb3duPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgbWFya2Rvd24gPSBrbm93bk1hcmtkb3duID8/IChhd2FpdCB0aGlzLnJlYWRNYXJrZG93bkZpbGUoZmlsZSkpO1xuICAgIGNvbnN0IGVudHJpZXMgPSBidWlsZE1pbmRtYXBJbmRleChtYXJrZG93biwgZmlsZS5wYXRoLCBmaWxlLmJhc2VuYW1lKTtcbiAgICBpZiAoZW50cmllcy5sZW5ndGggPiAwKSB0aGlzLm1pbmRtYXBJbmRleC5zZXQoZmlsZS5wYXRoLCBlbnRyaWVzKTtcbiAgICBlbHNlIHRoaXMubWluZG1hcEluZGV4LmRlbGV0ZShmaWxlLnBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBoYW5kbGVNYXJrZG93bkZpbGVNb2RpZmllZChmaWxlOiBURmlsZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnN1cHByZXNzTW9kaWZ5UGF0aHMuaGFzKGZpbGUucGF0aCkpIHJldHVybjtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hJbmRleEZvckZpbGUoZmlsZSk7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApKSB7XG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIGxlYWYudmlldy5zY2hlZHVsZU1hcmtkb3duUmVmcmVzaChmaWxlLnBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVmcmVzaE9wZW5NaW5kbWFwVmlld3Mob3B0aW9uczogeyBwcmVzZXJ2ZVNlbGVjdGlvbj86IGJvb2xlYW47IGZyb21FZGl0b3JDaGFuZ2U/OiBib29sZWFuIH0gPSB7fSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSB7XG4gICAgICAgIHZvaWQgbGVhZi52aWV3LmxvYWRDdXJyZW50RmlsZShvcHRpb25zKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlZnJlc2hPcGVuRGFzaGJvYXJkT25seSgpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUCkpIHtcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykgbGVhZi52aWV3LnJlbmRlcigpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgd2l0aE1pbmRtYXBWaWV3KGNhbGxiYWNrOiAodmlldzogTWluZG1hcFdvcmtiZW5jaFZpZXcpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgY29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghKGxlYWY/LnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcGVuIHRoZSBNYXJrZG93biBNaW5kbWFwIHBhbmVsIGZpcnN0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdm9pZCBjYWxsYmFjayhsZWFmLnZpZXcpO1xuICB9XG59XG5cbmNsYXNzIE1pbmRtYXBXb3JrYmVuY2hWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuICBwcml2YXRlIHNvdXJjZUZpbGU6IFRGaWxlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYmxvY2s6IE1pbmRtYXBCbG9jayB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIG5vZGVzOiBPdXRsaW5lTm9kZVtdID0gW107XG4gIHByaXZhdGUgc2VsZWN0ZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBjb2xsYXBzZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBzY2FsZSA9IDE7XG4gIHByaXZhdGUgc2Nyb2xsTGVmdCA9IDA7XG4gIHByaXZhdGUgc2Nyb2xsVG9wID0gMDtcbiAgcHJpdmF0ZSBzZWFyY2hRdWVyeSA9IFwiXCI7XG4gIHByaXZhdGUgcmVmcmVzaFRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBzdGF0ZVBlcnNpc3RUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IE1hcmtkb3duTWluZG1hcFBsdWdpbikge1xuICAgIHN1cGVyKGxlYWYpO1xuICB9XG5cbiAgZ2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gVklFV19UWVBFX01JTkRNQVA7XG4gIH1cblxuICBnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBcIk1hcmtkb3duIE1pbmRtYXBcIjtcbiAgfVxuXG4gIGdldEljb24oKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJnaXQtZm9ya1wiO1xuICB9XG5cbiAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gICAgYXdhaXQgdGhpcy5sb2FkQ3VycmVudEZpbGUoKTtcbiAgfVxuXG4gIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucmVmcmVzaFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTtcbiAgICBpZiAodGhpcy5zdGF0ZVBlcnNpc3RUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnN0YXRlUGVyc2lzdFRpbWVyKTtcbiAgICBhd2FpdCB0aGlzLnBlcnNpc3RTdGF0ZSgpO1xuICB9XG5cbiAgc2NoZWR1bGVNYXJrZG93blJlZnJlc2goZmlsZVBhdGg/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoZmlsZVBhdGggJiYgdGhpcy5zb3VyY2VGaWxlPy5wYXRoICE9PSBmaWxlUGF0aCkge1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMucmVmcmVzaFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTtcbiAgICB0aGlzLnJlZnJlc2hUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmVmcmVzaFRpbWVyID0gbnVsbDtcbiAgICAgIHZvaWQgdGhpcy5yZWZyZXNoQ3VycmVudEJsb2NrRnJvbU1hcmtkb3duKCk7XG4gICAgfSwgMTgwKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRDdXJyZW50RmlsZShvcHRpb25zOiB7IHByZXNlcnZlU2VsZWN0aW9uPzogYm9vbGVhbjsgZnJvbUVkaXRvckNoYW5nZT86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYWN0aXZlRmlsZSA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZU1hcmtkb3duRmlsZSgpO1xuICAgIGlmICghYWN0aXZlRmlsZSB8fCBhY3RpdmVGaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICBpZiAoIXRoaXMuc291cmNlRmlsZSkgdGhpcy5yZW5kZXIoXCJPcGVuIGEgTWFya2Rvd24gZmlsZSBvciBjaG9vc2UgYSBtaW5kbWFwIGZyb20gdGhlIGRhc2hib2FyZC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChvcHRpb25zLmZyb21FZGl0b3JDaGFuZ2UgJiYgdGhpcy5zb3VyY2VGaWxlPy5wYXRoID09PSBhY3RpdmVGaWxlLnBhdGgpIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVNYXJrZG93blJlZnJlc2goYWN0aXZlRmlsZS5wYXRoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZShhY3RpdmVGaWxlLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgYXN5bmMgbG9hZEZpbGVCbG9jayhmaWxlOiBURmlsZSwgYmxvY2tJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZShmaWxlLCBibG9ja0lkKTtcbiAgfVxuXG4gIGFzeW5jIHByb21wdEluZHVjZVBhcmVudCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5zZWxlY3RlZElkcy5zaXplIDwgMikge1xuICAgICAgbmV3IE5vdGljZShcIlNlbGVjdCBhdCBsZWFzdCB0d28gYWRqYWNlbnQgc2libGluZyBub2Rlcy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBQYXJlbnRUaXRsZU1vZGFsKHRoaXMuYXBwLCBcIlx1NUY1Mlx1N0VCM1wiLCAodGl0bGUpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5hcHBseU9wZXJhdGlvbihpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQodGhpcy5ub2RlcywgWy4uLnRoaXMuc2VsZWN0ZWRJZHNdLCB0aXRsZSB8fCBcIlx1NUY1Mlx1N0VCM1wiKSk7XG4gICAgfSkub3BlbigpO1xuICB9XG5cbiAgZm9jdXNTZWxlY3RlZE5vZGUoKTogdm9pZCB7XG4gICAgY29uc3QgaWQgPSBbLi4udGhpcy5zZWxlY3RlZElkc11bMF07XG4gICAgaWYgKCFpZCkge1xuICAgICAgbmV3IE5vdGljZShcIk5vIG1pbmRtYXAgbm9kZSBzZWxlY3RlZC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGlucHV0ID0gdGhpcy5jb250ZW50RWwucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihgaW5wdXRbZGF0YS1ub2RlLWlkPVwiJHtjc3NFc2NhcGUoaWQpfVwiXWApO1xuICAgIGlucHV0Py5mb2N1cygpO1xuICAgIGlucHV0Py5zZWxlY3QoKTtcbiAgfVxuXG4gIHJlbmRlcihzdGF0dXM/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJsb2NhbC1taW5kbWFwLXdvcmtiZW5jaFwiKTtcblxuICAgIGNvbnN0IHNoZWxsID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXNoZWxsXCIgfSk7XG4gICAgY29uc3QgZGFzaGJvYXJkID0gc2hlbGwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZGFzaGJvYXJkXCIgfSk7XG4gICAgY29uc3QgbWFpbiA9IHNoZWxsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLW1haW5cIiB9KTtcbiAgICB0aGlzLnJlbmRlckRhc2hib2FyZChkYXNoYm9hcmQpO1xuICAgIHRoaXMucmVuZGVyTWFpbihtYWluLCBzdGF0dXMpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsb2FkRmlsZShmaWxlOiBURmlsZSwgcmVxdWVzdGVkQmxvY2tJZD86IHN0cmluZywgb3B0aW9uczogeyBwcmVzZXJ2ZVNlbGVjdGlvbj86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZShmaWxlKTtcbiAgICBtYXJrZG93biA9IGF3YWl0IHRoaXMucGx1Z2luLm5vcm1hbGl6ZU1pbmRtYXBNZXRhZGF0YShmaWxlLCBtYXJrZG93bik7XG4gICAgY29uc3QgYmxvY2tzID0gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duLCB7IHNvdXJjZVBhdGg6IGZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogZmlsZS5iYXNlbmFtZSB9KTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGUsIG1hcmtkb3duKTtcblxuICAgIHRoaXMuc291cmNlRmlsZSA9IGZpbGU7XG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IFtdO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5jbGVhcigpO1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYWNoZSA9IHRoaXMucGx1Z2luLmdldEZpbGVDYWNoZShmaWxlLnBhdGgpO1xuICAgIGNvbnN0IGFjdGl2ZUlkID0gcmVxdWVzdGVkQmxvY2tJZCA/PyBjYWNoZS5hY3RpdmVCbG9ja0lkO1xuICAgIGNvbnN0IGJsb2NrID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSBhY3RpdmVJZCkgPz8gYmxvY2tzWzBdO1xuICAgIHRoaXMuYmxvY2sgPSBibG9jaztcbiAgICB0aGlzLm5vZGVzID0gYmxvY2subm9kZXM7XG4gICAgdGhpcy5wbHVnaW4uc2V0QWN0aXZlQmxvY2tGb3JGaWxlKGZpbGUucGF0aCwgYmxvY2suaWQpO1xuICAgIGNvbnN0IHN0YXRlID0gcmVhZE1pbmRtYXBTdGF0ZShtYXJrZG93bikuYmxvY2tzW2Jsb2NrLmlkXTtcbiAgICBjb25zdCBwcmV2aW91c1NlbGVjdGlvbiA9IG5ldyBTZXQodGhpcy5zZWxlY3RlZElkcyk7XG4gICAgdGhpcy5jb2xsYXBzZWRJZHMgPSBuZXcgU2V0KGNhY2hlLmFjdGl2ZUJsb2NrSWQgPT09IGJsb2NrLmlkID8gY2FjaGUuY29sbGFwc2VkSWRzIDogc3RhdGU/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgdGhpcy5zY2FsZSA9IGNhY2hlLmFjdGl2ZUJsb2NrSWQgPT09IGJsb2NrLmlkID8gY2FjaGUuc2NhbGUgOiBzdGF0ZT8uc2NhbGUgPz8gMTtcbiAgICB0aGlzLnNjcm9sbExlZnQgPSBjYWNoZS5hY3RpdmVCbG9ja0lkID09PSBibG9jay5pZCA/IGNhY2hlLnNjcm9sbExlZnQgOiBzdGF0ZT8uc2Nyb2xsTGVmdCA/PyAwO1xuICAgIHRoaXMuc2Nyb2xsVG9wID0gY2FjaGUuYWN0aXZlQmxvY2tJZCA9PT0gYmxvY2suaWQgPyBjYWNoZS5zY3JvbGxUb3AgOiBzdGF0ZT8uc2Nyb2xsVG9wID8/IDA7XG4gICAgdGhpcy5zZWxlY3RlZElkcyA9IG9wdGlvbnMucHJlc2VydmVTZWxlY3Rpb25cbiAgICAgID8gbmV3IFNldChbLi4ucHJldmlvdXNTZWxlY3Rpb25dLmZpbHRlcigoaWQpID0+IGZpbmROb2RlKHRoaXMubm9kZXMsIGlkKSkpXG4gICAgICA6IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgY2FjaGUubGFzdENvbnRlbnRIYXNoID0gYmxvY2suY29udGVudEhhc2g7XG4gICAgdGhpcy51cGRhdGVDYWNoZSgpO1xuICAgIHRoaXMucmVuZGVyKGJsb2NrLndhcm5pbmcpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWZyZXNoQ3VycmVudEJsb2NrRnJvbU1hcmtkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlKSByZXR1cm47XG4gICAgY29uc3QgbWFya2Rvd24gPSBhd2FpdCB0aGlzLnBsdWdpbi5yZWFkTWFya2Rvd25GaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ucmVmcmVzaEluZGV4Rm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUsIG1hcmtkb3duKTtcbiAgICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3MobWFya2Rvd24sIHsgc291cmNlUGF0aDogdGhpcy5zb3VyY2VGaWxlLnBhdGgsIGZhbGxiYWNrVGl0bGU6IHRoaXMuc291cmNlRmlsZS5iYXNlbmFtZSB9KTtcbiAgICBpZiAoIXRoaXMuYmxvY2spIHtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZyZXNoID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSB0aGlzLmJsb2NrPy5pZCk7XG4gICAgaWYgKCFmcmVzaCkge1xuICAgICAgdGhpcy5ibG9jayA9IGJsb2Nrc1swXSA/PyBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IHRoaXMuYmxvY2s/Lm5vZGVzID8/IFtdO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcyA9IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgICB0aGlzLnJlbmRlcih0aGlzLmJsb2NrID8gdGhpcy5ibG9jay53YXJuaW5nIDogdW5kZWZpbmVkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZyZXNoLmNvbnRlbnRIYXNoID09PSB0aGlzLmJsb2NrLmNvbnRlbnRIYXNoICYmIGZyZXNoLndhcm5pbmcgPT09IHRoaXMuYmxvY2sud2FybmluZykge1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5ibG9jayA9IGZyZXNoO1xuICAgIHRoaXMubm9kZXMgPSBmcmVzaC5ub2RlcztcbiAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChbLi4udGhpcy5zZWxlY3RlZElkc10uZmlsdGVyKChpZCkgPT4gZmluZE5vZGUodGhpcy5ub2RlcywgaWQpKSk7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA9PT0gMCAmJiB0aGlzLm5vZGVzWzBdKSB0aGlzLnNlbGVjdGVkSWRzLmFkZCh0aGlzLm5vZGVzWzBdLmlkKTtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgdGhpcy5yZW5kZXIoZnJlc2gud2FybmluZyk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckRhc2hib2FyZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWRhc2hib2FyZC1oZWFkZXJcIiB9KTtcbiAgICBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZGFzaGJvYXJkLXRpdGxlXCIsIHRleHQ6IFwiTWluZG1hcHNcIiB9KTtcbiAgICBjb25zdCByZWZyZXNoID0gaGVhZGVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtaWNvbi1idXR0b25cIiwgdGV4dDogXCJSZWZyZXNoXCIgfSk7XG4gICAgcmVmcmVzaC50eXBlID0gXCJidXR0b25cIjtcbiAgICByZWZyZXNoLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMucGx1Z2luLnJlZnJlc2hWYXVsdEluZGV4KCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjcmVhdGUgPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1jcmVhdGUtYnV0dG9uXCIsIHRleHQ6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIgfSk7XG4gICAgY3JlYXRlLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGNyZWF0ZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLnBsdWdpbi5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSgpO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2VhcmNoID0gY29udGFpbmVyLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWFyY2hcIiB9KTtcbiAgICBzZWFyY2gudHlwZSA9IFwic2VhcmNoXCI7XG4gICAgc2VhcmNoLnBsYWNlaG9sZGVyID0gXCJTZWFyY2ggbWluZG1hcHNcIjtcbiAgICBzZWFyY2gudmFsdWUgPSB0aGlzLnNlYXJjaFF1ZXJ5O1xuICAgIHNlYXJjaC5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgKCkgPT4ge1xuICAgICAgdGhpcy5zZWFyY2hRdWVyeSA9IHNlYXJjaC52YWx1ZTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfSk7XG5cbiAgICB0aGlzLnJlbmRlckVudHJ5U2VjdGlvbihjb250YWluZXIsIFwiQ3VycmVudCBmaWxlXCIsIHRoaXMuY3VycmVudEZpbGVFbnRyaWVzKCkpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50cmltKCkudG9Mb3dlckNhc2UoKTtcbiAgICBjb25zdCBhbGxFbnRyaWVzID0gdGhpcy5wbHVnaW5cbiAgICAgIC5nZXRBbGxJbmRleEVudHJpZXMoKVxuICAgICAgLmZpbHRlcigoZW50cnkpID0+XG4gICAgICAgICFxdWVyeSB8fFxuICAgICAgICBgJHtlbnRyeS50aXRsZX0gJHtlbnRyeS5yb290VGl0bGV9ICR7ZW50cnkuZmlsZVBhdGh9YC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KVxuICAgICAgKVxuICAgICAgLnNsaWNlKDAsIDgwKTtcbiAgICB0aGlzLnJlbmRlckVudHJ5U2VjdGlvbihjb250YWluZXIsIHF1ZXJ5ID8gXCJTZWFyY2ggcmVzdWx0c1wiIDogXCJWYXVsdFwiLCBhbGxFbnRyaWVzKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyRW50cnlTZWN0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcsIGVudHJpZXM6IE1pbmRtYXBJbmRleEVudHJ5W10pOiB2b2lkIHtcbiAgICBjb25zdCBzZWN0aW9uID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXNlY3Rpb25cIiB9KTtcbiAgICBzZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXNlY3Rpb24tdGl0bGVcIiwgdGV4dDogYCR7dGl0bGV9ICgke2VudHJpZXMubGVuZ3RofSlgIH0pO1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWN0aW9uLWVtcHR5XCIsIHRleHQ6IHRpdGxlID09PSBcIkN1cnJlbnQgZmlsZVwiID8gXCJUaGlzIGZpbGUgaGFzIG5vIG1pbmRtYXAgYmxvY2suXCIgOiBcIk5vIG1pbmRtYXBzIGZvdW5kLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcbiAgICAgIGNvbnN0IGFjdGl2ZSA9IHRoaXMuc291cmNlRmlsZT8ucGF0aCA9PT0gZW50cnkuZmlsZVBhdGggJiYgdGhpcy5ibG9jaz8uaWQgPT09IGVudHJ5LmlkO1xuICAgICAgY29uc3QgYnV0dG9uID0gc2VjdGlvbi5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogYWN0aXZlID8gXCJsb2NhbC1taW5kbWFwLWVudHJ5IGlzLWFjdGl2ZVwiIDogXCJsb2NhbC1taW5kbWFwLWVudHJ5XCIgfSk7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW50cnktdGl0bGVcIiwgdGV4dDogZW50cnkudGl0bGUgfHwgZW50cnkucm9vdFRpdGxlIHx8IFwiVW50aXRsZWQgbWluZG1hcFwiIH0pO1xuICAgICAgYnV0dG9uLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVudHJ5LXBhdGhcIiwgdGV4dDogYCR7ZW50cnkuZmlsZVBhdGh9IFx1MDBCNyBsaW5lICR7ZW50cnkubGluZX1gIH0pO1xuICAgICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgdm9pZCB0aGlzLm9wZW5JbmRleEVudHJ5KGVudHJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyTWFpbihjb250YWluZXI6IEhUTUxFbGVtZW50LCBzdGF0dXM/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB0b29sYmFyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXRvb2xiYXJcIiB9KTtcbiAgICBjb25zdCB0aXRsZUdyb3VwID0gdG9vbGJhci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1oZWFkaW5nXCIgfSk7XG4gICAgdGl0bGVHcm91cC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcImxvY2FsLW1pbmRtYXAtdGl0bGVcIixcbiAgICAgIHRleHQ6IHRoaXMuYmxvY2s/LnRpdGxlID8/IHRoaXMuc291cmNlRmlsZT8uYmFzZW5hbWUgPz8gXCJNYXJrZG93biBNaW5kbWFwXCJcbiAgICB9KTtcbiAgICB0aXRsZUdyb3VwLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwibG9jYWwtbWluZG1hcC1zdWJ0aXRsZVwiLFxuICAgICAgdGV4dDogdGhpcy5ibG9jayAmJiB0aGlzLnNvdXJjZUZpbGVcbiAgICAgICAgPyBgJHt0aGlzLnNvdXJjZUZpbGUucGF0aH0gXHUwMEI3IGxpbmVzICR7dGhpcy5ibG9jay5zdGFydExpbmUgKyAxfS0ke3RoaXMuYmxvY2suZW5kTGluZSArIDF9YFxuICAgICAgICA6IHRoaXMuc291cmNlRmlsZVxuICAgICAgICAgID8gYCR7dGhpcy5zb3VyY2VGaWxlLnBhdGh9IFx1MDBCNyBubyBtaW5kbWFwIGJsb2NrYFxuICAgICAgICAgIDogXCJDaG9vc2UgYSBtaW5kbWFwIG9yIGNyZWF0ZSBvbmUgaW4gdGhlIGFjdGl2ZSBmaWxlLlwiXG4gICAgfSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiSW5kdWNlIHBhcmVudFwiLCAoKSA9PiB0aGlzLnByb21wdEluZHVjZVBhcmVudCgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPj0gMik7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiRm9jdXNcIiwgKCkgPT4gdGhpcy5mb2N1c1NlbGVjdGVkTm9kZSgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPiAwKTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCItXCIsICgpID0+IHRoaXMuc2V0U2NhbGUodGhpcy5zY2FsZSAtIDAuMSksIEJvb2xlYW4odGhpcy5ibG9jaykpO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIitcIiwgKCkgPT4gdGhpcy5zZXRTY2FsZSh0aGlzLnNjYWxlICsgMC4xKSwgQm9vbGVhbih0aGlzLmJsb2NrKSk7XG5cbiAgICBpZiAoc3RhdHVzKSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtd2FybmluZ1wiLCB0ZXh0OiBzdGF0dXMgfSk7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUpIHtcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbXB0eVwiLCB0ZXh0OiBcIk9wZW4gYSBNYXJrZG93biBmaWxlIG9yIGNob29zZSBhIG1pbmRtYXAgZnJvbSB0aGUgZGFzaGJvYXJkLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuYmxvY2spIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVtcHR5XCIgfSk7XG4gICAgICBlbXB0eS5jcmVhdGVEaXYoeyB0ZXh0OiBcIlRoaXMgZmlsZSBoYXMgbm8gbWluZG1hcCBibG9jay5cIiB9KTtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGVtcHR5LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDcmVhdGUgbWluZG1hcCBpbiBjdXJyZW50IGZpbGVcIiB9KTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnBsdWdpbi5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSgpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMubm9kZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW1wdHlcIiwgdGV4dDogXCJUaGUgc2VsZWN0ZWQgbWluZG1hcCBibG9jayBpcyBlbXB0eS5cIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdGFnZSA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zdGFnZVwiIH0pO1xuICAgIHN0YWdlLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgc3RhZ2Uuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgc3RhZ2UuYWRkRXZlbnRMaXN0ZW5lcihcInNjcm9sbFwiLCAoKSA9PiB7XG4gICAgICB0aGlzLnNjcm9sbExlZnQgPSBzdGFnZS5zY3JvbGxMZWZ0O1xuICAgICAgdGhpcy5zY3JvbGxUb3AgPSBzdGFnZS5zY3JvbGxUb3A7XG4gICAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgICB0aGlzLnNjaGVkdWxlU3RhdGVQZXJzaXN0KCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzdXJmYWNlID0gc3RhZ2UuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc3VyZmFjZVwiIH0pO1xuICAgIHN1cmZhY2Uuc3R5bGUudHJhbnNmb3JtID0gYHNjYWxlKCR7dGhpcy5zY2FsZX0pYDtcbiAgICBzdXJmYWNlLnN0eWxlLnRyYW5zZm9ybU9yaWdpbiA9IFwidG9wIGxlZnRcIjtcbiAgICBjb25zdCBsYXlvdXRzID0gbGF5b3V0Tm9kZXModGhpcy5ub2RlcywgdGhpcy5jb2xsYXBzZWRJZHMpO1xuICAgIGNvbnN0IG1heFggPSBNYXRoLm1heCguLi5sYXlvdXRzLm1hcCgoZW50cnkpID0+IGVudHJ5LngpLCAwKSArIDM0MDtcbiAgICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4ubGF5b3V0cy5tYXAoKGVudHJ5KSA9PiBlbnRyeS55KSwgMCkgKyAxNDA7XG4gICAgc3VyZmFjZS5zdHlsZS53aWR0aCA9IGAke21heFh9cHhgO1xuICAgIHN1cmZhY2Uuc3R5bGUuaGVpZ2h0ID0gYCR7bWF4WX1weGA7XG5cbiAgICBjb25zdCBzdmcgPSBzdXJmYWNlLmNyZWF0ZVN2ZyhcInN2Z1wiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLWxpbmtzXCIgfSk7XG4gICAgc3ZnLnNldEF0dHIoXCJ3aWR0aFwiLCBTdHJpbmcobWF4WCkpO1xuICAgIHN2Zy5zZXRBdHRyKFwiaGVpZ2h0XCIsIFN0cmluZyhtYXhZKSk7XG4gICAgZm9yIChjb25zdCBsYXlvdXQgb2YgbGF5b3V0cykge1xuICAgICAgaWYgKCFsYXlvdXQucGFyZW50SWQpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcGFyZW50ID0gbGF5b3V0cy5maW5kKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCA9PT0gbGF5b3V0LnBhcmVudElkKTtcbiAgICAgIGlmICghcGFyZW50KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHBhdGggPSBzdmcuY3JlYXRlU3ZnKFwicGF0aFwiKTtcbiAgICAgIGNvbnN0IHN0YXJ0WCA9IHBhcmVudC54ICsgMjIwO1xuICAgICAgY29uc3Qgc3RhcnRZID0gcGFyZW50LnkgKyAyODtcbiAgICAgIGNvbnN0IGVuZFggPSBsYXlvdXQueDtcbiAgICAgIGNvbnN0IGVuZFkgPSBsYXlvdXQueSArIDI4O1xuICAgICAgY29uc3QgbWlkWCA9IHN0YXJ0WCArIE1hdGgubWF4KDQwLCAoZW5kWCAtIHN0YXJ0WCkgLyAyKTtcbiAgICAgIHBhdGguc2V0QXR0cihcImRcIiwgYE0gJHtzdGFydFh9ICR7c3RhcnRZfSBDICR7bWlkWH0gJHtzdGFydFl9LCAke21pZFh9ICR7ZW5kWX0sICR7ZW5kWH0gJHtlbmRZfWApO1xuICAgICAgcGF0aC5zZXRBdHRyKFwiY2xhc3NcIiwgXCJsb2NhbC1taW5kbWFwLWxpbmtcIik7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBsYXlvdXQgb2YgbGF5b3V0cykge1xuICAgICAgdGhpcy5yZW5kZXJOb2RlKHN1cmZhY2UsIGxheW91dCk7XG4gICAgfVxuXG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgc3RhZ2Uuc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcbiAgICAgIHN0YWdlLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgIH0sIDApO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJOb2RlKHN1cmZhY2U6IEhUTUxFbGVtZW50LCBsYXlvdXQ6IE5vZGVMYXlvdXQpOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbGF5b3V0Lm5vZGU7XG4gICAgY29uc3Qgc2VsZWN0ZWQgPSB0aGlzLnNlbGVjdGVkSWRzLmhhcyhub2RlLmlkKTtcbiAgICBjb25zdCBjYXJkID0gc3VyZmFjZS5jcmVhdGVEaXYoeyBjbHM6IHNlbGVjdGVkID8gXCJsb2NhbC1taW5kbWFwLW5vZGUgaXMtc2VsZWN0ZWRcIiA6IFwibG9jYWwtbWluZG1hcC1ub2RlXCIgfSk7XG4gICAgY2FyZC5zdHlsZS5sZWZ0ID0gYCR7bGF5b3V0Lnh9cHhgO1xuICAgIGNhcmQuc3R5bGUudG9wID0gYCR7bGF5b3V0Lnl9cHhgO1xuICAgIGNhcmQuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgaWYgKChldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLnRhZ05hbWUgPT09IFwiSU5QVVRcIiB8fCAoZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lID09PSBcIkJVVFRPTlwiKSByZXR1cm47XG4gICAgICB0aGlzLnNlbGVjdE5vZGUobm9kZS5pZCwgZXZlbnQubWV0YUtleSB8fCBldmVudC5jdHJsS2V5IHx8IGV2ZW50LnNoaWZ0S2V5KTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHJvdyA9IGNhcmQuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbm9kZS1yb3dcIiB9KTtcbiAgICBjb25zdCBzZWxlY3QgPSByb3cuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLXNlbGVjdFwiIH0pO1xuICAgIHNlbGVjdC50eXBlID0gXCJjaGVja2JveFwiO1xuICAgIHNlbGVjdC5jaGVja2VkID0gc2VsZWN0ZWQ7XG4gICAgc2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKCkgPT4gdGhpcy5zZWxlY3ROb2RlKG5vZGUuaWQsIHRydWUpKTtcblxuICAgIGNvbnN0IGNvbGxhcHNlID0gcm93LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtY29sbGFwc2VcIiwgdGV4dDogbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwID8gKHRoaXMuY29sbGFwc2VkSWRzLmhhcyhub2RlLmlkKSA/IFwiK1wiIDogXCItXCIpIDogXCJcIiB9KTtcbiAgICBjb2xsYXBzZS50eXBlID0gXCJidXR0b25cIjtcbiAgICBjb2xsYXBzZS5kaXNhYmxlZCA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAwO1xuICAgIGNvbGxhcHNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIHRoaXMudG9nZ2xlQ29sbGFwc2Uobm9kZS5pZCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpbnB1dCA9IHJvdy5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbm9kZS10aXRsZVwiIH0pO1xuICAgIGlucHV0LmRhdGFzZXQubm9kZUlkID0gbm9kZS5pZDtcbiAgICBpbnB1dC52YWx1ZSA9IG5vZGUudGl0bGU7XG4gICAgaW5wdXQucGxhY2Vob2xkZXIgPSBcIlVudGl0bGVkXCI7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzXCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2VsZWN0ZWRJZHMgPSBuZXcgU2V0KFtub2RlLmlkXSk7XG4gICAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgICBjYXJkLmFkZENsYXNzKFwiaXMtc2VsZWN0ZWRcIik7XG4gICAgICBzZWxlY3QuY2hlY2tlZCA9IHRydWU7XG4gICAgfSk7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImJsdXJcIiwgKCkgPT4gdm9pZCB0aGlzLmNvbW1pdFRpdGxlKG5vZGUuaWQsIGlucHV0LnZhbHVlKSk7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2ZW50KSA9PiB0aGlzLmhhbmRsZU5vZGVLZXlkb3duKGV2ZW50LCBub2RlLmlkLCBpbnB1dCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVOb2RlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCwgbm9kZUlkOiBzdHJpbmcsIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLmNvbW1pdFRpdGxlKG5vZGVJZCwgaW5wdXQudmFsdWUsIHsgc2tpcFJlbmRlcjogdHJ1ZSB9KS50aGVuKCgpID0+IHRoaXMuYXBwbHlPcGVyYXRpb24oaW5zZXJ0U2libGluZ0FmdGVyKHRoaXMubm9kZXMsIG5vZGVJZCwgXCJcIikpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJUYWJcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHZvaWQgdGhpcy5jb21taXRUaXRsZShub2RlSWQsIGlucHV0LnZhbHVlLCB7IHNraXBSZW5kZXI6IHRydWUgfSkudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gb3V0ZGVudE5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKSA6IGluZGVudE5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKSlcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICgoZXZlbnQua2V5ID09PSBcIkJhY2tzcGFjZVwiIHx8IGV2ZW50LmtleSA9PT0gXCJEZWxldGVcIikgJiYgaW5wdXQudmFsdWUudHJpbSgpID09PSBcIlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLmFwcGx5T3BlcmF0aW9uKGRlbGV0ZUVtcHR5Tm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGNvbW1pdFRpdGxlKG5vZGVJZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBvcHRpb25zOiB7IHNraXBSZW5kZXI/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vZGUgPSBmaW5kTm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpO1xuICAgIGlmICghbm9kZSB8fCBub2RlLnRpdGxlID09PSB0aXRsZSkgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMuYXBwbHlPcGVyYXRpb24odXBkYXRlTm9kZVRpdGxlKHRoaXMubm9kZXMsIG5vZGVJZCwgdGl0bGUpLCBvcHRpb25zKTtcbiAgfVxuXG4gIHByaXZhdGUgc2VsZWN0Tm9kZShub2RlSWQ6IHN0cmluZywgYWRkaXRpdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAoIWFkZGl0aXZlKSB0aGlzLnNlbGVjdGVkSWRzLmNsZWFyKCk7XG4gICAgaWYgKGFkZGl0aXZlICYmIHRoaXMuc2VsZWN0ZWRJZHMuaGFzKG5vZGVJZCkpIHtcbiAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuZGVsZXRlKG5vZGVJZCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuYWRkKG5vZGVJZCk7XG4gICAgfVxuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzZShub2RlSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICh0aGlzLmNvbGxhcHNlZElkcy5oYXMobm9kZUlkKSkgdGhpcy5jb2xsYXBzZWRJZHMuZGVsZXRlKG5vZGVJZCk7XG4gICAgZWxzZSB0aGlzLmNvbGxhcHNlZElkcy5hZGQobm9kZUlkKTtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0aGlzLnNjaGVkdWxlU3RhdGVQZXJzaXN0KCk7XG4gIH1cblxuICBwcml2YXRlIHNldFNjYWxlKG5leHQ6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMuc2NhbGUgPSBNYXRoLm1pbigxLjgsIE1hdGgubWF4KDAuNSwgTnVtYmVyKG5leHQudG9GaXhlZCgyKSkpKTtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0aGlzLnNjaGVkdWxlU3RhdGVQZXJzaXN0KCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGFwcGx5T3BlcmF0aW9uKHJlc3VsdDogT3V0bGluZU9wZXJhdGlvblJlc3VsdCwgb3B0aW9uczogeyBza2lwUmVuZGVyPzogYm9vbGVhbiB9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgbmV3IE5vdGljZShyZXN1bHQucmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5ub2RlcyA9IHJlc3VsdC5ub2RlcztcbiAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChyZXN1bHQuZm9jdXNJZCA/IFtyZXN1bHQuZm9jdXNJZF0gOiBbLi4udGhpcy5zZWxlY3RlZElkc10uZmlsdGVyKChpZCkgPT4gZmluZE5vZGUodGhpcy5ub2RlcywgaWQpKSk7XG4gICAgY29uc3Qgd3JpdHRlbiA9IGF3YWl0IHRoaXMud3JpdGVOb2Rlc1RvTWFya2Rvd24oKTtcbiAgICBpZiAoIXdyaXR0ZW4pIHJldHVybjtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgaWYgKCFvcHRpb25zLnNraXBSZW5kZXIpIHRoaXMucmVuZGVyKCk7XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gdGhpcy5mb2N1c1NlbGVjdGVkTm9kZSgpLCAwKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgd3JpdGVOb2Rlc1RvTWFya2Rvd24oKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUgfHwgIXRoaXMuYmxvY2spIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBzb3VyY2UgbWluZG1hcCBibG9jayBsb2FkZWQuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBtYXJrZG93biA9IGF3YWl0IHRoaXMucGx1Z2luLnJlYWRNYXJrZG93bkZpbGUodGhpcy5zb3VyY2VGaWxlKTtcbiAgICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3MobWFya2Rvd24sIHsgc291cmNlUGF0aDogdGhpcy5zb3VyY2VGaWxlLnBhdGgsIGZhbGxiYWNrVGl0bGU6IHRoaXMuc291cmNlRmlsZS5iYXNlbmFtZSB9KTtcbiAgICBjb25zdCBmcmVzaEJsb2NrID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSB0aGlzLmJsb2NrPy5pZCk7XG4gICAgaWYgKCFmcmVzaEJsb2NrKSB7XG4gICAgICBuZXcgTm90aWNlKFwiVGhlIHNvdXJjZSBtaW5kbWFwIGJsb2NrIG5vIGxvbmdlciBleGlzdHMuXCIpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBuZXh0ID0gcmVwbGFjZU1pbmRtYXBCbG9jayhtYXJrZG93biwgZnJlc2hCbG9jaywgdGhpcy5ub2RlcywgZnJlc2hCbG9jay50aXRsZSk7XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVNYXJrZG93bkZpbGUodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoSW5kZXhGb3JGaWxlKHRoaXMuc291cmNlRmlsZSwgbmV4dCk7XG4gICAgY29uc3QgbmV4dEJsb2NrID0gcGFyc2VNaW5kbWFwQmxvY2tzKG5leHQsIHsgc291cmNlUGF0aDogdGhpcy5zb3VyY2VGaWxlLnBhdGgsIGZhbGxiYWNrVGl0bGU6IHRoaXMuc291cmNlRmlsZS5iYXNlbmFtZSB9KS5maW5kKFxuICAgICAgKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSBmcmVzaEJsb2NrLmlkXG4gICAgKTtcbiAgICBpZiAobmV4dEJsb2NrKSB7XG4gICAgICB0aGlzLmJsb2NrID0gbmV4dEJsb2NrO1xuICAgICAgdGhpcy5wbHVnaW4uZ2V0RmlsZUNhY2hlKHRoaXMuc291cmNlRmlsZS5wYXRoKS5sYXN0Q29udGVudEhhc2ggPSBuZXh0QmxvY2suY29udGVudEhhc2g7XG4gICAgfVxuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb3BlbkluZGV4RW50cnkoZW50cnk6IE1pbmRtYXBJbmRleEVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChlbnRyeS5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIk1pbmRtYXAgc291cmNlIGZpbGUgbm8gbG9uZ2VyIGV4aXN0cy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMucGx1Z2luLnNldEFjdGl2ZUJsb2NrRm9yRmlsZShmaWxlLnBhdGgsIGVudHJ5LmlkKTtcbiAgICBjb25zdCBleGlzdGluZ1ZpZXcgPSB0aGlzLnBsdWdpbi5maW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlKTtcbiAgICBpZiAoIWV4aXN0aW5nVmlldykge1xuICAgICAgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoZmFsc2UpLm9wZW5GaWxlKGZpbGUsIHsgYWN0aXZlOiBmYWxzZSB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZUJsb2NrKGZpbGUsIGVudHJ5LmlkKTtcbiAgfVxuXG4gIHByaXZhdGUgY3VycmVudEZpbGVFbnRyaWVzKCk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlKSByZXR1cm4gW107XG4gICAgcmV0dXJuIHRoaXMucGx1Z2luLmdldEluZGV4RW50cmllc0ZvckZpbGUodGhpcy5zb3VyY2VGaWxlLnBhdGgpO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVDYWNoZSgpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSB8fCAhdGhpcy5ibG9jaykgcmV0dXJuO1xuICAgIGNvbnN0IGNhY2hlID0gdGhpcy5wbHVnaW4uZ2V0RmlsZUNhY2hlKHRoaXMuc291cmNlRmlsZS5wYXRoKTtcbiAgICBjYWNoZS5hY3RpdmVCbG9ja0lkID0gdGhpcy5ibG9jay5pZDtcbiAgICBjYWNoZS5zZWxlY3RlZElkcyA9IFsuLi50aGlzLnNlbGVjdGVkSWRzXTtcbiAgICBjYWNoZS5jb2xsYXBzZWRJZHMgPSBbLi4udGhpcy5jb2xsYXBzZWRJZHNdO1xuICAgIGNhY2hlLnNjYWxlID0gdGhpcy5zY2FsZTtcbiAgICBjYWNoZS5zY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgIGNhY2hlLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgIGNhY2hlLmxhc3RDb250ZW50SGFzaCA9IHRoaXMuYmxvY2suY29udGVudEhhc2g7XG4gIH1cblxuICBwcml2YXRlIHNjaGVkdWxlU3RhdGVQZXJzaXN0KCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5wbHVnaW4uc2V0dGluZ3MucGVyc2lzdENvbGxhcHNlU3RhdGUpIHJldHVybjtcbiAgICBpZiAodGhpcy5zdGF0ZVBlcnNpc3RUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnN0YXRlUGVyc2lzdFRpbWVyKTtcbiAgICB0aGlzLnN0YXRlUGVyc2lzdFRpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgdGhpcy5zdGF0ZVBlcnNpc3RUaW1lciA9IG51bGw7XG4gICAgICB2b2lkIHRoaXMucGVyc2lzdFN0YXRlKCk7XG4gICAgfSwgNTAwKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcGVyc2lzdFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlIHx8ICF0aGlzLmJsb2NrIHx8ICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkgcmV0dXJuO1xuICAgIGNvbnN0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUpO1xuICAgIGNvbnN0IHN0YXRlOiBNaW5kbWFwU3RhdGVEYXRhID0gcmVhZE1pbmRtYXBTdGF0ZShtYXJrZG93bik7XG4gICAgc3RhdGUuYmxvY2tzW3RoaXMuYmxvY2suaWRdID0ge1xuICAgICAgY29sbGFwc2VkSWRzOiBbLi4udGhpcy5jb2xsYXBzZWRJZHNdLFxuICAgICAgc2NhbGU6IHRoaXMuc2NhbGUsXG4gICAgICBzY3JvbGxMZWZ0OiB0aGlzLnNjcm9sbExlZnQsXG4gICAgICBzY3JvbGxUb3A6IHRoaXMuc2Nyb2xsVG9wLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICB9O1xuICAgIGNvbnN0IG5leHQgPSB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93biwgc3RhdGUpO1xuICAgIGlmIChuZXh0ID09PSBtYXJrZG93bikgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLndyaXRlTWFya2Rvd25GaWxlKHRoaXMuc291cmNlRmlsZSwgbmV4dCk7XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ucmVmcmVzaEluZGV4Rm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUsIG5leHQpO1xuICB9XG5cbiAgcHJpdmF0ZSBhZGRUb29sYmFyQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRleHQ6IHN0cmluZywgb25DbGljazogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sIGVuYWJsZWQgPSB0cnVlKTogdm9pZCB7XG4gICAgY29uc3QgYnV0dG9uID0gY29udGFpbmVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dCB9KTtcbiAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgYnV0dG9uLmRpc2FibGVkID0gIWVuYWJsZWQ7XG4gICAgYnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIG9uQ2xpY2soKTtcbiAgICB9KTtcbiAgfVxufVxuXG5jbGFzcyBQYXJlbnRUaXRsZU1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0VGl0bGU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBvblN1Ym1pdDogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQpIHtcbiAgICBzdXBlcihhcHApO1xuICB9XG5cbiAgb25PcGVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJJbmR1Y2UgcGFyZW50XCIgfSk7XG4gICAgY29uc3QgaW5wdXQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLW1vZGFsLWlucHV0XCIgfSk7XG4gICAgaW5wdXQudmFsdWUgPSB0aGlzLmRlZmF1bHRUaXRsZTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHtcbiAgICAgIGlmIChldmVudC5rZXkgIT09IFwiRW50ZXJcIikgcmV0dXJuO1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHRoaXMuc3VibWl0KGlucHV0LnZhbHVlKTtcbiAgICB9KTtcbiAgICBuZXcgU2V0dGluZyhjb250ZW50RWwpLmFkZEJ1dHRvbigoYnV0dG9uKSA9PlxuICAgICAgYnV0dG9uXG4gICAgICAgIC5zZXRCdXR0b25UZXh0KFwiQ29uZmlybVwiKVxuICAgICAgICAuc2V0Q3RhKClcbiAgICAgICAgLm9uQ2xpY2soKCkgPT4gdGhpcy5zdWJtaXQoaW5wdXQudmFsdWUpKVxuICAgICk7XG4gICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgaW5wdXQuZm9jdXMoKTtcbiAgICAgIGlucHV0LnNlbGVjdCgpO1xuICAgIH0sIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBzdWJtaXQodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMub25TdWJtaXQodGl0bGUudHJpbSgpIHx8IHRoaXMuZGVmYXVsdFRpdGxlKTtcbiAgICB0aGlzLmNsb3NlKCk7XG4gIH1cbn1cblxuY2xhc3MgTWFya2Rvd25NaW5kbWFwU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IE1hcmtkb3duTWluZG1hcFBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIk9wZW4gaW4gcmlnaHQgc2lkZWJhclwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbkluUmlnaHRTaWRlYmFyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXIgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiUGVyc2lzdCB2aWV3IHN0YXRlXCIpXG4gICAgICAuc2V0RGVzYyhcIlNhdmUgY29sbGFwc2VkIG5vZGVzLCB6b29tLCBhbmQgc2Nyb2xsIGluIGEgaGlkZGVuIG1hbmFnZWQgYmxvY2sgaW4gdGhlIE1hcmtkb3duIGZpbGUuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGVyc2lzdENvbGxhcHNlU3RhdGUgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRm9sbG93IGFjdGl2ZSBmaWxlXCIpXG4gICAgICAuc2V0RGVzYyhcIktlZXAgdGhlIHBhbmVsIHBvaW50ZWQgYXQgdGhlIGFjdGl2ZSBNYXJrZG93biBmaWxlIHdpdGhvdXQgY2xlYXJpbmcgc3RhdGUgb24gY3Vyc29yIG1vdmVtZW50LlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9sbG93QWN0aXZlRmlsZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9sbG93QWN0aXZlRmlsZSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJTY2FuIHZhdWx0IG9uIG9wZW5cIilcbiAgICAgIC5zZXREZXNjKFwiQnVpbGQgdGhlIGRhc2hib2FyZCBpbmRleCBmcm9tIGFsbCBNYXJrZG93biBmaWxlcyBhZnRlciBPYnNpZGlhbiBsYXlvdXQgaXMgcmVhZHkuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zY2FuVmF1bHRPbk9wZW4pLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNjYW5WYXVsdE9uT3BlbiA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXBsYWNlV2hvbGVFZGl0b3JEYXRhKGVkaXRvcjogRWRpdG9yLCByZXBsYWNlbWVudDogc3RyaW5nKTogdm9pZCB7XG4gIGNvbnN0IGxhc3RMaW5lID0gTWF0aC5tYXgoMCwgZWRpdG9yLmxpbmVDb3VudCgpIC0gMSk7XG4gIGNvbnN0IGVuZCA9IHsgbGluZTogbGFzdExpbmUsIGNoOiBlZGl0b3IuZ2V0TGluZShsYXN0TGluZSkubGVuZ3RoIH07XG4gIGVkaXRvci5yZXBsYWNlUmFuZ2UocmVwbGFjZW1lbnQsIHsgbGluZTogMCwgY2g6IDAgfSwgZW5kKTtcbn1cblxuZnVuY3Rpb24gbGF5b3V0Tm9kZXMobm9kZXM6IE91dGxpbmVOb2RlW10sIGNvbGxhcHNlZElkczogU2V0PHN0cmluZz4pOiBOb2RlTGF5b3V0W10ge1xuICBjb25zdCByZXN1bHQ6IE5vZGVMYXlvdXRbXSA9IFtdO1xuICBsZXQgcm93ID0gMDtcbiAgY29uc3QgdmlzaXQgPSAobm9kZTogT3V0bGluZU5vZGUsIGRlcHRoOiBudW1iZXIsIHBhcmVudElkOiBzdHJpbmcgfCBudWxsKSA9PiB7XG4gICAgcmVzdWx0LnB1c2goe1xuICAgICAgbm9kZSxcbiAgICAgIGRlcHRoLFxuICAgICAgcGFyZW50SWQsXG4gICAgICB4OiAzNiArIGRlcHRoICogMjYwLFxuICAgICAgeTogMzYgKyByb3cgKiA3OFxuICAgIH0pO1xuICAgIHJvdyArPSAxO1xuICAgIGlmIChjb2xsYXBzZWRJZHMuaGFzKG5vZGUuaWQpKSByZXR1cm47XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB2aXNpdChjaGlsZCwgZGVwdGggKyAxLCBub2RlLmlkKTtcbiAgfTtcbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB2aXNpdChub2RlLCAwLCBudWxsKTtcbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZmluZE5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU5vZGUgfCBudWxsIHtcbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgaWYgKG5vZGUuaWQgPT09IG5vZGVJZCkgcmV0dXJuIG5vZGU7XG4gICAgY29uc3QgY2hpbGQgPSBmaW5kTm9kZShub2RlLmNoaWxkcmVuLCBub2RlSWQpO1xuICAgIGlmIChjaGlsZCkgcmV0dXJuIGNoaWxkO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjc3NFc2NhcGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgQ1NTICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBDU1MuZXNjYXBlID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiBDU1MuZXNjYXBlKHZhbHVlKTtcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1tcIlxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuIiwgImV4cG9ydCBjb25zdCBNQVJLRE9XTl9NSU5ETUFQX1NUQVRFX0JFR0lOID0gXCI8IS0tIEJFR0lOIE1BUktET1dOLU1JTkRNQVAtU1RBVEVcIjtcbmV4cG9ydCBjb25zdCBNQVJLRE9XTl9NSU5ETUFQX1NUQVRFX0VORCA9IFwiRU5EIE1BUktET1dOLU1JTkRNQVAtU1RBVEUgLS0+XCI7XG5leHBvcnQgY29uc3QgTEVHQUNZX01JTkRNQVBfU1RBVEVfQkVHSU4gPSBcIjwhLS0gQkVHSU4gTE9DQUwtT0JTSURJQU4tTUlORE1BUC1TVEFURVwiO1xuZXhwb3J0IGNvbnN0IExFR0FDWV9NSU5ETUFQX1NUQVRFX0VORCA9IFwiRU5EIExPQ0FMLU9CU0lESUFOLU1JTkRNQVAtU1RBVEUgLS0+XCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3V0bGluZU5vZGUge1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICBjaGlsZHJlbjogT3V0bGluZU5vZGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaW5kbWFwQmxvY2sge1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICByb290VGl0bGU6IHN0cmluZztcbiAgc3RhcnRMaW5lOiBudW1iZXI7XG4gIGVuZExpbmU6IG51bWJlcjtcbiAgY29udGVudFN0YXJ0TGluZTogbnVtYmVyO1xuICBjb250ZW50RW5kTGluZTogbnVtYmVyO1xuICByYXdDb250ZW50OiBzdHJpbmc7XG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdO1xuICBjb250ZW50SGFzaDogc3RyaW5nO1xuICBtZXRhZGF0YU1pc3Npbmc6IGJvb2xlYW47XG4gIHdhcm5pbmc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWluZG1hcEluZGV4RW50cnkge1xuICBpZDogc3RyaW5nO1xuICB0aXRsZTogc3RyaW5nO1xuICByb290VGl0bGU6IHN0cmluZztcbiAgZmlsZVBhdGg6IHN0cmluZztcbiAgbGluZTogbnVtYmVyO1xuICBjb250ZW50SGFzaDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pbmRtYXBTdGF0ZURhdGEge1xuICBzY2hlbWFWZXJzaW9uOiAxO1xuICBibG9ja3M6IFJlY29yZDxcbiAgICBzdHJpbmcsXG4gICAge1xuICAgICAgY29sbGFwc2VkSWRzOiBzdHJpbmdbXTtcbiAgICAgIHNjYWxlPzogbnVtYmVyO1xuICAgICAgc2Nyb2xsTGVmdD86IG51bWJlcjtcbiAgICAgIHNjcm9sbFRvcD86IG51bWJlcjtcbiAgICAgIHVwZGF0ZWRBdDogc3RyaW5nO1xuICAgIH1cbiAgPjtcbn1cblxuZXhwb3J0IHR5cGUgT3V0bGluZU9wZXJhdGlvblJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZTsgbm9kZXM6IE91dGxpbmVOb2RlW107IGZvY3VzSWQ/OiBzdHJpbmcgfVxuICB8IHsgb2s6IGZhbHNlOyByZWFzb246IHN0cmluZyB9O1xuXG5pbnRlcmZhY2UgUGFyc2VNaW5kbWFwT3B0aW9ucyB7XG4gIHNvdXJjZVBhdGg/OiBzdHJpbmc7XG4gIGZhbGxiYWNrVGl0bGU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBCbG9ja0NhbmRpZGF0ZSB7XG4gIHN0YXJ0TGluZTogbnVtYmVyO1xuICBlbmRMaW5lOiBudW1iZXI7XG4gIGNvbnRlbnRTdGFydExpbmU6IG51bWJlcjtcbiAgY29udGVudEVuZExpbmU6IG51bWJlcjtcbiAgZmVuY2U6IHN0cmluZztcbiAgYXR0cnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIHJhd0F0dHJzOiBzdHJpbmc7XG4gIHJhd0NvbnRlbnQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTWluZG1hcEJsb2NrcyhtYXJrZG93bjogc3RyaW5nLCBvcHRpb25zOiBQYXJzZU1pbmRtYXBPcHRpb25zID0ge30pOiBNaW5kbWFwQmxvY2tbXSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhzdHJpcE1pbmRtYXBTdGF0ZUJsb2NrKG1hcmtkb3duKSk7XG4gIGNvbnN0IGxpbmVzID0gbm9ybWFsaXplZC5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IGZpbmRNaW5kbWFwRmVuY2VzKGxpbmVzKTtcbiAgcmV0dXJuIGNhbmRpZGF0ZXMubWFwKChjYW5kaWRhdGUsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VPdXRsaW5lQmxvY2tMaW5lcyhjYW5kaWRhdGUucmF3Q29udGVudC5zcGxpdChcIlxcblwiKSk7XG4gICAgY29uc3Qgbm9kZXMgPSBwYXJzZWQub2sgPyBwYXJzZWQubm9kZXMgOiBbXTtcbiAgICBjb25zdCByb290VGl0bGUgPSBmaXJzdFJvb3RUaXRsZShub2Rlcyk7XG4gICAgY29uc3QgZ2VuZXJhdGVkSWQgPSBzdGFibGVNaW5kbWFwSWQob3B0aW9ucy5zb3VyY2VQYXRoID8/IFwiXCIsIGluZGV4LCBjYW5kaWRhdGUucmF3Q29udGVudCk7XG4gICAgY29uc3QgaWQgPSBjYW5kaWRhdGUuYXR0cnMuaWQ/LnRyaW0oKSB8fCBnZW5lcmF0ZWRJZDtcbiAgICBjb25zdCB0aXRsZSA9IGNhbmRpZGF0ZS5hdHRycy50aXRsZT8udHJpbSgpIHx8IHJvb3RUaXRsZSB8fCBvcHRpb25zLmZhbGxiYWNrVGl0bGUgfHwgXCJNaW5kbWFwXCI7XG4gICAgcmV0dXJuIHtcbiAgICAgIGlkLFxuICAgICAgdGl0bGUsXG4gICAgICByb290VGl0bGUsXG4gICAgICBzdGFydExpbmU6IGNhbmRpZGF0ZS5zdGFydExpbmUsXG4gICAgICBlbmRMaW5lOiBjYW5kaWRhdGUuZW5kTGluZSxcbiAgICAgIGNvbnRlbnRTdGFydExpbmU6IGNhbmRpZGF0ZS5jb250ZW50U3RhcnRMaW5lLFxuICAgICAgY29udGVudEVuZExpbmU6IGNhbmRpZGF0ZS5jb250ZW50RW5kTGluZSxcbiAgICAgIHJhd0NvbnRlbnQ6IGNhbmRpZGF0ZS5yYXdDb250ZW50LFxuICAgICAgbm9kZXMsXG4gICAgICBjb250ZW50SGFzaDogaGFzaFN0cmluZyhjYW5kaWRhdGUucmF3Q29udGVudCksXG4gICAgICBtZXRhZGF0YU1pc3Npbmc6ICFjYW5kaWRhdGUuYXR0cnMuaWQgfHwgIWNhbmRpZGF0ZS5hdHRycy50aXRsZSxcbiAgICAgIHdhcm5pbmc6IHBhcnNlZC5vayA/IHVuZGVmaW5lZCA6IHBhcnNlZC5yZWFzb25cbiAgICB9O1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWluZG1hcEluZGV4KG1hcmtkb3duOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcsIGZhbGxiYWNrVGl0bGU/OiBzdHJpbmcpOiBNaW5kbWFwSW5kZXhFbnRyeVtdIHtcbiAgcmV0dXJuIHBhcnNlTWluZG1hcEJsb2NrcyhtYXJrZG93biwgeyBzb3VyY2VQYXRoOiBmaWxlUGF0aCwgZmFsbGJhY2tUaXRsZSB9KS5tYXAoKGJsb2NrKSA9PiAoe1xuICAgIGlkOiBibG9jay5pZCxcbiAgICB0aXRsZTogYmxvY2sudGl0bGUsXG4gICAgcm9vdFRpdGxlOiBibG9jay5yb290VGl0bGUsXG4gICAgZmlsZVBhdGgsXG4gICAgbGluZTogYmxvY2suc3RhcnRMaW5lICsgMSxcbiAgICBjb250ZW50SGFzaDogYmxvY2suY29udGVudEhhc2hcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplTWluZG1hcEJsb2NrTWV0YWRhdGEobWFya2Rvd246IHN0cmluZywgb3B0aW9uczogUGFyc2VNaW5kbWFwT3B0aW9ucyA9IHt9KTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgYmxvY2tzID0gcGFyc2VNaW5kbWFwQmxvY2tzKG5vcm1hbGl6ZWQsIG9wdGlvbnMpO1xuICBpZiAoIWJsb2Nrcy5zb21lKChibG9jaykgPT4gYmxvY2subWV0YWRhdGFNaXNzaW5nKSkgcmV0dXJuIG5vcm1hbGl6ZWQ7XG5cbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBmb3IgKGNvbnN0IGJsb2NrIG9mIGJsb2Nrcykge1xuICAgIGlmICghYmxvY2subWV0YWRhdGFNaXNzaW5nKSBjb250aW51ZTtcbiAgICBsaW5lc1tibG9jay5zdGFydExpbmVdID0gYFxcYFxcYFxcYG1pbmRtYXAgaWQ9XCIke2VzY2FwZUF0dHJpYnV0ZShibG9jay5pZCl9XCIgdGl0bGU9XCIke2VzY2FwZUF0dHJpYnV0ZShibG9jay50aXRsZSl9XCJgO1xuICB9XG4gIHJldHVybiByZXN0b3JlRmluYWxOZXdsaW5lKG1hcmtkb3duLCBsaW5lcy5qb2luKFwiXFxuXCIpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VNaW5kbWFwQmxvY2sobWFya2Rvd246IHN0cmluZywgYmxvY2s6IFBpY2s8TWluZG1hcEJsb2NrLCBcInN0YXJ0TGluZVwiIHwgXCJlbmRMaW5lXCIgfCBcImlkXCIgfCBcInRpdGxlXCI+LCBub2RlczogT3V0bGluZU5vZGVbXSwgdGl0bGUgPSBibG9jay50aXRsZSk6IHN0cmluZyB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bik7XG4gIGNvbnN0IGxpbmVzID0gbm9ybWFsaXplZC5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgcmVwbGFjZW1lbnQgPSBzZXJpYWxpemVNaW5kbWFwQmxvY2soeyBpZDogYmxvY2suaWQsIHRpdGxlIH0sIG5vZGVzKS5zcGxpdChcIlxcblwiKTtcbiAgbGluZXMuc3BsaWNlKGJsb2NrLnN0YXJ0TGluZSwgYmxvY2suZW5kTGluZSAtIGJsb2NrLnN0YXJ0TGluZSArIDEsIC4uLnJlcGxhY2VtZW50KTtcbiAgcmV0dXJuIHJlc3RvcmVGaW5hbE5ld2xpbmUobWFya2Rvd24sIGxpbmVzLmpvaW4oXCJcXG5cIikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0TWluZG1hcEJsb2NrQXRMaW5lKG1hcmtkb3duOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgb3B0aW9uczogeyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nOyBub2Rlcz86IE91dGxpbmVOb2RlW10gfSk6IHN0cmluZyB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bik7XG4gIGNvbnN0IGxpbmVzID0gbm9ybWFsaXplZC5sZW5ndGggPiAwID8gbm9ybWFsaXplZC5zcGxpdChcIlxcblwiKSA6IFtdO1xuICBjb25zdCB0YXJnZXRMaW5lID0gTWF0aC5tYXgoMCwgTWF0aC5taW4obGluZSwgbGluZXMubGVuZ3RoKSk7XG4gIGNvbnN0IG5vZGVzID0gb3B0aW9ucy5ub2Rlcz8ubGVuZ3RoXG4gICAgPyBvcHRpb25zLm5vZGVzXG4gICAgOiBbeyBpZDogXCJuLTBcIiwgdGl0bGU6IG9wdGlvbnMudGl0bGUgfHwgXCJNaW5kbWFwXCIsIGNoaWxkcmVuOiBbXSB9XTtcbiAgY29uc3QgYmxvY2sgPSBzZXJpYWxpemVNaW5kbWFwQmxvY2soeyBpZDogb3B0aW9ucy5pZCwgdGl0bGU6IG9wdGlvbnMudGl0bGUgfHwgXCJNaW5kbWFwXCIgfSwgbm9kZXMpO1xuICBjb25zdCBwcmVmaXggPSB0YXJnZXRMaW5lID4gMCAmJiBsaW5lc1t0YXJnZXRMaW5lIC0gMV0/LnRyaW0oKSA/IFtcIlwiXSA6IFtdO1xuICBjb25zdCBzdWZmaXggPSBsaW5lc1t0YXJnZXRMaW5lXT8udHJpbSgpID8gW1wiXCJdIDogW107XG4gIGxpbmVzLnNwbGljZSh0YXJnZXRMaW5lLCAwLCAuLi5wcmVmaXgsIC4uLmJsb2NrLnNwbGl0KFwiXFxuXCIpLCAuLi5zdWZmaXgpO1xuICByZXR1cm4gcmVzdG9yZUZpbmFsTmV3bGluZShtYXJrZG93biwgbGluZXMuam9pbihcIlxcblwiKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVNaW5kbWFwQmxvY2sobWV0YWRhdGE6IHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9LCBub2RlczogT3V0bGluZU5vZGVbXSk6IHN0cmluZyB7XG4gIHJldHVybiBbXG4gICAgYFxcYFxcYFxcYG1pbmRtYXAgaWQ9XCIke2VzY2FwZUF0dHJpYnV0ZShtZXRhZGF0YS5pZCl9XCIgdGl0bGU9XCIke2VzY2FwZUF0dHJpYnV0ZShtZXRhZGF0YS50aXRsZSl9XCJgLFxuICAgIHNlcmlhbGl6ZU91dGxpbmUobm9kZXMpLFxuICAgIFwiYGBgXCJcbiAgXS5qb2luKFwiXFxuXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplT3V0bGluZShub2RlczogT3V0bGluZU5vZGVbXSwgaW5kZW50ID0gXCJcXHRcIik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBPdXRsaW5lTm9kZSwgZGVwdGg6IG51bWJlcikgPT4ge1xuICAgIGxpbmVzLnB1c2goYCR7aW5kZW50LnJlcGVhdChkZXB0aCl9LSAke25vZGUudGl0bGV9YCk7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB2aXNpdChjaGlsZCwgZGVwdGggKyAxKTtcbiAgfTtcbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB2aXNpdChub2RlLCAwKTtcbiAgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVOb2RlVGl0bGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgbG9jYXRpb24ubm9kZS50aXRsZSA9IHRpdGxlO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0U2libGluZ0FmdGVyKFxuICBub2RlczogT3V0bGluZU5vZGVbXSxcbiAgbm9kZUlkOiBzdHJpbmcsXG4gIHRpdGxlID0gXCJcIixcbiAgbmV3SWQgPSBjcmVhdGVHZW5lcmF0ZWROb2RlSWQoKVxuKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4ICsgMSwgMCwgeyBpZDogbmV3SWQsIHRpdGxlLCBjaGlsZHJlbjogW10gfSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbmV3SWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluZGVudE5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgaWYgKGxvY2F0aW9uLmluZGV4ID09PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJDYW5ub3QgaW5kZW50OiB0aGVyZSBpcyBubyBwcmV2aW91cyBzaWJsaW5nLlwiIH07XG4gIGNvbnN0IFtub2RlXSA9IGxvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShsb2NhdGlvbi5pbmRleCwgMSk7XG4gIGxvY2F0aW9uLnNpYmxpbmdzW2xvY2F0aW9uLmluZGV4IC0gMV0uY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBub2RlSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG91dGRlbnROb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGlmICghbG9jYXRpb24ucGFyZW50SWQpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkNhbm5vdCBvdXRkZW50IGEgdG9wLWxldmVsIG5vZGUuXCIgfTtcbiAgY29uc3QgcGFyZW50TG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbG9jYXRpb24ucGFyZW50SWQpO1xuICBpZiAoIXBhcmVudExvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJQYXJlbnQgbm9kZSBub3QgZm91bmQuXCIgfTtcbiAgY29uc3QgZnJlc2hMb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWZyZXNoTG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGNvbnN0IFtub2RlXSA9IGZyZXNoTG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGZyZXNoTG9jYXRpb24uaW5kZXgsIDEpO1xuICBwYXJlbnRMb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UocGFyZW50TG9jYXRpb24uaW5kZXggKyAxLCAwLCBub2RlKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBub2RlSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUVtcHR5Tm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBpZiAobG9jYXRpb24ubm9kZS50aXRsZS50cmltKCkgfHwgbG9jYXRpb24ubm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiT25seSBlbXB0eSBsZWFmIG5vZGVzIGNhbiBiZSBkZWxldGVkIHdpdGggQmFja3NwYWNlL0RlbGV0ZS5cIiB9O1xuICB9XG4gIGxvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShsb2NhdGlvbi5pbmRleCwgMSk7XG4gIGNvbnN0IGZvY3VzSWQgPSBsb2NhdGlvbi5zaWJsaW5nc1tNYXRoLm1heCgwLCBsb2NhdGlvbi5pbmRleCAtIDEpXT8uaWQgPz8gbG9jYXRpb24uc2libGluZ3NbMF0/LmlkO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluZHVjZVBhcmVudEZyb21TZWxlY3RlZChcbiAgbm9kZXM6IE91dGxpbmVOb2RlW10sXG4gIHNlbGVjdGVkSWRzOiBzdHJpbmdbXSxcbiAgdGl0bGUgPSBcIlx1NUY1Mlx1N0VCM1wiLFxuICBuZXdJZCA9IGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpXG4pOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgdW5pcXVlSWRzID0gWy4uLm5ldyBTZXQoc2VsZWN0ZWRJZHMpXTtcbiAgaWYgKHVuaXF1ZUlkcy5sZW5ndGggPCAyKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJTZWxlY3QgYXQgbGVhc3QgdHdvIHNpYmxpbmcgbm9kZXMuXCIgfTtcblxuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9ucyA9IHVuaXF1ZUlkcy5tYXAoKGlkKSA9PiBmaW5kTG9jYXRpb24obmV4dCwgaWQpKTtcbiAgaWYgKGxvY2F0aW9ucy5zb21lKChsb2NhdGlvbikgPT4gIWxvY2F0aW9uKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiU29tZSBzZWxlY3RlZCBub2RlcyBubyBsb25nZXIgZXhpc3QuXCIgfTtcbiAgY29uc3QgY29uY3JldGUgPSBsb2NhdGlvbnMgYXMgTm9uTnVsbGFibGU8UmV0dXJuVHlwZTx0eXBlb2YgZmluZExvY2F0aW9uPj5bXTtcbiAgY29uc3QgcGFyZW50S2V5ID0gY29uY3JldGVbMF0ucGFyZW50SWQgPz8gXCJfX3Jvb3RfX1wiO1xuICBpZiAoY29uY3JldGUuc29tZSgobG9jYXRpb24pID0+IChsb2NhdGlvbi5wYXJlbnRJZCA/PyBcIl9fcm9vdF9fXCIpICE9PSBwYXJlbnRLZXkpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBub2RlcyB3aXRoIHRoZSBzYW1lIHBhcmVudC5cIiB9O1xuICB9XG5cbiAgY29uc3Qgc2libGluZ3MgPSBjb25jcmV0ZVswXS5zaWJsaW5ncztcbiAgaWYgKGNvbmNyZXRlLnNvbWUoKGxvY2F0aW9uKSA9PiBsb2NhdGlvbi5zaWJsaW5ncyAhPT0gc2libGluZ3MpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBub2RlcyB3aXRoIHRoZSBzYW1lIHBhcmVudC5cIiB9O1xuICB9XG5cbiAgY29uc3Qgc29ydGVkID0gY29uY3JldGUuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gIGZvciAobGV0IGluZGV4ID0gMTsgaW5kZXggPCBzb3J0ZWQubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgaWYgKHNvcnRlZFtpbmRleF0uaW5kZXggIT09IHNvcnRlZFtpbmRleCAtIDFdLmluZGV4ICsgMSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBhZGphY2VudCBzaWJsaW5nIG5vZGVzLlwiIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmlyc3RJbmRleCA9IHNvcnRlZFswXS5pbmRleDtcbiAgY29uc3Qgc2VsZWN0ZWROb2RlcyA9IHNpYmxpbmdzLnNwbGljZShmaXJzdEluZGV4LCBzb3J0ZWQubGVuZ3RoKTtcbiAgc2libGluZ3Muc3BsaWNlKGZpcnN0SW5kZXgsIDAsIHsgaWQ6IG5ld0lkLCB0aXRsZSwgY2hpbGRyZW46IHNlbGVjdGVkTm9kZXMgfSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbmV3SWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwTWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd246IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bilcbiAgICAucmVwbGFjZShtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBcIlwiKVxuICAgIC5yZXBsYWNlKGxlZ2FjeU1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCksIFwiXCIpXG4gICAgLnJlcGxhY2UoL1xcbnszLH0kL2csIFwiXFxuXFxuXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVhZE1pbmRtYXBTdGF0ZShtYXJrZG93bjogc3RyaW5nKTogTWluZG1hcFN0YXRlRGF0YSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bik7XG4gIGNvbnN0IG1hdGNoID0gbWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKS5leGVjKG5vcm1hbGl6ZWQpID8/IGxlZ2FjeU1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCkuZXhlYyhub3JtYWxpemVkKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGVtcHR5TWluZG1hcFN0YXRlKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShtYXRjaFsxXS50cmltKCkpIGFzIE1pbmRtYXBTdGF0ZURhdGE7XG4gICAgaWYgKHBhcnNlZC5zY2hlbWFWZXJzaW9uICE9PSAxIHx8IHR5cGVvZiBwYXJzZWQuYmxvY2tzICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZC5ibG9ja3MgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBlbXB0eU1pbmRtYXBTdGF0ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZW1wdHlNaW5kbWFwU3RhdGUoKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBzZXJ0TWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd246IHN0cmluZywgc3RhdGU6IE1pbmRtYXBTdGF0ZURhdGEpOiBzdHJpbmcge1xuICBsZXQgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKS50cmltRW5kKCk7XG4gIG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLnJlcGxhY2UobGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKSwgXCJcIikudHJpbUVuZCgpO1xuICBjb25zdCBibG9jayA9IGAke01BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU59XFxuJHtKU09OLnN0cmluZ2lmeShzdGF0ZSwgbnVsbCwgMil9XFxuJHtNQVJLRE9XTl9NSU5ETUFQX1NUQVRFX0VORH1gO1xuICBpZiAobWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKS50ZXN0KG5vcm1hbGl6ZWQpKSB7XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZWQucmVwbGFjZShtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBibG9jayl9XFxuYDtcbiAgfVxuICByZXR1cm4gYCR7bm9ybWFsaXplZH1cXG5cXG4ke2Jsb2NrfVxcbmA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaGFzaCA9IDIxNjYxMzYyNjE7XG4gIGZvciAoY29uc3QgY2hhciBvZiBub3JtYWxpemVOZXdsaW5lcyh2YWx1ZSkpIHtcbiAgICBoYXNoIF49IGNoYXIuY2hhckNvZGVBdCgwKTtcbiAgICBoYXNoID0gTWF0aC5pbXVsKGhhc2gsIDE2Nzc3NjE5KTtcbiAgfVxuICByZXR1cm4gKGhhc2ggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCBcIjBcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNaW5kbWFwSWQoc2VlZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBtaW5kbWFwLSR7aGFzaFN0cmluZyhgJHtzZWVkfToke0RhdGUubm93KCl9YCkuc2xpY2UoMCwgMTApfWA7XG59XG5cbmZ1bmN0aW9uIGZpbmRNaW5kbWFwRmVuY2VzKGxpbmVzOiBzdHJpbmdbXSk6IEJsb2NrQ2FuZGlkYXRlW10ge1xuICBjb25zdCBibG9ja3M6IEJsb2NrQ2FuZGlkYXRlW10gPSBbXTtcbiAgZm9yIChsZXQgbGluZSA9IDA7IGxpbmUgPCBsaW5lcy5sZW5ndGg7IGxpbmUgKz0gMSkge1xuICAgIGNvbnN0IG9wZW4gPSBsaW5lc1tsaW5lXS5tYXRjaCgvXihgezMsfXx+ezMsfSltaW5kbWFwKD86XFxzKyguKikpP1xccyokLyk7XG4gICAgaWYgKCFvcGVuKSBjb250aW51ZTtcbiAgICBjb25zdCBmZW5jZSA9IG9wZW5bMV07XG4gICAgY29uc3QgZmVuY2VDaGFyID0gZmVuY2VbMF07XG4gICAgY29uc3QgbWluRmVuY2VMZW5ndGggPSBmZW5jZS5sZW5ndGg7XG4gICAgbGV0IGNsb3NlTGluZSA9IC0xO1xuICAgIGZvciAobGV0IGN1cnNvciA9IGxpbmUgKyAxOyBjdXJzb3IgPCBsaW5lcy5sZW5ndGg7IGN1cnNvciArPSAxKSB7XG4gICAgICBpZiAobmV3IFJlZ0V4cChgXiR7ZXNjYXBlUmVnRXhwKGZlbmNlQ2hhcil9eyR7bWluRmVuY2VMZW5ndGh9LH1cXFxccyokYCkudGVzdChsaW5lc1tjdXJzb3JdKSkge1xuICAgICAgICBjbG9zZUxpbmUgPSBjdXJzb3I7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY2xvc2VMaW5lID09PSAtMSkgY29udGludWU7XG4gICAgY29uc3QgcmF3QXR0cnMgPSBvcGVuWzJdID8/IFwiXCI7XG4gICAgY29uc3QgY29udGVudExpbmVzID0gbGluZXMuc2xpY2UobGluZSArIDEsIGNsb3NlTGluZSk7XG4gICAgYmxvY2tzLnB1c2goe1xuICAgICAgc3RhcnRMaW5lOiBsaW5lLFxuICAgICAgZW5kTGluZTogY2xvc2VMaW5lLFxuICAgICAgY29udGVudFN0YXJ0TGluZTogbGluZSArIDEsXG4gICAgICBjb250ZW50RW5kTGluZTogY2xvc2VMaW5lIC0gMSxcbiAgICAgIGZlbmNlLFxuICAgICAgYXR0cnM6IHBhcnNlQXR0cmlidXRlcyhyYXdBdHRycyksXG4gICAgICByYXdBdHRycyxcbiAgICAgIHJhd0NvbnRlbnQ6IGNvbnRlbnRMaW5lcy5qb2luKFwiXFxuXCIpXG4gICAgfSk7XG4gICAgbGluZSA9IGNsb3NlTGluZTtcbiAgfVxuICByZXR1cm4gYmxvY2tzO1xufVxuXG5mdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMocmF3QXR0cnM6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBjb25zdCByZWdleHAgPSAvKFtBLVphLXpfXVtcXHctXSopPVwiKFteXCJdKilcIi9nO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIHdoaWxlICgobWF0Y2ggPSByZWdleHAuZXhlYyhyYXdBdHRycykpICE9PSBudWxsKSB7XG4gICAgYXR0cnNbbWF0Y2hbMV1dID0gdW5lc2NhcGVBdHRyaWJ1dGUobWF0Y2hbMl0pO1xuICB9XG4gIHJldHVybiBhdHRycztcbn1cblxuZnVuY3Rpb24gcGFyc2VPdXRsaW5lQmxvY2tMaW5lcyhcbiAgYmxvY2tMaW5lczogc3RyaW5nW11cbik6IHsgb2s6IHRydWU7IG5vZGVzOiBPdXRsaW5lTm9kZVtdIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gIGNvbnN0IG1lYW5pbmdmdWxMaW5lcyA9IGJsb2NrTGluZXMuZmlsdGVyKChsaW5lKSA9PiBsaW5lLnRyaW0oKS5sZW5ndGggPiAwKTtcbiAgaWYgKG1lYW5pbmdmdWxMaW5lcy5sZW5ndGggPT09IDApIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogW10gfTtcblxuICBjb25zdCByb290czogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBjb25zdCBzdGFjazogQXJyYXk8eyBub2RlOiBPdXRsaW5lTm9kZTsgZGVwdGg6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgcHJldmlvdXNEZXB0aCA9IDA7XG5cbiAgZm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgbWVhbmluZ2Z1bExpbmVzLmxlbmd0aDsgbGluZUluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZVBsYWluTGlzdEl0ZW0obWVhbmluZ2Z1bExpbmVzW2xpbmVJbmRleF0pO1xuICAgIGlmICghcGFyc2VkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogcGFyc2VkLnJlYXNvbiB9O1xuICAgIGlmIChsaW5lSW5kZXggPT09IDAgJiYgcGFyc2VkLmRlcHRoICE9PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUaGUgbWluZG1hcCBsaXN0IG11c3Qgc3RhcnQgYXQgZGVwdGggMC5cIiB9O1xuICAgIGlmIChwYXJzZWQuZGVwdGggPiBwcmV2aW91c0RlcHRoICsgMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiSW5kZW50YXRpb24ganVtcHMgbW9yZSB0aGFuIG9uZSBsZXZlbC5cIiB9O1xuICAgIGNvbnN0IHBhcmVudCA9IHBhcnNlZC5kZXB0aCA9PT0gMCA/IG51bGwgOiBzdGFja1twYXJzZWQuZGVwdGggLSAxXT8ubm9kZTtcbiAgICBpZiAocGFyc2VkLmRlcHRoID4gMCAmJiAhcGFyZW50KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJNaXNzaW5nIHBhcmVudCBsaXN0IGl0ZW0uXCIgfTtcbiAgICBjb25zdCBzaWJsaW5ncyA9IHBhcmVudCA/IHBhcmVudC5jaGlsZHJlbiA6IHJvb3RzO1xuICAgIGNvbnN0IG5vZGU6IE91dGxpbmVOb2RlID0ge1xuICAgICAgaWQ6IGBuLSR7Wy4uLnN0YWNrLnNsaWNlKDAsIHBhcnNlZC5kZXB0aCkubWFwKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCksIHNpYmxpbmdzLmxlbmd0aF0uam9pbihcIi1cIil9YCxcbiAgICAgIHRpdGxlOiBwYXJzZWQudGl0bGUsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuICAgIHNpYmxpbmdzLnB1c2gobm9kZSk7XG4gICAgc3RhY2tbcGFyc2VkLmRlcHRoXSA9IHsgbm9kZSwgZGVwdGg6IHBhcnNlZC5kZXB0aCB9O1xuICAgIHN0YWNrLmxlbmd0aCA9IHBhcnNlZC5kZXB0aCArIDE7XG4gICAgcHJldmlvdXNEZXB0aCA9IHBhcnNlZC5kZXB0aDtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2Rlczogcm9vdHMgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFpbkxpc3RJdGVtKGxpbmU6IHN0cmluZyk6XG4gIHwgeyBvazogdHJ1ZTsgZGVwdGg6IG51bWJlcjsgdGl0bGU6IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH0ge1xuICBpZiAoL15cXHMqXFxkK1xcLlxccysvLnRlc3QobGluZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk9yZGVyZWQgbGlzdHMgYXJlIG5vdCBzdXBwb3J0ZWQuXCIgfTtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKC9eKFsgXFx0XSopLVxccz8oLiopJC8pO1xuICBpZiAoIW1hdGNoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPbmx5IHBsYWluIHVub3JkZXJlZCBsaXN0IGl0ZW1zIGFyZSBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgY29uc3QgaW5kZW50ID0gbWF0Y2hbMV07XG4gIGlmIChpbmRlbnQuaW5jbHVkZXMoXCJcXHRcIikgJiYgaW5kZW50LmluY2x1ZGVzKFwiIFwiKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiRG8gbm90IG1peCB0YWJzIGFuZCBzcGFjZXMgZm9yIG1pbmRtYXAgaW5kZW50YXRpb24uXCIgfTtcbiAgbGV0IGRlcHRoID0gMDtcbiAgaWYgKGluZGVudC5pbmNsdWRlcyhcIlxcdFwiKSkge1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBpZiAoaW5kZW50Lmxlbmd0aCAlIDIgIT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkxlZ2FjeSBzcGFjZSBpbmRlbnRhdGlvbiBtdXN0IHVzZSBtdWx0aXBsZXMgb2YgdHdvIHNwYWNlcy5cIiB9O1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aCAvIDI7XG4gIH1cbiAgY29uc3QgdGl0bGUgPSBtYXRjaFsyXSA/PyBcIlwiO1xuICBpZiAoL15cXFtbIHhYXVxcXVxccysvLnRlc3QodGl0bGUpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUYXNrIGxpc3QgaXRlbXMgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRlcHRoLCB0aXRsZSB9O1xufVxuXG5mdW5jdGlvbiBmaW5kTG9jYXRpb24oXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXG4pOiB7IG5vZGU6IE91dGxpbmVOb2RlOyBzaWJsaW5nczogT3V0bGluZU5vZGVbXTsgaW5kZXg6IG51bWJlcjsgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgfSB8IG51bGwge1xuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbm9kZXMubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzW2luZGV4XTtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4geyBub2RlLCBzaWJsaW5nczogbm9kZXMsIGluZGV4LCBwYXJlbnRJZCB9O1xuICAgIGNvbnN0IGNoaWxkID0gZmluZExvY2F0aW9uKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCwgbm9kZS5pZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsb25lTm9kZXMobm9kZXM6IE91dGxpbmVOb2RlW10pOiBPdXRsaW5lTm9kZVtdIHtcbiAgcmV0dXJuIG5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICBpZDogbm9kZS5pZCxcbiAgICB0aXRsZTogbm9kZS50aXRsZSxcbiAgICBjaGlsZHJlbjogY2xvbmVOb2Rlcyhub2RlLmNoaWxkcmVuKVxuICB9KSk7XG59XG5cbmZ1bmN0aW9uIGVtcHR5TWluZG1hcFN0YXRlKCk6IE1pbmRtYXBTdGF0ZURhdGEge1xuICByZXR1cm4geyBzY2hlbWFWZXJzaW9uOiAxLCBibG9ja3M6IHt9IH07XG59XG5cbmZ1bmN0aW9uIHN0YWJsZU1pbmRtYXBJZChzb3VyY2VQYXRoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgbWluZG1hcC0ke2hhc2hTdHJpbmcoYCR7c291cmNlUGF0aH06JHtpbmRleH06JHtjb250ZW50fWApLnNsaWNlKDAsIDEwKX1gO1xufVxuXG5mdW5jdGlvbiBmaXJzdFJvb3RUaXRsZShub2RlczogT3V0bGluZU5vZGVbXSk6IHN0cmluZyB7XG4gIHJldHVybiBub2Rlc1swXT8udGl0bGU/LnRyaW0oKSA/PyBcIlwiO1xufVxuXG5sZXQgZ2VuZXJhdGVkSWRDb3VudGVyID0gMDtcbmZ1bmN0aW9uIGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpOiBzdHJpbmcge1xuICBnZW5lcmF0ZWRJZENvdW50ZXIgKz0gMTtcbiAgcmV0dXJuIGBub2RlLSR7RGF0ZS5ub3coKS50b1N0cmluZygzNil9LSR7Z2VuZXJhdGVkSWRDb3VudGVyfWA7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5ld2xpbmVzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyXFxuL2csIFwiXFxuXCIpLnJlcGxhY2UoL1xcci9nLCBcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUZpbmFsTmV3bGluZShvcmlnaW5hbDogc3RyaW5nLCBuZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplTmV3bGluZXMob3JpZ2luYWwpLmVuZHNXaXRoKFwiXFxuXCIpICYmICFuZXh0LmVuZHNXaXRoKFwiXFxuXCIpID8gYCR7bmV4dH1cXG5gIDogbmV4dDtcbn1cblxuZnVuY3Rpb24gbWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKE1BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU4pfVxcXFxuKFtcXFxcc1xcXFxTXSo/KVxcXFxuJHtlc2NhcGVSZWdFeHAoTUFSS0RPV05fTUlORE1BUF9TVEFURV9FTkQpfWAsIFwibVwiKTtcbn1cblxuZnVuY3Rpb24gbGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0JFR0lOKX1cXFxcbihbXFxcXHNcXFxcU10qPylcXFxcbiR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0VORCl9YCwgXCJtXCIpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVBdHRyaWJ1dGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIikucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIik7XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlQXR0cmlidXRlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQVlPOzs7QUNaQSxJQUFNLCtCQUErQjtBQUNyQyxJQUFNLDZCQUE2QjtBQUNuQyxJQUFNLDZCQUE2QjtBQUNuQyxJQUFNLDJCQUEyQjtBQWtFakMsU0FBUyxtQkFBbUIsVUFBa0IsVUFBK0IsQ0FBQyxHQUFtQjtBQUN0RyxRQUFNLGFBQWEsa0JBQWtCLHVCQUF1QixRQUFRLENBQUM7QUFDckUsUUFBTSxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQ25DLFFBQU0sYUFBYSxrQkFBa0IsS0FBSztBQUMxQyxTQUFPLFdBQVcsSUFBSSxDQUFDLFdBQVcsVUFBVTtBQUMxQyxVQUFNLFNBQVMsdUJBQXVCLFVBQVUsV0FBVyxNQUFNLElBQUksQ0FBQztBQUN0RSxVQUFNLFFBQVEsT0FBTyxLQUFLLE9BQU8sUUFBUSxDQUFDO0FBQzFDLFVBQU0sWUFBWSxlQUFlLEtBQUs7QUFDdEMsVUFBTSxjQUFjLGdCQUFnQixRQUFRLGNBQWMsSUFBSSxPQUFPLFVBQVUsVUFBVTtB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
