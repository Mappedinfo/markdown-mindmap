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
  lastMarkdownFilePath = null;
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
        this.captureActiveMarkdownFile();
        if (!this.settings.followActiveFile) return;
        this.refreshOpenMindmapViews();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.captureActiveMarkdownFile();
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
      this.captureActiveMarkdownFile();
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
  async createMindmapInCurrentFile(targetFile) {
    const view = this.getActiveMarkdownView();
    const file = targetFile ?? view?.file ?? this.getActiveMarkdownFile();
    if (!file) {
      new import_obsidian.Notice("Open a Markdown file first.");
      return;
    }
    this.lastMarkdownFilePath = file.path;
    const sourceView = view?.file?.path === file.path ? view : this.findMarkdownViewForFile(file);
    const title = file.basename || "Mindmap";
    const id = createMindmapId(`${file.path}:${Date.now()}`);
    const markdown = sourceView?.getViewData() ?? await this.app.vault.cachedRead(file);
    const insertLine = sourceView?.editor.getCursor().line ?? markdown.split("\n").length;
    const next = insertMindmapBlockAtLine(markdown, insertLine, { id, title });
    await this.writeMarkdownFile(file, next);
    this.setActiveBlockForFile(file.path, id);
    await this.refreshIndexForFile(file, next);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) await leaf.view.loadFileBlock(file, id);
    }
  }
  getActiveMarkdownView() {
    return this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
  }
  getActiveMarkdownFile() {
    const activeMarkdown = this.getActiveMarkdownView();
    if (activeMarkdown?.file) {
      this.lastMarkdownFilePath = activeMarkdown.file.path;
      return activeMarkdown.file;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile?.extension === "md") {
      this.lastMarkdownFilePath = activeFile.path;
      return activeFile;
    }
    return this.getLastMarkdownFile();
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
  rememberMarkdownFile(file) {
    if (file.extension === "md") this.lastMarkdownFilePath = file.path;
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
  captureActiveMarkdownFile() {
    const activeMarkdown = this.getActiveMarkdownView();
    if (activeMarkdown?.file) {
      this.lastMarkdownFilePath = activeMarkdown.file.path;
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile?.extension === "md") this.lastMarkdownFilePath = activeFile.path;
  }
  getLastMarkdownFile() {
    if (!this.lastMarkdownFilePath) return null;
    const file = this.app.vault.getAbstractFileByPath(this.lastMarkdownFilePath);
    return file instanceof import_obsidian.TFile && file.extension === "md" ? file : null;
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
    this.plugin.rememberMarkdownFile(file);
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
      void this.plugin.createMindmapInCurrentFile(this.sourceFile ?? void 0);
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
      button.addEventListener("click", () => void this.plugin.createMindmapInCurrentFile(this.sourceFile ?? void 0));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL291dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBJdGVtVmlldyxcbiAgTWFya2Rvd25WaWV3LFxuICBNb2RhbCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgYnVpbGRNaW5kbWFwSW5kZXgsXG4gIGNyZWF0ZU1pbmRtYXBJZCxcbiAgZGVsZXRlRW1wdHlOb2RlLFxuICBpbmRlbnROb2RlLFxuICBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQsXG4gIGluc2VydE1pbmRtYXBCbG9ja0F0TGluZSxcbiAgaW5zZXJ0U2libGluZ0FmdGVyLFxuICBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YSxcbiAgb3V0ZGVudE5vZGUsXG4gIHBhcnNlTWluZG1hcEJsb2NrcyxcbiAgcmVhZE1pbmRtYXBTdGF0ZSxcbiAgcmVwbGFjZU1pbmRtYXBCbG9jayxcbiAgdXBkYXRlTm9kZVRpdGxlLFxuICB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayxcbiAgdHlwZSBNaW5kbWFwQmxvY2ssXG4gIHR5cGUgTWluZG1hcEluZGV4RW50cnksXG4gIHR5cGUgTWluZG1hcFN0YXRlRGF0YSxcbiAgdHlwZSBPdXRsaW5lTm9kZSxcbiAgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0XG59IGZyb20gXCIuL291dGxpbmUudHNcIjtcblxuY29uc3QgVklFV19UWVBFX01JTkRNQVAgPSBcIm1hcmtkb3duLW1pbmRtYXAtd29ya2JlbmNoXCI7XG5cbmludGVyZmFjZSBMb2NhbE1pbmRtYXBTZXR0aW5ncyB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogYm9vbGVhbjtcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IGJvb2xlYW47XG4gIGZvbGxvd0FjdGl2ZUZpbGU6IGJvb2xlYW47XG4gIHNjYW5WYXVsdE9uT3BlbjogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogdHJ1ZSxcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IHRydWUsXG4gIGZvbGxvd0FjdGl2ZUZpbGU6IHRydWUsXG4gIHNjYW5WYXVsdE9uT3BlbjogdHJ1ZVxufTtcblxuaW50ZXJmYWNlIEZpbGVNaW5kbWFwQ2FjaGUge1xuICBhY3RpdmVCbG9ja0lkPzogc3RyaW5nO1xuICBzZWxlY3RlZElkczogc3RyaW5nW107XG4gIGNvbGxhcHNlZElkczogc3RyaW5nW107XG4gIHNjYWxlOiBudW1iZXI7XG4gIHNjcm9sbExlZnQ6IG51bWJlcjtcbiAgc2Nyb2xsVG9wOiBudW1iZXI7XG4gIGxhc3RDb250ZW50SGFzaD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE5vZGVMYXlvdXQge1xuICBub2RlOiBPdXRsaW5lTm9kZTtcbiAgZGVwdGg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHBhcmVudElkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXJrZG93bk1pbmRtYXBQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICByZWFkb25seSBmaWxlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgRmlsZU1pbmRtYXBDYWNoZT4oKTtcbiAgcmVhZG9ubHkgbWluZG1hcEluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIE1pbmRtYXBJbmRleEVudHJ5W10+KCk7XG4gIHJlYWRvbmx5IHN1cHByZXNzTW9kaWZ5UGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICBwcml2YXRlIHZhdWx0U2NhblRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsYXN0TWFya2Rvd25GaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXJrZG93bk1pbmRtYXBTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3RlclZpZXcoVklFV19UWVBFX01JTkRNQVAsIChsZWFmKSA9PiBuZXcgTWluZG1hcFdvcmtiZW5jaFZpZXcobGVhZiwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwiZ2l0LWZvcmtcIiwgXCJPcGVuIE1hcmtkb3duIE1pbmRtYXBcIiwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLm9wZW5NaW5kbWFwUGFuZWwoKTtcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLW1hcmtkb3duLW1pbmRtYXBcIixcbiAgICAgIG5hbWU6IFwiT3BlbiBNYXJrZG93biBNaW5kbWFwXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcFBhbmVsKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWN1cnJlbnQtb3V0bGluZS1taW5kbWFwXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gTWluZG1hcCBmb3IgQ3VycmVudCBPdXRsaW5lXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcFBhbmVsKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJjcmVhdGUtbWluZG1hcC1pbi1jdXJyZW50LWZpbGVcIixcbiAgICAgIG5hbWU6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSgpXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiaW5kdWNlLXBhcmVudC1mcm9tLXNlbGVjdGVkLW5vZGVzXCIsXG4gICAgICBuYW1lOiBcIkluZHVjZSBQYXJlbnQgZnJvbSBTZWxlY3RlZCBOb2Rlc1wiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMud2l0aE1pbmRtYXBWaWV3KCh2aWV3KSA9PiB2aWV3LnByb21wdEluZHVjZVBhcmVudCgpKVxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImZvY3VzLW1pbmRtYXAtbm9kZVwiLFxuICAgICAgbmFtZTogXCJGb2N1cyBNaW5kbWFwIE5vZGVcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLndpdGhNaW5kbWFwVmlldygodmlldykgPT4gdmlldy5mb2N1c1NlbGVjdGVkTm9kZSgpKVxuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiYWN0aXZlLWxlYWYtY2hhbmdlXCIsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYXB0dXJlQWN0aXZlTWFya2Rvd25GaWxlKCk7XG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlKSByZXR1cm47XG4gICAgICAgIHRoaXMucmVmcmVzaE9wZW5NaW5kbWFwVmlld3MoKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICB0aGlzLmNhcHR1cmVBY3RpdmVNYXJrZG93bkZpbGUoKTtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmZvbGxvd0FjdGl2ZUZpbGUpIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWZyZXNoT3Blbk1pbmRtYXBWaWV3cyh7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlLCBmcm9tRWRpdG9yQ2hhbmdlOiB0cnVlIH0pO1xuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHtcbiAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm47XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVNYXJrZG93bkZpbGVNb2RpZmllZChmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgIHRoaXMuY2FwdHVyZUFjdGl2ZU1hcmtkb3duRmlsZSgpO1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Muc2NhblZhdWx0T25PcGVuKSB2b2lkIHRoaXMucmVmcmVzaFZhdWx0SW5kZXgoKTtcbiAgICB9KTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnZhdWx0U2NhblRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMudmF1bHRTY2FuVGltZXIpO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5kZXRhY2hMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJhdyA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIFBhcnRpYWw8TG9jYWxNaW5kbWFwU2V0dGluZ3M+ICYgeyBmb2xsb3dBY3RpdmVPdXRsaW5lPzogYm9vbGVhbjsgaW5kZW50VW5pdD86IG51bWJlciB9IHwgbnVsbDtcbiAgICB0aGlzLnNldHRpbmdzID0ge1xuICAgICAgLi4uREVGQVVMVF9TRVRUSU5HUyxcbiAgICAgIC4uLihyYXcgPz8ge30pLFxuICAgICAgZm9sbG93QWN0aXZlRmlsZTogcmF3Py5mb2xsb3dBY3RpdmVGaWxlID8/IHJhdz8uZm9sbG93QWN0aXZlT3V0bGluZSA/PyBERUZBVUxUX1NFVFRJTkdTLmZvbGxvd0FjdGl2ZUZpbGVcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICBhc3luYyBvcGVuTWluZG1hcFBhbmVsKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUClbMF07XG4gICAgaWYgKCFsZWFmKSB7XG4gICAgICBsZWFmID0gdGhpcy5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXJcbiAgICAgICAgPyB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0UmlnaHRMZWFmKGZhbHNlKSA/PyB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZih0cnVlKVxuICAgICAgICA6IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKHRydWUpO1xuICAgICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBWSUVXX1RZUEVfTUlORE1BUCwgYWN0aXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcbiAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgIGF3YWl0IGxlYWYudmlldy5sb2FkQ3VycmVudEZpbGUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSh0YXJnZXRGaWxlPzogVEZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB2aWV3ID0gdGhpcy5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBjb25zdCBmaWxlID0gdGFyZ2V0RmlsZSA/PyB2aWV3Py5maWxlID8/IHRoaXMuZ2V0QWN0aXZlTWFya2Rvd25GaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgZmlyc3QuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoID0gZmlsZS5wYXRoO1xuICAgIGNvbnN0IHNvdXJjZVZpZXcgPSB2aWV3Py5maWxlPy5wYXRoID09PSBmaWxlLnBhdGggPyB2aWV3IDogdGhpcy5maW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlKTtcbiAgICBjb25zdCB0aXRsZSA9IGZpbGUuYmFzZW5hbWUgfHwgXCJNaW5kbWFwXCI7XG4gICAgY29uc3QgaWQgPSBjcmVhdGVNaW5kbWFwSWQoYCR7ZmlsZS5wYXRofToke0RhdGUubm93KCl9YCk7XG4gICAgY29uc3QgbWFya2Rvd24gPSBzb3VyY2VWaWV3Py5nZXRWaWV3RGF0YSgpID8/IChhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpKTtcbiAgICBjb25zdCBpbnNlcnRMaW5lID0gc291cmNlVmlldz8uZWRpdG9yLmdldEN1cnNvcigpLmxpbmUgPz8gbWFya2Rvd24uc3BsaXQoXCJcXG5cIikubGVuZ3RoO1xuICAgIGNvbnN0IG5leHQgPSBpbnNlcnRNaW5kbWFwQmxvY2tBdExpbmUobWFya2Rvd24sIGluc2VydExpbmUsIHsgaWQsIHRpdGxlIH0pO1xuICAgIGF3YWl0IHRoaXMud3JpdGVNYXJrZG93bkZpbGUoZmlsZSwgbmV4dCk7XG4gICAgdGhpcy5zZXRBY3RpdmVCbG9ja0ZvckZpbGUoZmlsZS5wYXRoLCBpZCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGUsIG5leHQpO1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSBhd2FpdCBsZWFmLnZpZXcubG9hZEZpbGVCbG9jayhmaWxlLCBpZCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QWN0aXZlTWFya2Rvd25WaWV3KCk6IE1hcmtkb3duVmlldyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuICB9XG5cbiAgZ2V0QWN0aXZlTWFya2Rvd25GaWxlKCk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgYWN0aXZlTWFya2Rvd24gPSB0aGlzLmdldEFjdGl2ZU1hcmtkb3duVmlldygpO1xuICAgIGlmIChhY3RpdmVNYXJrZG93bj8uZmlsZSkge1xuICAgICAgdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCA9IGFjdGl2ZU1hcmtkb3duLmZpbGUucGF0aDtcbiAgICAgIHJldHVybiBhY3RpdmVNYXJrZG93bi5maWxlO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoYWN0aXZlRmlsZT8uZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIHRoaXMubGFzdE1hcmtkb3duRmlsZVBhdGggPSBhY3RpdmVGaWxlLnBhdGg7XG4gICAgICByZXR1cm4gYWN0aXZlRmlsZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFzdE1hcmtkb3duRmlsZSgpO1xuICB9XG5cbiAgZmluZE1hcmtkb3duVmlld0ZvckZpbGUoZmlsZTogVEZpbGUpOiBNYXJrZG93blZpZXcgfCBudWxsIHtcbiAgICBsZXQgZm91bmQ6IE1hcmtkb3duVmlldyB8IG51bGwgPSBudWxsO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5pdGVyYXRlQWxsTGVhdmVzKChsZWFmKSA9PiB7XG4gICAgICBpZiAoZm91bmQpIHJldHVybjtcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcgJiYgbGVhZi52aWV3LmZpbGU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICBmb3VuZCA9IGxlYWYudmlldztcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gZm91bmQ7XG4gIH1cblxuICBnZXRGaWxlQ2FjaGUoZmlsZVBhdGg6IHN0cmluZyk6IEZpbGVNaW5kbWFwQ2FjaGUge1xuICAgIGxldCBjYWNoZSA9IHRoaXMuZmlsZUNhY2hlLmdldChmaWxlUGF0aCk7XG4gICAgaWYgKCFjYWNoZSkge1xuICAgICAgY2FjaGUgPSB7IHNlbGVjdGVkSWRzOiBbXSwgY29sbGFwc2VkSWRzOiBbXSwgc2NhbGU6IDEsIHNjcm9sbExlZnQ6IDAsIHNjcm9sbFRvcDogMCB9O1xuICAgICAgdGhpcy5maWxlQ2FjaGUuc2V0KGZpbGVQYXRoLCBjYWNoZSk7XG4gICAgfVxuICAgIHJldHVybiBjYWNoZTtcbiAgfVxuXG4gIHNldEFjdGl2ZUJsb2NrRm9yRmlsZShmaWxlUGF0aDogc3RyaW5nLCBibG9ja0lkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmdldEZpbGVDYWNoZShmaWxlUGF0aCkuYWN0aXZlQmxvY2tJZCA9IGJsb2NrSWQ7XG4gIH1cblxuICByZW1lbWJlck1hcmtkb3duRmlsZShmaWxlOiBURmlsZSk6IHZvaWQge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoID0gZmlsZS5wYXRoO1xuICB9XG5cbiAgZ2V0QWxsSW5kZXhFbnRyaWVzKCk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICAgIHJldHVybiBbLi4udGhpcy5taW5kbWFwSW5kZXgudmFsdWVzKCldLmZsYXQoKS5zb3J0KChhLCBiKSA9PiBhLmZpbGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5maWxlUGF0aCkgfHwgYS5saW5lIC0gYi5saW5lKTtcbiAgfVxuXG4gIGdldEluZGV4RW50cmllc0ZvckZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICAgIHJldHVybiB0aGlzLm1pbmRtYXBJbmRleC5nZXQoZmlsZVBhdGgpID8/IFtdO1xuICB9XG5cbiAgYXN5bmMgcmVhZE1hcmtkb3duRmlsZShmaWxlOiBURmlsZSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuZmluZE1hcmtkb3duVmlld0ZvckZpbGUoZmlsZSk7XG4gICAgcmV0dXJuIHZpZXc/LmdldFZpZXdEYXRhKCkgPz8gdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIHdyaXRlTWFya2Rvd25GaWxlKGZpbGU6IFRGaWxlLCBtYXJrZG93bjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zdXBwcmVzc01vZGlmeVBhdGhzLmFkZChmaWxlLnBhdGgpO1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKGZpbGUpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICByZXBsYWNlV2hvbGVFZGl0b3JEYXRhKHZpZXcuZWRpdG9yLCBtYXJrZG93bik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBtYXJrZG93bik7XG4gICAgfVxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMuc3VwcHJlc3NNb2RpZnlQYXRocy5kZWxldGUoZmlsZS5wYXRoKSwgMzUwKTtcbiAgfVxuXG4gIGFzeW5jIG5vcm1hbGl6ZU1pbmRtYXBNZXRhZGF0YShmaWxlOiBURmlsZSwgbWFya2Rvd246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgbmV4dCA9IG5vcm1hbGl6ZU1pbmRtYXBCbG9ja01ldGFkYXRhKG1hcmtkb3duLCB7XG4gICAgICBzb3VyY2VQYXRoOiBmaWxlLnBhdGgsXG4gICAgICBmYWxsYmFja1RpdGxlOiBmaWxlLmJhc2VuYW1lXG4gICAgfSk7XG4gICAgaWYgKG5leHQgPT09IG1hcmtkb3duKSByZXR1cm4gbWFya2Rvd247XG4gICAgYXdhaXQgdGhpcy53cml0ZU1hcmtkb3duRmlsZShmaWxlLCBuZXh0KTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hJbmRleEZvckZpbGUoZmlsZSwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBhc3luYyByZWZyZXNoVmF1bHRJbmRleCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy52YXVsdFNjYW5UaW1lciAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnZhdWx0U2NhblRpbWVyKTtcbiAgICAgIHRoaXMudmF1bHRTY2FuVGltZXIgPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVmcmVzaEluZGV4Rm9yRmlsZShmaWxlKTtcbiAgICB9XG4gICAgdGhpcy5yZWZyZXNoT3BlbkRhc2hib2FyZE9ubHkoKTtcbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hJbmRleEZvckZpbGUoZmlsZTogVEZpbGUsIGtub3duTWFya2Rvd24/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBtYXJrZG93biA9IGtub3duTWFya2Rvd24gPz8gKGF3YWl0IHRoaXMucmVhZE1hcmtkb3duRmlsZShmaWxlKSk7XG4gICAgY29uc3QgZW50cmllcyA9IGJ1aWxkTWluZG1hcEluZGV4KG1hcmtkb3duLCBmaWxlLnBhdGgsIGZpbGUuYmFzZW5hbWUpO1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHRoaXMubWluZG1hcEluZGV4LnNldChmaWxlLnBhdGgsIGVudHJpZXMpO1xuICAgIGVsc2UgdGhpcy5taW5kbWFwSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZU1hcmtkb3duRmlsZU1vZGlmaWVkKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuc3VwcHJlc3NNb2RpZnlQYXRocy5oYXMoZmlsZS5wYXRoKSkgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEluZGV4Rm9yRmlsZShmaWxlKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUCkpIHtcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykgbGVhZi52aWV3LnNjaGVkdWxlTWFya2Rvd25SZWZyZXNoKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWZyZXNoT3Blbk1pbmRtYXBWaWV3cyhvcHRpb25zOiB7IHByZXNlcnZlU2VsZWN0aW9uPzogYm9vbGVhbjsgZnJvbUVkaXRvckNoYW5nZT86IGJvb2xlYW4gfSA9IHt9KTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApKSB7XG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgICAgdm9pZCBsZWFmLnZpZXcubG9hZEN1cnJlbnRGaWxlKG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVmcmVzaE9wZW5EYXNoYm9hcmRPbmx5KCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSBsZWFmLnZpZXcucmVuZGVyKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjYXB0dXJlQWN0aXZlTWFya2Rvd25GaWxlKCk6IHZvaWQge1xuICAgIGNvbnN0IGFjdGl2ZU1hcmtkb3duID0gdGhpcy5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBpZiAoYWN0aXZlTWFya2Rvd24/LmZpbGUpIHtcbiAgICAgIHRoaXMubGFzdE1hcmtkb3duRmlsZVBhdGggPSBhY3RpdmVNYXJrZG93bi5maWxlLnBhdGg7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgIGlmIChhY3RpdmVGaWxlPy5leHRlbnNpb24gPT09IFwibWRcIikgdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCA9IGFjdGl2ZUZpbGUucGF0aDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TGFzdE1hcmtkb3duRmlsZSgpOiBURmlsZSB8IG51bGwge1xuICAgIGlmICghdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgd2l0aE1pbmRtYXBWaWV3KGNhbGxiYWNrOiAodmlldzogTWluZG1hcFdvcmtiZW5jaFZpZXcpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgY29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghKGxlYWY/LnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcGVuIHRoZSBNYXJrZG93biBNaW5kbWFwIHBhbmVsIGZpcnN0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdm9pZCBjYWxsYmFjayhsZWFmLnZpZXcpO1xuICB9XG59XG5cbmNsYXNzIE1pbmRtYXBXb3JrYmVuY2hWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuICBwcml2YXRlIHNvdXJjZUZpbGU6IFRGaWxlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYmxvY2s6IE1pbmRtYXBCbG9jayB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIG5vZGVzOiBPdXRsaW5lTm9kZVtdID0gW107XG4gIHByaXZhdGUgc2VsZWN0ZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBjb2xsYXBzZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBzY2FsZSA9IDE7XG4gIHByaXZhdGUgc2Nyb2xsTGVmdCA9IDA7XG4gIHByaXZhdGUgc2Nyb2xsVG9wID0gMDtcbiAgcHJpdmF0ZSBzZWFyY2hRdWVyeSA9IFwiXCI7XG4gIHByaXZhdGUgcmVmcmVzaFRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBzdGF0ZVBlcnNpc3RUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IE1hcmtkb3duTWluZG1hcFBsdWdpbikge1xuICAgIHN1cGVyKGxlYWYpO1xuICB9XG5cbiAgZ2V0Vmlld1R5cGUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gVklFV19UWVBFX01JTkRNQVA7XG4gIH1cblxuICBnZXREaXNwbGF5VGV4dCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBcIk1hcmtkb3duIE1pbmRtYXBcIjtcbiAgfVxuXG4gIGdldEljb24oKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJnaXQtZm9ya1wiO1xuICB9XG5cbiAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gICAgYXdhaXQgdGhpcy5sb2FkQ3VycmVudEZpbGUoKTtcbiAgfVxuXG4gIGFzeW5jIG9uQ2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMucmVmcmVzaFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTtcbiAgICBpZiAodGhpcy5zdGF0ZVBlcnNpc3RUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnN0YXRlUGVyc2lzdFRpbWVyKTtcbiAgICBhd2FpdCB0aGlzLnBlcnNpc3RTdGF0ZSgpO1xuICB9XG5cbiAgc2NoZWR1bGVNYXJrZG93blJlZnJlc2goZmlsZVBhdGg/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoZmlsZVBhdGggJiYgdGhpcy5zb3VyY2VGaWxlPy5wYXRoICE9PSBmaWxlUGF0aCkge1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMucmVmcmVzaFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMucmVmcmVzaFRpbWVyKTtcbiAgICB0aGlzLnJlZnJlc2hUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIHRoaXMucmVmcmVzaFRpbWVyID0gbnVsbDtcbiAgICAgIHZvaWQgdGhpcy5yZWZyZXNoQ3VycmVudEJsb2NrRnJvbU1hcmtkb3duKCk7XG4gICAgfSwgMTgwKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRDdXJyZW50RmlsZShvcHRpb25zOiB7IHByZXNlcnZlU2VsZWN0aW9uPzogYm9vbGVhbjsgZnJvbUVkaXRvckNoYW5nZT86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgYWN0aXZlRmlsZSA9IHRoaXMucGx1Z2luLmdldEFjdGl2ZU1hcmtkb3duRmlsZSgpO1xuICAgIGlmICghYWN0aXZlRmlsZSB8fCBhY3RpdmVGaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSB7XG4gICAgICBpZiAoIXRoaXMuc291cmNlRmlsZSkgdGhpcy5yZW5kZXIoXCJPcGVuIGEgTWFya2Rvd24gZmlsZSBvciBjaG9vc2UgYSBtaW5kbWFwIGZyb20gdGhlIGRhc2hib2FyZC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChvcHRpb25zLmZyb21FZGl0b3JDaGFuZ2UgJiYgdGhpcy5zb3VyY2VGaWxlPy5wYXRoID09PSBhY3RpdmVGaWxlLnBhdGgpIHtcbiAgICAgIHRoaXMuc2NoZWR1bGVNYXJrZG93blJlZnJlc2goYWN0aXZlRmlsZS5wYXRoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZShhY3RpdmVGaWxlLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuICB9XG5cbiAgYXN5bmMgbG9hZEZpbGVCbG9jayhmaWxlOiBURmlsZSwgYmxvY2tJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZShmaWxlLCBibG9ja0lkKTtcbiAgfVxuXG4gIGFzeW5jIHByb21wdEluZHVjZVBhcmVudCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy5zZWxlY3RlZElkcy5zaXplIDwgMikge1xuICAgICAgbmV3IE5vdGljZShcIlNlbGVjdCBhdCBsZWFzdCB0d28gYWRqYWNlbnQgc2libGluZyBub2Rlcy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIG5ldyBQYXJlbnRUaXRsZU1vZGFsKHRoaXMuYXBwLCBcIlx1NUY1Mlx1N0VCM1wiLCAodGl0bGUpID0+IHtcbiAgICAgIHZvaWQgdGhpcy5hcHBseU9wZXJhdGlvbihpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQodGhpcy5ub2RlcywgWy4uLnRoaXMuc2VsZWN0ZWRJZHNdLCB0aXRsZSB8fCBcIlx1NUY1Mlx1N0VCM1wiKSk7XG4gICAgfSkub3BlbigpO1xuICB9XG5cbiAgZm9jdXNTZWxlY3RlZE5vZGUoKTogdm9pZCB7XG4gICAgY29uc3QgaWQgPSBbLi4udGhpcy5zZWxlY3RlZElkc11bMF07XG4gICAgaWYgKCFpZCkge1xuICAgICAgbmV3IE5vdGljZShcIk5vIG1pbmRtYXAgbm9kZSBzZWxlY3RlZC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGlucHV0ID0gdGhpcy5jb250ZW50RWwucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihgaW5wdXRbZGF0YS1ub2RlLWlkPVwiJHtjc3NFc2NhcGUoaWQpfVwiXWApO1xuICAgIGlucHV0Py5mb2N1cygpO1xuICAgIGlucHV0Py5zZWxlY3QoKTtcbiAgfVxuXG4gIHJlbmRlcihzdGF0dXM/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJsb2NhbC1taW5kbWFwLXdvcmtiZW5jaFwiKTtcblxuICAgIGNvbnN0IHNoZWxsID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXNoZWxsXCIgfSk7XG4gICAgY29uc3QgZGFzaGJvYXJkID0gc2hlbGwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZGFzaGJvYXJkXCIgfSk7XG4gICAgY29uc3QgbWFpbiA9IHNoZWxsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLW1haW5cIiB9KTtcbiAgICB0aGlzLnJlbmRlckRhc2hib2FyZChkYXNoYm9hcmQpO1xuICAgIHRoaXMucmVuZGVyTWFpbihtYWluLCBzdGF0dXMpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBsb2FkRmlsZShmaWxlOiBURmlsZSwgcmVxdWVzdGVkQmxvY2tJZD86IHN0cmluZywgb3B0aW9uczogeyBwcmVzZXJ2ZVNlbGVjdGlvbj86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZShmaWxlKTtcbiAgICB0aGlzLnBsdWdpbi5yZW1lbWJlck1hcmtkb3duRmlsZShmaWxlKTtcbiAgICBtYXJrZG93biA9IGF3YWl0IHRoaXMucGx1Z2luLm5vcm1hbGl6ZU1pbmRtYXBNZXRhZGF0YShmaWxlLCBtYXJrZG93bik7XG4gICAgY29uc3QgYmxvY2tzID0gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duLCB7IHNvdXJjZVBhdGg6IGZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogZmlsZS5iYXNlbmFtZSB9KTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGUsIG1hcmtkb3duKTtcblxuICAgIHRoaXMuc291cmNlRmlsZSA9IGZpbGU7XG4gICAgaWYgKGJsb2Nrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IFtdO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5jbGVhcigpO1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjYWNoZSA9IHRoaXMucGx1Z2luLmdldEZpbGVDYWNoZShmaWxlLnBhdGgpO1xuICAgIGNvbnN0IGFjdGl2ZUlkID0gcmVxdWVzdGVkQmxvY2tJZCA/PyBjYWNoZS5hY3RpdmVCbG9ja0lkO1xuICAgIGNvbnN0IGJsb2NrID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSBhY3RpdmVJZCkgPz8gYmxvY2tzWzBdO1xuICAgIHRoaXMuYmxvY2sgPSBibG9jaztcbiAgICB0aGlzLm5vZGVzID0gYmxvY2subm9kZXM7XG4gICAgdGhpcy5wbHVnaW4uc2V0QWN0aXZlQmxvY2tGb3JGaWxlKGZpbGUucGF0aCwgYmxvY2suaWQpO1xuICAgIGNvbnN0IHN0YXRlID0gcmVhZE1pbmRtYXBTdGF0ZShtYXJrZG93bikuYmxvY2tzW2Jsb2NrLmlkXTtcbiAgICBjb25zdCBwcmV2aW91c1NlbGVjdGlvbiA9IG5ldyBTZXQodGhpcy5zZWxlY3RlZElkcyk7XG4gICAgdGhpcy5jb2xsYXBzZWRJZHMgPSBuZXcgU2V0KGNhY2hlLmFjdGl2ZUJsb2NrSWQgPT09IGJsb2NrLmlkID8gY2FjaGUuY29sbGFwc2VkSWRzIDogc3RhdGU/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgdGhpcy5zY2FsZSA9IGNhY2hlLmFjdGl2ZUJsb2NrSWQgPT09IGJsb2NrLmlkID8gY2FjaGUuc2NhbGUgOiBzdGF0ZT8uc2NhbGUgPz8gMTtcbiAgICB0aGlzLnNjcm9sbExlZnQgPSBjYWNoZS5hY3RpdmVCbG9ja0lkID09PSBibG9jay5pZCA/IGNhY2hlLnNjcm9sbExlZnQgOiBzdGF0ZT8uc2Nyb2xsTGVmdCA/PyAwO1xuICAgIHRoaXMuc2Nyb2xsVG9wID0gY2FjaGUuYWN0aXZlQmxvY2tJZCA9PT0gYmxvY2suaWQgPyBjYWNoZS5zY3JvbGxUb3AgOiBzdGF0ZT8uc2Nyb2xsVG9wID8/IDA7XG4gICAgdGhpcy5zZWxlY3RlZElkcyA9IG9wdGlvbnMucHJlc2VydmVTZWxlY3Rpb25cbiAgICAgID8gbmV3IFNldChbLi4ucHJldmlvdXNTZWxlY3Rpb25dLmZpbHRlcigoaWQpID0+IGZpbmROb2RlKHRoaXMubm9kZXMsIGlkKSkpXG4gICAgICA6IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgY2FjaGUubGFzdENvbnRlbnRIYXNoID0gYmxvY2suY29udGVudEhhc2g7XG4gICAgdGhpcy51cGRhdGVDYWNoZSgpO1xuICAgIHRoaXMucmVuZGVyKGJsb2NrLndhcm5pbmcpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyByZWZyZXNoQ3VycmVudEJsb2NrRnJvbU1hcmtkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlKSByZXR1cm47XG4gICAgY29uc3QgbWFya2Rvd24gPSBhd2FpdCB0aGlzLnBsdWdpbi5yZWFkTWFya2Rvd25GaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ucmVmcmVzaEluZGV4Rm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUsIG1hcmtkb3duKTtcbiAgICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3MobWFya2Rvd24sIHsgc291cmNlUGF0aDogdGhpcy5zb3VyY2VGaWxlLnBhdGgsIGZhbGxiYWNrVGl0bGU6IHRoaXMuc291cmNlRmlsZS5iYXNlbmFtZSB9KTtcbiAgICBpZiAoIXRoaXMuYmxvY2spIHtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZyZXNoID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSB0aGlzLmJsb2NrPy5pZCk7XG4gICAgaWYgKCFmcmVzaCkge1xuICAgICAgdGhpcy5ibG9jayA9IGJsb2Nrc1swXSA/PyBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IHRoaXMuYmxvY2s/Lm5vZGVzID8/IFtdO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcyA9IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgICB0aGlzLnJlbmRlcih0aGlzLmJsb2NrID8gdGhpcy5ibG9jay53YXJuaW5nIDogdW5kZWZpbmVkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZyZXNoLmNvbnRlbnRIYXNoID09PSB0aGlzLmJsb2NrLmNvbnRlbnRIYXNoICYmIGZyZXNoLndhcm5pbmcgPT09IHRoaXMuYmxvY2sud2FybmluZykge1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5ibG9jayA9IGZyZXNoO1xuICAgIHRoaXMubm9kZXMgPSBmcmVzaC5ub2RlcztcbiAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChbLi4udGhpcy5zZWxlY3RlZElkc10uZmlsdGVyKChpZCkgPT4gZmluZE5vZGUodGhpcy5ub2RlcywgaWQpKSk7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA9PT0gMCAmJiB0aGlzLm5vZGVzWzBdKSB0aGlzLnNlbGVjdGVkSWRzLmFkZCh0aGlzLm5vZGVzWzBdLmlkKTtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgdGhpcy5yZW5kZXIoZnJlc2gud2FybmluZyk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckRhc2hib2FyZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWRhc2hib2FyZC1oZWFkZXJcIiB9KTtcbiAgICBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZGFzaGJvYXJkLXRpdGxlXCIsIHRleHQ6IFwiTWluZG1hcHNcIiB9KTtcbiAgICBjb25zdCByZWZyZXNoID0gaGVhZGVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtaWNvbi1idXR0b25cIiwgdGV4dDogXCJSZWZyZXNoXCIgfSk7XG4gICAgcmVmcmVzaC50eXBlID0gXCJidXR0b25cIjtcbiAgICByZWZyZXNoLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMucGx1Z2luLnJlZnJlc2hWYXVsdEluZGV4KCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjcmVhdGUgPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1jcmVhdGUtYnV0dG9uXCIsIHRleHQ6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIgfSk7XG4gICAgY3JlYXRlLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGNyZWF0ZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLnBsdWdpbi5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSh0aGlzLnNvdXJjZUZpbGUgPz8gdW5kZWZpbmVkKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNlYXJjaCA9IGNvbnRhaW5lci5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VhcmNoXCIgfSk7XG4gICAgc2VhcmNoLnR5cGUgPSBcInNlYXJjaFwiO1xuICAgIHNlYXJjaC5wbGFjZWhvbGRlciA9IFwiU2VhcmNoIG1pbmRtYXBzXCI7XG4gICAgc2VhcmNoLnZhbHVlID0gdGhpcy5zZWFyY2hRdWVyeTtcbiAgICBzZWFyY2guYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2VhcmNoUXVlcnkgPSBzZWFyY2gudmFsdWU7XG4gICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZW5kZXJFbnRyeVNlY3Rpb24oY29udGFpbmVyLCBcIkN1cnJlbnQgZmlsZVwiLCB0aGlzLmN1cnJlbnRGaWxlRW50cmllcygpKTtcbiAgICBjb25zdCBxdWVyeSA9IHRoaXMuc2VhcmNoUXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgYWxsRW50cmllcyA9IHRoaXMucGx1Z2luXG4gICAgICAuZ2V0QWxsSW5kZXhFbnRyaWVzKClcbiAgICAgIC5maWx0ZXIoKGVudHJ5KSA9PlxuICAgICAgICAhcXVlcnkgfHxcbiAgICAgICAgYCR7ZW50cnkudGl0bGV9ICR7ZW50cnkucm9vdFRpdGxlfSAke2VudHJ5LmZpbGVQYXRofWAudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcbiAgICAgIClcbiAgICAgIC5zbGljZSgwLCA4MCk7XG4gICAgdGhpcy5yZW5kZXJFbnRyeVNlY3Rpb24oY29udGFpbmVyLCBxdWVyeSA/IFwiU2VhcmNoIHJlc3VsdHNcIiA6IFwiVmF1bHRcIiwgYWxsRW50cmllcyk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckVudHJ5U2VjdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aXRsZTogc3RyaW5nLCBlbnRyaWVzOiBNaW5kbWFwSW5kZXhFbnRyeVtdKTogdm9pZCB7XG4gICAgY29uc3Qgc2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWN0aW9uXCIgfSk7XG4gICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWN0aW9uLXRpdGxlXCIsIHRleHQ6IGAke3RpdGxlfSAoJHtlbnRyaWVzLmxlbmd0aH0pYCB9KTtcbiAgICBpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VjdGlvbi1lbXB0eVwiLCB0ZXh0OiB0aXRsZSA9PT0gXCJDdXJyZW50IGZpbGVcIiA/IFwiVGhpcyBmaWxlIGhhcyBubyBtaW5kbWFwIGJsb2NrLlwiIDogXCJObyBtaW5kbWFwcyBmb3VuZC5cIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLnNvdXJjZUZpbGU/LnBhdGggPT09IGVudHJ5LmZpbGVQYXRoICYmIHRoaXMuYmxvY2s/LmlkID09PSBlbnRyeS5pZDtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHNlY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IGFjdGl2ZSA/IFwibG9jYWwtbWluZG1hcC1lbnRyeSBpcy1hY3RpdmVcIiA6IFwibG9jYWwtbWluZG1hcC1lbnRyeVwiIH0pO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVudHJ5LXRpdGxlXCIsIHRleHQ6IGVudHJ5LnRpdGxlIHx8IGVudHJ5LnJvb3RUaXRsZSB8fCBcIlVudGl0bGVkIG1pbmRtYXBcIiB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbnRyeS1wYXRoXCIsIHRleHQ6IGAke2VudHJ5LmZpbGVQYXRofSBcdTAwQjcgbGluZSAke2VudHJ5LmxpbmV9YCB9KTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHZvaWQgdGhpcy5vcGVuSW5kZXhFbnRyeShlbnRyeSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlbmRlck1haW4oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RhdHVzPzogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdG9vbGJhciA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC10b29sYmFyXCIgfSk7XG4gICAgY29uc3QgdGl0bGVHcm91cCA9IHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtaGVhZGluZ1wiIH0pO1xuICAgIHRpdGxlR3JvdXAuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJsb2NhbC1taW5kbWFwLXRpdGxlXCIsXG4gICAgICB0ZXh0OiB0aGlzLmJsb2NrPy50aXRsZSA/PyB0aGlzLnNvdXJjZUZpbGU/LmJhc2VuYW1lID8/IFwiTWFya2Rvd24gTWluZG1hcFwiXG4gICAgfSk7XG4gICAgdGl0bGVHcm91cC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcImxvY2FsLW1pbmRtYXAtc3VidGl0bGVcIixcbiAgICAgIHRleHQ6IHRoaXMuYmxvY2sgJiYgdGhpcy5zb3VyY2VGaWxlXG4gICAgICAgID8gYCR7dGhpcy5zb3VyY2VGaWxlLnBhdGh9IFx1MDBCNyBsaW5lcyAke3RoaXMuYmxvY2suc3RhcnRMaW5lICsgMX0tJHt0aGlzLmJsb2NrLmVuZExpbmUgKyAxfWBcbiAgICAgICAgOiB0aGlzLnNvdXJjZUZpbGVcbiAgICAgICAgICA/IGAke3RoaXMuc291cmNlRmlsZS5wYXRofSBcdTAwQjcgbm8gbWluZG1hcCBibG9ja2BcbiAgICAgICAgICA6IFwiQ2hvb3NlIGEgbWluZG1hcCBvciBjcmVhdGUgb25lIGluIHRoZSBhY3RpdmUgZmlsZS5cIlxuICAgIH0pO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIkluZHVjZSBwYXJlbnRcIiwgKCkgPT4gdGhpcy5wcm9tcHRJbmR1Y2VQYXJlbnQoKSwgdGhpcy5zZWxlY3RlZElkcy5zaXplID49IDIpO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIkZvY3VzXCIsICgpID0+IHRoaXMuZm9jdXNTZWxlY3RlZE5vZGUoKSwgdGhpcy5zZWxlY3RlZElkcy5zaXplID4gMCk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiLVwiLCAoKSA9PiB0aGlzLnNldFNjYWxlKHRoaXMuc2NhbGUgLSAwLjEpLCBCb29sZWFuKHRoaXMuYmxvY2spKTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCIrXCIsICgpID0+IHRoaXMuc2V0U2NhbGUodGhpcy5zY2FsZSArIDAuMSksIEJvb2xlYW4odGhpcy5ibG9jaykpO1xuXG4gICAgaWYgKHN0YXR1cykgY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXdhcm5pbmdcIiwgdGV4dDogc3RhdHVzIH0pO1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlKSB7XG4gICAgICBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW1wdHlcIiwgdGV4dDogXCJPcGVuIGEgTWFya2Rvd24gZmlsZSBvciBjaG9vc2UgYSBtaW5kbWFwIGZyb20gdGhlIGRhc2hib2FyZC5cIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCF0aGlzLmJsb2NrKSB7XG4gICAgICBjb25zdCBlbXB0eSA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbXB0eVwiIH0pO1xuICAgICAgZW1wdHkuY3JlYXRlRGl2KHsgdGV4dDogXCJUaGlzIGZpbGUgaGFzIG5vIG1pbmRtYXAgYmxvY2suXCIgfSk7XG4gICAgICBjb25zdCBidXR0b24gPSBlbXB0eS5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIgfSk7XG4gICAgICBidXR0b24udHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHZvaWQgdGhpcy5wbHVnaW4uY3JlYXRlTWluZG1hcEluQ3VycmVudEZpbGUodGhpcy5zb3VyY2VGaWxlID8/IHVuZGVmaW5lZCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5ub2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbXB0eVwiLCB0ZXh0OiBcIlRoZSBzZWxlY3RlZCBtaW5kbWFwIGJsb2NrIGlzIGVtcHR5LlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWdlID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN0YWdlXCIgfSk7XG4gICAgc3RhZ2Uuc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcbiAgICBzdGFnZS5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcDtcbiAgICBzdGFnZS5hZGRFdmVudExpc3RlbmVyKFwic2Nyb2xsXCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2Nyb2xsTGVmdCA9IHN0YWdlLnNjcm9sbExlZnQ7XG4gICAgICB0aGlzLnNjcm9sbFRvcCA9IHN0YWdlLnNjcm9sbFRvcDtcbiAgICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHN1cmZhY2UgPSBzdGFnZS5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zdXJmYWNlXCIgfSk7XG4gICAgc3VyZmFjZS5zdHlsZS50cmFuc2Zvcm0gPSBgc2NhbGUoJHt0aGlzLnNjYWxlfSlgO1xuICAgIHN1cmZhY2Uuc3R5bGUudHJhbnNmb3JtT3JpZ2luID0gXCJ0b3AgbGVmdFwiO1xuICAgIGNvbnN0IGxheW91dHMgPSBsYXlvdXROb2Rlcyh0aGlzLm5vZGVzLCB0aGlzLmNvbGxhcHNlZElkcyk7XG4gICAgY29uc3QgbWF4WCA9IE1hdGgubWF4KC4uLmxheW91dHMubWFwKChlbnRyeSkgPT4gZW50cnkueCksIDApICsgMzQwO1xuICAgIGNvbnN0IG1heFkgPSBNYXRoLm1heCguLi5sYXlvdXRzLm1hcCgoZW50cnkpID0+IGVudHJ5LnkpLCAwKSArIDE0MDtcbiAgICBzdXJmYWNlLnN0eWxlLndpZHRoID0gYCR7bWF4WH1weGA7XG4gICAgc3VyZmFjZS5zdHlsZS5oZWlnaHQgPSBgJHttYXhZfXB4YDtcblxuICAgIGNvbnN0IHN2ZyA9IHN1cmZhY2UuY3JlYXRlU3ZnKFwic3ZnXCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbGlua3NcIiB9KTtcbiAgICBzdmcuc2V0QXR0cihcIndpZHRoXCIsIFN0cmluZyhtYXhYKSk7XG4gICAgc3ZnLnNldEF0dHIoXCJoZWlnaHRcIiwgU3RyaW5nKG1heFkpKTtcbiAgICBmb3IgKGNvbnN0IGxheW91dCBvZiBsYXlvdXRzKSB7XG4gICAgICBpZiAoIWxheW91dC5wYXJlbnRJZCkgY29udGludWU7XG4gICAgICBjb25zdCBwYXJlbnQgPSBsYXlvdXRzLmZpbmQoKGVudHJ5KSA9PiBlbnRyeS5ub2RlLmlkID09PSBsYXlvdXQucGFyZW50SWQpO1xuICAgICAgaWYgKCFwYXJlbnQpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcGF0aCA9IHN2Zy5jcmVhdGVTdmcoXCJwYXRoXCIpO1xuICAgICAgY29uc3Qgc3RhcnRYID0gcGFyZW50LnggKyAyMjA7XG4gICAgICBjb25zdCBzdGFydFkgPSBwYXJlbnQueSArIDI4O1xuICAgICAgY29uc3QgZW5kWCA9IGxheW91dC54O1xuICAgICAgY29uc3QgZW5kWSA9IGxheW91dC55ICsgMjg7XG4gICAgICBjb25zdCBtaWRYID0gc3RhcnRYICsgTWF0aC5tYXgoNDAsIChlbmRYIC0gc3RhcnRYKSAvIDIpO1xuICAgICAgcGF0aC5zZXRBdHRyKFwiZFwiLCBgTSAke3N0YXJ0WH0gJHtzdGFydFl9IEMgJHttaWRYfSAke3N0YXJ0WX0sICR7bWlkWH0gJHtlbmRZfSwgJHtlbmRYfSAke2VuZFl9YCk7XG4gICAgICBwYXRoLnNldEF0dHIoXCJjbGFzc1wiLCBcImxvY2FsLW1pbmRtYXAtbGlua1wiKTtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGxheW91dCBvZiBsYXlvdXRzKSB7XG4gICAgICB0aGlzLnJlbmRlck5vZGUoc3VyZmFjZSwgbGF5b3V0KTtcbiAgICB9XG5cbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBzdGFnZS5zY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgc3RhZ2Uuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlck5vZGUoc3VyZmFjZTogSFRNTEVsZW1lbnQsIGxheW91dDogTm9kZUxheW91dCk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBsYXlvdXQubm9kZTtcbiAgICBjb25zdCBzZWxlY3RlZCA9IHRoaXMuc2VsZWN0ZWRJZHMuaGFzKG5vZGUuaWQpO1xuICAgIGNvbnN0IGNhcmQgPSBzdXJmYWNlLmNyZWF0ZURpdih7IGNsczogc2VsZWN0ZWQgPyBcImxvY2FsLW1pbmRtYXAtbm9kZSBpcy1zZWxlY3RlZFwiIDogXCJsb2NhbC1taW5kbWFwLW5vZGVcIiB9KTtcbiAgICBjYXJkLnN0eWxlLmxlZnQgPSBgJHtsYXlvdXQueH1weGA7XG4gICAgY2FyZC5zdHlsZS50b3AgPSBgJHtsYXlvdXQueX1weGA7XG4gICAgY2FyZC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoKGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkudGFnTmFtZSA9PT0gXCJJTlBVVFwiIHx8IChldmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLnRhZ05hbWUgPT09IFwiQlVUVE9OXCIpIHJldHVybjtcbiAgICAgIHRoaXMuc2VsZWN0Tm9kZShub2RlLmlkLCBldmVudC5tZXRhS2V5IHx8IGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQuc2hpZnRLZXkpO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgcm93ID0gY2FyZC5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1ub2RlLXJvd1wiIH0pO1xuICAgIGNvbnN0IHNlbGVjdCA9IHJvdy5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VsZWN0XCIgfSk7XG4gICAgc2VsZWN0LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgc2VsZWN0LmNoZWNrZWQgPSBzZWxlY3RlZDtcbiAgICBzZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB0aGlzLnNlbGVjdE5vZGUobm9kZS5pZCwgdHJ1ZSkpO1xuXG4gICAgY29uc3QgY29sbGFwc2UgPSByb3cuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1jb2xsYXBzZVwiLCB0ZXh0OiBub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDAgPyAodGhpcy5jb2xsYXBzZWRJZHMuaGFzKG5vZGUuaWQpID8gXCIrXCIgOiBcIi1cIikgOiBcIlwiIH0pO1xuICAgIGNvbGxhcHNlLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGNvbGxhcHNlLmRpc2FibGVkID0gbm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDA7XG4gICAgY29sbGFwc2UuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdGhpcy50b2dnbGVDb2xsYXBzZShub2RlLmlkKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IGlucHV0ID0gcm93LmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1ub2RlLXRpdGxlXCIgfSk7XG4gICAgaW5wdXQuZGF0YXNldC5ub2RlSWQgPSBub2RlLmlkO1xuICAgIGlucHV0LnZhbHVlID0gbm9kZS50aXRsZTtcbiAgICBpbnB1dC5wbGFjZWhvbGRlciA9IFwiVW50aXRsZWRcIjtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiZm9jdXNcIiwgKCkgPT4ge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcyA9IG5ldyBTZXQoW25vZGUuaWRdKTtcbiAgICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICAgIGNhcmQuYWRkQ2xhc3MoXCJpcy1zZWxlY3RlZFwiKTtcbiAgICAgIHNlbGVjdC5jaGVja2VkID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCAoKSA9PiB2b2lkIHRoaXMuY29tbWl0VGl0bGUobm9kZS5pZCwgaW5wdXQudmFsdWUpKTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHRoaXMuaGFuZGxlTm9kZUtleWRvd24oZXZlbnQsIG5vZGUuaWQsIGlucHV0KSk7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZU5vZGVLZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50LCBub2RlSWQ6IHN0cmluZywgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMuY29tbWl0VGl0bGUobm9kZUlkLCBpbnB1dC52YWx1ZSwgeyBza2lwUmVuZGVyOiB0cnVlIH0pLnRoZW4oKCkgPT4gdGhpcy5hcHBseU9wZXJhdGlvbihpbnNlcnRTaWJsaW5nQWZ0ZXIodGhpcy5ub2Rlcywgbm9kZUlkLCBcIlwiKSkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIlRhYlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLmNvbW1pdFRpdGxlKG5vZGVJZCwgaW5wdXQudmFsdWUsIHsgc2tpcFJlbmRlcjogdHJ1ZSB9KS50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYXBwbHlPcGVyYXRpb24oZXZlbnQuc2hpZnRLZXkgPyBvdXRkZW50Tm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpIDogaW5kZW50Tm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKChldmVudC5rZXkgPT09IFwiQmFja3NwYWNlXCIgfHwgZXZlbnQua2V5ID09PSBcIkRlbGV0ZVwiKSAmJiBpbnB1dC52YWx1ZS50cmltKCkgPT09IFwiXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMuYXBwbHlPcGVyYXRpb24oZGVsZXRlRW1wdHlOb2RlKHRoaXMubm9kZXMsIG5vZGVJZCkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tbWl0VGl0bGUobm9kZUlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIG9wdGlvbnM6IHsgc2tpcFJlbmRlcj86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlKHRoaXMubm9kZXMsIG5vZGVJZCk7XG4gICAgaWYgKCFub2RlIHx8IG5vZGUudGl0bGUgPT09IHRpdGxlKSByZXR1cm47XG4gICAgYXdhaXQgdGhpcy5hcHBseU9wZXJhdGlvbih1cGRhdGVOb2RlVGl0bGUodGhpcy5ub2Rlcywgbm9kZUlkLCB0aXRsZSksIG9wdGlvbnMpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZWxlY3ROb2RlKG5vZGVJZDogc3RyaW5nLCBhZGRpdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghYWRkaXRpdmUpIHRoaXMuc2VsZWN0ZWRJZHMuY2xlYXIoKTtcbiAgICBpZiAoYWRkaXRpdmUgJiYgdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZUlkKSkge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUobm9kZUlkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5hZGQobm9kZUlkKTtcbiAgICB9XG4gICAgdGhpcy51cGRhdGVDYWNoZSgpO1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNlKG5vZGVJZDogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuY29sbGFwc2VkSWRzLmhhcyhub2RlSWQpKSB0aGlzLmNvbGxhcHNlZElkcy5kZWxldGUobm9kZUlkKTtcbiAgICBlbHNlIHRoaXMuY29sbGFwc2VkSWRzLmFkZChub2RlSWQpO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0U2NhbGUobmV4dDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5zY2FsZSA9IE1hdGgubWluKDEuOCwgTWF0aC5tYXgoMC41LCBOdW1iZXIobmV4dC50b0ZpeGVkKDIpKSkpO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYXBwbHlPcGVyYXRpb24ocmVzdWx0OiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0LCBvcHRpb25zOiB7IHNraXBSZW5kZXI/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICBuZXcgTm90aWNlKHJlc3VsdC5yZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLm5vZGVzID0gcmVzdWx0Lm5vZGVzO1xuICAgIHRoaXMuc2VsZWN0ZWRJZHMgPSBuZXcgU2V0KHJlc3VsdC5mb2N1c0lkID8gW3Jlc3VsdC5mb2N1c0lkXSA6IFsuLi50aGlzLnNlbGVjdGVkSWRzXS5maWx0ZXIoKGlkKSA9PiBmaW5kTm9kZSh0aGlzLm5vZGVzLCBpZCkpKTtcbiAgICBjb25zdCB3cml0dGVuID0gYXdhaXQgdGhpcy53cml0ZU5vZGVzVG9NYXJrZG93bigpO1xuICAgIGlmICghd3JpdHRlbikgcmV0dXJuO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICBpZiAoIW9wdGlvbnMuc2tpcFJlbmRlcikgdGhpcy5yZW5kZXIoKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzU2VsZWN0ZWROb2RlKCksIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZU5vZGVzVG9NYXJrZG93bigpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSB8fCAhdGhpcy5ibG9jaykge1xuICAgICAgbmV3IE5vdGljZShcIk5vIHNvdXJjZSBtaW5kbWFwIGJsb2NrIGxvYWRlZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUpO1xuICAgIGNvbnN0IGJsb2NrcyA9IHBhcnNlTWluZG1hcEJsb2NrcyhtYXJrZG93biwgeyBzb3VyY2VQYXRoOiB0aGlzLnNvdXJjZUZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogdGhpcy5zb3VyY2VGaWxlLmJhc2VuYW1lIH0pO1xuICAgIGNvbnN0IGZyZXNoQmxvY2sgPSBibG9ja3MuZmluZCgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuaWQgPT09IHRoaXMuYmxvY2s/LmlkKTtcbiAgICBpZiAoIWZyZXNoQmxvY2spIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJUaGUgc291cmNlIG1pbmRtYXAgYmxvY2sgbm8gbG9uZ2VyIGV4aXN0cy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG5leHQgPSByZXBsYWNlTWluZG1hcEJsb2NrKG1hcmtkb3duLCBmcmVzaEJsb2NrLCB0aGlzLm5vZGVzLCBmcmVzaEJsb2NrLnRpdGxlKTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi53cml0ZU1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUsIG5leHQpO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hJbmRleEZvckZpbGUodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgICBjb25zdCBuZXh0QmxvY2sgPSBwYXJzZU1pbmRtYXBCbG9ja3MobmV4dCwgeyBzb3VyY2VQYXRoOiB0aGlzLnNvdXJjZUZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogdGhpcy5zb3VyY2VGaWxlLmJhc2VuYW1lIH0pLmZpbmQoXG4gICAgICAoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuaWQgPT09IGZyZXNoQmxvY2suaWRcbiAgICApO1xuICAgIGlmIChuZXh0QmxvY2spIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBuZXh0QmxvY2s7XG4gICAgICB0aGlzLnBsdWdpbi5nZXRGaWxlQ2FjaGUodGhpcy5zb3VyY2VGaWxlLnBhdGgpLmxhc3RDb250ZW50SGFzaCA9IG5leHRCbG9jay5jb250ZW50SGFzaDtcbiAgICB9XG4gICAgdGhpcy5zY2hlZHVsZVN0YXRlUGVyc2lzdCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvcGVuSW5kZXhFbnRyeShlbnRyeTogTWluZG1hcEluZGV4RW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGVudHJ5LmZpbGVQYXRoKTtcbiAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICBuZXcgTm90aWNlKFwiTWluZG1hcCBzb3VyY2UgZmlsZSBubyBsb25nZXIgZXhpc3RzLlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5wbHVnaW4uc2V0QWN0aXZlQmxvY2tGb3JGaWxlKGZpbGUucGF0aCwgZW50cnkuaWQpO1xuICAgIGNvbnN0IGV4aXN0aW5nVmlldyA9IHRoaXMucGx1Z2luLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKGZpbGUpO1xuICAgIGlmICghZXhpc3RpbmdWaWV3KSB7XG4gICAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZihmYWxzZSkub3BlbkZpbGUoZmlsZSwgeyBhY3RpdmU6IGZhbHNlIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmxvYWRGaWxlQmxvY2soZmlsZSwgZW50cnkuaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBjdXJyZW50RmlsZUVudHJpZXMoKTogTWluZG1hcEluZGV4RW50cnlbXSB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUpIHJldHVybiBbXTtcbiAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0SW5kZXhFbnRyaWVzRm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUucGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUNhY2hlKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlIHx8ICF0aGlzLmJsb2NrKSByZXR1cm47XG4gICAgY29uc3QgY2FjaGUgPSB0aGlzLnBsdWdpbi5nZXRGaWxlQ2FjaGUodGhpcy5zb3VyY2VGaWxlLnBhdGgpO1xuICAgIGNhY2hlLmFjdGl2ZUJsb2NrSWQgPSB0aGlzLmJsb2NrLmlkO1xuICAgIGNhY2hlLnNlbGVjdGVkSWRzID0gWy4uLnRoaXMuc2VsZWN0ZWRJZHNdO1xuICAgIGNhY2hlLmNvbGxhcHNlZElkcyA9IFsuLi50aGlzLmNvbGxhcHNlZElkc107XG4gICAgY2FjaGUuc2NhbGUgPSB0aGlzLnNjYWxlO1xuICAgIGNhY2hlLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgY2FjaGUuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgY2FjaGUubGFzdENvbnRlbnRIYXNoID0gdGhpcy5ibG9jay5jb250ZW50SGFzaDtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnN0YXRlUGVyc2lzdFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuc3RhdGVQZXJzaXN0VGltZXIpO1xuICAgIHRoaXMuc3RhdGVQZXJzaXN0VGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnN0YXRlUGVyc2lzdFRpbWVyID0gbnVsbDtcbiAgICAgIHZvaWQgdGhpcy5wZXJzaXN0U3RhdGUoKTtcbiAgICB9LCA1MDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwZXJzaXN0U3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUgfHwgIXRoaXMuYmxvY2sgfHwgIXRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlKSByZXR1cm47XG4gICAgY29uc3QgbWFya2Rvd24gPSBhd2FpdCB0aGlzLnBsdWdpbi5yZWFkTWFya2Rvd25GaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgY29uc3Qgc3RhdGU6IE1pbmRtYXBTdGF0ZURhdGEgPSByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duKTtcbiAgICBzdGF0ZS5ibG9ja3NbdGhpcy5ibG9jay5pZF0gPSB7XG4gICAgICBjb2xsYXBzZWRJZHM6IFsuLi50aGlzLmNvbGxhcHNlZElkc10sXG4gICAgICBzY2FsZTogdGhpcy5zY2FsZSxcbiAgICAgIHNjcm9sbExlZnQ6IHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgIHNjcm9sbFRvcDogdGhpcy5zY3JvbGxUb3AsXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgIH07XG4gICAgY29uc3QgbmV4dCA9IHVwc2VydE1pbmRtYXBTdGF0ZUJsb2NrKG1hcmtkb3duLCBzdGF0ZSk7XG4gICAgaWYgKG5leHQgPT09IG1hcmtkb3duKSByZXR1cm47XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVNYXJrZG93bkZpbGUodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoSW5kZXhGb3JGaWxlKHRoaXMuc291cmNlRmlsZSwgbmV4dCk7XG4gIH1cblxuICBwcml2YXRlIGFkZFRvb2xiYXJCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPiwgZW5hYmxlZCA9IHRydWUpOiB2b2lkIHtcbiAgICBjb25zdCBidXR0b24gPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0IH0pO1xuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICBidXR0b24uZGlzYWJsZWQgPSAhZW5hYmxlZDtcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHZvaWQgb25DbGljaygpO1xuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIFBhcmVudFRpdGxlTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRUaXRsZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IG9uU3VibWl0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkluZHVjZSBwYXJlbnRcIiB9KTtcbiAgICBjb25zdCBpbnB1dCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbW9kYWwtaW5wdXRcIiB9KTtcbiAgICBpbnB1dC52YWx1ZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LmtleSAhPT0gXCJFbnRlclwiKSByZXR1cm47XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5zdWJtaXQoaW5wdXQudmFsdWUpO1xuICAgIH0pO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbCkuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICBidXR0b25cbiAgICAgICAgLnNldEJ1dHRvblRleHQoXCJDb25maXJtXCIpXG4gICAgICAgIC5zZXRDdGEoKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLnN1Ym1pdChpbnB1dC52YWx1ZSkpXG4gICAgKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpbnB1dC5mb2N1cygpO1xuICAgICAgaW5wdXQuc2VsZWN0KCk7XG4gICAgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHN1Ym1pdCh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5vblN1Ym1pdCh0aXRsZS50cmltKCkgfHwgdGhpcy5kZWZhdWx0VGl0bGUpO1xuICAgIHRoaXMuY2xvc2UoKTtcbiAgfVxufVxuXG5jbGFzcyBNYXJrZG93bk1pbmRtYXBTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogTWFya2Rvd25NaW5kbWFwUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiT3BlbiBpbiByaWdodCBzaWRlYmFyXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5JblJpZ2h0U2lkZWJhciA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJQZXJzaXN0IHZpZXcgc3RhdGVcIilcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBjb2xsYXBzZWQgbm9kZXMsIHpvb20sIGFuZCBzY3JvbGwgaW4gYSBoaWRkZW4gbWFuYWdlZCBibG9jayBpbiB0aGUgTWFya2Rvd24gZmlsZS5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJGb2xsb3cgYWN0aXZlIGZpbGVcIilcbiAgICAgIC5zZXREZXNjKFwiS2VlcCB0aGUgcGFuZWwgcG9pbnRlZCBhdCB0aGUgYWN0aXZlIE1hcmtkb3duIGZpbGUgd2l0aG91dCBjbGVhcmluZyBzdGF0ZSBvbiBjdXJzb3IgbW92ZW1lbnQuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlNjYW4gdmF1bHQgb24gb3BlblwiKVxuICAgICAgLnNldERlc2MoXCJCdWlsZCB0aGUgZGFzaGJvYXJkIGluZGV4IGZyb20gYWxsIE1hcmtkb3duIGZpbGVzIGFmdGVyIE9ic2lkaWFuIGxheW91dCBpcyByZWFkeS5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNjYW5WYXVsdE9uT3Blbikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2NhblZhdWx0T25PcGVuID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXaG9sZUVkaXRvckRhdGEoZWRpdG9yOiBFZGl0b3IsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgbGFzdExpbmUgPSBNYXRoLm1heCgwLCBlZGl0b3IubGluZUNvdW50KCkgLSAxKTtcbiAgY29uc3QgZW5kID0geyBsaW5lOiBsYXN0TGluZSwgY2g6IGVkaXRvci5nZXRMaW5lKGxhc3RMaW5lKS5sZW5ndGggfTtcbiAgZWRpdG9yLnJlcGxhY2VSYW5nZShyZXBsYWNlbWVudCwgeyBsaW5lOiAwLCBjaDogMCB9LCBlbmQpO1xufVxuXG5mdW5jdGlvbiBsYXlvdXROb2Rlcyhub2RlczogT3V0bGluZU5vZGVbXSwgY29sbGFwc2VkSWRzOiBTZXQ8c3RyaW5nPik6IE5vZGVMYXlvdXRbXSB7XG4gIGNvbnN0IHJlc3VsdDogTm9kZUxheW91dFtdID0gW107XG4gIGxldCByb3cgPSAwO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBPdXRsaW5lTm9kZSwgZGVwdGg6IG51bWJlciwgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICByZXN1bHQucHVzaCh7XG4gICAgICBub2RlLFxuICAgICAgZGVwdGgsXG4gICAgICBwYXJlbnRJZCxcbiAgICAgIHg6IDM2ICsgZGVwdGggKiAyNjAsXG4gICAgICB5OiAzNiArIHJvdyAqIDc4XG4gICAgfSk7XG4gICAgcm93ICs9IDE7XG4gICAgaWYgKGNvbGxhcHNlZElkcy5oYXMobm9kZS5pZCkpIHJldHVybjtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEsIG5vZGUuaWQpO1xuICB9O1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHZpc2l0KG5vZGUsIDAsIG51bGwpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBmaW5kTm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lTm9kZSB8IG51bGwge1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4gbm9kZTtcbiAgICBjb25zdCBjaGlsZCA9IGZpbmROb2RlKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNzc0VzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBDU1MgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIENTUy5lc2NhcGUgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIENTUy5lc2NhcGUodmFsdWUpO1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW1wiXFxcXF0vZywgXCJcXFxcJCZcIik7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU4gPSBcIjwhLS0gQkVHSU4gTUFSS0RPV04tTUlORE1BUC1TVEFURVwiO1xuZXhwb3J0IGNvbnN0IE1BUktET1dOX01JTkRNQVBfU1RBVEVfRU5EID0gXCJFTkQgTUFSS0RPV04tTUlORE1BUC1TVEFURSAtLT5cIjtcbmV4cG9ydCBjb25zdCBMRUdBQ1lfTUlORE1BUF9TVEFURV9CRUdJTiA9IFwiPCEtLSBCRUdJTiBMT0NBTC1PQlNJRElBTi1NSU5ETUFQLVNUQVRFXCI7XG5leHBvcnQgY29uc3QgTEVHQUNZX01JTkRNQVBfU1RBVEVfRU5EID0gXCJFTkQgTE9DQUwtT0JTSURJQU4tTUlORE1BUC1TVEFURSAtLT5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBPdXRsaW5lTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNoaWxkcmVuOiBPdXRsaW5lTm9kZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pbmRtYXBCbG9jayB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHJvb3RUaXRsZTogc3RyaW5nO1xuICBzdGFydExpbmU6IG51bWJlcjtcbiAgZW5kTGluZTogbnVtYmVyO1xuICBjb250ZW50U3RhcnRMaW5lOiBudW1iZXI7XG4gIGNvbnRlbnRFbmRMaW5lOiBudW1iZXI7XG4gIHJhd0NvbnRlbnQ6IHN0cmluZztcbiAgbm9kZXM6IE91dGxpbmVOb2RlW107XG4gIGNvbnRlbnRIYXNoOiBzdHJpbmc7XG4gIG1ldGFkYXRhTWlzc2luZzogYm9vbGVhbjtcbiAgd2FybmluZz86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaW5kbWFwSW5kZXhFbnRyeSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHJvb3RUaXRsZTogc3RyaW5nO1xuICBmaWxlUGF0aDogc3RyaW5nO1xuICBsaW5lOiBudW1iZXI7XG4gIGNvbnRlbnRIYXNoOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWluZG1hcFN0YXRlRGF0YSB7XG4gIHNjaGVtYVZlcnNpb246IDE7XG4gIGJsb2NrczogUmVjb3JkPFxuICAgIHN0cmluZyxcbiAgICB7XG4gICAgICBjb2xsYXBzZWRJZHM6IHN0cmluZ1tdO1xuICAgICAgc2NhbGU/OiBudW1iZXI7XG4gICAgICBzY3JvbGxMZWZ0PzogbnVtYmVyO1xuICAgICAgc2Nyb2xsVG9wPzogbnVtYmVyO1xuICAgICAgdXBkYXRlZEF0OiBzdHJpbmc7XG4gICAgfVxuICA+O1xufVxuXG5leHBvcnQgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBub2RlczogT3V0bGluZU5vZGVbXTsgZm9jdXNJZD86IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH07XG5cbmludGVyZmFjZSBQYXJzZU1pbmRtYXBPcHRpb25zIHtcbiAgc291cmNlUGF0aD86IHN0cmluZztcbiAgZmFsbGJhY2tUaXRsZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEJsb2NrQ2FuZGlkYXRlIHtcbiAgc3RhcnRMaW5lOiBudW1iZXI7XG4gIGVuZExpbmU6IG51bWJlcjtcbiAgY29udGVudFN0YXJ0TGluZTogbnVtYmVyO1xuICBjb250ZW50RW5kTGluZTogbnVtYmVyO1xuICBmZW5jZTogc3RyaW5nO1xuICBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgcmF3QXR0cnM6IHN0cmluZztcbiAgcmF3Q29udGVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duOiBzdHJpbmcsIG9wdGlvbnM6IFBhcnNlTWluZG1hcE9wdGlvbnMgPSB7fSk6IE1pbmRtYXBCbG9ja1tdIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKHN0cmlwTWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd24pKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCBjYW5kaWRhdGVzID0gZmluZE1pbmRtYXBGZW5jZXMobGluZXMpO1xuICByZXR1cm4gY2FuZGlkYXRlcy5tYXAoKGNhbmRpZGF0ZSwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZU91dGxpbmVCbG9ja0xpbmVzKGNhbmRpZGF0ZS5yYXdDb250ZW50LnNwbGl0KFwiXFxuXCIpKTtcbiAgICBjb25zdCBub2RlcyA9IHBhcnNlZC5vayA/IHBhcnNlZC5ub2RlcyA6IFtdO1xuICAgIGNvbnN0IHJvb3RUaXRsZSA9IGZpcnN0Um9vdFRpdGxlKG5vZGVzKTtcbiAgICBjb25zdCBnZW5lcmF0ZWRJZCA9IHN0YWJsZU1pbmRtYXBJZChvcHRpb25zLnNvdXJjZVBhdGggPz8gXCJcIiwgaW5kZXgsIGNhbmRpZGF0ZS5yYXdDb250ZW50KTtcbiAgICBjb25zdCBpZCA9IGNhbmRpZGF0ZS5hdHRycy5pZD8udHJpbSgpIHx8IGdlbmVyYXRlZElkO1xuICAgIGNvbnN0IHRpdGxlID0gY2FuZGlkYXRlLmF0dHJzLnRpdGxlPy50cmltKCkgfHwgcm9vdFRpdGxlIHx8IG9wdGlvbnMuZmFsbGJhY2tUaXRsZSB8fCBcIk1pbmRtYXBcIjtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICB0aXRsZSxcbiAgICAgIHJvb3RUaXRsZSxcbiAgICAgIHN0YXJ0TGluZTogY2FuZGlkYXRlLnN0YXJ0TGluZSxcbiAgICAgIGVuZExpbmU6IGNhbmRpZGF0ZS5lbmRMaW5lLFxuICAgICAgY29udGVudFN0YXJ0TGluZTogY2FuZGlkYXRlLmNvbnRlbnRTdGFydExpbmUsXG4gICAgICBjb250ZW50RW5kTGluZTogY2FuZGlkYXRlLmNvbnRlbnRFbmRMaW5lLFxuICAgICAgcmF3Q29udGVudDogY2FuZGlkYXRlLnJhd0NvbnRlbnQsXG4gICAgICBub2RlcyxcbiAgICAgIGNvbnRlbnRIYXNoOiBoYXNoU3RyaW5nKGNhbmRpZGF0ZS5yYXdDb250ZW50KSxcbiAgICAgIG1ldGFkYXRhTWlzc2luZzogIWNhbmRpZGF0ZS5hdHRycy5pZCB8fCAhY2FuZGlkYXRlLmF0dHJzLnRpdGxlLFxuICAgICAgd2FybmluZzogcGFyc2VkLm9rID8gdW5kZWZpbmVkIDogcGFyc2VkLnJlYXNvblxuICAgIH07XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNaW5kbWFwSW5kZXgobWFya2Rvd246IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZywgZmFsbGJhY2tUaXRsZT86IHN0cmluZyk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICByZXR1cm4gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duLCB7IHNvdXJjZVBhdGg6IGZpbGVQYXRoLCBmYWxsYmFja1RpdGxlIH0pLm1hcCgoYmxvY2spID0+ICh7XG4gICAgaWQ6IGJsb2NrLmlkLFxuICAgIHRpdGxlOiBibG9jay50aXRsZSxcbiAgICByb290VGl0bGU6IGJsb2NrLnJvb3RUaXRsZSxcbiAgICBmaWxlUGF0aCxcbiAgICBsaW5lOiBibG9jay5zdGFydExpbmUgKyAxLFxuICAgIGNvbnRlbnRIYXNoOiBibG9jay5jb250ZW50SGFzaFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YShtYXJrZG93bjogc3RyaW5nLCBvcHRpb25zOiBQYXJzZU1pbmRtYXBPcHRpb25zID0ge30pOiBzdHJpbmcge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pO1xuICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3Mobm9ybWFsaXplZCwgb3B0aW9ucyk7XG4gIGlmICghYmxvY2tzLnNvbWUoKGJsb2NrKSA9PiBibG9jay5tZXRhZGF0YU1pc3NpbmcpKSByZXR1cm4gbm9ybWFsaXplZDtcblxuICBjb25zdCBsaW5lcyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCJcXG5cIik7XG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzKSB7XG4gICAgaWYgKCFibG9jay5tZXRhZGF0YU1pc3NpbmcpIGNvbnRpbnVlO1xuICAgIGxpbmVzW2Jsb2NrLnN0YXJ0TGluZV0gPSBgXFxgXFxgXFxgbWluZG1hcCBpZD1cIiR7ZXNjYXBlQXR0cmlidXRlKGJsb2NrLmlkKX1cIiB0aXRsZT1cIiR7ZXNjYXBlQXR0cmlidXRlKGJsb2NrLnRpdGxlKX1cImA7XG4gIH1cbiAgcmV0dXJuIHJlc3RvcmVGaW5hbE5ld2xpbmUobWFya2Rvd24sIGxpbmVzLmpvaW4oXCJcXG5cIikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1pbmRtYXBCbG9jayhtYXJrZG93bjogc3RyaW5nLCBibG9jazogUGljazxNaW5kbWFwQmxvY2ssIFwic3RhcnRMaW5lXCIgfCBcImVuZExpbmVcIiB8IFwiaWRcIiB8IFwidGl0bGVcIj4sIG5vZGVzOiBPdXRsaW5lTm9kZVtdLCB0aXRsZSA9IGJsb2NrLnRpdGxlKTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCByZXBsYWNlbWVudCA9IHNlcmlhbGl6ZU1pbmRtYXBCbG9jayh7IGlkOiBibG9jay5pZCwgdGl0bGUgfSwgbm9kZXMpLnNwbGl0KFwiXFxuXCIpO1xuICBsaW5lcy5zcGxpY2UoYmxvY2suc3RhcnRMaW5lLCBibG9jay5lbmRMaW5lIC0gYmxvY2suc3RhcnRMaW5lICsgMSwgLi4ucmVwbGFjZW1lbnQpO1xuICByZXR1cm4gcmVzdG9yZUZpbmFsTmV3bGluZShtYXJrZG93biwgbGluZXMuam9pbihcIlxcblwiKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRNaW5kbWFwQmxvY2tBdExpbmUobWFya2Rvd246IHN0cmluZywgbGluZTogbnVtYmVyLCBvcHRpb25zOiB7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IG5vZGVzPzogT3V0bGluZU5vZGVbXSB9KTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLmxlbmd0aCA+IDAgPyBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpIDogW107XG4gIGNvbnN0IHRhcmdldExpbmUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsaW5lLCBsaW5lcy5sZW5ndGgpKTtcbiAgY29uc3Qgbm9kZXMgPSBvcHRpb25zLm5vZGVzPy5sZW5ndGhcbiAgICA/IG9wdGlvbnMubm9kZXNcbiAgICA6IFt7IGlkOiBcIm4tMFwiLCB0aXRsZTogb3B0aW9ucy50aXRsZSB8fCBcIk1pbmRtYXBcIiwgY2hpbGRyZW46IFtdIH1dO1xuICBjb25zdCBibG9jayA9IHNlcmlhbGl6ZU1pbmRtYXBCbG9jayh7IGlkOiBvcHRpb25zLmlkLCB0aXRsZTogb3B0aW9ucy50aXRsZSB8fCBcIk1pbmRtYXBcIiB9LCBub2Rlcyk7XG4gIGNvbnN0IHByZWZpeCA9IHRhcmdldExpbmUgPiAwICYmIGxpbmVzW3RhcmdldExpbmUgLSAxXT8udHJpbSgpID8gW1wiXCJdIDogW107XG4gIGNvbnN0IHN1ZmZpeCA9IGxpbmVzW3RhcmdldExpbmVdPy50cmltKCkgPyBbXCJcIl0gOiBbXTtcbiAgbGluZXMuc3BsaWNlKHRhcmdldExpbmUsIDAsIC4uLnByZWZpeCwgLi4uYmxvY2suc3BsaXQoXCJcXG5cIiksIC4uLnN1ZmZpeCk7XG4gIHJldHVybiByZXN0b3JlRmluYWxOZXdsaW5lKG1hcmtkb3duLCBsaW5lcy5qb2luKFwiXFxuXCIpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZU1pbmRtYXBCbG9jayhtZXRhZGF0YTogeyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH0sIG5vZGVzOiBPdXRsaW5lTm9kZVtdKTogc3RyaW5nIHtcbiAgcmV0dXJuIFtcbiAgICBgXFxgXFxgXFxgbWluZG1hcCBpZD1cIiR7ZXNjYXBlQXR0cmlidXRlKG1ldGFkYXRhLmlkKX1cIiB0aXRsZT1cIiR7ZXNjYXBlQXR0cmlidXRlKG1ldGFkYXRhLnRpdGxlKX1cImAsXG4gICAgc2VyaWFsaXplT3V0bGluZShub2RlcyksXG4gICAgXCJgYGBcIlxuICBdLmpvaW4oXCJcXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVPdXRsaW5lKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBpbmRlbnQgPSBcIlxcdFwiKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IE91dGxpbmVOb2RlLCBkZXB0aDogbnVtYmVyKSA9PiB7XG4gICAgbGluZXMucHVzaChgJHtpbmRlbnQucmVwZWF0KGRlcHRoKX0tICR7bm9kZS50aXRsZX1gKTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEpO1xuICB9O1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHZpc2l0KG5vZGUsIDApO1xuICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU5vZGVUaXRsZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBsb2NhdGlvbi5ub2RlLnRpdGxlID0gdGl0bGU7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbm9kZUlkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRTaWJsaW5nQWZ0ZXIoXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgdGl0bGUgPSBcIlwiLFxuICBuZXdJZCA9IGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpXG4pOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBsb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UobG9jYXRpb24uaW5kZXggKyAxLCAwLCB7IGlkOiBuZXdJZCwgdGl0bGUsIGNoaWxkcmVuOiBbXSB9KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBuZXdJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kZW50Tm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBpZiAobG9jYXRpb24uaW5kZXggPT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkNhbm5vdCBpbmRlbnQ6IHRoZXJlIGlzIG5vIHByZXZpb3VzIHNpYmxpbmcuXCIgfTtcbiAgY29uc3QgW25vZGVdID0gbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4LCAxKTtcbiAgbG9jYXRpb24uc2libGluZ3NbbG9jYXRpb24uaW5kZXggLSAxXS5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3V0ZGVudE5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgaWYgKCFsb2NhdGlvbi5wYXJlbnRJZCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiQ2Fubm90IG91dGRlbnQgYSB0b3AtbGV2ZWwgbm9kZS5cIiB9O1xuICBjb25zdCBwYXJlbnRMb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBsb2NhdGlvbi5wYXJlbnRJZCk7XG4gIGlmICghcGFyZW50TG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlBhcmVudCBub2RlIG5vdCBmb3VuZC5cIiB9O1xuICBjb25zdCBmcmVzaExvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghZnJlc2hMb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgY29uc3QgW25vZGVdID0gZnJlc2hMb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UoZnJlc2hMb2NhdGlvbi5pbmRleCwgMSk7XG4gIHBhcmVudExvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShwYXJlbnRMb2NhdGlvbi5pbmRleCArIDEsIDAsIG5vZGUpO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlRW1wdHlOb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGlmIChsb2NhdGlvbi5ub2RlLnRpdGxlLnRyaW0oKSB8fCBsb2NhdGlvbi5ub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPbmx5IGVtcHR5IGxlYWYgbm9kZXMgY2FuIGJlIGRlbGV0ZWQgd2l0aCBCYWNrc3BhY2UvRGVsZXRlLlwiIH07XG4gIH1cbiAgbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4LCAxKTtcbiAgY29uc3QgZm9jdXNJZCA9IGxvY2F0aW9uLnNpYmxpbmdzW01hdGgubWF4KDAsIGxvY2F0aW9uLmluZGV4IC0gMSldPy5pZCA/PyBsb2NhdGlvbi5zaWJsaW5nc1swXT8uaWQ7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kdWNlUGFyZW50RnJvbVNlbGVjdGVkKFxuICBub2RlczogT3V0bGluZU5vZGVbXSxcbiAgc2VsZWN0ZWRJZHM6IHN0cmluZ1tdLFxuICB0aXRsZSA9IFwiXHU1RjUyXHU3RUIzXCIsXG4gIG5ld0lkID0gY3JlYXRlR2VuZXJhdGVkTm9kZUlkKClcbik6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCB1bmlxdWVJZHMgPSBbLi4ubmV3IFNldChzZWxlY3RlZElkcyldO1xuICBpZiAodW5pcXVlSWRzLmxlbmd0aCA8IDIpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlNlbGVjdCBhdCBsZWFzdCB0d28gc2libGluZyBub2Rlcy5cIiB9O1xuXG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb25zID0gdW5pcXVlSWRzLm1hcCgoaWQpID0+IGZpbmRMb2NhdGlvbihuZXh0LCBpZCkpO1xuICBpZiAobG9jYXRpb25zLnNvbWUoKGxvY2F0aW9uKSA9PiAhbG9jYXRpb24pKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJTb21lIHNlbGVjdGVkIG5vZGVzIG5vIGxvbmdlciBleGlzdC5cIiB9O1xuICBjb25zdCBjb25jcmV0ZSA9IGxvY2F0aW9ucyBhcyBOb25OdWxsYWJsZTxSZXR1cm5UeXBlPHR5cGVvZiBmaW5kTG9jYXRpb24+PltdO1xuICBjb25zdCBwYXJlbnRLZXkgPSBjb25jcmV0ZVswXS5wYXJlbnRJZCA/PyBcIl9fcm9vdF9fXCI7XG4gIGlmIChjb25jcmV0ZS5zb21lKChsb2NhdGlvbikgPT4gKGxvY2F0aW9uLnBhcmVudElkID8/IFwiX19yb290X19cIikgIT09IHBhcmVudEtleSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIG5vZGVzIHdpdGggdGhlIHNhbWUgcGFyZW50LlwiIH07XG4gIH1cblxuICBjb25zdCBzaWJsaW5ncyA9IGNvbmNyZXRlWzBdLnNpYmxpbmdzO1xuICBpZiAoY29uY3JldGUuc29tZSgobG9jYXRpb24pID0+IGxvY2F0aW9uLnNpYmxpbmdzICE9PSBzaWJsaW5ncykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIG5vZGVzIHdpdGggdGhlIHNhbWUgcGFyZW50LlwiIH07XG4gIH1cblxuICBjb25zdCBzb3J0ZWQgPSBjb25jcmV0ZS5zbGljZSgpLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgZm9yIChsZXQgaW5kZXggPSAxOyBpbmRleCA8IHNvcnRlZC5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBpZiAoc29ydGVkW2luZGV4XS5pbmRleCAhPT0gc29ydGVkW2luZGV4IC0gMV0uaW5kZXggKyAxKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIGFkamFjZW50IHNpYmxpbmcgbm9kZXMuXCIgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmaXJzdEluZGV4ID0gc29ydGVkWzBdLmluZGV4O1xuICBjb25zdCBzZWxlY3RlZE5vZGVzID0gc2libGluZ3Muc3BsaWNlKGZpcnN0SW5kZXgsIHNvcnRlZC5sZW5ndGgpO1xuICBzaWJsaW5ncy5zcGxpY2UoZmlyc3RJbmRleCwgMCwgeyBpZDogbmV3SWQsIHRpdGxlLCBjaGlsZHJlbjogc2VsZWN0ZWROb2RlcyB9KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBuZXdJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaXBNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bjogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKVxuICAgIC5yZXBsYWNlKG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCksIFwiXCIpXG4gICAgLnJlcGxhY2UobGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKSwgXCJcIilcbiAgICAucmVwbGFjZSgvXFxuezMsfSQvZywgXCJcXG5cXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duOiBzdHJpbmcpOiBNaW5kbWFwU3RhdGVEYXRhIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbWF0Y2ggPSBtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLmV4ZWMobm9ybWFsaXplZCkgPz8gbGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKS5leGVjKG5vcm1hbGl6ZWQpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gZW1wdHlNaW5kbWFwU3RhdGUoKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG1hdGNoWzFdLnRyaW0oKSkgYXMgTWluZG1hcFN0YXRlRGF0YTtcbiAgICBpZiAocGFyc2VkLnNjaGVtYVZlcnNpb24gIT09IDEgfHwgdHlwZW9mIHBhcnNlZC5ibG9ja3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmJsb2NrcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGVtcHR5TWluZG1hcFN0YXRlKCk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBlbXB0eU1pbmRtYXBTdGF0ZSgpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bjogc3RyaW5nLCBzdGF0ZTogTWluZG1hcFN0YXRlRGF0YSk6IHN0cmluZyB7XG4gIGxldCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pLnRyaW1FbmQoKTtcbiAgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZShsZWdhY3lNaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBcIlwiKS50cmltRW5kKCk7XG4gIGNvbnN0IGJsb2NrID0gYCR7TUFSS0RPV05fTUlORE1BUF9TVEFURV9CRUdJTn1cXG4ke0pTT04uc3RyaW5naWZ5KHN0YXRlLCBudWxsLCAyKX1cXG4ke01BUktET1dOX01JTkRNQVBfU1RBVEVfRU5EfWA7XG4gIGlmIChtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLnRlc3Qobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gYCR7bm9ybWFsaXplZC5yZXBsYWNlKG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCksIGJsb2NrKX1cXG5gO1xuICB9XG4gIHJldHVybiBgJHtub3JtYWxpemVkfVxcblxcbiR7YmxvY2t9XFxuYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2hTdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoYXNoID0gMjE2NjEzNjI2MTtcbiAgZm9yIChjb25zdCBjaGFyIG9mIG5vcm1hbGl6ZU5ld2xpbmVzKHZhbHVlKSkge1xuICAgIGhhc2ggXj0gY2hhci5jaGFyQ29kZUF0KDApO1xuICAgIGhhc2ggPSBNYXRoLmltdWwoaGFzaCwgMTY3Nzc2MTkpO1xuICB9XG4gIHJldHVybiAoaGFzaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsIFwiMFwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1pbmRtYXBJZChzZWVkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYG1pbmRtYXAtJHtoYXNoU3RyaW5nKGAke3NlZWR9OiR7RGF0ZS5ub3coKX1gKS5zbGljZSgwLCAxMCl9YDtcbn1cblxuZnVuY3Rpb24gZmluZE1pbmRtYXBGZW5jZXMobGluZXM6IHN0cmluZ1tdKTogQmxvY2tDYW5kaWRhdGVbXSB7XG4gIGNvbnN0IGJsb2NrczogQmxvY2tDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGxldCBsaW5lID0gMDsgbGluZSA8IGxpbmVzLmxlbmd0aDsgbGluZSArPSAxKSB7XG4gICAgY29uc3Qgb3BlbiA9IGxpbmVzW2xpbmVdLm1hdGNoKC9eKGB7Myx9fH57Myx9KVxccyptaW5kbWFwKD86XFxzKyguKikpP1xccyokLyk7XG4gICAgaWYgKCFvcGVuKSBjb250aW51ZTtcbiAgICBjb25zdCBmZW5jZSA9IG9wZW5bMV07XG4gICAgY29uc3QgZmVuY2VDaGFyID0gZmVuY2VbMF07XG4gICAgY29uc3QgbWluRmVuY2VMZW5ndGggPSBmZW5jZS5sZW5ndGg7XG4gICAgbGV0IGNsb3NlTGluZSA9IC0xO1xuICAgIGZvciAobGV0IGN1cnNvciA9IGxpbmUgKyAxOyBjdXJzb3IgPCBsaW5lcy5sZW5ndGg7IGN1cnNvciArPSAxKSB7XG4gICAgICBpZiAobmV3IFJlZ0V4cChgXiR7ZXNjYXBlUmVnRXhwKGZlbmNlQ2hhcil9eyR7bWluRmVuY2VMZW5ndGh9LH1cXFxccyokYCkudGVzdChsaW5lc1tjdXJzb3JdKSkge1xuICAgICAgICBjbG9zZUxpbmUgPSBjdXJzb3I7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY2xvc2VMaW5lID09PSAtMSkgY29udGludWU7XG4gICAgY29uc3QgcmF3QXR0cnMgPSBvcGVuWzJdID8/IFwiXCI7XG4gICAgY29uc3QgY29udGVudExpbmVzID0gbGluZXMuc2xpY2UobGluZSArIDEsIGNsb3NlTGluZSk7XG4gICAgYmxvY2tzLnB1c2goe1xuICAgICAgc3RhcnRMaW5lOiBsaW5lLFxuICAgICAgZW5kTGluZTogY2xvc2VMaW5lLFxuICAgICAgY29udGVudFN0YXJ0TGluZTogbGluZSArIDEsXG4gICAgICBjb250ZW50RW5kTGluZTogY2xvc2VMaW5lIC0gMSxcbiAgICAgIGZlbmNlLFxuICAgICAgYXR0cnM6IHBhcnNlQXR0cmlidXRlcyhyYXdBdHRycyksXG4gICAgICByYXdBdHRycyxcbiAgICAgIHJhd0NvbnRlbnQ6IGNvbnRlbnRMaW5lcy5qb2luKFwiXFxuXCIpXG4gICAgfSk7XG4gICAgbGluZSA9IGNsb3NlTGluZTtcbiAgfVxuICByZXR1cm4gYmxvY2tzO1xufVxuXG5mdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMocmF3QXR0cnM6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBjb25zdCByZWdleHAgPSAvKFtBLVphLXpfXVtcXHctXSopPVwiKFteXCJdKilcIi9nO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIHdoaWxlICgobWF0Y2ggPSByZWdleHAuZXhlYyhyYXdBdHRycykpICE9PSBudWxsKSB7XG4gICAgYXR0cnNbbWF0Y2hbMV1dID0gdW5lc2NhcGVBdHRyaWJ1dGUobWF0Y2hbMl0pO1xuICB9XG4gIHJldHVybiBhdHRycztcbn1cblxuZnVuY3Rpb24gcGFyc2VPdXRsaW5lQmxvY2tMaW5lcyhcbiAgYmxvY2tMaW5lczogc3RyaW5nW11cbik6IHsgb2s6IHRydWU7IG5vZGVzOiBPdXRsaW5lTm9kZVtdIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gIGNvbnN0IG1lYW5pbmdmdWxMaW5lcyA9IGJsb2NrTGluZXMuZmlsdGVyKChsaW5lKSA9PiBsaW5lLnRyaW0oKS5sZW5ndGggPiAwKTtcbiAgaWYgKG1lYW5pbmdmdWxMaW5lcy5sZW5ndGggPT09IDApIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogW10gfTtcblxuICBjb25zdCByb290czogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBjb25zdCBzdGFjazogQXJyYXk8eyBub2RlOiBPdXRsaW5lTm9kZTsgZGVwdGg6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgcHJldmlvdXNEZXB0aCA9IDA7XG5cbiAgZm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgbWVhbmluZ2Z1bExpbmVzLmxlbmd0aDsgbGluZUluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZVBsYWluTGlzdEl0ZW0obWVhbmluZ2Z1bExpbmVzW2xpbmVJbmRleF0pO1xuICAgIGlmICghcGFyc2VkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogcGFyc2VkLnJlYXNvbiB9O1xuICAgIGlmIChsaW5lSW5kZXggPT09IDAgJiYgcGFyc2VkLmRlcHRoICE9PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUaGUgbWluZG1hcCBsaXN0IG11c3Qgc3RhcnQgYXQgZGVwdGggMC5cIiB9O1xuICAgIGlmIChwYXJzZWQuZGVwdGggPiBwcmV2aW91c0RlcHRoICsgMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiSW5kZW50YXRpb24ganVtcHMgbW9yZSB0aGFuIG9uZSBsZXZlbC5cIiB9O1xuICAgIGNvbnN0IHBhcmVudCA9IHBhcnNlZC5kZXB0aCA9PT0gMCA/IG51bGwgOiBzdGFja1twYXJzZWQuZGVwdGggLSAxXT8ubm9kZTtcbiAgICBpZiAocGFyc2VkLmRlcHRoID4gMCAmJiAhcGFyZW50KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJNaXNzaW5nIHBhcmVudCBsaXN0IGl0ZW0uXCIgfTtcbiAgICBjb25zdCBzaWJsaW5ncyA9IHBhcmVudCA/IHBhcmVudC5jaGlsZHJlbiA6IHJvb3RzO1xuICAgIGNvbnN0IG5vZGU6IE91dGxpbmVOb2RlID0ge1xuICAgICAgaWQ6IGBuLSR7Wy4uLnN0YWNrLnNsaWNlKDAsIHBhcnNlZC5kZXB0aCkubWFwKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCksIHNpYmxpbmdzLmxlbmd0aF0uam9pbihcIi1cIil9YCxcbiAgICAgIHRpdGxlOiBwYXJzZWQudGl0bGUsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuICAgIHNpYmxpbmdzLnB1c2gobm9kZSk7XG4gICAgc3RhY2tbcGFyc2VkLmRlcHRoXSA9IHsgbm9kZSwgZGVwdGg6IHBhcnNlZC5kZXB0aCB9O1xuICAgIHN0YWNrLmxlbmd0aCA9IHBhcnNlZC5kZXB0aCArIDE7XG4gICAgcHJldmlvdXNEZXB0aCA9IHBhcnNlZC5kZXB0aDtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2Rlczogcm9vdHMgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFpbkxpc3RJdGVtKGxpbmU6IHN0cmluZyk6XG4gIHwgeyBvazogdHJ1ZTsgZGVwdGg6IG51bWJlcjsgdGl0bGU6IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH0ge1xuICBpZiAoL15cXHMqXFxkK1xcLlxccysvLnRlc3QobGluZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk9yZGVyZWQgbGlzdHMgYXJlIG5vdCBzdXBwb3J0ZWQuXCIgfTtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKC9eKFsgXFx0XSopLVxccz8oLiopJC8pO1xuICBpZiAoIW1hdGNoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPbmx5IHBsYWluIHVub3JkZXJlZCBsaXN0IGl0ZW1zIGFyZSBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgY29uc3QgaW5kZW50ID0gbWF0Y2hbMV07XG4gIGlmIChpbmRlbnQuaW5jbHVkZXMoXCJcXHRcIikgJiYgaW5kZW50LmluY2x1ZGVzKFwiIFwiKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiRG8gbm90IG1peCB0YWJzIGFuZCBzcGFjZXMgZm9yIG1pbmRtYXAgaW5kZW50YXRpb24uXCIgfTtcbiAgbGV0IGRlcHRoID0gMDtcbiAgaWYgKGluZGVudC5pbmNsdWRlcyhcIlxcdFwiKSkge1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBpZiAoaW5kZW50Lmxlbmd0aCAlIDIgIT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkxlZ2FjeSBzcGFjZSBpbmRlbnRhdGlvbiBtdXN0IHVzZSBtdWx0aXBsZXMgb2YgdHdvIHNwYWNlcy5cIiB9O1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aCAvIDI7XG4gIH1cbiAgY29uc3QgdGl0bGUgPSBtYXRjaFsyXSA/PyBcIlwiO1xuICBpZiAoL15cXFtbIHhYXVxcXVxccysvLnRlc3QodGl0bGUpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUYXNrIGxpc3QgaXRlbXMgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRlcHRoLCB0aXRsZSB9O1xufVxuXG5mdW5jdGlvbiBmaW5kTG9jYXRpb24oXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXG4pOiB7IG5vZGU6IE91dGxpbmVOb2RlOyBzaWJsaW5nczogT3V0bGluZU5vZGVbXTsgaW5kZXg6IG51bWJlcjsgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgfSB8IG51bGwge1xuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbm9kZXMubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzW2luZGV4XTtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4geyBub2RlLCBzaWJsaW5nczogbm9kZXMsIGluZGV4LCBwYXJlbnRJZCB9O1xuICAgIGNvbnN0IGNoaWxkID0gZmluZExvY2F0aW9uKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCwgbm9kZS5pZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsb25lTm9kZXMobm9kZXM6IE91dGxpbmVOb2RlW10pOiBPdXRsaW5lTm9kZVtdIHtcbiAgcmV0dXJuIG5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICBpZDogbm9kZS5pZCxcbiAgICB0aXRsZTogbm9kZS50aXRsZSxcbiAgICBjaGlsZHJlbjogY2xvbmVOb2Rlcyhub2RlLmNoaWxkcmVuKVxuICB9KSk7XG59XG5cbmZ1bmN0aW9uIGVtcHR5TWluZG1hcFN0YXRlKCk6IE1pbmRtYXBTdGF0ZURhdGEge1xuICByZXR1cm4geyBzY2hlbWFWZXJzaW9uOiAxLCBibG9ja3M6IHt9IH07XG59XG5cbmZ1bmN0aW9uIHN0YWJsZU1pbmRtYXBJZChzb3VyY2VQYXRoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgbWluZG1hcC0ke2hhc2hTdHJpbmcoYCR7c291cmNlUGF0aH06JHtpbmRleH06JHtjb250ZW50fWApLnNsaWNlKDAsIDEwKX1gO1xufVxuXG5mdW5jdGlvbiBmaXJzdFJvb3RUaXRsZShub2RlczogT3V0bGluZU5vZGVbXSk6IHN0cmluZyB7XG4gIHJldHVybiBub2Rlc1swXT8udGl0bGU/LnRyaW0oKSA/PyBcIlwiO1xufVxuXG5sZXQgZ2VuZXJhdGVkSWRDb3VudGVyID0gMDtcbmZ1bmN0aW9uIGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpOiBzdHJpbmcge1xuICBnZW5lcmF0ZWRJZENvdW50ZXIgKz0gMTtcbiAgcmV0dXJuIGBub2RlLSR7RGF0ZS5ub3coKS50b1N0cmluZygzNil9LSR7Z2VuZXJhdGVkSWRDb3VudGVyfWA7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5ld2xpbmVzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyXFxuL2csIFwiXFxuXCIpLnJlcGxhY2UoL1xcci9nLCBcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUZpbmFsTmV3bGluZShvcmlnaW5hbDogc3RyaW5nLCBuZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplTmV3bGluZXMob3JpZ2luYWwpLmVuZHNXaXRoKFwiXFxuXCIpICYmICFuZXh0LmVuZHNXaXRoKFwiXFxuXCIpID8gYCR7bmV4dH1cXG5gIDogbmV4dDtcbn1cblxuZnVuY3Rpb24gbWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKE1BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU4pfVxcXFxuKFtcXFxcc1xcXFxTXSo/KVxcXFxuJHtlc2NhcGVSZWdFeHAoTUFSS0RPV05fTUlORE1BUF9TVEFURV9FTkQpfWAsIFwibVwiKTtcbn1cblxuZnVuY3Rpb24gbGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0JFR0lOKX1cXFxcbihbXFxcXHNcXFxcU10qPylcXFxcbiR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0VORCl9YCwgXCJtXCIpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVBdHRyaWJ1dGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIikucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIik7XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlQXR0cmlidXRlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQVlPOzs7QUNaQSxJQUFNLCtCQUErQjtBQUNyQyxJQUFNLDZCQUE2QjtBQUNuQyxJQUFNLDZCQUE2QjtBQUNuQyxJQUFNLDJCQUEyQjtBQWtFakMsU0FBUyxtQkFBbUIsVUFBa0IsVUFBK0IsQ0FBQyxHQUFtQjtBQUN0RyxRQUFNLGFBQWEsa0JBQWtCLHVCQUF1QixRQUFRLENBQUM7QUFDckUsUUFBTSxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQ25DLFFBQU0sYUFBYSxrQkFBa0IsS0FBSztBQUMxQyxTQUFPLFdBQVcsSUFBSSxDQUFDLFdBQVcsVUFBVTtBQUMxQyxVQUFNLFNBQVMsdUJBQXVCLFVBQVUsV0FBVyxNQUFNLElBQUksQ0FBQztBQUN0RSxVQUFNLFFBQVEsT0FBTyxLQUFLLE9BQU8sUUFBUSxDQUFDO0FBQzFDLFVBQU0sWUFBWSxlQUFlLEtBQUs7QUFDdEMsVUFBTSxjQUFjLGdCQUFnQixRQUFRLGNBQWMsSUFBSSxPQUFPLFVBQVUsVUFBVTtBQUN6RixVQUFNLEtBQUssVUFBVSxNQUFNLElBQUksS0FBSyxLQUFLO0FBQ3pDLFVBQU0sUUFBUSxVQUFVLE1BQU0sT0FBTyxLQUFLLEtBQUssYUFBYSxRQUFRLGlCQUFpQjtBQUNyRixXQUFPO0FBQUEsTUFDTDtB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
