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
  blocks = [];
  block = null;
  nodes = [];
  fileState = { schemaVersion: 1, blocks: {} };
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
    if (!id || !this.block) {
      new import_obsidian.Notice("No mindmap node selected.");
      return;
    }
    const input = this.contentEl.querySelector(
      `input[data-block-id="${cssEscape(this.block.id)}"][data-node-id="${cssEscape(id)}"]`
    );
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
    this.blocks = blocks;
    this.fileState = readMindmapState(markdown);
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
    const state = this.fileState.blocks[block.id];
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
    this.blocks = blocks;
    this.fileState = readMindmapState(markdown);
    if (!this.block) {
      if (blocks.length > 0) {
        this.activateBlock(blocks[0].id);
      }
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
      text: this.sourceFile?.basename ?? "Markdown Mindmap"
    });
    titleGroup.createDiv({
      cls: "local-mindmap-subtitle",
      text: this.sourceFile && this.blocks.length > 0 ? `${this.sourceFile.path} \xB7 ${this.blocks.length} mindmap${this.blocks.length > 1 ? "s" : ""} rendered` : this.sourceFile ? `${this.sourceFile.path} \xB7 no mindmap block` : "Choose a mindmap or create one in the active file."
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
    if (this.blocks.length === 0) {
      const empty = container.createDiv({ cls: "local-mindmap-empty" });
      empty.createDiv({ text: "This file has no mindmap block." });
      const button = empty.createEl("button", { text: "Create mindmap in current file" });
      button.type = "button";
      button.addEventListener("click", () => void this.plugin.createMindmapInCurrentFile(this.sourceFile ?? void 0));
      return;
    }
    const overview = container.createDiv({ cls: "local-mindmap-overview" });
    for (const block of this.blocks) {
      this.renderMindmapBlock(overview, block);
    }
  }
  renderMindmapBlock(container, block) {
    const active = this.block?.id === block.id;
    const section = container.createDiv({ cls: active ? "local-mindmap-block is-active" : "local-mindmap-block" });
    const header = section.createDiv({ cls: "local-mindmap-block-header" });
    header.createDiv({ cls: "local-mindmap-block-title", text: block.title || block.rootTitle || "Untitled mindmap" });
    header.createDiv({ cls: "local-mindmap-block-meta", text: `lines ${block.startLine + 1}-${block.endLine + 1}` });
    if (block.warning) section.createDiv({ cls: "local-mindmap-warning", text: block.warning });
    const blockNodes = active ? this.nodes : block.nodes;
    if (blockNodes.length === 0) {
      section.createDiv({ cls: "local-mindmap-empty", text: "This mindmap block is empty." });
      return;
    }
    const collapsedIds = active ? this.collapsedIds : new Set(this.fileState.blocks[block.id]?.collapsedIds ?? []);
    const stage = section.createDiv({ cls: "local-mindmap-stage local-mindmap-block-stage" });
    stage.scrollLeft = this.scrollLeft;
    stage.scrollTop = this.scrollTop;
    stage.addEventListener("scroll", () => {
      if (!active) return;
      this.scrollLeft = stage.scrollLeft;
      this.scrollTop = stage.scrollTop;
      this.updateCache();
      this.scheduleStatePersist();
    });
    const surface = stage.createDiv({ cls: "local-mindmap-surface" });
    surface.style.transform = `scale(${this.scale})`;
    surface.style.transformOrigin = "top left";
    const layouts = layoutNodes(blockNodes, collapsedIds);
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
      this.renderNode(surface, block, layout);
    }
    window.setTimeout(() => {
      if (!active) return;
      stage.scrollLeft = this.scrollLeft;
      stage.scrollTop = this.scrollTop;
    }, 0);
  }
  renderNode(surface, block, layout) {
    const node = layout.node;
    const active = this.block?.id === block.id;
    const selected = active && this.selectedIds.has(node.id);
    const card = surface.createDiv({ cls: selected ? "local-mindmap-node is-selected" : "local-mindmap-node" });
    card.style.left = `${layout.x}px`;
    card.style.top = `${layout.y}px`;
    card.addEventListener("click", (event) => {
      if (event.target.tagName === "INPUT" || event.target.tagName === "BUTTON") return;
      this.selectNode(block.id, node.id, event.metaKey || event.ctrlKey || event.shiftKey);
    });
    const row = card.createDiv({ cls: "local-mindmap-node-row" });
    const select = row.createEl("input", { cls: "local-mindmap-select" });
    select.type = "checkbox";
    select.checked = selected;
    select.addEventListener("change", () => this.selectNode(block.id, node.id, true));
    const blockCollapsedIds = active ? this.collapsedIds : new Set(this.fileState.blocks[block.id]?.collapsedIds ?? []);
    const collapse = row.createEl("button", { cls: "local-mindmap-collapse", text: node.children.length > 0 ? blockCollapsedIds.has(node.id) ? "+" : "-" : "" });
    collapse.type = "button";
    collapse.disabled = node.children.length === 0;
    collapse.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleCollapse(block.id, node.id);
    });
    const input = row.createEl("input", { cls: "local-mindmap-node-title" });
    input.dataset.blockId = block.id;
    input.dataset.nodeId = node.id;
    input.value = node.title;
    input.placeholder = "Untitled";
    input.addEventListener("focus", () => {
      this.activateBlock(block.id);
      this.selectedIds = /* @__PURE__ */ new Set([node.id]);
      this.updateCache();
      card.addClass("is-selected");
      select.checked = true;
    });
    input.addEventListener("blur", () => void this.commitTitle(block.id, node.id, input.value));
    input.addEventListener("keydown", (event) => this.handleNodeKeydown(event, block.id, node.id, input));
  }
  handleNodeKeydown(event, blockId, nodeId, input) {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.commitTitle(blockId, nodeId, input.value, { skipRender: true }).then(() => this.applyOperation(insertSiblingAfter(this.nodes, nodeId, "")));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      void this.commitTitle(blockId, nodeId, input.value, { skipRender: true }).then(
        () => this.applyOperation(event.shiftKey ? outdentNode(this.nodes, nodeId) : indentNode(this.nodes, nodeId))
      );
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && input.value.trim() === "") {
      event.preventDefault();
      void this.applyOperation(deleteEmptyNode(this.nodes, nodeId));
    }
  }
  async commitTitle(blockId, nodeId, title, options = {}) {
    this.activateBlock(blockId);
    const node = findNode(this.nodes, nodeId);
    if (!node || node.title === title) return;
    await this.applyOperation(updateNodeTitle(this.nodes, nodeId, title), options);
  }
  selectNode(blockId, nodeId, additive) {
    this.activateBlock(blockId);
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
    } else {
      this.selectedIds.add(nodeId);
    }
    this.updateCache();
    this.render();
  }
  toggleCollapse(blockId, nodeId) {
    this.activateBlock(blockId);
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
      this.nodes = nextBlock.nodes;
      this.blocks = parseMindmapBlocks(next, { sourcePath: this.sourceFile.path, fallbackTitle: this.sourceFile.basename });
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
  activateBlock(blockId) {
    if (this.block?.id === blockId) return;
    const block = this.blocks.find((candidate) => candidate.id === blockId);
    if (!block) return;
    this.block = block;
    this.nodes = block.nodes;
    const cache = this.sourceFile ? this.plugin.getFileCache(this.sourceFile.path) : null;
    const previousActiveId = cache?.activeBlockId;
    const state = this.fileState.blocks[block.id];
    this.collapsedIds = new Set(previousActiveId === block.id ? cache?.collapsedIds ?? [] : state?.collapsedIds ?? []);
    this.scale = previousActiveId === block.id ? cache?.scale ?? this.scale : state?.scale ?? this.scale;
    this.scrollLeft = previousActiveId === block.id ? cache?.scrollLeft ?? 0 : state?.scrollLeft ?? 0;
    this.scrollTop = previousActiveId === block.id ? cache?.scrollTop ?? 0 : state?.scrollTop ?? 0;
    if (this.sourceFile) this.plugin.setActiveBlockForFile(this.sourceFile.path, block.id);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL291dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBJdGVtVmlldyxcbiAgTWFya2Rvd25WaWV3LFxuICBNb2RhbCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgYnVpbGRNaW5kbWFwSW5kZXgsXG4gIGNyZWF0ZU1pbmRtYXBJZCxcbiAgZGVsZXRlRW1wdHlOb2RlLFxuICBpbmRlbnROb2RlLFxuICBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQsXG4gIGluc2VydE1pbmRtYXBCbG9ja0F0TGluZSxcbiAgaW5zZXJ0U2libGluZ0FmdGVyLFxuICBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YSxcbiAgb3V0ZGVudE5vZGUsXG4gIHBhcnNlTWluZG1hcEJsb2NrcyxcbiAgcmVhZE1pbmRtYXBTdGF0ZSxcbiAgcmVwbGFjZU1pbmRtYXBCbG9jayxcbiAgdXBkYXRlTm9kZVRpdGxlLFxuICB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayxcbiAgdHlwZSBNaW5kbWFwQmxvY2ssXG4gIHR5cGUgTWluZG1hcEluZGV4RW50cnksXG4gIHR5cGUgTWluZG1hcFN0YXRlRGF0YSxcbiAgdHlwZSBPdXRsaW5lTm9kZSxcbiAgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0XG59IGZyb20gXCIuL291dGxpbmUudHNcIjtcblxuY29uc3QgVklFV19UWVBFX01JTkRNQVAgPSBcIm1hcmtkb3duLW1pbmRtYXAtd29ya2JlbmNoXCI7XG5cbmludGVyZmFjZSBMb2NhbE1pbmRtYXBTZXR0aW5ncyB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogYm9vbGVhbjtcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IGJvb2xlYW47XG4gIGZvbGxvd0FjdGl2ZUZpbGU6IGJvb2xlYW47XG4gIHNjYW5WYXVsdE9uT3BlbjogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSB7XG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogdHJ1ZSxcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IHRydWUsXG4gIGZvbGxvd0FjdGl2ZUZpbGU6IHRydWUsXG4gIHNjYW5WYXVsdE9uT3BlbjogdHJ1ZVxufTtcblxuaW50ZXJmYWNlIEZpbGVNaW5kbWFwQ2FjaGUge1xuICBhY3RpdmVCbG9ja0lkPzogc3RyaW5nO1xuICBzZWxlY3RlZElkczogc3RyaW5nW107XG4gIGNvbGxhcHNlZElkczogc3RyaW5nW107XG4gIHNjYWxlOiBudW1iZXI7XG4gIHNjcm9sbExlZnQ6IG51bWJlcjtcbiAgc2Nyb2xsVG9wOiBudW1iZXI7XG4gIGxhc3RDb250ZW50SGFzaD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIE5vZGVMYXlvdXQge1xuICBub2RlOiBPdXRsaW5lTm9kZTtcbiAgZGVwdGg6IG51bWJlcjtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHBhcmVudElkOiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXJrZG93bk1pbmRtYXBQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuICByZWFkb25seSBmaWxlQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgRmlsZU1pbmRtYXBDYWNoZT4oKTtcbiAgcmVhZG9ubHkgbWluZG1hcEluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIE1pbmRtYXBJbmRleEVudHJ5W10+KCk7XG4gIHJlYWRvbmx5IHN1cHByZXNzTW9kaWZ5UGF0aHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuICBwcml2YXRlIHZhdWx0U2NhblRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBsYXN0TWFya2Rvd25GaWxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cbiAgYXN5bmMgb25sb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXJrZG93bk1pbmRtYXBTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3RlclZpZXcoVklFV19UWVBFX01JTkRNQVAsIChsZWFmKSA9PiBuZXcgTWluZG1hcFdvcmtiZW5jaFZpZXcobGVhZiwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRSaWJib25JY29uKFwiZ2l0LWZvcmtcIiwgXCJPcGVuIE1hcmtkb3duIE1pbmRtYXBcIiwgKCkgPT4ge1xuICAgICAgdm9pZCB0aGlzLm9wZW5NaW5kbWFwUGFuZWwoKTtcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLW1hcmtkb3duLW1pbmRtYXBcIixcbiAgICAgIG5hbWU6IFwiT3BlbiBNYXJrZG93biBNaW5kbWFwXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcFBhbmVsKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWN1cnJlbnQtb3V0bGluZS1taW5kbWFwXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gTWluZG1hcCBmb3IgQ3VycmVudCBPdXRsaW5lXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcFBhbmVsKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJjcmVhdGUtbWluZG1hcC1pbi1jdXJyZW50LWZpbGVcIixcbiAgICAgIG5hbWU6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSgpXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiaW5kdWNlLXBhcmVudC1mcm9tLXNlbGVjdGVkLW5vZGVzXCIsXG4gICAgICBuYW1lOiBcIkluZHVjZSBQYXJlbnQgZnJvbSBTZWxlY3RlZCBOb2Rlc1wiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMud2l0aE1pbmRtYXBWaWV3KCh2aWV3KSA9PiB2aWV3LnByb21wdEluZHVjZVBhcmVudCgpKVxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImZvY3VzLW1pbmRtYXAtbm9kZVwiLFxuICAgICAgbmFtZTogXCJGb2N1cyBNaW5kbWFwIE5vZGVcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLndpdGhNaW5kbWFwVmlldygodmlldykgPT4gdmlldy5mb2N1c1NlbGVjdGVkTm9kZSgpKVxuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uKFwiYWN0aXZlLWxlYWYtY2hhbmdlXCIsICgpID0+IHtcbiAgICAgICAgdGhpcy5jYXB0dXJlQWN0aXZlTWFya2Rvd25GaWxlKCk7XG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlKSByZXR1cm47XG4gICAgICAgIHRoaXMucmVmcmVzaE9wZW5NaW5kbWFwVmlld3MoKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbihcImVkaXRvci1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICB0aGlzLmNhcHR1cmVBY3RpdmVNYXJrZG93bkZpbGUoKTtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmZvbGxvd0FjdGl2ZUZpbGUpIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWZyZXNoT3Blbk1pbmRtYXBWaWV3cyh7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlLCBmcm9tRWRpdG9yQ2hhbmdlOiB0cnVlIH0pO1xuICAgICAgfSlcbiAgICApO1xuXG4gICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJtb2RpZnlcIiwgKGZpbGUpID0+IHtcbiAgICAgICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm47XG4gICAgICAgIHZvaWQgdGhpcy5oYW5kbGVNYXJrZG93bkZpbGVNb2RpZmllZChmaWxlKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgIHRoaXMuY2FwdHVyZUFjdGl2ZU1hcmtkb3duRmlsZSgpO1xuICAgICAgaWYgKHRoaXMuc2V0dGluZ3Muc2NhblZhdWx0T25PcGVuKSB2b2lkIHRoaXMucmVmcmVzaFZhdWx0SW5kZXgoKTtcbiAgICB9KTtcbiAgfVxuXG4gIG9udW5sb2FkKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnZhdWx0U2NhblRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMudmF1bHRTY2FuVGltZXIpO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5kZXRhY2hMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHJhdyA9IChhd2FpdCB0aGlzLmxvYWREYXRhKCkpIGFzIFBhcnRpYWw8TG9jYWxNaW5kbWFwU2V0dGluZ3M+ICYgeyBmb2xsb3dBY3RpdmVPdXRsaW5lPzogYm9vbGVhbjsgaW5kZW50VW5pdD86IG51bWJlciB9IHwgbnVsbDtcbiAgICB0aGlzLnNldHRpbmdzID0ge1xuICAgICAgLi4uREVGQVVMVF9TRVRUSU5HUyxcbiAgICAgIC4uLihyYXcgPz8ge30pLFxuICAgICAgZm9sbG93QWN0aXZlRmlsZTogcmF3Py5mb2xsb3dBY3RpdmVGaWxlID8/IHJhdz8uZm9sbG93QWN0aXZlT3V0bGluZSA/PyBERUZBVUxUX1NFVFRJTkdTLmZvbGxvd0FjdGl2ZUZpbGVcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICBhc3luYyBvcGVuTWluZG1hcFBhbmVsKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBsZWFmID0gdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUClbMF07XG4gICAgaWYgKCFsZWFmKSB7XG4gICAgICBsZWFmID0gdGhpcy5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXJcbiAgICAgICAgPyB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0UmlnaHRMZWFmKGZhbHNlKSA/PyB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZih0cnVlKVxuICAgICAgICA6IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKHRydWUpO1xuICAgICAgYXdhaXQgbGVhZi5zZXRWaWV3U3RhdGUoeyB0eXBlOiBWSUVXX1RZUEVfTUlORE1BUCwgYWN0aXZlOiB0cnVlIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFwcC53b3Jrc3BhY2UucmV2ZWFsTGVhZihsZWFmKTtcbiAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgIGF3YWl0IGxlYWYudmlldy5sb2FkQ3VycmVudEZpbGUoKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSh0YXJnZXRGaWxlPzogVEZpbGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB2aWV3ID0gdGhpcy5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBjb25zdCBmaWxlID0gdGFyZ2V0RmlsZSA/PyB2aWV3Py5maWxlID8/IHRoaXMuZ2V0QWN0aXZlTWFya2Rvd25GaWxlKCk7XG4gICAgaWYgKCFmaWxlKSB7XG4gICAgICBuZXcgTm90aWNlKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgZmlyc3QuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoID0gZmlsZS5wYXRoO1xuICAgIGNvbnN0IHNvdXJjZVZpZXcgPSB2aWV3Py5maWxlPy5wYXRoID09PSBmaWxlLnBhdGggPyB2aWV3IDogdGhpcy5maW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlKTtcbiAgICBjb25zdCB0aXRsZSA9IGZpbGUuYmFzZW5hbWUgfHwgXCJNaW5kbWFwXCI7XG4gICAgY29uc3QgaWQgPSBjcmVhdGVNaW5kbWFwSWQoYCR7ZmlsZS5wYXRofToke0RhdGUubm93KCl9YCk7XG4gICAgY29uc3QgbWFya2Rvd24gPSBzb3VyY2VWaWV3Py5nZXRWaWV3RGF0YSgpID8/IChhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpKTtcbiAgICBjb25zdCBpbnNlcnRMaW5lID0gc291cmNlVmlldz8uZWRpdG9yLmdldEN1cnNvcigpLmxpbmUgPz8gbWFya2Rvd24uc3BsaXQoXCJcXG5cIikubGVuZ3RoO1xuICAgIGNvbnN0IG5leHQgPSBpbnNlcnRNaW5kbWFwQmxvY2tBdExpbmUobWFya2Rvd24sIGluc2VydExpbmUsIHsgaWQsIHRpdGxlIH0pO1xuICAgIGF3YWl0IHRoaXMud3JpdGVNYXJrZG93bkZpbGUoZmlsZSwgbmV4dCk7XG4gICAgdGhpcy5zZXRBY3RpdmVCbG9ja0ZvckZpbGUoZmlsZS5wYXRoLCBpZCk7XG4gICAgYXdhaXQgdGhpcy5yZWZyZXNoSW5kZXhGb3JGaWxlKGZpbGUsIG5leHQpO1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSBhd2FpdCBsZWFmLnZpZXcubG9hZEZpbGVCbG9jayhmaWxlLCBpZCk7XG4gICAgfVxuICB9XG5cbiAgZ2V0QWN0aXZlTWFya2Rvd25WaWV3KCk6IE1hcmtkb3duVmlldyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuICB9XG5cbiAgZ2V0QWN0aXZlTWFya2Rvd25GaWxlKCk6IFRGaWxlIHwgbnVsbCB7XG4gICAgY29uc3QgYWN0aXZlTWFya2Rvd24gPSB0aGlzLmdldEFjdGl2ZU1hcmtkb3duVmlldygpO1xuICAgIGlmIChhY3RpdmVNYXJrZG93bj8uZmlsZSkge1xuICAgICAgdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCA9IGFjdGl2ZU1hcmtkb3duLmZpbGUucGF0aDtcbiAgICAgIHJldHVybiBhY3RpdmVNYXJrZG93bi5maWxlO1xuICAgIH1cbiAgICBjb25zdCBhY3RpdmVGaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICBpZiAoYWN0aXZlRmlsZT8uZXh0ZW5zaW9uID09PSBcIm1kXCIpIHtcbiAgICAgIHRoaXMubGFzdE1hcmtkb3duRmlsZVBhdGggPSBhY3RpdmVGaWxlLnBhdGg7XG4gICAgICByZXR1cm4gYWN0aXZlRmlsZTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZ2V0TGFzdE1hcmtkb3duRmlsZSgpO1xuICB9XG5cbiAgZmluZE1hcmtkb3duVmlld0ZvckZpbGUoZmlsZTogVEZpbGUpOiBNYXJrZG93blZpZXcgfCBudWxsIHtcbiAgICBsZXQgZm91bmQ6IE1hcmtkb3duVmlldyB8IG51bGwgPSBudWxsO1xuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5pdGVyYXRlQWxsTGVhdmVzKChsZWFmKSA9PiB7XG4gICAgICBpZiAoZm91bmQpIHJldHVybjtcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNYXJrZG93blZpZXcgJiYgbGVhZi52aWV3LmZpbGU/LnBhdGggPT09IGZpbGUucGF0aCkge1xuICAgICAgICBmb3VuZCA9IGxlYWYudmlldztcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gZm91bmQ7XG4gIH1cblxuICBnZXRGaWxlQ2FjaGUoZmlsZVBhdGg6IHN0cmluZyk6IEZpbGVNaW5kbWFwQ2FjaGUge1xuICAgIGxldCBjYWNoZSA9IHRoaXMuZmlsZUNhY2hlLmdldChmaWxlUGF0aCk7XG4gICAgaWYgKCFjYWNoZSkge1xuICAgICAgY2FjaGUgPSB7IHNlbGVjdGVkSWRzOiBbXSwgY29sbGFwc2VkSWRzOiBbXSwgc2NhbGU6IDEsIHNjcm9sbExlZnQ6IDAsIHNjcm9sbFRvcDogMCB9O1xuICAgICAgdGhpcy5maWxlQ2FjaGUuc2V0KGZpbGVQYXRoLCBjYWNoZSk7XG4gICAgfVxuICAgIHJldHVybiBjYWNoZTtcbiAgfVxuXG4gIHNldEFjdGl2ZUJsb2NrRm9yRmlsZShmaWxlUGF0aDogc3RyaW5nLCBibG9ja0lkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmdldEZpbGVDYWNoZShmaWxlUGF0aCkuYWN0aXZlQmxvY2tJZCA9IGJsb2NrSWQ7XG4gIH1cblxuICByZW1lbWJlck1hcmtkb3duRmlsZShmaWxlOiBURmlsZSk6IHZvaWQge1xuICAgIGlmIChmaWxlLmV4dGVuc2lvbiA9PT0gXCJtZFwiKSB0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoID0gZmlsZS5wYXRoO1xuICB9XG5cbiAgZ2V0QWxsSW5kZXhFbnRyaWVzKCk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICAgIHJldHVybiBbLi4udGhpcy5taW5kbWFwSW5kZXgudmFsdWVzKCldLmZsYXQoKS5zb3J0KChhLCBiKSA9PiBhLmZpbGVQYXRoLmxvY2FsZUNvbXBhcmUoYi5maWxlUGF0aCkgfHwgYS5saW5lIC0gYi5saW5lKTtcbiAgfVxuXG4gIGdldEluZGV4RW50cmllc0ZvckZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICAgIHJldHVybiB0aGlzLm1pbmRtYXBJbmRleC5nZXQoZmlsZVBhdGgpID8/IFtdO1xuICB9XG5cbiAgYXN5bmMgcmVhZE1hcmtkb3duRmlsZShmaWxlOiBURmlsZSk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgdmlldyA9IHRoaXMuZmluZE1hcmtkb3duVmlld0ZvckZpbGUoZmlsZSk7XG4gICAgcmV0dXJuIHZpZXc/LmdldFZpZXdEYXRhKCkgPz8gdGhpcy5hcHAudmF1bHQuY2FjaGVkUmVhZChmaWxlKTtcbiAgfVxuXG4gIGFzeW5jIHdyaXRlTWFya2Rvd25GaWxlKGZpbGU6IFRGaWxlLCBtYXJrZG93bjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zdXBwcmVzc01vZGlmeVBhdGhzLmFkZChmaWxlLnBhdGgpO1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKGZpbGUpO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICByZXBsYWNlV2hvbGVFZGl0b3JEYXRhKHZpZXcuZWRpdG9yLCBtYXJrZG93bik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShmaWxlLCBtYXJrZG93bik7XG4gICAgfVxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMuc3VwcHJlc3NNb2RpZnlQYXRocy5kZWxldGUoZmlsZS5wYXRoKSwgMzUwKTtcbiAgfVxuXG4gIGFzeW5jIG5vcm1hbGl6ZU1pbmRtYXBNZXRhZGF0YShmaWxlOiBURmlsZSwgbWFya2Rvd246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgbmV4dCA9IG5vcm1hbGl6ZU1pbmRtYXBCbG9ja01ldGFkYXRhKG1hcmtkb3duLCB7XG4gICAgICBzb3VyY2VQYXRoOiBmaWxlLnBhdGgsXG4gICAgICBmYWxsYmFja1RpdGxlOiBmaWxlLmJhc2VuYW1lXG4gICAgfSk7XG4gICAgaWYgKG5leHQgPT09IG1hcmtkb3duKSByZXR1cm4gbWFya2Rvd247XG4gICAgYXdhaXQgdGhpcy53cml0ZU1hcmtkb3duRmlsZShmaWxlLCBuZXh0KTtcbiAgICBhd2FpdCB0aGlzLnJlZnJlc2hJbmRleEZvckZpbGUoZmlsZSwgbmV4dCk7XG4gICAgcmV0dXJuIG5leHQ7XG4gIH1cblxuICBhc3luYyByZWZyZXNoVmF1bHRJbmRleCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAodGhpcy52YXVsdFNjYW5UaW1lciAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnZhdWx0U2NhblRpbWVyKTtcbiAgICAgIHRoaXMudmF1bHRTY2FuVGltZXIgPSBudWxsO1xuICAgIH1cbiAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgIGF3YWl0IHRoaXMucmVmcmVzaEluZGV4Rm9yRmlsZShmaWxlKTtcbiAgICB9XG4gICAgdGhpcy5yZWZyZXNoT3BlbkRhc2hib2FyZE9ubHkoKTtcbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hJbmRleEZvckZpbGUoZmlsZTogVEZpbGUsIGtub3duTWFya2Rvd24/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBtYXJrZG93biA9IGtub3duTWFya2Rvd24gPz8gKGF3YWl0IHRoaXMucmVhZE1hcmtkb3duRmlsZShmaWxlKSk7XG4gICAgY29uc3QgZW50cmllcyA9IGJ1aWxkTWluZG1hcEluZGV4KG1hcmtkb3duLCBmaWxlLnBhdGgsIGZpbGUuYmFzZW5hbWUpO1xuICAgIGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHRoaXMubWluZG1hcEluZGV4LnNldChmaWxlLnBhdGgsIGVudHJpZXMpO1xuICAgIGVsc2UgdGhpcy5taW5kbWFwSW5kZXguZGVsZXRlKGZpbGUucGF0aCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGhhbmRsZU1hcmtkb3duRmlsZU1vZGlmaWVkKGZpbGU6IFRGaWxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuc3VwcHJlc3NNb2RpZnlQYXRocy5oYXMoZmlsZS5wYXRoKSkgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMucmVmcmVzaEluZGV4Rm9yRmlsZShmaWxlKTtcbiAgICBmb3IgKGNvbnN0IGxlYWYgb2YgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUCkpIHtcbiAgICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykgbGVhZi52aWV3LnNjaGVkdWxlTWFya2Rvd25SZWZyZXNoKGZpbGUucGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWZyZXNoT3Blbk1pbmRtYXBWaWV3cyhvcHRpb25zOiB7IHByZXNlcnZlU2VsZWN0aW9uPzogYm9vbGVhbjsgZnJvbUVkaXRvckNoYW5nZT86IGJvb2xlYW4gfSA9IHt9KTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApKSB7XG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgICAgdm9pZCBsZWFmLnZpZXcubG9hZEN1cnJlbnRGaWxlKG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVmcmVzaE9wZW5EYXNoYm9hcmRPbmx5KCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgbGVhZiBvZiB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKSkge1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1pbmRtYXBXb3JrYmVuY2hWaWV3KSBsZWFmLnZpZXcucmVuZGVyKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjYXB0dXJlQWN0aXZlTWFya2Rvd25GaWxlKCk6IHZvaWQge1xuICAgIGNvbnN0IGFjdGl2ZU1hcmtkb3duID0gdGhpcy5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBpZiAoYWN0aXZlTWFya2Rvd24/LmZpbGUpIHtcbiAgICAgIHRoaXMubGFzdE1hcmtkb3duRmlsZVBhdGggPSBhY3RpdmVNYXJrZG93bi5maWxlLnBhdGg7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgIGlmIChhY3RpdmVGaWxlPy5leHRlbnNpb24gPT09IFwibWRcIikgdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCA9IGFjdGl2ZUZpbGUucGF0aDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0TGFzdE1hcmtkb3duRmlsZSgpOiBURmlsZSB8IG51bGwge1xuICAgIGlmICghdGhpcy5sYXN0TWFya2Rvd25GaWxlUGF0aCkgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aCh0aGlzLmxhc3RNYXJrZG93bkZpbGVQYXRoKTtcbiAgICByZXR1cm4gZmlsZSBpbnN0YW5jZW9mIFRGaWxlICYmIGZpbGUuZXh0ZW5zaW9uID09PSBcIm1kXCIgPyBmaWxlIDogbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgd2l0aE1pbmRtYXBWaWV3KGNhbGxiYWNrOiAodmlldzogTWluZG1hcFdvcmtiZW5jaFZpZXcpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgY29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghKGxlYWY/LnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcGVuIHRoZSBNYXJrZG93biBNaW5kbWFwIHBhbmVsIGZpcnN0LlwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdm9pZCBjYWxsYmFjayhsZWFmLnZpZXcpO1xuICB9XG59XG5cbmNsYXNzIE1pbmRtYXBXb3JrYmVuY2hWaWV3IGV4dGVuZHMgSXRlbVZpZXcge1xuICBwcml2YXRlIHNvdXJjZUZpbGU6IFRGaWxlIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYmxvY2tzOiBNaW5kbWFwQmxvY2tbXSA9IFtdO1xuICBwcml2YXRlIGJsb2NrOiBNaW5kbWFwQmxvY2sgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBub2RlczogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBwcml2YXRlIGZpbGVTdGF0ZTogTWluZG1hcFN0YXRlRGF0YSA9IHsgc2NoZW1hVmVyc2lvbjogMSwgYmxvY2tzOiB7fSB9O1xuICBwcml2YXRlIHNlbGVjdGVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgY29sbGFwc2VkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgc2NhbGUgPSAxO1xuICBwcml2YXRlIHNjcm9sbExlZnQgPSAwO1xuICBwcml2YXRlIHNjcm9sbFRvcCA9IDA7XG4gIHByaXZhdGUgc2VhcmNoUXVlcnkgPSBcIlwiO1xuICBwcml2YXRlIHJlZnJlc2hUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgc3RhdGVQZXJzaXN0VGltZXI6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKGxlYWY6IFdvcmtzcGFjZUxlYWYsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBNYXJrZG93bk1pbmRtYXBQbHVnaW4pIHtcbiAgICBzdXBlcihsZWFmKTtcbiAgfVxuXG4gIGdldFZpZXdUeXBlKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFZJRVdfVFlQRV9NSU5ETUFQO1xuICB9XG5cbiAgZ2V0RGlzcGxheVRleHQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJNYXJrZG93biBNaW5kbWFwXCI7XG4gIH1cblxuICBnZXRJY29uKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFwiZ2l0LWZvcmtcIjtcbiAgfVxuXG4gIGFzeW5jIG9uT3BlbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIGF3YWl0IHRoaXMubG9hZEN1cnJlbnRGaWxlKCk7XG4gIH1cblxuICBhc3luYyBvbkNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgaWYgKHRoaXMuc3RhdGVQZXJzaXN0VGltZXIgIT09IG51bGwpIHdpbmRvdy5jbGVhclRpbWVvdXQodGhpcy5zdGF0ZVBlcnNpc3RUaW1lcik7XG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0U3RhdGUoKTtcbiAgfVxuXG4gIHNjaGVkdWxlTWFya2Rvd25SZWZyZXNoKGZpbGVQYXRoPzogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKGZpbGVQYXRoICYmIHRoaXMuc291cmNlRmlsZT8ucGF0aCAhPT0gZmlsZVBhdGgpIHtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgdGhpcy5yZWZyZXNoVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICB2b2lkIHRoaXMucmVmcmVzaEN1cnJlbnRCbG9ja0Zyb21NYXJrZG93bigpO1xuICAgIH0sIDE4MCk7XG4gIH1cblxuICBhc3luYyBsb2FkQ3VycmVudEZpbGUob3B0aW9uczogeyBwcmVzZXJ2ZVNlbGVjdGlvbj86IGJvb2xlYW47IGZyb21FZGl0b3JDaGFuZ2U/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGFjdGl2ZUZpbGUgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVNYXJrZG93bkZpbGUoKTtcbiAgICBpZiAoIWFjdGl2ZUZpbGUgfHwgYWN0aXZlRmlsZS5leHRlbnNpb24gIT09IFwibWRcIikge1xuICAgICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUpIHRoaXMucmVuZGVyKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgb3IgY2hvb3NlIGEgbWluZG1hcCBmcm9tIHRoZSBkYXNoYm9hcmQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy5mcm9tRWRpdG9yQ2hhbmdlICYmIHRoaXMuc291cmNlRmlsZT8ucGF0aCA9PT0gYWN0aXZlRmlsZS5wYXRoKSB7XG4gICAgICB0aGlzLnNjaGVkdWxlTWFya2Rvd25SZWZyZXNoKGFjdGl2ZUZpbGUucGF0aCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGF3YWl0IHRoaXMubG9hZEZpbGUoYWN0aXZlRmlsZSwgdW5kZWZpbmVkLCBvcHRpb25zKTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRGaWxlQmxvY2soZmlsZTogVEZpbGUsIGJsb2NrSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMubG9hZEZpbGUoZmlsZSwgYmxvY2tJZCk7XG4gIH1cblxuICBhc3luYyBwcm9tcHRJbmR1Y2VQYXJlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA8IDIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJTZWxlY3QgYXQgbGVhc3QgdHdvIGFkamFjZW50IHNpYmxpbmcgbm9kZXMuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgUGFyZW50VGl0bGVNb2RhbCh0aGlzLmFwcCwgXCJcdTVGNTJcdTdFQjNcIiwgKHRpdGxlKSA9PiB7XG4gICAgICB2b2lkIHRoaXMuYXBwbHlPcGVyYXRpb24oaW5kdWNlUGFyZW50RnJvbVNlbGVjdGVkKHRoaXMubm9kZXMsIFsuLi50aGlzLnNlbGVjdGVkSWRzXSwgdGl0bGUgfHwgXCJcdTVGNTJcdTdFQjNcIikpO1xuICAgIH0pLm9wZW4oKTtcbiAgfVxuXG4gIGZvY3VzU2VsZWN0ZWROb2RlKCk6IHZvaWQge1xuICAgIGNvbnN0IGlkID0gWy4uLnRoaXMuc2VsZWN0ZWRJZHNdWzBdO1xuICAgIGlmICghaWQgfHwgIXRoaXMuYmxvY2spIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBtaW5kbWFwIG5vZGUgc2VsZWN0ZWQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbnB1dCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXG4gICAgICBgaW5wdXRbZGF0YS1ibG9jay1pZD1cIiR7Y3NzRXNjYXBlKHRoaXMuYmxvY2suaWQpfVwiXVtkYXRhLW5vZGUtaWQ9XCIke2Nzc0VzY2FwZShpZCl9XCJdYFxuICAgICk7XG4gICAgaW5wdXQ/LmZvY3VzKCk7XG4gICAgaW5wdXQ/LnNlbGVjdCgpO1xuICB9XG5cbiAgcmVuZGVyKHN0YXR1cz86IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIGNvbnRlbnRFbC5hZGRDbGFzcyhcImxvY2FsLW1pbmRtYXAtd29ya2JlbmNoXCIpO1xuXG4gICAgY29uc3Qgc2hlbGwgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2hlbGxcIiB9KTtcbiAgICBjb25zdCBkYXNoYm9hcmQgPSBzaGVsbC5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1kYXNoYm9hcmRcIiB9KTtcbiAgICBjb25zdCBtYWluID0gc2hlbGwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbWFpblwiIH0pO1xuICAgIHRoaXMucmVuZGVyRGFzaGJvYXJkKGRhc2hib2FyZCk7XG4gICAgdGhpcy5yZW5kZXJNYWluKG1haW4sIHN0YXR1cyk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGxvYWRGaWxlKGZpbGU6IFRGaWxlLCByZXF1ZXN0ZWRCbG9ja0lkPzogc3RyaW5nLCBvcHRpb25zOiB7IHByZXNlcnZlU2VsZWN0aW9uPzogYm9vbGVhbiB9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBsZXQgbWFya2Rvd24gPSBhd2FpdCB0aGlzLnBsdWdpbi5yZWFkTWFya2Rvd25GaWxlKGZpbGUpO1xuICAgIHRoaXMucGx1Z2luLnJlbWVtYmVyTWFya2Rvd25GaWxlKGZpbGUpO1xuICAgIG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ubm9ybWFsaXplTWluZG1hcE1ldGFkYXRhKGZpbGUsIG1hcmtkb3duKTtcbiAgICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3MobWFya2Rvd24sIHsgc291cmNlUGF0aDogZmlsZS5wYXRoLCBmYWxsYmFja1RpdGxlOiBmaWxlLmJhc2VuYW1lIH0pO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hJbmRleEZvckZpbGUoZmlsZSwgbWFya2Rvd24pO1xuXG4gICAgdGhpcy5zb3VyY2VGaWxlID0gZmlsZTtcbiAgICB0aGlzLmJsb2NrcyA9IGJsb2NrcztcbiAgICB0aGlzLmZpbGVTdGF0ZSA9IHJlYWRNaW5kbWFwU3RhdGUobWFya2Rvd24pO1xuICAgIGlmIChibG9ja3MubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aGlzLmJsb2NrID0gbnVsbDtcbiAgICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgICAgIHRoaXMuc2VsZWN0ZWRJZHMuY2xlYXIoKTtcbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2FjaGUgPSB0aGlzLnBsdWdpbi5nZXRGaWxlQ2FjaGUoZmlsZS5wYXRoKTtcbiAgICBjb25zdCBhY3RpdmVJZCA9IHJlcXVlc3RlZEJsb2NrSWQgPz8gY2FjaGUuYWN0aXZlQmxvY2tJZDtcbiAgICBjb25zdCBibG9jayA9IGJsb2Nrcy5maW5kKChjYW5kaWRhdGUpID0+IGNhbmRpZGF0ZS5pZCA9PT0gYWN0aXZlSWQpID8/IGJsb2Nrc1swXTtcbiAgICB0aGlzLmJsb2NrID0gYmxvY2s7XG4gICAgdGhpcy5ub2RlcyA9IGJsb2NrLm5vZGVzO1xuICAgIHRoaXMucGx1Z2luLnNldEFjdGl2ZUJsb2NrRm9yRmlsZShmaWxlLnBhdGgsIGJsb2NrLmlkKTtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZmlsZVN0YXRlLmJsb2Nrc1tibG9jay5pZF07XG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSBuZXcgU2V0KHRoaXMuc2VsZWN0ZWRJZHMpO1xuICAgIHRoaXMuY29sbGFwc2VkSWRzID0gbmV3IFNldChjYWNoZS5hY3RpdmVCbG9ja0lkID09PSBibG9jay5pZCA/IGNhY2hlLmNvbGxhcHNlZElkcyA6IHN0YXRlPy5jb2xsYXBzZWRJZHMgPz8gW10pO1xuICAgIHRoaXMuc2NhbGUgPSBjYWNoZS5hY3RpdmVCbG9ja0lkID09PSBibG9jay5pZCA/IGNhY2hlLnNjYWxlIDogc3RhdGU/LnNjYWxlID8/IDE7XG4gICAgdGhpcy5zY3JvbGxMZWZ0ID0gY2FjaGUuYWN0aXZlQmxvY2tJZCA9PT0gYmxvY2suaWQgPyBjYWNoZS5zY3JvbGxMZWZ0IDogc3RhdGU/LnNjcm9sbExlZnQgPz8gMDtcbiAgICB0aGlzLnNjcm9sbFRvcCA9IGNhY2hlLmFjdGl2ZUJsb2NrSWQgPT09IGJsb2NrLmlkID8gY2FjaGUuc2Nyb2xsVG9wIDogc3RhdGU/LnNjcm9sbFRvcCA/PyAwO1xuICAgIHRoaXMuc2VsZWN0ZWRJZHMgPSBvcHRpb25zLnByZXNlcnZlU2VsZWN0aW9uXG4gICAgICA/IG5ldyBTZXQoWy4uLnByZXZpb3VzU2VsZWN0aW9uXS5maWx0ZXIoKGlkKSA9PiBmaW5kTm9kZSh0aGlzLm5vZGVzLCBpZCkpKVxuICAgICAgOiBuZXcgU2V0KFt0aGlzLm5vZGVzWzBdPy5pZF0uZmlsdGVyKChpZCk6IGlkIGlzIHN0cmluZyA9PiBCb29sZWFuKGlkKSkpO1xuICAgIGNhY2hlLmxhc3RDb250ZW50SGFzaCA9IGJsb2NrLmNvbnRlbnRIYXNoO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcihibG9jay53YXJuaW5nKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcmVmcmVzaEN1cnJlbnRCbG9ja0Zyb21NYXJrZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSkgcmV0dXJuO1xuICAgIGNvbnN0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUpO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hJbmRleEZvckZpbGUodGhpcy5zb3VyY2VGaWxlLCBtYXJrZG93bik7XG4gICAgY29uc3QgYmxvY2tzID0gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duLCB7IHNvdXJjZVBhdGg6IHRoaXMuc291cmNlRmlsZS5wYXRoLCBmYWxsYmFja1RpdGxlOiB0aGlzLnNvdXJjZUZpbGUuYmFzZW5hbWUgfSk7XG4gICAgdGhpcy5ibG9ja3MgPSBibG9ja3M7XG4gICAgdGhpcy5maWxlU3RhdGUgPSByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duKTtcbiAgICBpZiAoIXRoaXMuYmxvY2spIHtcbiAgICAgIGlmIChibG9ja3MubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLmFjdGl2YXRlQmxvY2soYmxvY2tzWzBdLmlkKTtcbiAgICAgIH1cbiAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZyZXNoID0gYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSB0aGlzLmJsb2NrPy5pZCk7XG4gICAgaWYgKCFmcmVzaCkge1xuICAgICAgdGhpcy5ibG9jayA9IGJsb2Nrc1swXSA/PyBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IHRoaXMuYmxvY2s/Lm5vZGVzID8/IFtdO1xuICAgICAgdGhpcy5zZWxlY3RlZElkcyA9IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgICB0aGlzLnJlbmRlcih0aGlzLmJsb2NrID8gdGhpcy5ibG9jay53YXJuaW5nIDogdW5kZWZpbmVkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZyZXNoLmNvbnRlbnRIYXNoID09PSB0aGlzLmJsb2NrLmNvbnRlbnRIYXNoICYmIGZyZXNoLndhcm5pbmcgPT09IHRoaXMuYmxvY2sud2FybmluZykge1xuICAgICAgdGhpcy5yZW5kZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5ibG9jayA9IGZyZXNoO1xuICAgIHRoaXMubm9kZXMgPSBmcmVzaC5ub2RlcztcbiAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChbLi4udGhpcy5zZWxlY3RlZElkc10uZmlsdGVyKChpZCkgPT4gZmluZE5vZGUodGhpcy5ub2RlcywgaWQpKSk7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA9PT0gMCAmJiB0aGlzLm5vZGVzWzBdKSB0aGlzLnNlbGVjdGVkSWRzLmFkZCh0aGlzLm5vZGVzWzBdLmlkKTtcbiAgICB0aGlzLnVwZGF0ZUNhY2hlKCk7XG4gICAgdGhpcy5yZW5kZXIoZnJlc2gud2FybmluZyk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckRhc2hib2FyZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgY29uc3QgaGVhZGVyID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWRhc2hib2FyZC1oZWFkZXJcIiB9KTtcbiAgICBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZGFzaGJvYXJkLXRpdGxlXCIsIHRleHQ6IFwiTWluZG1hcHNcIiB9KTtcbiAgICBjb25zdCByZWZyZXNoID0gaGVhZGVyLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtaWNvbi1idXR0b25cIiwgdGV4dDogXCJSZWZyZXNoXCIgfSk7XG4gICAgcmVmcmVzaC50eXBlID0gXCJidXR0b25cIjtcbiAgICByZWZyZXNoLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMucGx1Z2luLnJlZnJlc2hWYXVsdEluZGV4KCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjcmVhdGUgPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1jcmVhdGUtYnV0dG9uXCIsIHRleHQ6IFwiQ3JlYXRlIG1pbmRtYXAgaW4gY3VycmVudCBmaWxlXCIgfSk7XG4gICAgY3JlYXRlLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGNyZWF0ZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLnBsdWdpbi5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSh0aGlzLnNvdXJjZUZpbGUgPz8gdW5kZWZpbmVkKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNlYXJjaCA9IGNvbnRhaW5lci5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VhcmNoXCIgfSk7XG4gICAgc2VhcmNoLnR5cGUgPSBcInNlYXJjaFwiO1xuICAgIHNlYXJjaC5wbGFjZWhvbGRlciA9IFwiU2VhcmNoIG1pbmRtYXBzXCI7XG4gICAgc2VhcmNoLnZhbHVlID0gdGhpcy5zZWFyY2hRdWVyeTtcbiAgICBzZWFyY2guYWRkRXZlbnRMaXN0ZW5lcihcImlucHV0XCIsICgpID0+IHtcbiAgICAgIHRoaXMuc2VhcmNoUXVlcnkgPSBzZWFyY2gudmFsdWU7XG4gICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZW5kZXJFbnRyeVNlY3Rpb24oY29udGFpbmVyLCBcIkN1cnJlbnQgZmlsZVwiLCB0aGlzLmN1cnJlbnRGaWxlRW50cmllcygpKTtcbiAgICBjb25zdCBxdWVyeSA9IHRoaXMuc2VhcmNoUXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgYWxsRW50cmllcyA9IHRoaXMucGx1Z2luXG4gICAgICAuZ2V0QWxsSW5kZXhFbnRyaWVzKClcbiAgICAgIC5maWx0ZXIoKGVudHJ5KSA9PlxuICAgICAgICAhcXVlcnkgfHxcbiAgICAgICAgYCR7ZW50cnkudGl0bGV9ICR7ZW50cnkucm9vdFRpdGxlfSAke2VudHJ5LmZpbGVQYXRofWAudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcbiAgICAgIClcbiAgICAgIC5zbGljZSgwLCA4MCk7XG4gICAgdGhpcy5yZW5kZXJFbnRyeVNlY3Rpb24oY29udGFpbmVyLCBxdWVyeSA/IFwiU2VhcmNoIHJlc3VsdHNcIiA6IFwiVmF1bHRcIiwgYWxsRW50cmllcyk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlckVudHJ5U2VjdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aXRsZTogc3RyaW5nLCBlbnRyaWVzOiBNaW5kbWFwSW5kZXhFbnRyeVtdKTogdm9pZCB7XG4gICAgY29uc3Qgc2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWN0aW9uXCIgfSk7XG4gICAgc2VjdGlvbi5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWN0aW9uLXRpdGxlXCIsIHRleHQ6IGAke3RpdGxlfSAoJHtlbnRyaWVzLmxlbmd0aH0pYCB9KTtcbiAgICBpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VjdGlvbi1lbXB0eVwiLCB0ZXh0OiB0aXRsZSA9PT0gXCJDdXJyZW50IGZpbGVcIiA/IFwiVGhpcyBmaWxlIGhhcyBubyBtaW5kbWFwIGJsb2NrLlwiIDogXCJObyBtaW5kbWFwcyBmb3VuZC5cIiB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgICBjb25zdCBhY3RpdmUgPSB0aGlzLnNvdXJjZUZpbGU/LnBhdGggPT09IGVudHJ5LmZpbGVQYXRoICYmIHRoaXMuYmxvY2s/LmlkID09PSBlbnRyeS5pZDtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IHNlY3Rpb24uY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IGFjdGl2ZSA/IFwibG9jYWwtbWluZG1hcC1lbnRyeSBpcy1hY3RpdmVcIiA6IFwibG9jYWwtbWluZG1hcC1lbnRyeVwiIH0pO1xuICAgICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgICAgYnV0dG9uLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVudHJ5LXRpdGxlXCIsIHRleHQ6IGVudHJ5LnRpdGxlIHx8IGVudHJ5LnJvb3RUaXRsZSB8fCBcIlVudGl0bGVkIG1pbmRtYXBcIiB9KTtcbiAgICAgIGJ1dHRvbi5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbnRyeS1wYXRoXCIsIHRleHQ6IGAke2VudHJ5LmZpbGVQYXRofSBcdTAwQjcgbGluZSAke2VudHJ5LmxpbmV9YCB9KTtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHZvaWQgdGhpcy5vcGVuSW5kZXhFbnRyeShlbnRyeSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlbmRlck1haW4oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc3RhdHVzPzogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgdG9vbGJhciA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC10b29sYmFyXCIgfSk7XG4gICAgY29uc3QgdGl0bGVHcm91cCA9IHRvb2xiYXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtaGVhZGluZ1wiIH0pO1xuICAgIHRpdGxlR3JvdXAuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJsb2NhbC1taW5kbWFwLXRpdGxlXCIsXG4gICAgICB0ZXh0OiB0aGlzLnNvdXJjZUZpbGU/LmJhc2VuYW1lID8/IFwiTWFya2Rvd24gTWluZG1hcFwiXG4gICAgfSk7XG4gICAgdGl0bGVHcm91cC5jcmVhdGVEaXYoe1xuICAgICAgY2xzOiBcImxvY2FsLW1pbmRtYXAtc3VidGl0bGVcIixcbiAgICAgIHRleHQ6IHRoaXMuc291cmNlRmlsZSAmJiB0aGlzLmJsb2Nrcy5sZW5ndGggPiAwXG4gICAgICAgID8gYCR7dGhpcy5zb3VyY2VGaWxlLnBhdGh9IFx1MDBCNyAke3RoaXMuYmxvY2tzLmxlbmd0aH0gbWluZG1hcCR7dGhpcy5ibG9ja3MubGVuZ3RoID4gMSA/IFwic1wiIDogXCJcIn0gcmVuZGVyZWRgXG4gICAgICAgIDogdGhpcy5zb3VyY2VGaWxlXG4gICAgICAgICAgPyBgJHt0aGlzLnNvdXJjZUZpbGUucGF0aH0gXHUwMEI3IG5vIG1pbmRtYXAgYmxvY2tgXG4gICAgICAgICAgOiBcIkNob29zZSBhIG1pbmRtYXAgb3IgY3JlYXRlIG9uZSBpbiB0aGUgYWN0aXZlIGZpbGUuXCJcbiAgICB9KTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCJJbmR1Y2UgcGFyZW50XCIsICgpID0+IHRoaXMucHJvbXB0SW5kdWNlUGFyZW50KCksIHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA+PSAyKTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCJGb2N1c1wiLCAoKSA9PiB0aGlzLmZvY3VzU2VsZWN0ZWROb2RlKCksIHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA+IDApO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIi1cIiwgKCkgPT4gdGhpcy5zZXRTY2FsZSh0aGlzLnNjYWxlIC0gMC4xKSwgQm9vbGVhbih0aGlzLmJsb2NrKSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiK1wiLCAoKSA9PiB0aGlzLnNldFNjYWxlKHRoaXMuc2NhbGUgKyAwLjEpLCBCb29sZWFuKHRoaXMuYmxvY2spKTtcblxuICAgIGlmIChzdGF0dXMpIGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC13YXJuaW5nXCIsIHRleHQ6IHN0YXR1cyB9KTtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSkge1xuICAgICAgY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVtcHR5XCIsIHRleHQ6IFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgb3IgY2hvb3NlIGEgbWluZG1hcCBmcm9tIHRoZSBkYXNoYm9hcmQuXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh0aGlzLmJsb2Nrcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnN0IGVtcHR5ID0gY29udGFpbmVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWVtcHR5XCIgfSk7XG4gICAgICBlbXB0eS5jcmVhdGVEaXYoeyB0ZXh0OiBcIlRoaXMgZmlsZSBoYXMgbm8gbWluZG1hcCBibG9jay5cIiB9KTtcbiAgICAgIGNvbnN0IGJ1dHRvbiA9IGVtcHR5LmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDcmVhdGUgbWluZG1hcCBpbiBjdXJyZW50IGZpbGVcIiB9KTtcbiAgICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4gdm9pZCB0aGlzLnBsdWdpbi5jcmVhdGVNaW5kbWFwSW5DdXJyZW50RmlsZSh0aGlzLnNvdXJjZUZpbGUgPz8gdW5kZWZpbmVkKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3Qgb3ZlcnZpZXcgPSBjb250YWluZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtb3ZlcnZpZXdcIiB9KTtcbiAgICBmb3IgKGNvbnN0IGJsb2NrIG9mIHRoaXMuYmxvY2tzKSB7XG4gICAgICB0aGlzLnJlbmRlck1pbmRtYXBCbG9jayhvdmVydmlldywgYmxvY2spO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyTWluZG1hcEJsb2NrKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGJsb2NrOiBNaW5kbWFwQmxvY2spOiB2b2lkIHtcbiAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmJsb2NrPy5pZCA9PT0gYmxvY2suaWQ7XG4gICAgY29uc3Qgc2VjdGlvbiA9IGNvbnRhaW5lci5jcmVhdGVEaXYoeyBjbHM6IGFjdGl2ZSA/IFwibG9jYWwtbWluZG1hcC1ibG9jayBpcy1hY3RpdmVcIiA6IFwibG9jYWwtbWluZG1hcC1ibG9ja1wiIH0pO1xuICAgIGNvbnN0IGhlYWRlciA9IHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtYmxvY2staGVhZGVyXCIgfSk7XG4gICAgaGVhZGVyLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLWJsb2NrLXRpdGxlXCIsIHRleHQ6IGJsb2NrLnRpdGxlIHx8IGJsb2NrLnJvb3RUaXRsZSB8fCBcIlVudGl0bGVkIG1pbmRtYXBcIiB9KTtcbiAgICBoZWFkZXIuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtYmxvY2stbWV0YVwiLCB0ZXh0OiBgbGluZXMgJHtibG9jay5zdGFydExpbmUgKyAxfS0ke2Jsb2NrLmVuZExpbmUgKyAxfWAgfSk7XG4gICAgaWYgKGJsb2NrLndhcm5pbmcpIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtd2FybmluZ1wiLCB0ZXh0OiBibG9jay53YXJuaW5nIH0pO1xuXG4gICAgY29uc3QgYmxvY2tOb2RlcyA9IGFjdGl2ZSA/IHRoaXMubm9kZXMgOiBibG9jay5ub2RlcztcbiAgICBpZiAoYmxvY2tOb2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHNlY3Rpb24uY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW1wdHlcIiwgdGV4dDogXCJUaGlzIG1pbmRtYXAgYmxvY2sgaXMgZW1wdHkuXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY29sbGFwc2VkSWRzID0gYWN0aXZlID8gdGhpcy5jb2xsYXBzZWRJZHMgOiBuZXcgU2V0KHRoaXMuZmlsZVN0YXRlLmJsb2Nrc1tibG9jay5pZF0/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgY29uc3Qgc3RhZ2UgPSBzZWN0aW9uLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN0YWdlIGxvY2FsLW1pbmRtYXAtYmxvY2stc3RhZ2VcIiB9KTtcbiAgICBzdGFnZS5zY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgIHN0YWdlLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wO1xuICAgIHN0YWdlLmFkZEV2ZW50TGlzdGVuZXIoXCJzY3JvbGxcIiwgKCkgPT4ge1xuICAgICAgaWYgKCFhY3RpdmUpIHJldHVybjtcbiAgICAgIHRoaXMuc2Nyb2xsTGVmdCA9IHN0YWdlLnNjcm9sbExlZnQ7XG4gICAgICB0aGlzLnNjcm9sbFRvcCA9IHN0YWdlLnNjcm9sbFRvcDtcbiAgICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHN1cmZhY2UgPSBzdGFnZS5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zdXJmYWNlXCIgfSk7XG4gICAgc3VyZmFjZS5zdHlsZS50cmFuc2Zvcm0gPSBgc2NhbGUoJHt0aGlzLnNjYWxlfSlgO1xuICAgIHN1cmZhY2Uuc3R5bGUudHJhbnNmb3JtT3JpZ2luID0gXCJ0b3AgbGVmdFwiO1xuICAgIGNvbnN0IGxheW91dHMgPSBsYXlvdXROb2RlcyhibG9ja05vZGVzLCBjb2xsYXBzZWRJZHMpO1xuICAgIGNvbnN0IG1heFggPSBNYXRoLm1heCguLi5sYXlvdXRzLm1hcCgoZW50cnkpID0+IGVudHJ5LngpLCAwKSArIDM0MDtcbiAgICBjb25zdCBtYXhZID0gTWF0aC5tYXgoLi4ubGF5b3V0cy5tYXAoKGVudHJ5KSA9PiBlbnRyeS55KSwgMCkgKyAxNDA7XG4gICAgc3VyZmFjZS5zdHlsZS53aWR0aCA9IGAke21heFh9cHhgO1xuICAgIHN1cmZhY2Uuc3R5bGUuaGVpZ2h0ID0gYCR7bWF4WX1weGA7XG5cbiAgICBjb25zdCBzdmcgPSBzdXJmYWNlLmNyZWF0ZVN2ZyhcInN2Z1wiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLWxpbmtzXCIgfSk7XG4gICAgc3ZnLnNldEF0dHIoXCJ3aWR0aFwiLCBTdHJpbmcobWF4WCkpO1xuICAgIHN2Zy5zZXRBdHRyKFwiaGVpZ2h0XCIsIFN0cmluZyhtYXhZKSk7XG4gICAgZm9yIChjb25zdCBsYXlvdXQgb2YgbGF5b3V0cykge1xuICAgICAgaWYgKCFsYXlvdXQucGFyZW50SWQpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgcGFyZW50ID0gbGF5b3V0cy5maW5kKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCA9PT0gbGF5b3V0LnBhcmVudElkKTtcbiAgICAgIGlmICghcGFyZW50KSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHBhdGggPSBzdmcuY3JlYXRlU3ZnKFwicGF0aFwiKTtcbiAgICAgIGNvbnN0IHN0YXJ0WCA9IHBhcmVudC54ICsgMjIwO1xuICAgICAgY29uc3Qgc3RhcnRZID0gcGFyZW50LnkgKyAyODtcbiAgICAgIGNvbnN0IGVuZFggPSBsYXlvdXQueDtcbiAgICAgIGNvbnN0IGVuZFkgPSBsYXlvdXQueSArIDI4O1xuICAgICAgY29uc3QgbWlkWCA9IHN0YXJ0WCArIE1hdGgubWF4KDQwLCAoZW5kWCAtIHN0YXJ0WCkgLyAyKTtcbiAgICAgIHBhdGguc2V0QXR0cihcImRcIiwgYE0gJHtzdGFydFh9ICR7c3RhcnRZfSBDICR7bWlkWH0gJHtzdGFydFl9LCAke21pZFh9ICR7ZW5kWX0sICR7ZW5kWH0gJHtlbmRZfWApO1xuICAgICAgcGF0aC5zZXRBdHRyKFwiY2xhc3NcIiwgXCJsb2NhbC1taW5kbWFwLWxpbmtcIik7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBsYXlvdXQgb2YgbGF5b3V0cykge1xuICAgICAgdGhpcy5yZW5kZXJOb2RlKHN1cmZhY2UsIGJsb2NrLCBsYXlvdXQpO1xuICAgIH1cblxuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICghYWN0aXZlKSByZXR1cm47XG4gICAgICBzdGFnZS5zY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgICAgc3RhZ2Uuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlck5vZGUoc3VyZmFjZTogSFRNTEVsZW1lbnQsIGJsb2NrOiBNaW5kbWFwQmxvY2ssIGxheW91dDogTm9kZUxheW91dCk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBsYXlvdXQubm9kZTtcbiAgICBjb25zdCBhY3RpdmUgPSB0aGlzLmJsb2NrPy5pZCA9PT0gYmxvY2suaWQ7XG4gICAgY29uc3Qgc2VsZWN0ZWQgPSBhY3RpdmUgJiYgdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZS5pZCk7XG4gICAgY29uc3QgY2FyZCA9IHN1cmZhY2UuY3JlYXRlRGl2KHsgY2xzOiBzZWxlY3RlZCA/IFwibG9jYWwtbWluZG1hcC1ub2RlIGlzLXNlbGVjdGVkXCIgOiBcImxvY2FsLW1pbmRtYXAtbm9kZVwiIH0pO1xuICAgIGNhcmQuc3R5bGUubGVmdCA9IGAke2xheW91dC54fXB4YDtcbiAgICBjYXJkLnN0eWxlLnRvcCA9IGAke2xheW91dC55fXB4YDtcbiAgICBjYXJkLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGlmICgoZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgKGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkudGFnTmFtZSA9PT0gXCJCVVRUT05cIikgcmV0dXJuO1xuICAgICAgdGhpcy5zZWxlY3ROb2RlKGJsb2NrLmlkLCBub2RlLmlkLCBldmVudC5tZXRhS2V5IHx8IGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQuc2hpZnRLZXkpO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgcm93ID0gY2FyZC5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1ub2RlLXJvd1wiIH0pO1xuICAgIGNvbnN0IHNlbGVjdCA9IHJvdy5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtc2VsZWN0XCIgfSk7XG4gICAgc2VsZWN0LnR5cGUgPSBcImNoZWNrYm94XCI7XG4gICAgc2VsZWN0LmNoZWNrZWQgPSBzZWxlY3RlZDtcbiAgICBzZWxlY3QuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCAoKSA9PiB0aGlzLnNlbGVjdE5vZGUoYmxvY2suaWQsIG5vZGUuaWQsIHRydWUpKTtcblxuICAgIGNvbnN0IGJsb2NrQ29sbGFwc2VkSWRzID0gYWN0aXZlID8gdGhpcy5jb2xsYXBzZWRJZHMgOiBuZXcgU2V0KHRoaXMuZmlsZVN0YXRlLmJsb2Nrc1tibG9jay5pZF0/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgY29uc3QgY29sbGFwc2UgPSByb3cuY3JlYXRlRWwoXCJidXR0b25cIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1jb2xsYXBzZVwiLCB0ZXh0OiBub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDAgPyAoYmxvY2tDb2xsYXBzZWRJZHMuaGFzKG5vZGUuaWQpID8gXCIrXCIgOiBcIi1cIikgOiBcIlwiIH0pO1xuICAgIGNvbGxhcHNlLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGNvbGxhcHNlLmRpc2FibGVkID0gbm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDA7XG4gICAgY29sbGFwc2UuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdGhpcy50b2dnbGVDb2xsYXBzZShibG9jay5pZCwgbm9kZS5pZCk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBpbnB1dCA9IHJvdy5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbm9kZS10aXRsZVwiIH0pO1xuICAgIGlucHV0LmRhdGFzZXQuYmxvY2tJZCA9IGJsb2NrLmlkO1xuICAgIGlucHV0LmRhdGFzZXQubm9kZUlkID0gbm9kZS5pZDtcbiAgICBpbnB1dC52YWx1ZSA9IG5vZGUudGl0bGU7XG4gICAgaW5wdXQucGxhY2Vob2xkZXIgPSBcIlVudGl0bGVkXCI7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImZvY3VzXCIsICgpID0+IHtcbiAgICAgIHRoaXMuYWN0aXZhdGVCbG9jayhibG9jay5pZCk7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChbbm9kZS5pZF0pO1xuICAgICAgdGhpcy51cGRhdGVDYWNoZSgpO1xuICAgICAgY2FyZC5hZGRDbGFzcyhcImlzLXNlbGVjdGVkXCIpO1xuICAgICAgc2VsZWN0LmNoZWNrZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJibHVyXCIsICgpID0+IHZvaWQgdGhpcy5jb21taXRUaXRsZShibG9jay5pZCwgbm9kZS5pZCwgaW5wdXQudmFsdWUpKTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHRoaXMuaGFuZGxlTm9kZUtleWRvd24oZXZlbnQsIGJsb2NrLmlkLCBub2RlLmlkLCBpbnB1dCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVOb2RlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCwgYmxvY2tJZDogc3RyaW5nLCBub2RlSWQ6IHN0cmluZywgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMuY29tbWl0VGl0bGUoYmxvY2tJZCwgbm9kZUlkLCBpbnB1dC52YWx1ZSwgeyBza2lwUmVuZGVyOiB0cnVlIH0pLnRoZW4oKCkgPT4gdGhpcy5hcHBseU9wZXJhdGlvbihpbnNlcnRTaWJsaW5nQWZ0ZXIodGhpcy5ub2Rlcywgbm9kZUlkLCBcIlwiKSkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIlRhYlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCB0aGlzLmNvbW1pdFRpdGxlKGJsb2NrSWQsIG5vZGVJZCwgaW5wdXQudmFsdWUsIHsgc2tpcFJlbmRlcjogdHJ1ZSB9KS50aGVuKCgpID0+XG4gICAgICAgIHRoaXMuYXBwbHlPcGVyYXRpb24oZXZlbnQuc2hpZnRLZXkgPyBvdXRkZW50Tm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpIDogaW5kZW50Tm9kZSh0aGlzLm5vZGVzLCBub2RlSWQpKVxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKChldmVudC5rZXkgPT09IFwiQmFja3NwYWNlXCIgfHwgZXZlbnQua2V5ID09PSBcIkRlbGV0ZVwiKSAmJiBpbnB1dC52YWx1ZS50cmltKCkgPT09IFwiXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB2b2lkIHRoaXMuYXBwbHlPcGVyYXRpb24oZGVsZXRlRW1wdHlOb2RlKHRoaXMubm9kZXMsIG5vZGVJZCkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY29tbWl0VGl0bGUoYmxvY2tJZDogc3RyaW5nLCBub2RlSWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgb3B0aW9uczogeyBza2lwUmVuZGVyPzogYm9vbGVhbiB9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLmFjdGl2YXRlQmxvY2soYmxvY2tJZCk7XG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlKHRoaXMubm9kZXMsIG5vZGVJZCk7XG4gICAgaWYgKCFub2RlIHx8IG5vZGUudGl0bGUgPT09IHRpdGxlKSByZXR1cm47XG4gICAgYXdhaXQgdGhpcy5hcHBseU9wZXJhdGlvbih1cGRhdGVOb2RlVGl0bGUodGhpcy5ub2Rlcywgbm9kZUlkLCB0aXRsZSksIG9wdGlvbnMpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZWxlY3ROb2RlKGJsb2NrSWQ6IHN0cmluZywgbm9kZUlkOiBzdHJpbmcsIGFkZGl0aXZlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5hY3RpdmF0ZUJsb2NrKGJsb2NrSWQpO1xuICAgIGlmICghYWRkaXRpdmUpIHRoaXMuc2VsZWN0ZWRJZHMuY2xlYXIoKTtcbiAgICBpZiAoYWRkaXRpdmUgJiYgdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZUlkKSkge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUobm9kZUlkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5hZGQobm9kZUlkKTtcbiAgICB9XG4gICAgdGhpcy51cGRhdGVDYWNoZSgpO1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHRvZ2dsZUNvbGxhcHNlKGJsb2NrSWQ6IHN0cmluZywgbm9kZUlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmFjdGl2YXRlQmxvY2soYmxvY2tJZCk7XG4gICAgaWYgKHRoaXMuY29sbGFwc2VkSWRzLmhhcyhub2RlSWQpKSB0aGlzLmNvbGxhcHNlZElkcy5kZWxldGUobm9kZUlkKTtcbiAgICBlbHNlIHRoaXMuY29sbGFwc2VkSWRzLmFkZChub2RlSWQpO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0U2NhbGUobmV4dDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5zY2FsZSA9IE1hdGgubWluKDEuOCwgTWF0aC5tYXgoMC41LCBOdW1iZXIobmV4dC50b0ZpeGVkKDIpKSkpO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgYXBwbHlPcGVyYXRpb24ocmVzdWx0OiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0LCBvcHRpb25zOiB7IHNraXBSZW5kZXI/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICBuZXcgTm90aWNlKHJlc3VsdC5yZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLm5vZGVzID0gcmVzdWx0Lm5vZGVzO1xuICAgIHRoaXMuc2VsZWN0ZWRJZHMgPSBuZXcgU2V0KHJlc3VsdC5mb2N1c0lkID8gW3Jlc3VsdC5mb2N1c0lkXSA6IFsuLi50aGlzLnNlbGVjdGVkSWRzXS5maWx0ZXIoKGlkKSA9PiBmaW5kTm9kZSh0aGlzLm5vZGVzLCBpZCkpKTtcbiAgICBjb25zdCB3cml0dGVuID0gYXdhaXQgdGhpcy53cml0ZU5vZGVzVG9NYXJrZG93bigpO1xuICAgIGlmICghd3JpdHRlbikgcmV0dXJuO1xuICAgIHRoaXMudXBkYXRlQ2FjaGUoKTtcbiAgICBpZiAoIW9wdGlvbnMuc2tpcFJlbmRlcikgdGhpcy5yZW5kZXIoKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzU2VsZWN0ZWROb2RlKCksIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyB3cml0ZU5vZGVzVG9NYXJrZG93bigpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSB8fCAhdGhpcy5ibG9jaykge1xuICAgICAgbmV3IE5vdGljZShcIk5vIHNvdXJjZSBtaW5kbWFwIGJsb2NrIGxvYWRlZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG1hcmtkb3duID0gYXdhaXQgdGhpcy5wbHVnaW4ucmVhZE1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUpO1xuICAgIGNvbnN0IGJsb2NrcyA9IHBhcnNlTWluZG1hcEJsb2NrcyhtYXJrZG93biwgeyBzb3VyY2VQYXRoOiB0aGlzLnNvdXJjZUZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogdGhpcy5zb3VyY2VGaWxlLmJhc2VuYW1lIH0pO1xuICAgIGNvbnN0IGZyZXNoQmxvY2sgPSBibG9ja3MuZmluZCgoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuaWQgPT09IHRoaXMuYmxvY2s/LmlkKTtcbiAgICBpZiAoIWZyZXNoQmxvY2spIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJUaGUgc291cmNlIG1pbmRtYXAgYmxvY2sgbm8gbG9uZ2VyIGV4aXN0cy5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG5leHQgPSByZXBsYWNlTWluZG1hcEJsb2NrKG1hcmtkb3duLCBmcmVzaEJsb2NrLCB0aGlzLm5vZGVzLCBmcmVzaEJsb2NrLnRpdGxlKTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi53cml0ZU1hcmtkb3duRmlsZSh0aGlzLnNvdXJjZUZpbGUsIG5leHQpO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLnJlZnJlc2hJbmRleEZvckZpbGUodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgICBjb25zdCBuZXh0QmxvY2sgPSBwYXJzZU1pbmRtYXBCbG9ja3MobmV4dCwgeyBzb3VyY2VQYXRoOiB0aGlzLnNvdXJjZUZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogdGhpcy5zb3VyY2VGaWxlLmJhc2VuYW1lIH0pLmZpbmQoXG4gICAgICAoY2FuZGlkYXRlKSA9PiBjYW5kaWRhdGUuaWQgPT09IGZyZXNoQmxvY2suaWRcbiAgICApO1xuICAgIGlmIChuZXh0QmxvY2spIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBuZXh0QmxvY2s7XG4gICAgICB0aGlzLm5vZGVzID0gbmV4dEJsb2NrLm5vZGVzO1xuICAgICAgdGhpcy5ibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3MobmV4dCwgeyBzb3VyY2VQYXRoOiB0aGlzLnNvdXJjZUZpbGUucGF0aCwgZmFsbGJhY2tUaXRsZTogdGhpcy5zb3VyY2VGaWxlLmJhc2VuYW1lIH0pO1xuICAgICAgdGhpcy5wbHVnaW4uZ2V0RmlsZUNhY2hlKHRoaXMuc291cmNlRmlsZS5wYXRoKS5sYXN0Q29udGVudEhhc2ggPSBuZXh0QmxvY2suY29udGVudEhhc2g7XG4gICAgfVxuICAgIHRoaXMuc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb3BlbkluZGV4RW50cnkoZW50cnk6IE1pbmRtYXBJbmRleEVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChlbnRyeS5maWxlUGF0aCk7XG4gICAgaWYgKCEoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkge1xuICAgICAgbmV3IE5vdGljZShcIk1pbmRtYXAgc291cmNlIGZpbGUgbm8gbG9uZ2VyIGV4aXN0cy5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMucGx1Z2luLnNldEFjdGl2ZUJsb2NrRm9yRmlsZShmaWxlLnBhdGgsIGVudHJ5LmlkKTtcbiAgICBjb25zdCBleGlzdGluZ1ZpZXcgPSB0aGlzLnBsdWdpbi5maW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlKTtcbiAgICBpZiAoIWV4aXN0aW5nVmlldykge1xuICAgICAgYXdhaXQgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoZmFsc2UpLm9wZW5GaWxlKGZpbGUsIHsgYWN0aXZlOiBmYWxzZSB9KTtcbiAgICB9XG4gICAgYXdhaXQgdGhpcy5sb2FkRmlsZUJsb2NrKGZpbGUsIGVudHJ5LmlkKTtcbiAgfVxuXG4gIHByaXZhdGUgYWN0aXZhdGVCbG9jayhibG9ja0lkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5ibG9jaz8uaWQgPT09IGJsb2NrSWQpIHJldHVybjtcbiAgICBjb25zdCBibG9jayA9IHRoaXMuYmxvY2tzLmZpbmQoKGNhbmRpZGF0ZSkgPT4gY2FuZGlkYXRlLmlkID09PSBibG9ja0lkKTtcbiAgICBpZiAoIWJsb2NrKSByZXR1cm47XG4gICAgdGhpcy5ibG9jayA9IGJsb2NrO1xuICAgIHRoaXMubm9kZXMgPSBibG9jay5ub2RlcztcbiAgICBjb25zdCBjYWNoZSA9IHRoaXMuc291cmNlRmlsZSA/IHRoaXMucGx1Z2luLmdldEZpbGVDYWNoZSh0aGlzLnNvdXJjZUZpbGUucGF0aCkgOiBudWxsO1xuICAgIGNvbnN0IHByZXZpb3VzQWN0aXZlSWQgPSBjYWNoZT8uYWN0aXZlQmxvY2tJZDtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZmlsZVN0YXRlLmJsb2Nrc1tibG9jay5pZF07XG4gICAgdGhpcy5jb2xsYXBzZWRJZHMgPSBuZXcgU2V0KHByZXZpb3VzQWN0aXZlSWQgPT09IGJsb2NrLmlkID8gY2FjaGU/LmNvbGxhcHNlZElkcyA/PyBbXSA6IHN0YXRlPy5jb2xsYXBzZWRJZHMgPz8gW10pO1xuICAgIHRoaXMuc2NhbGUgPSBwcmV2aW91c0FjdGl2ZUlkID09PSBibG9jay5pZCA/IGNhY2hlPy5zY2FsZSA/PyB0aGlzLnNjYWxlIDogc3RhdGU/LnNjYWxlID8/IHRoaXMuc2NhbGU7XG4gICAgdGhpcy5zY3JvbGxMZWZ0ID0gcHJldmlvdXNBY3RpdmVJZCA9PT0gYmxvY2suaWQgPyBjYWNoZT8uc2Nyb2xsTGVmdCA/PyAwIDogc3RhdGU/LnNjcm9sbExlZnQgPz8gMDtcbiAgICB0aGlzLnNjcm9sbFRvcCA9IHByZXZpb3VzQWN0aXZlSWQgPT09IGJsb2NrLmlkID8gY2FjaGU/LnNjcm9sbFRvcCA/PyAwIDogc3RhdGU/LnNjcm9sbFRvcCA/PyAwO1xuICAgIGlmICh0aGlzLnNvdXJjZUZpbGUpIHRoaXMucGx1Z2luLnNldEFjdGl2ZUJsb2NrRm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUucGF0aCwgYmxvY2suaWQpO1xuICB9XG5cbiAgcHJpdmF0ZSBjdXJyZW50RmlsZUVudHJpZXMoKTogTWluZG1hcEluZGV4RW50cnlbXSB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUpIHJldHVybiBbXTtcbiAgICByZXR1cm4gdGhpcy5wbHVnaW4uZ2V0SW5kZXhFbnRyaWVzRm9yRmlsZSh0aGlzLnNvdXJjZUZpbGUucGF0aCk7XG4gIH1cblxuICBwcml2YXRlIHVwZGF0ZUNhY2hlKCk6IHZvaWQge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlIHx8ICF0aGlzLmJsb2NrKSByZXR1cm47XG4gICAgY29uc3QgY2FjaGUgPSB0aGlzLnBsdWdpbi5nZXRGaWxlQ2FjaGUodGhpcy5zb3VyY2VGaWxlLnBhdGgpO1xuICAgIGNhY2hlLmFjdGl2ZUJsb2NrSWQgPSB0aGlzLmJsb2NrLmlkO1xuICAgIGNhY2hlLnNlbGVjdGVkSWRzID0gWy4uLnRoaXMuc2VsZWN0ZWRJZHNdO1xuICAgIGNhY2hlLmNvbGxhcHNlZElkcyA9IFsuLi50aGlzLmNvbGxhcHNlZElkc107XG4gICAgY2FjaGUuc2NhbGUgPSB0aGlzLnNjYWxlO1xuICAgIGNhY2hlLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgY2FjaGUuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7XG4gICAgY2FjaGUubGFzdENvbnRlbnRIYXNoID0gdGhpcy5ibG9jay5jb250ZW50SGFzaDtcbiAgfVxuXG4gIHByaXZhdGUgc2NoZWR1bGVTdGF0ZVBlcnNpc3QoKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkgcmV0dXJuO1xuICAgIGlmICh0aGlzLnN0YXRlUGVyc2lzdFRpbWVyICE9PSBudWxsKSB3aW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuc3RhdGVQZXJzaXN0VGltZXIpO1xuICAgIHRoaXMuc3RhdGVQZXJzaXN0VGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnN0YXRlUGVyc2lzdFRpbWVyID0gbnVsbDtcbiAgICAgIHZvaWQgdGhpcy5wZXJzaXN0U3RhdGUoKTtcbiAgICB9LCA1MDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwZXJzaXN0U3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUgfHwgIXRoaXMuYmxvY2sgfHwgIXRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlKSByZXR1cm47XG4gICAgY29uc3QgbWFya2Rvd24gPSBhd2FpdCB0aGlzLnBsdWdpbi5yZWFkTWFya2Rvd25GaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgY29uc3Qgc3RhdGU6IE1pbmRtYXBTdGF0ZURhdGEgPSByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duKTtcbiAgICBzdGF0ZS5ibG9ja3NbdGhpcy5ibG9jay5pZF0gPSB7XG4gICAgICBjb2xsYXBzZWRJZHM6IFsuLi50aGlzLmNvbGxhcHNlZElkc10sXG4gICAgICBzY2FsZTogdGhpcy5zY2FsZSxcbiAgICAgIHNjcm9sbExlZnQ6IHRoaXMuc2Nyb2xsTGVmdCxcbiAgICAgIHNjcm9sbFRvcDogdGhpcy5zY3JvbGxUb3AsXG4gICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgIH07XG4gICAgY29uc3QgbmV4dCA9IHVwc2VydE1pbmRtYXBTdGF0ZUJsb2NrKG1hcmtkb3duLCBzdGF0ZSk7XG4gICAgaWYgKG5leHQgPT09IG1hcmtkb3duKSByZXR1cm47XG4gICAgYXdhaXQgdGhpcy5wbHVnaW4ud3JpdGVNYXJrZG93bkZpbGUodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5yZWZyZXNoSW5kZXhGb3JGaWxlKHRoaXMuc291cmNlRmlsZSwgbmV4dCk7XG4gIH1cblxuICBwcml2YXRlIGFkZFRvb2xiYXJCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPiwgZW5hYmxlZCA9IHRydWUpOiB2b2lkIHtcbiAgICBjb25zdCBidXR0b24gPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0IH0pO1xuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICBidXR0b24uZGlzYWJsZWQgPSAhZW5hYmxlZDtcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHZvaWQgb25DbGljaygpO1xuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIFBhcmVudFRpdGxlTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRUaXRsZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IG9uU3VibWl0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkluZHVjZSBwYXJlbnRcIiB9KTtcbiAgICBjb25zdCBpbnB1dCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbW9kYWwtaW5wdXRcIiB9KTtcbiAgICBpbnB1dC52YWx1ZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LmtleSAhPT0gXCJFbnRlclwiKSByZXR1cm47XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5zdWJtaXQoaW5wdXQudmFsdWUpO1xuICAgIH0pO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbCkuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICBidXR0b25cbiAgICAgICAgLnNldEJ1dHRvblRleHQoXCJDb25maXJtXCIpXG4gICAgICAgIC5zZXRDdGEoKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLnN1Ym1pdChpbnB1dC52YWx1ZSkpXG4gICAgKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpbnB1dC5mb2N1cygpO1xuICAgICAgaW5wdXQuc2VsZWN0KCk7XG4gICAgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHN1Ym1pdCh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5vblN1Ym1pdCh0aXRsZS50cmltKCkgfHwgdGhpcy5kZWZhdWx0VGl0bGUpO1xuICAgIHRoaXMuY2xvc2UoKTtcbiAgfVxufVxuXG5jbGFzcyBNYXJrZG93bk1pbmRtYXBTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogTWFya2Rvd25NaW5kbWFwUGx1Z2luKSB7XG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiT3BlbiBpbiByaWdodCBzaWRlYmFyXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXIpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5JblJpZ2h0U2lkZWJhciA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJQZXJzaXN0IHZpZXcgc3RhdGVcIilcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBjb2xsYXBzZWQgbm9kZXMsIHpvb20sIGFuZCBzY3JvbGwgaW4gYSBoaWRkZW4gbWFuYWdlZCBibG9jayBpbiB0aGUgTWFya2Rvd24gZmlsZS5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJGb2xsb3cgYWN0aXZlIGZpbGVcIilcbiAgICAgIC5zZXREZXNjKFwiS2VlcCB0aGUgcGFuZWwgcG9pbnRlZCBhdCB0aGUgYWN0aXZlIE1hcmtkb3duIGZpbGUgd2l0aG91dCBjbGVhcmluZyBzdGF0ZSBvbiBjdXJzb3IgbW92ZW1lbnQuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVGaWxlID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlNjYW4gdmF1bHQgb24gb3BlblwiKVxuICAgICAgLnNldERlc2MoXCJCdWlsZCB0aGUgZGFzaGJvYXJkIGluZGV4IGZyb20gYWxsIE1hcmtkb3duIGZpbGVzIGFmdGVyIE9ic2lkaWFuIGxheW91dCBpcyByZWFkeS5cIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNjYW5WYXVsdE9uT3Blbikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2NhblZhdWx0T25PcGVuID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXaG9sZUVkaXRvckRhdGEoZWRpdG9yOiBFZGl0b3IsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgbGFzdExpbmUgPSBNYXRoLm1heCgwLCBlZGl0b3IubGluZUNvdW50KCkgLSAxKTtcbiAgY29uc3QgZW5kID0geyBsaW5lOiBsYXN0TGluZSwgY2g6IGVkaXRvci5nZXRMaW5lKGxhc3RMaW5lKS5sZW5ndGggfTtcbiAgZWRpdG9yLnJlcGxhY2VSYW5nZShyZXBsYWNlbWVudCwgeyBsaW5lOiAwLCBjaDogMCB9LCBlbmQpO1xufVxuXG5mdW5jdGlvbiBsYXlvdXROb2Rlcyhub2RlczogT3V0bGluZU5vZGVbXSwgY29sbGFwc2VkSWRzOiBTZXQ8c3RyaW5nPik6IE5vZGVMYXlvdXRbXSB7XG4gIGNvbnN0IHJlc3VsdDogTm9kZUxheW91dFtdID0gW107XG4gIGxldCByb3cgPSAwO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBPdXRsaW5lTm9kZSwgZGVwdGg6IG51bWJlciwgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICByZXN1bHQucHVzaCh7XG4gICAgICBub2RlLFxuICAgICAgZGVwdGgsXG4gICAgICBwYXJlbnRJZCxcbiAgICAgIHg6IDM2ICsgZGVwdGggKiAyNjAsXG4gICAgICB5OiAzNiArIHJvdyAqIDc4XG4gICAgfSk7XG4gICAgcm93ICs9IDE7XG4gICAgaWYgKGNvbGxhcHNlZElkcy5oYXMobm9kZS5pZCkpIHJldHVybjtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEsIG5vZGUuaWQpO1xuICB9O1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHZpc2l0KG5vZGUsIDAsIG51bGwpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBmaW5kTm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lTm9kZSB8IG51bGwge1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4gbm9kZTtcbiAgICBjb25zdCBjaGlsZCA9IGZpbmROb2RlKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNzc0VzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBDU1MgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIENTUy5lc2NhcGUgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIENTUy5lc2NhcGUodmFsdWUpO1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW1wiXFxcXF0vZywgXCJcXFxcJCZcIik7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU4gPSBcIjwhLS0gQkVHSU4gTUFSS0RPV04tTUlORE1BUC1TVEFURVwiO1xuZXhwb3J0IGNvbnN0IE1BUktET1dOX01JTkRNQVBfU1RBVEVfRU5EID0gXCJFTkQgTUFSS0RPV04tTUlORE1BUC1TVEFURSAtLT5cIjtcbmV4cG9ydCBjb25zdCBMRUdBQ1lfTUlORE1BUF9TVEFURV9CRUdJTiA9IFwiPCEtLSBCRUdJTiBMT0NBTC1PQlNJRElBTi1NSU5ETUFQLVNUQVRFXCI7XG5leHBvcnQgY29uc3QgTEVHQUNZX01JTkRNQVBfU1RBVEVfRU5EID0gXCJFTkQgTE9DQUwtT0JTSURJQU4tTUlORE1BUC1TVEFURSAtLT5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBPdXRsaW5lTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNoaWxkcmVuOiBPdXRsaW5lTm9kZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pbmRtYXBCbG9jayB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHJvb3RUaXRsZTogc3RyaW5nO1xuICBzdGFydExpbmU6IG51bWJlcjtcbiAgZW5kTGluZTogbnVtYmVyO1xuICBjb250ZW50U3RhcnRMaW5lOiBudW1iZXI7XG4gIGNvbnRlbnRFbmRMaW5lOiBudW1iZXI7XG4gIHJhd0NvbnRlbnQ6IHN0cmluZztcbiAgbm9kZXM6IE91dGxpbmVOb2RlW107XG4gIGNvbnRlbnRIYXNoOiBzdHJpbmc7XG4gIG1ldGFkYXRhTWlzc2luZzogYm9vbGVhbjtcbiAgd2FybmluZz86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaW5kbWFwSW5kZXhFbnRyeSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIHJvb3RUaXRsZTogc3RyaW5nO1xuICBmaWxlUGF0aDogc3RyaW5nO1xuICBsaW5lOiBudW1iZXI7XG4gIGNvbnRlbnRIYXNoOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWluZG1hcFN0YXRlRGF0YSB7XG4gIHNjaGVtYVZlcnNpb246IDE7XG4gIGJsb2NrczogUmVjb3JkPFxuICAgIHN0cmluZyxcbiAgICB7XG4gICAgICBjb2xsYXBzZWRJZHM6IHN0cmluZ1tdO1xuICAgICAgc2NhbGU/OiBudW1iZXI7XG4gICAgICBzY3JvbGxMZWZ0PzogbnVtYmVyO1xuICAgICAgc2Nyb2xsVG9wPzogbnVtYmVyO1xuICAgICAgdXBkYXRlZEF0OiBzdHJpbmc7XG4gICAgfVxuICA+O1xufVxuXG5leHBvcnQgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBub2RlczogT3V0bGluZU5vZGVbXTsgZm9jdXNJZD86IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH07XG5cbmludGVyZmFjZSBQYXJzZU1pbmRtYXBPcHRpb25zIHtcbiAgc291cmNlUGF0aD86IHN0cmluZztcbiAgZmFsbGJhY2tUaXRsZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEJsb2NrQ2FuZGlkYXRlIHtcbiAgc3RhcnRMaW5lOiBudW1iZXI7XG4gIGVuZExpbmU6IG51bWJlcjtcbiAgY29udGVudFN0YXJ0TGluZTogbnVtYmVyO1xuICBjb250ZW50RW5kTGluZTogbnVtYmVyO1xuICBmZW5jZTogc3RyaW5nO1xuICBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgcmF3QXR0cnM6IHN0cmluZztcbiAgcmF3Q29udGVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duOiBzdHJpbmcsIG9wdGlvbnM6IFBhcnNlTWluZG1hcE9wdGlvbnMgPSB7fSk6IE1pbmRtYXBCbG9ja1tdIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKHN0cmlwTWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd24pKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCBjYW5kaWRhdGVzID0gZmluZE1pbmRtYXBGZW5jZXMobGluZXMpO1xuICByZXR1cm4gY2FuZGlkYXRlcy5tYXAoKGNhbmRpZGF0ZSwgaW5kZXgpID0+IHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZU91dGxpbmVCbG9ja0xpbmVzKGNhbmRpZGF0ZS5yYXdDb250ZW50LnNwbGl0KFwiXFxuXCIpKTtcbiAgICBjb25zdCBub2RlcyA9IHBhcnNlZC5vayA/IHBhcnNlZC5ub2RlcyA6IFtdO1xuICAgIGNvbnN0IHJvb3RUaXRsZSA9IGZpcnN0Um9vdFRpdGxlKG5vZGVzKTtcbiAgICBjb25zdCBnZW5lcmF0ZWRJZCA9IHN0YWJsZU1pbmRtYXBJZChvcHRpb25zLnNvdXJjZVBhdGggPz8gXCJcIiwgaW5kZXgsIGNhbmRpZGF0ZS5yYXdDb250ZW50KTtcbiAgICBjb25zdCBpZCA9IGNhbmRpZGF0ZS5hdHRycy5pZD8udHJpbSgpIHx8IGdlbmVyYXRlZElkO1xuICAgIGNvbnN0IHRpdGxlID0gY2FuZGlkYXRlLmF0dHJzLnRpdGxlPy50cmltKCkgfHwgcm9vdFRpdGxlIHx8IG9wdGlvbnMuZmFsbGJhY2tUaXRsZSB8fCBcIk1pbmRtYXBcIjtcbiAgICByZXR1cm4ge1xuICAgICAgaWQsXG4gICAgICB0aXRsZSxcbiAgICAgIHJvb3RUaXRsZSxcbiAgICAgIHN0YXJ0TGluZTogY2FuZGlkYXRlLnN0YXJ0TGluZSxcbiAgICAgIGVuZExpbmU6IGNhbmRpZGF0ZS5lbmRMaW5lLFxuICAgICAgY29udGVudFN0YXJ0TGluZTogY2FuZGlkYXRlLmNvbnRlbnRTdGFydExpbmUsXG4gICAgICBjb250ZW50RW5kTGluZTogY2FuZGlkYXRlLmNvbnRlbnRFbmRMaW5lLFxuICAgICAgcmF3Q29udGVudDogY2FuZGlkYXRlLnJhd0NvbnRlbnQsXG4gICAgICBub2RlcyxcbiAgICAgIGNvbnRlbnRIYXNoOiBoYXNoU3RyaW5nKGNhbmRpZGF0ZS5yYXdDb250ZW50KSxcbiAgICAgIG1ldGFkYXRhTWlzc2luZzogIWNhbmRpZGF0ZS5hdHRycy5pZCB8fCAhY2FuZGlkYXRlLmF0dHJzLnRpdGxlLFxuICAgICAgd2FybmluZzogcGFyc2VkLm9rID8gdW5kZWZpbmVkIDogcGFyc2VkLnJlYXNvblxuICAgIH07XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRNaW5kbWFwSW5kZXgobWFya2Rvd246IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZywgZmFsbGJhY2tUaXRsZT86IHN0cmluZyk6IE1pbmRtYXBJbmRleEVudHJ5W10ge1xuICByZXR1cm4gcGFyc2VNaW5kbWFwQmxvY2tzKG1hcmtkb3duLCB7IHNvdXJjZVBhdGg6IGZpbGVQYXRoLCBmYWxsYmFja1RpdGxlIH0pLm1hcCgoYmxvY2spID0+ICh7XG4gICAgaWQ6IGJsb2NrLmlkLFxuICAgIHRpdGxlOiBibG9jay50aXRsZSxcbiAgICByb290VGl0bGU6IGJsb2NrLnJvb3RUaXRsZSxcbiAgICBmaWxlUGF0aCxcbiAgICBsaW5lOiBibG9jay5zdGFydExpbmUgKyAxLFxuICAgIGNvbnRlbnRIYXNoOiBibG9jay5jb250ZW50SGFzaFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVNaW5kbWFwQmxvY2tNZXRhZGF0YShtYXJrZG93bjogc3RyaW5nLCBvcHRpb25zOiBQYXJzZU1pbmRtYXBPcHRpb25zID0ge30pOiBzdHJpbmcge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pO1xuICBjb25zdCBibG9ja3MgPSBwYXJzZU1pbmRtYXBCbG9ja3Mobm9ybWFsaXplZCwgb3B0aW9ucyk7XG4gIGlmICghYmxvY2tzLnNvbWUoKGJsb2NrKSA9PiBibG9jay5tZXRhZGF0YU1pc3NpbmcpKSByZXR1cm4gbm9ybWFsaXplZDtcblxuICBjb25zdCBsaW5lcyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCJcXG5cIik7XG4gIGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzKSB7XG4gICAgaWYgKCFibG9jay5tZXRhZGF0YU1pc3NpbmcpIGNvbnRpbnVlO1xuICAgIGxpbmVzW2Jsb2NrLnN0YXJ0TGluZV0gPSBgXFxgXFxgXFxgbWluZG1hcCBpZD1cIiR7ZXNjYXBlQXR0cmlidXRlKGJsb2NrLmlkKX1cIiB0aXRsZT1cIiR7ZXNjYXBlQXR0cmlidXRlKGJsb2NrLnRpdGxlKX1cImA7XG4gIH1cbiAgcmV0dXJuIHJlc3RvcmVGaW5hbE5ld2xpbmUobWFya2Rvd24sIGxpbmVzLmpvaW4oXCJcXG5cIikpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZU1pbmRtYXBCbG9jayhtYXJrZG93bjogc3RyaW5nLCBibG9jazogUGljazxNaW5kbWFwQmxvY2ssIFwic3RhcnRMaW5lXCIgfCBcImVuZExpbmVcIiB8IFwiaWRcIiB8IFwidGl0bGVcIj4sIG5vZGVzOiBPdXRsaW5lTm9kZVtdLCB0aXRsZSA9IGJsb2NrLnRpdGxlKTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCByZXBsYWNlbWVudCA9IHNlcmlhbGl6ZU1pbmRtYXBCbG9jayh7IGlkOiBibG9jay5pZCwgdGl0bGUgfSwgbm9kZXMpLnNwbGl0KFwiXFxuXCIpO1xuICBsaW5lcy5zcGxpY2UoYmxvY2suc3RhcnRMaW5lLCBibG9jay5lbmRMaW5lIC0gYmxvY2suc3RhcnRMaW5lICsgMSwgLi4ucmVwbGFjZW1lbnQpO1xuICByZXR1cm4gcmVzdG9yZUZpbmFsTmV3bGluZShtYXJrZG93biwgbGluZXMuam9pbihcIlxcblwiKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRNaW5kbWFwQmxvY2tBdExpbmUobWFya2Rvd246IHN0cmluZywgbGluZTogbnVtYmVyLCBvcHRpb25zOiB7IGlkOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IG5vZGVzPzogT3V0bGluZU5vZGVbXSB9KTogc3RyaW5nIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLmxlbmd0aCA+IDAgPyBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpIDogW107XG4gIGNvbnN0IHRhcmdldExpbmUgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihsaW5lLCBsaW5lcy5sZW5ndGgpKTtcbiAgY29uc3Qgbm9kZXMgPSBvcHRpb25zLm5vZGVzPy5sZW5ndGhcbiAgICA/IG9wdGlvbnMubm9kZXNcbiAgICA6IFt7IGlkOiBcIm4tMFwiLCB0aXRsZTogb3B0aW9ucy50aXRsZSB8fCBcIk1pbmRtYXBcIiwgY2hpbGRyZW46IFtdIH1dO1xuICBjb25zdCBibG9jayA9IHNlcmlhbGl6ZU1pbmRtYXBCbG9jayh7IGlkOiBvcHRpb25zLmlkLCB0aXRsZTogb3B0aW9ucy50aXRsZSB8fCBcIk1pbmRtYXBcIiB9LCBub2Rlcyk7XG4gIGNvbnN0IHByZWZpeCA9IHRhcmdldExpbmUgPiAwICYmIGxpbmVzW3RhcmdldExpbmUgLSAxXT8udHJpbSgpID8gW1wiXCJdIDogW107XG4gIGNvbnN0IHN1ZmZpeCA9IGxpbmVzW3RhcmdldExpbmVdPy50cmltKCkgPyBbXCJcIl0gOiBbXTtcbiAgbGluZXMuc3BsaWNlKHRhcmdldExpbmUsIDAsIC4uLnByZWZpeCwgLi4uYmxvY2suc3BsaXQoXCJcXG5cIiksIC4uLnN1ZmZpeCk7XG4gIHJldHVybiByZXN0b3JlRmluYWxOZXdsaW5lKG1hcmtkb3duLCBsaW5lcy5qb2luKFwiXFxuXCIpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZU1pbmRtYXBCbG9jayhtZXRhZGF0YTogeyBpZDogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH0sIG5vZGVzOiBPdXRsaW5lTm9kZVtdKTogc3RyaW5nIHtcbiAgcmV0dXJuIFtcbiAgICBgXFxgXFxgXFxgbWluZG1hcCBpZD1cIiR7ZXNjYXBlQXR0cmlidXRlKG1ldGFkYXRhLmlkKX1cIiB0aXRsZT1cIiR7ZXNjYXBlQXR0cmlidXRlKG1ldGFkYXRhLnRpdGxlKX1cImAsXG4gICAgc2VyaWFsaXplT3V0bGluZShub2RlcyksXG4gICAgXCJgYGBcIlxuICBdLmpvaW4oXCJcXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVPdXRsaW5lKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBpbmRlbnQgPSBcIlxcdFwiKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IE91dGxpbmVOb2RlLCBkZXB0aDogbnVtYmVyKSA9PiB7XG4gICAgbGluZXMucHVzaChgJHtpbmRlbnQucmVwZWF0KGRlcHRoKX0tICR7bm9kZS50aXRsZX1gKTtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEpO1xuICB9O1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHZpc2l0KG5vZGUsIDApO1xuICByZXR1cm4gbGluZXMuam9pbihcIlxcblwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZU5vZGVUaXRsZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBsb2NhdGlvbi5ub2RlLnRpdGxlID0gdGl0bGU7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbm9kZUlkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRTaWJsaW5nQWZ0ZXIoXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgdGl0bGUgPSBcIlwiLFxuICBuZXdJZCA9IGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpXG4pOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBsb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UobG9jYXRpb24uaW5kZXggKyAxLCAwLCB7IGlkOiBuZXdJZCwgdGl0bGUsIGNoaWxkcmVuOiBbXSB9KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBuZXdJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kZW50Tm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBpZiAobG9jYXRpb24uaW5kZXggPT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkNhbm5vdCBpbmRlbnQ6IHRoZXJlIGlzIG5vIHByZXZpb3VzIHNpYmxpbmcuXCIgfTtcbiAgY29uc3QgW25vZGVdID0gbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4LCAxKTtcbiAgbG9jYXRpb24uc2libGluZ3NbbG9jYXRpb24uaW5kZXggLSAxXS5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3V0ZGVudE5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgaWYgKCFsb2NhdGlvbi5wYXJlbnRJZCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiQ2Fubm90IG91dGRlbnQgYSB0b3AtbGV2ZWwgbm9kZS5cIiB9O1xuICBjb25zdCBwYXJlbnRMb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBsb2NhdGlvbi5wYXJlbnRJZCk7XG4gIGlmICghcGFyZW50TG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlBhcmVudCBub2RlIG5vdCBmb3VuZC5cIiB9O1xuICBjb25zdCBmcmVzaExvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghZnJlc2hMb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgY29uc3QgW25vZGVdID0gZnJlc2hMb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UoZnJlc2hMb2NhdGlvbi5pbmRleCwgMSk7XG4gIHBhcmVudExvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShwYXJlbnRMb2NhdGlvbi5pbmRleCArIDEsIDAsIG5vZGUpO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlRW1wdHlOb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGlmIChsb2NhdGlvbi5ub2RlLnRpdGxlLnRyaW0oKSB8fCBsb2NhdGlvbi5ub2RlLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPbmx5IGVtcHR5IGxlYWYgbm9kZXMgY2FuIGJlIGRlbGV0ZWQgd2l0aCBCYWNrc3BhY2UvRGVsZXRlLlwiIH07XG4gIH1cbiAgbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4LCAxKTtcbiAgY29uc3QgZm9jdXNJZCA9IGxvY2F0aW9uLnNpYmxpbmdzW01hdGgubWF4KDAsIGxvY2F0aW9uLmluZGV4IC0gMSldPy5pZCA/PyBsb2NhdGlvbi5zaWJsaW5nc1swXT8uaWQ7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5kdWNlUGFyZW50RnJvbVNlbGVjdGVkKFxuICBub2RlczogT3V0bGluZU5vZGVbXSxcbiAgc2VsZWN0ZWRJZHM6IHN0cmluZ1tdLFxuICB0aXRsZSA9IFwiXHU1RjUyXHU3RUIzXCIsXG4gIG5ld0lkID0gY3JlYXRlR2VuZXJhdGVkTm9kZUlkKClcbik6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCB1bmlxdWVJZHMgPSBbLi4ubmV3IFNldChzZWxlY3RlZElkcyldO1xuICBpZiAodW5pcXVlSWRzLmxlbmd0aCA8IDIpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlNlbGVjdCBhdCBsZWFzdCB0d28gc2libGluZyBub2Rlcy5cIiB9O1xuXG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb25zID0gdW5pcXVlSWRzLm1hcCgoaWQpID0+IGZpbmRMb2NhdGlvbihuZXh0LCBpZCkpO1xuICBpZiAobG9jYXRpb25zLnNvbWUoKGxvY2F0aW9uKSA9PiAhbG9jYXRpb24pKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJTb21lIHNlbGVjdGVkIG5vZGVzIG5vIGxvbmdlciBleGlzdC5cIiB9O1xuICBjb25zdCBjb25jcmV0ZSA9IGxvY2F0aW9ucyBhcyBOb25OdWxsYWJsZTxSZXR1cm5UeXBlPHR5cGVvZiBmaW5kTG9jYXRpb24+PltdO1xuICBjb25zdCBwYXJlbnRLZXkgPSBjb25jcmV0ZVswXS5wYXJlbnRJZCA/PyBcIl9fcm9vdF9fXCI7XG4gIGlmIChjb25jcmV0ZS5zb21lKChsb2NhdGlvbikgPT4gKGxvY2F0aW9uLnBhcmVudElkID8/IFwiX19yb290X19cIikgIT09IHBhcmVudEtleSkpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIG5vZGVzIHdpdGggdGhlIHNhbWUgcGFyZW50LlwiIH07XG4gIH1cblxuICBjb25zdCBzaWJsaW5ncyA9IGNvbmNyZXRlWzBdLnNpYmxpbmdzO1xuICBpZiAoY29uY3JldGUuc29tZSgobG9jYXRpb24pID0+IGxvY2F0aW9uLnNpYmxpbmdzICE9PSBzaWJsaW5ncykpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIG5vZGVzIHdpdGggdGhlIHNhbWUgcGFyZW50LlwiIH07XG4gIH1cblxuICBjb25zdCBzb3J0ZWQgPSBjb25jcmV0ZS5zbGljZSgpLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgZm9yIChsZXQgaW5kZXggPSAxOyBpbmRleCA8IHNvcnRlZC5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBpZiAoc29ydGVkW2luZGV4XS5pbmRleCAhPT0gc29ydGVkW2luZGV4IC0gMV0uaW5kZXggKyAxKSB7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJSZXZlcnNlIGluZHVjdGlvbiBvbmx5IHN1cHBvcnRzIGFkamFjZW50IHNpYmxpbmcgbm9kZXMuXCIgfTtcbiAgICB9XG4gIH1cblxuICBjb25zdCBmaXJzdEluZGV4ID0gc29ydGVkWzBdLmluZGV4O1xuICBjb25zdCBzZWxlY3RlZE5vZGVzID0gc2libGluZ3Muc3BsaWNlKGZpcnN0SW5kZXgsIHNvcnRlZC5sZW5ndGgpO1xuICBzaWJsaW5ncy5zcGxpY2UoZmlyc3RJbmRleCwgMCwgeyBpZDogbmV3SWQsIHRpdGxlLCBjaGlsZHJlbjogc2VsZWN0ZWROb2RlcyB9KTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBuZXdJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RyaXBNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bjogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKVxuICAgIC5yZXBsYWNlKG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCksIFwiXCIpXG4gICAgLnJlcGxhY2UobGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKSwgXCJcIilcbiAgICAucmVwbGFjZSgvXFxuezMsfSQvZywgXCJcXG5cXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duOiBzdHJpbmcpOiBNaW5kbWFwU3RhdGVEYXRhIHtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgbWF0Y2ggPSBtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLmV4ZWMobm9ybWFsaXplZCkgPz8gbGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKS5leGVjKG5vcm1hbGl6ZWQpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gZW1wdHlNaW5kbWFwU3RhdGUoKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG1hdGNoWzFdLnRyaW0oKSkgYXMgTWluZG1hcFN0YXRlRGF0YTtcbiAgICBpZiAocGFyc2VkLnNjaGVtYVZlcnNpb24gIT09IDEgfHwgdHlwZW9mIHBhcnNlZC5ibG9ja3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmJsb2NrcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGVtcHR5TWluZG1hcFN0YXRlKCk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBlbXB0eU1pbmRtYXBTdGF0ZSgpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bjogc3RyaW5nLCBzdGF0ZTogTWluZG1hcFN0YXRlRGF0YSk6IHN0cmluZyB7XG4gIGxldCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pLnRyaW1FbmQoKTtcbiAgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZShsZWdhY3lNaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBcIlwiKS50cmltRW5kKCk7XG4gIGNvbnN0IGJsb2NrID0gYCR7TUFSS0RPV05fTUlORE1BUF9TVEFURV9CRUdJTn1cXG4ke0pTT04uc3RyaW5naWZ5KHN0YXRlLCBudWxsLCAyKX1cXG4ke01BUktET1dOX01JTkRNQVBfU1RBVEVfRU5EfWA7XG4gIGlmIChtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLnRlc3Qobm9ybWFsaXplZCkpIHtcbiAgICByZXR1cm4gYCR7bm9ybWFsaXplZC5yZXBsYWNlKG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCksIGJsb2NrKX1cXG5gO1xuICB9XG4gIHJldHVybiBgJHtub3JtYWxpemVkfVxcblxcbiR7YmxvY2t9XFxuYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2hTdHJpbmcodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBoYXNoID0gMjE2NjEzNjI2MTtcbiAgZm9yIChjb25zdCBjaGFyIG9mIG5vcm1hbGl6ZU5ld2xpbmVzKHZhbHVlKSkge1xuICAgIGhhc2ggXj0gY2hhci5jaGFyQ29kZUF0KDApO1xuICAgIGhhc2ggPSBNYXRoLmltdWwoaGFzaCwgMTY3Nzc2MTkpO1xuICB9XG4gIHJldHVybiAoaGFzaCA+Pj4gMCkudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDgsIFwiMFwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1pbmRtYXBJZChzZWVkOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYG1pbmRtYXAtJHtoYXNoU3RyaW5nKGAke3NlZWR9OiR7RGF0ZS5ub3coKX1gKS5zbGljZSgwLCAxMCl9YDtcbn1cblxuZnVuY3Rpb24gZmluZE1pbmRtYXBGZW5jZXMobGluZXM6IHN0cmluZ1tdKTogQmxvY2tDYW5kaWRhdGVbXSB7XG4gIGNvbnN0IGJsb2NrczogQmxvY2tDYW5kaWRhdGVbXSA9IFtdO1xuICBmb3IgKGxldCBsaW5lID0gMDsgbGluZSA8IGxpbmVzLmxlbmd0aDsgbGluZSArPSAxKSB7XG4gICAgY29uc3Qgb3BlbiA9IGxpbmVzW2xpbmVdLm1hdGNoKC9eKGB7Myx9fH57Myx9KVxccyptaW5kbWFwKD86XFxzKyguKikpP1xccyokLyk7XG4gICAgaWYgKCFvcGVuKSBjb250aW51ZTtcbiAgICBjb25zdCBmZW5jZSA9IG9wZW5bMV07XG4gICAgY29uc3QgZmVuY2VDaGFyID0gZmVuY2VbMF07XG4gICAgY29uc3QgbWluRmVuY2VMZW5ndGggPSBmZW5jZS5sZW5ndGg7XG4gICAgbGV0IGNsb3NlTGluZSA9IC0xO1xuICAgIGZvciAobGV0IGN1cnNvciA9IGxpbmUgKyAxOyBjdXJzb3IgPCBsaW5lcy5sZW5ndGg7IGN1cnNvciArPSAxKSB7XG4gICAgICBpZiAobmV3IFJlZ0V4cChgXiR7ZXNjYXBlUmVnRXhwKGZlbmNlQ2hhcil9eyR7bWluRmVuY2VMZW5ndGh9LH1cXFxccyokYCkudGVzdChsaW5lc1tjdXJzb3JdKSkge1xuICAgICAgICBjbG9zZUxpbmUgPSBjdXJzb3I7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoY2xvc2VMaW5lID09PSAtMSkgY29udGludWU7XG4gICAgY29uc3QgcmF3QXR0cnMgPSBvcGVuWzJdID8/IFwiXCI7XG4gICAgY29uc3QgY29udGVudExpbmVzID0gbGluZXMuc2xpY2UobGluZSArIDEsIGNsb3NlTGluZSk7XG4gICAgYmxvY2tzLnB1c2goe1xuICAgICAgc3RhcnRMaW5lOiBsaW5lLFxuICAgICAgZW5kTGluZTogY2xvc2VMaW5lLFxuICAgICAgY29udGVudFN0YXJ0TGluZTogbGluZSArIDEsXG4gICAgICBjb250ZW50RW5kTGluZTogY2xvc2VMaW5lIC0gMSxcbiAgICAgIGZlbmNlLFxuICAgICAgYXR0cnM6IHBhcnNlQXR0cmlidXRlcyhyYXdBdHRycyksXG4gICAgICByYXdBdHRycyxcbiAgICAgIHJhd0NvbnRlbnQ6IGNvbnRlbnRMaW5lcy5qb2luKFwiXFxuXCIpXG4gICAgfSk7XG4gICAgbGluZSA9IGNsb3NlTGluZTtcbiAgfVxuICByZXR1cm4gYmxvY2tzO1xufVxuXG5mdW5jdGlvbiBwYXJzZUF0dHJpYnV0ZXMocmF3QXR0cnM6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBjb25zdCBhdHRyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBjb25zdCByZWdleHAgPSAvKFtBLVphLXpfXVtcXHctXSopPVwiKFteXCJdKilcIi9nO1xuICBsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG4gIHdoaWxlICgobWF0Y2ggPSByZWdleHAuZXhlYyhyYXdBdHRycykpICE9PSBudWxsKSB7XG4gICAgYXR0cnNbbWF0Y2hbMV1dID0gdW5lc2NhcGVBdHRyaWJ1dGUobWF0Y2hbMl0pO1xuICB9XG4gIHJldHVybiBhdHRycztcbn1cblxuZnVuY3Rpb24gcGFyc2VPdXRsaW5lQmxvY2tMaW5lcyhcbiAgYmxvY2tMaW5lczogc3RyaW5nW11cbik6IHsgb2s6IHRydWU7IG5vZGVzOiBPdXRsaW5lTm9kZVtdIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gIGNvbnN0IG1lYW5pbmdmdWxMaW5lcyA9IGJsb2NrTGluZXMuZmlsdGVyKChsaW5lKSA9PiBsaW5lLnRyaW0oKS5sZW5ndGggPiAwKTtcbiAgaWYgKG1lYW5pbmdmdWxMaW5lcy5sZW5ndGggPT09IDApIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogW10gfTtcblxuICBjb25zdCByb290czogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBjb25zdCBzdGFjazogQXJyYXk8eyBub2RlOiBPdXRsaW5lTm9kZTsgZGVwdGg6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgcHJldmlvdXNEZXB0aCA9IDA7XG5cbiAgZm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgbWVhbmluZ2Z1bExpbmVzLmxlbmd0aDsgbGluZUluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZVBsYWluTGlzdEl0ZW0obWVhbmluZ2Z1bExpbmVzW2xpbmVJbmRleF0pO1xuICAgIGlmICghcGFyc2VkLm9rKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogcGFyc2VkLnJlYXNvbiB9O1xuICAgIGlmIChsaW5lSW5kZXggPT09IDAgJiYgcGFyc2VkLmRlcHRoICE9PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUaGUgbWluZG1hcCBsaXN0IG11c3Qgc3RhcnQgYXQgZGVwdGggMC5cIiB9O1xuICAgIGlmIChwYXJzZWQuZGVwdGggPiBwcmV2aW91c0RlcHRoICsgMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiSW5kZW50YXRpb24ganVtcHMgbW9yZSB0aGFuIG9uZSBsZXZlbC5cIiB9O1xuICAgIGNvbnN0IHBhcmVudCA9IHBhcnNlZC5kZXB0aCA9PT0gMCA/IG51bGwgOiBzdGFja1twYXJzZWQuZGVwdGggLSAxXT8ubm9kZTtcbiAgICBpZiAocGFyc2VkLmRlcHRoID4gMCAmJiAhcGFyZW50KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJNaXNzaW5nIHBhcmVudCBsaXN0IGl0ZW0uXCIgfTtcbiAgICBjb25zdCBzaWJsaW5ncyA9IHBhcmVudCA/IHBhcmVudC5jaGlsZHJlbiA6IHJvb3RzO1xuICAgIGNvbnN0IG5vZGU6IE91dGxpbmVOb2RlID0ge1xuICAgICAgaWQ6IGBuLSR7Wy4uLnN0YWNrLnNsaWNlKDAsIHBhcnNlZC5kZXB0aCkubWFwKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCksIHNpYmxpbmdzLmxlbmd0aF0uam9pbihcIi1cIil9YCxcbiAgICAgIHRpdGxlOiBwYXJzZWQudGl0bGUsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuICAgIHNpYmxpbmdzLnB1c2gobm9kZSk7XG4gICAgc3RhY2tbcGFyc2VkLmRlcHRoXSA9IHsgbm9kZSwgZGVwdGg6IHBhcnNlZC5kZXB0aCB9O1xuICAgIHN0YWNrLmxlbmd0aCA9IHBhcnNlZC5kZXB0aCArIDE7XG4gICAgcHJldmlvdXNEZXB0aCA9IHBhcnNlZC5kZXB0aDtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2Rlczogcm9vdHMgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFpbkxpc3RJdGVtKGxpbmU6IHN0cmluZyk6XG4gIHwgeyBvazogdHJ1ZTsgZGVwdGg6IG51bWJlcjsgdGl0bGU6IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH0ge1xuICBpZiAoL15cXHMqXFxkK1xcLlxccysvLnRlc3QobGluZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk9yZGVyZWQgbGlzdHMgYXJlIG5vdCBzdXBwb3J0ZWQuXCIgfTtcbiAgY29uc3QgbWF0Y2ggPSBsaW5lLm1hdGNoKC9eKFsgXFx0XSopLVxccz8oLiopJC8pO1xuICBpZiAoIW1hdGNoKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPbmx5IHBsYWluIHVub3JkZXJlZCBsaXN0IGl0ZW1zIGFyZSBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgY29uc3QgaW5kZW50ID0gbWF0Y2hbMV07XG4gIGlmIChpbmRlbnQuaW5jbHVkZXMoXCJcXHRcIikgJiYgaW5kZW50LmluY2x1ZGVzKFwiIFwiKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiRG8gbm90IG1peCB0YWJzIGFuZCBzcGFjZXMgZm9yIG1pbmRtYXAgaW5kZW50YXRpb24uXCIgfTtcbiAgbGV0IGRlcHRoID0gMDtcbiAgaWYgKGluZGVudC5pbmNsdWRlcyhcIlxcdFwiKSkge1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBpZiAoaW5kZW50Lmxlbmd0aCAlIDIgIT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkxlZ2FjeSBzcGFjZSBpbmRlbnRhdGlvbiBtdXN0IHVzZSBtdWx0aXBsZXMgb2YgdHdvIHNwYWNlcy5cIiB9O1xuICAgIGRlcHRoID0gaW5kZW50Lmxlbmd0aCAvIDI7XG4gIH1cbiAgY29uc3QgdGl0bGUgPSBtYXRjaFsyXSA/PyBcIlwiO1xuICBpZiAoL15cXFtbIHhYXVxcXVxccysvLnRlc3QodGl0bGUpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUYXNrIGxpc3QgaXRlbXMgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gbWluZG1hcCBibG9ja3MuXCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRlcHRoLCB0aXRsZSB9O1xufVxuXG5mdW5jdGlvbiBmaW5kTG9jYXRpb24oXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXG4pOiB7IG5vZGU6IE91dGxpbmVOb2RlOyBzaWJsaW5nczogT3V0bGluZU5vZGVbXTsgaW5kZXg6IG51bWJlcjsgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgfSB8IG51bGwge1xuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbm9kZXMubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzW2luZGV4XTtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4geyBub2RlLCBzaWJsaW5nczogbm9kZXMsIGluZGV4LCBwYXJlbnRJZCB9O1xuICAgIGNvbnN0IGNoaWxkID0gZmluZExvY2F0aW9uKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCwgbm9kZS5pZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsb25lTm9kZXMobm9kZXM6IE91dGxpbmVOb2RlW10pOiBPdXRsaW5lTm9kZVtdIHtcbiAgcmV0dXJuIG5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICBpZDogbm9kZS5pZCxcbiAgICB0aXRsZTogbm9kZS50aXRsZSxcbiAgICBjaGlsZHJlbjogY2xvbmVOb2Rlcyhub2RlLmNoaWxkcmVuKVxuICB9KSk7XG59XG5cbmZ1bmN0aW9uIGVtcHR5TWluZG1hcFN0YXRlKCk6IE1pbmRtYXBTdGF0ZURhdGEge1xuICByZXR1cm4geyBzY2hlbWFWZXJzaW9uOiAxLCBibG9ja3M6IHt9IH07XG59XG5cbmZ1bmN0aW9uIHN0YWJsZU1pbmRtYXBJZChzb3VyY2VQYXRoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgbWluZG1hcC0ke2hhc2hTdHJpbmcoYCR7c291cmNlUGF0aH06JHtpbmRleH06JHtjb250ZW50fWApLnNsaWNlKDAsIDEwKX1gO1xufVxuXG5mdW5jdGlvbiBmaXJzdFJvb3RUaXRsZShub2RlczogT3V0bGluZU5vZGVbXSk6IHN0cmluZyB7XG4gIHJldHVybiBub2Rlc1swXT8udGl0bGU/LnRyaW0oKSA/PyBcIlwiO1xufVxuXG5sZXQgZ2VuZXJhdGVkSWRDb3VudGVyID0gMDtcbmZ1bmN0aW9uIGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpOiBzdHJpbmcge1xuICBnZW5lcmF0ZWRJZENvdW50ZXIgKz0gMTtcbiAgcmV0dXJuIGBub2RlLSR7RGF0ZS5ub3coKS50b1N0cmluZygzNil9LSR7Z2VuZXJhdGVkSWRDb3VudGVyfWA7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZU5ld2xpbmVzKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvXFxyXFxuL2csIFwiXFxuXCIpLnJlcGxhY2UoL1xcci9nLCBcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUZpbmFsTmV3bGluZShvcmlnaW5hbDogc3RyaW5nLCBuZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplTmV3bGluZXMob3JpZ2luYWwpLmVuZHNXaXRoKFwiXFxuXCIpICYmICFuZXh0LmVuZHNXaXRoKFwiXFxuXCIpID8gYCR7bmV4dH1cXG5gIDogbmV4dDtcbn1cblxuZnVuY3Rpb24gbWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKE1BUktET1dOX01JTkRNQVBfU1RBVEVfQkVHSU4pfVxcXFxuKFtcXFxcc1xcXFxTXSo/KVxcXFxuJHtlc2NhcGVSZWdFeHAoTUFSS0RPV05fTUlORE1BUF9TVEFURV9FTkQpfWAsIFwibVwiKTtcbn1cblxuZnVuY3Rpb24gbGVnYWN5TWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0JFR0lOKX1cXFxcbihbXFxcXHNcXFxcU10qPylcXFxcbiR7ZXNjYXBlUmVnRXhwKExFR0FDWV9NSU5ETUFQX1NUQVRFX0VORCl9YCwgXCJtXCIpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVBdHRyaWJ1dGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC8mL2csIFwiJmFtcDtcIikucmVwbGFjZSgvXCIvZywgXCImcXVvdDtcIik7XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlQXR0cmlidXRlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvJnF1b3Q7L2csICdcIicpLnJlcGxhY2UoLyZhbXA7L2csIFwiJlwiKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQVlPOzs7QUNaQSxJQUFNLCtCQUErQjtBQUNy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
