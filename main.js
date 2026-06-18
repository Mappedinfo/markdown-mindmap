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
  default: () => LocalObsidianMindmapPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/outline.ts
var MINDMAP_STATE_BEGIN = "<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE";
var MINDMAP_STATE_END = "END LOCAL-OBSIDIAN-MINDMAP-STATE -->";
function parseOutlineAtLine(markdown, cursorLine, options = {}) {
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
function replaceOutlineBlock(markdown, block, nodes, options = {}) {
  const indentUnit = options.indentUnit ?? 2;
  const normalized = normalizeNewlines(markdown);
  const hadFinalNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  const replacement = serializeOutline(nodes, indentUnit).split("\n");
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...replacement);
  const next = lines.join("\n");
  return hadFinalNewline && !next.endsWith("\n") ? `${next}
` : next;
}
function serializeOutline(nodes, indentUnit = 2) {
  const lines = [];
  const visit = (node, depth) => {
    lines.push(`${" ".repeat(depth * indentUnit)}- ${node.title}`);
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
  return normalizeNewlines(markdown).replace(mindmapStateBlockRegExp(), "").replace(/\n{3,}$/g, "\n\n");
}
function readMindmapState(markdown) {
  const match = mindmapStateBlockRegExp().exec(normalizeNewlines(markdown));
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
  const normalized = normalizeNewlines(markdown).trimEnd();
  const block = `${MINDMAP_STATE_BEGIN}
${JSON.stringify(state, null, 2)}
${MINDMAP_STATE_END}`;
  if (mindmapStateBlockRegExp().test(normalized)) {
    return `${normalized.replace(mindmapStateBlockRegExp(), block)}
`;
  }
  return `${normalized}

${block}
`;
}
function hashOutlineBlock(markdown) {
  let hash = 2166136261;
  for (const char of normalizeNewlines(markdown)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function parseOutlineBlockLines(blockLines, indentUnit) {
  const roots = [];
  const stack = [];
  let previousDepth = 0;
  for (let lineIndex = 0; lineIndex < blockLines.length; lineIndex += 1) {
    const parsed = parsePlainListItem(blockLines[lineIndex], indentUnit);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    if (lineIndex === 0 && parsed.depth !== 0) return { ok: false, reason: "The outline block must start at depth 0." };
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
function parsePlainListItem(line, indentUnit) {
  if (/^\s*\d+\.\s+/.test(line)) return { ok: false, reason: "Ordered lists are not supported in v1." };
  const match = line.match(/^(\s*)-\s?(.*)$/);
  if (!match) return { ok: false, reason: "Only plain unordered list items are supported." };
  const indent = match[1];
  if (indent.includes("	")) return { ok: false, reason: "Tab indentation is not supported; use spaces." };
  if (indent.length % indentUnit !== 0) return { ok: false, reason: `Indentation must use ${indentUnit} spaces.` };
  const title = match[2] ?? "";
  if (/^\[[ xX]\]\s+/.test(title)) return { ok: false, reason: "Task list items are not supported in v1." };
  return { ok: true, depth: indent.length / indentUnit, title };
}
function findListBlockStart(lines, cursorLine) {
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
function findListBlockEnd(lines, cursorLine) {
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
function mindmapStateBlockRegExp() {
  return new RegExp(`${escapeRegExp(MINDMAP_STATE_BEGIN)}\\n([\\s\\S]*?)\\n${escapeRegExp(MINDMAP_STATE_END)}`, "m");
}
var generatedIdCounter = 0;
function createGeneratedNodeId() {
  generatedIdCounter += 1;
  return `node-${Date.now().toString(36)}-${generatedIdCounter}`;
}
function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// src/main.ts
var VIEW_TYPE_MINDMAP = "markdown-mindmap-workbench";
var DEFAULT_SETTINGS = {
  indentUnit: 2,
  openInRightSidebar: true,
  persistCollapseState: true,
  followActiveOutline: true
};
var LocalObsidianMindmapPlugin = class extends import_obsidian.Plugin {
  settings = DEFAULT_SETTINGS;
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new LocalMindmapSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_MINDMAP, (leaf) => new MindmapWorkbenchView(leaf, this));
    this.addCommand({
      id: "open-current-outline-mindmap",
      name: "Open Mindmap for Current Outline",
      callback: () => this.openMindmapForCurrentOutline()
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
        if (!this.settings.followActiveOutline) return;
        this.refreshOpenMindmapViews();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        if (!this.settings.followActiveOutline) return;
        this.refreshOpenMindmapViews();
      })
    );
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }
  async loadSettings() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...await this.loadData()
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async openMindmapForCurrentOutline() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!leaf) {
      leaf = this.settings.openInRightSidebar ? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true) : this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MindmapWorkbenchView) {
      await leaf.view.loadFromActiveMarkdown();
    }
  }
  getActiveMarkdownView() {
    return this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
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
  refreshOpenMindmapViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) {
        void leaf.view.loadFromActiveMarkdown({ preserveSelection: true });
      }
    }
  }
  withMindmapView(callback) {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!(leaf?.view instanceof MindmapWorkbenchView)) {
      new import_obsidian.Notice("Open the Mindmap Workbench first.");
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
  refreshTimer = null;
  getViewType() {
    return VIEW_TYPE_MINDMAP;
  }
  getDisplayText() {
    return "Mindmap Workbench";
  }
  getIcon() {
    return "git-fork";
  }
  async onOpen() {
    this.render();
  }
  async onClose() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  scheduleRefresh() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.loadFromActiveMarkdown({ preserveSelection: true });
    }, 120);
  }
  async loadFromActiveMarkdown(options = {}) {
    const view = this.plugin.getActiveMarkdownView();
    if (!view?.file) {
      this.sourceFile = null;
      this.block = null;
      this.nodes = [];
      this.render("Open a Markdown file and place the cursor on a plain list item.");
      return;
    }
    const cursor = view.editor.getCursor();
    const markdown = view.getViewData();
    const parsed = parseOutlineAtLine(markdown, cursor.line, { indentUnit: this.plugin.settings.indentUnit });
    this.sourceFile = view.file;
    if (!parsed.ok) {
      this.block = null;
      this.nodes = [];
      this.render(parsed.reason);
      return;
    }
    const previousSelection = new Set(this.selectedIds);
    this.block = parsed.block;
    this.nodes = parsed.block.nodes;
    const state = readMindmapState(markdown);
    this.collapsedIds = new Set(state.blocks[parsed.block.blockHash]?.collapsedIds ?? []);
    this.selectedIds = options.preserveSelection ? new Set([...previousSelection].filter((id) => findNode(this.nodes, id))) : new Set([this.nodes[0]?.id].filter((id) => Boolean(id)));
    this.render();
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
  async promptInduceParent() {
    if (this.selectedIds.size < 2) {
      new import_obsidian.Notice("Select at least two adjacent sibling nodes.");
      return;
    }
    new ParentTitleModal(this.app, "\u5F52\u7EB3", (title) => {
      this.applyOperation(induceParentFromSelected(this.nodes, [...this.selectedIds], title || "\u5F52\u7EB3"));
    }).open();
  }
  render(status) {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("local-mindmap-workbench");
    const toolbar = contentEl.createDiv({ cls: "local-mindmap-toolbar" });
    toolbar.createDiv({
      cls: "local-mindmap-title",
      text: this.sourceFile ? this.sourceFile.basename : "Mindmap Workbench"
    });
    toolbar.createDiv({
      cls: "local-mindmap-subtitle",
      text: this.block ? `${this.sourceFile?.path ?? ""} \xB7 lines ${this.block.startLine + 1}-${this.block.endLine + 1}` : "Place the cursor on a plain Markdown list item."
    });
    this.addToolbarButton(toolbar, "Refresh", () => this.loadFromActiveMarkdown());
    this.addToolbarButton(toolbar, "Induce parent", () => this.promptInduceParent(), this.selectedIds.size >= 2);
    this.addToolbarButton(toolbar, "Focus", () => this.focusSelectedNode(), this.selectedIds.size > 0);
    this.addToolbarButton(toolbar, "-", () => this.setScale(this.scale - 0.1));
    this.addToolbarButton(toolbar, "+", () => this.setScale(this.scale + 0.1));
    if (status) {
      contentEl.createDiv({ cls: "local-mindmap-empty", text: status });
      return;
    }
    if (!this.block || this.nodes.length === 0) {
      contentEl.createDiv({ cls: "local-mindmap-empty", text: "No outline block loaded." });
      return;
    }
    const stage = contentEl.createDiv({ cls: "local-mindmap-stage" });
    const surface = stage.createDiv({ cls: "local-mindmap-surface" });
    surface.style.transform = `scale(${this.scale})`;
    surface.style.transformOrigin = "top left";
    const layouts = layoutNodes(this.nodes, this.collapsedIds);
    const maxX = Math.max(...layouts.map((entry) => entry.x), 0) + 320;
    const maxY = Math.max(...layouts.map((entry) => entry.y), 0) + 120;
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
      card.addClass("is-selected");
      select.checked = true;
    });
    input.addEventListener("blur", () => this.commitTitle(node.id, input.value));
    input.addEventListener("keydown", (event) => this.handleNodeKeydown(event, node.id, input));
  }
  handleNodeKeydown(event, nodeId, input) {
    if (event.key === "Enter") {
      event.preventDefault();
      this.commitTitle(nodeId, input.value, { skipRender: true });
      this.applyOperation(insertSiblingAfter(this.nodes, nodeId, ""));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      this.commitTitle(nodeId, input.value, { skipRender: true });
      this.applyOperation(event.shiftKey ? outdentNode(this.nodes, nodeId) : indentNode(this.nodes, nodeId));
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && input.value.trim() === "") {
      event.preventDefault();
      this.applyOperation(deleteEmptyNode(this.nodes, nodeId));
    }
  }
  commitTitle(nodeId, title, options = {}) {
    const node = findNode(this.nodes, nodeId);
    if (!node || node.title === title) return;
    this.applyOperation(updateNodeTitle(this.nodes, nodeId, title), options);
  }
  selectNode(nodeId, additive) {
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
    } else {
      this.selectedIds.add(nodeId);
    }
    this.render();
  }
  toggleCollapse(nodeId) {
    if (this.collapsedIds.has(nodeId)) this.collapsedIds.delete(nodeId);
    else this.collapsedIds.add(nodeId);
    this.render();
    void this.persistCollapseState();
  }
  setScale(next) {
    this.scale = Math.min(1.8, Math.max(0.5, Number(next.toFixed(2))));
    this.render();
  }
  applyOperation(result, options = {}) {
    if (!result.ok) {
      new import_obsidian.Notice(result.reason);
      return;
    }
    this.nodes = result.nodes;
    this.selectedIds = new Set(result.focusId ? [result.focusId] : [...this.selectedIds].filter((id) => findNode(this.nodes, id)));
    const written = this.writeNodesToMarkdown();
    if (!written) return;
    if (!options.skipRender) this.render();
    window.setTimeout(() => this.focusSelectedNode(), 0);
  }
  writeNodesToMarkdown() {
    if (!this.sourceFile || !this.block) {
      new import_obsidian.Notice("No source outline block loaded.");
      return false;
    }
    const markdownView = this.plugin.findMarkdownViewForFile(this.sourceFile);
    const nextBlock = serializeOutline(this.nodes, this.plugin.settings.indentUnit);
    if (markdownView) {
      replaceEditorBlock(markdownView.editor, this.block, nextBlock);
    } else {
      void this.plugin.app.vault.cachedRead(this.sourceFile).then((markdown) => {
        const next = replaceOutlineBlock(markdown, this.block, this.nodes, {
          indentUnit: this.plugin.settings.indentUnit
        });
        return this.plugin.app.vault.modify(this.sourceFile, next);
      });
    }
    this.block = {
      ...this.block,
      endLine: this.block.startLine + nextBlock.split("\n").length - 1,
      markdown: nextBlock,
      blockHash: hashOutlineBlock(nextBlock)
    };
    return true;
  }
  async persistCollapseState() {
    if (!this.sourceFile || !this.block || !this.plugin.settings.persistCollapseState) return;
    const markdownView = this.plugin.findMarkdownViewForFile(this.sourceFile);
    const markdown = markdownView?.getViewData() ?? await this.plugin.app.vault.cachedRead(this.sourceFile);
    const state = readMindmapState(markdown);
    state.blocks[this.block.blockHash] = {
      collapsedIds: [...this.collapsedIds],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const next = upsertMindmapStateBlock(markdown, state);
    if (next === markdown) return;
    await this.plugin.app.vault.modify(this.sourceFile, next);
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
var LocalMindmapSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Indent unit").setDesc("Number of spaces used for one outline level.").addText(
      (text) => text.setValue(String(this.plugin.settings.indentUnit)).onChange(async (value) => {
        const parsed = Number(value);
        this.plugin.settings.indentUnit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.indentUnit;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Open in right sidebar").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.openInRightSidebar).onChange(async (value) => {
        this.plugin.settings.openInRightSidebar = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Persist collapse state").setDesc("Save folded nodes in a hidden managed block at the end of the Markdown file.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.persistCollapseState).onChange(async (value) => {
        this.plugin.settings.persistCollapseState = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Follow active outline").setDesc("Refresh the workbench when the active Markdown cursor changes.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.followActiveOutline).onChange(async (value) => {
        this.plugin.settings.followActiveOutline = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
function replaceEditorBlock(editor, block, replacement) {
  const hasFollowingLine = block.endLine + 1 < editor.lineCount();
  const from = { line: block.startLine, ch: 0 };
  const to = hasFollowingLine ? { line: block.endLine + 1, ch: 0 } : { line: block.endLine, ch: editor.getLine(block.endLine).length };
  editor.replaceRange(hasFollowingLine ? `${replacement}
` : replacement, from, to);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL291dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBJdGVtVmlldyxcbiAgTWFya2Rvd25WaWV3LFxuICBNb2RhbCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmLFxuICBub3JtYWxpemVQYXRoXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgZGVsZXRlRW1wdHlOb2RlLFxuICBoYXNoT3V0bGluZUJsb2NrLFxuICBpbmRlbnROb2RlLFxuICBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQsXG4gIGluc2VydFNpYmxpbmdBZnRlcixcbiAgb3V0ZGVudE5vZGUsXG4gIHBhcnNlT3V0bGluZUF0TGluZSxcbiAgcmVhZE1pbmRtYXBTdGF0ZSxcbiAgcmVwbGFjZU91dGxpbmVCbG9jayxcbiAgc2VyaWFsaXplT3V0bGluZSxcbiAgdXBkYXRlTm9kZVRpdGxlLFxuICB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayxcbiAgdHlwZSBNaW5kbWFwU2V0dGluZ3NEYXRhLFxuICB0eXBlIE91dGxpbmVCbG9jayxcbiAgdHlwZSBPdXRsaW5lTm9kZSxcbiAgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0XG59IGZyb20gXCIuL291dGxpbmUudHNcIjtcblxuY29uc3QgVklFV19UWVBFX01JTkRNQVAgPSBcIm1hcmtkb3duLW1pbmRtYXAtd29ya2JlbmNoXCI7XG5cbmludGVyZmFjZSBMb2NhbE1pbmRtYXBTZXR0aW5ncyB7XG4gIGluZGVudFVuaXQ6IG51bWJlcjtcbiAgb3BlbkluUmlnaHRTaWRlYmFyOiBib29sZWFuO1xuICBwZXJzaXN0Q29sbGFwc2VTdGF0ZTogYm9vbGVhbjtcbiAgZm9sbG93QWN0aXZlT3V0bGluZTogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSB7XG4gIGluZGVudFVuaXQ6IDIsXG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogdHJ1ZSxcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IHRydWUsXG4gIGZvbGxvd0FjdGl2ZU91dGxpbmU6IHRydWVcbn07XG5cbmludGVyZmFjZSBOb2RlTGF5b3V0IHtcbiAgbm9kZTogT3V0bGluZU5vZGU7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTG9jYWxPYnNpZGlhbk1pbmRtYXBQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuXG4gIGFzeW5jIG9ubG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTG9jYWxNaW5kbWFwU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJWaWV3KFZJRVdfVFlQRV9NSU5ETUFQLCAobGVhZikgPT4gbmV3IE1pbmRtYXBXb3JrYmVuY2hWaWV3KGxlYWYsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWN1cnJlbnQtb3V0bGluZS1taW5kbWFwXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gTWluZG1hcCBmb3IgQ3VycmVudCBPdXRsaW5lXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcEZvckN1cnJlbnRPdXRsaW5lKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJpbmR1Y2UtcGFyZW50LWZyb20tc2VsZWN0ZWQtbm9kZXNcIixcbiAgICAgIG5hbWU6IFwiSW5kdWNlIFBhcmVudCBmcm9tIFNlbGVjdGVkIE5vZGVzXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy53aXRoTWluZG1hcFZpZXcoKHZpZXcpID0+IHZpZXcucHJvbXB0SW5kdWNlUGFyZW50KCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZm9jdXMtbWluZG1hcC1ub2RlXCIsXG4gICAgICBuYW1lOiBcIkZvY3VzIE1pbmRtYXAgTm9kZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMud2l0aE1pbmRtYXBWaWV3KCh2aWV3KSA9PiB2aWV3LmZvY3VzU2VsZWN0ZWROb2RlKCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJhY3RpdmUtbGVhZi1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZm9sbG93QWN0aXZlT3V0bGluZSkgcmV0dXJuO1xuICAgICAgICB0aGlzLnJlZnJlc2hPcGVuTWluZG1hcFZpZXdzKCk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItY2hhbmdlXCIsICgpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmZvbGxvd0FjdGl2ZU91dGxpbmUpIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWZyZXNoT3Blbk1pbmRtYXBWaWV3cygpO1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgb251bmxvYWQoKTogdm9pZCB7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLmRldGFjaExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUCk7XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zZXR0aW5ncyA9IHtcbiAgICAgIC4uLkRFRkFVTFRfU0VUVElOR1MsXG4gICAgICAuLi4oYXdhaXQgdGhpcy5sb2FkRGF0YSgpKVxuICAgIH07XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5NaW5kbWFwRm9yQ3VycmVudE91dGxpbmUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IGxlYWYgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKVswXTtcbiAgICBpZiAoIWxlYWYpIHtcbiAgICAgIGxlYWYgPSB0aGlzLnNldHRpbmdzLm9wZW5JblJpZ2h0U2lkZWJhclxuICAgICAgICA/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRSaWdodExlYWYoZmFsc2UpID8/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKHRydWUpXG4gICAgICAgIDogdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYodHJ1ZSk7XG4gICAgICBhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7IHR5cGU6IFZJRVdfVFlQRV9NSU5ETUFQLCBhY3RpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykge1xuICAgICAgYXdhaXQgbGVhZi52aWV3LmxvYWRGcm9tQWN0aXZlTWFya2Rvd24oKTtcbiAgICB9XG4gIH1cblxuICBnZXRBY3RpdmVNYXJrZG93blZpZXcoKTogTWFya2Rvd25WaWV3IHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gIH1cblxuICBmaW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlOiBURmlsZSk6IE1hcmtkb3duVmlldyB8IG51bGwge1xuICAgIGxldCBmb3VuZDogTWFya2Rvd25WaWV3IHwgbnVsbCA9IG51bGw7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLml0ZXJhdGVBbGxMZWF2ZXMoKGxlYWYpID0+IHtcbiAgICAgIGlmIChmb3VuZCkgcmV0dXJuO1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldyAmJiBsZWFmLnZpZXcuZmlsZT8ucGF0aCA9PT0gZmlsZS5wYXRoKSB7XG4gICAgICAgIGZvdW5kID0gbGVhZi52aWV3O1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBmb3VuZDtcbiAgfVxuXG4gIHByaXZhdGUgcmVmcmVzaE9wZW5NaW5kbWFwVmlld3MoKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApKSB7XG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgICAgdm9pZCBsZWFmLnZpZXcubG9hZEZyb21BY3RpdmVNYXJrZG93bih7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgd2l0aE1pbmRtYXBWaWV3KGNhbGxiYWNrOiAodmlldzogTWluZG1hcFdvcmtiZW5jaFZpZXcpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgY29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghKGxlYWY/LnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcGVuIHRoZSBNaW5kbWFwIFdvcmtiZW5jaCBmaXJzdC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZvaWQgY2FsbGJhY2sobGVhZi52aWV3KTtcbiAgfVxufVxuXG5jbGFzcyBNaW5kbWFwV29ya2JlbmNoVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcbiAgcHJpdmF0ZSBzb3VyY2VGaWxlOiBURmlsZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGJsb2NrOiBPdXRsaW5lQmxvY2sgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBub2RlczogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBwcml2YXRlIHNlbGVjdGVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgY29sbGFwc2VkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgc2NhbGUgPSAxO1xuICBwcml2YXRlIHJlZnJlc2hUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IExvY2FsT2JzaWRpYW5NaW5kbWFwUGx1Z2luKSB7XG4gICAgc3VwZXIobGVhZik7XG4gIH1cblxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBWSUVXX1RZUEVfTUlORE1BUDtcbiAgfVxuXG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFwiTWluZG1hcCBXb3JrYmVuY2hcIjtcbiAgfVxuXG4gIGdldEljb24oKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJnaXQtZm9ya1wiO1xuICB9XG5cbiAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBhc3luYyBvbkNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZWZyZXNoKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgdGhpcy5yZWZyZXNoVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICB2b2lkIHRoaXMubG9hZEZyb21BY3RpdmVNYXJrZG93bih7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlIH0pO1xuICAgIH0sIDEyMCk7XG4gIH1cblxuICBhc3luYyBsb2FkRnJvbUFjdGl2ZU1hcmtkb3duKG9wdGlvbnM6IHsgcHJlc2VydmVTZWxlY3Rpb24/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBpZiAoIXZpZXc/LmZpbGUpIHtcbiAgICAgIHRoaXMuc291cmNlRmlsZSA9IG51bGw7XG4gICAgICB0aGlzLmJsb2NrID0gbnVsbDtcbiAgICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgICAgIHRoaXMucmVuZGVyKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgYW5kIHBsYWNlIHRoZSBjdXJzb3Igb24gYSBwbGFpbiBsaXN0IGl0ZW0uXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuICAgIGNvbnN0IG1hcmtkb3duID0gdmlldy5nZXRWaWV3RGF0YSgpO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlT3V0bGluZUF0TGluZShtYXJrZG93biwgY3Vyc29yLmxpbmUsIHsgaW5kZW50VW5pdDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5kZW50VW5pdCB9KTtcbiAgICB0aGlzLnNvdXJjZUZpbGUgPSB2aWV3LmZpbGU7XG4gICAgaWYgKCFwYXJzZWQub2spIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IFtdO1xuICAgICAgdGhpcy5yZW5kZXIocGFyc2VkLnJlYXNvbik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSBuZXcgU2V0KHRoaXMuc2VsZWN0ZWRJZHMpO1xuICAgIHRoaXMuYmxvY2sgPSBwYXJzZWQuYmxvY2s7XG4gICAgdGhpcy5ub2RlcyA9IHBhcnNlZC5ibG9jay5ub2RlcztcbiAgICBjb25zdCBzdGF0ZSA9IHJlYWRNaW5kbWFwU3RhdGUobWFya2Rvd24pO1xuICAgIHRoaXMuY29sbGFwc2VkSWRzID0gbmV3IFNldChzdGF0ZS5ibG9ja3NbcGFyc2VkLmJsb2NrLmJsb2NrSGFzaF0/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgdGhpcy5zZWxlY3RlZElkcyA9IG9wdGlvbnMucHJlc2VydmVTZWxlY3Rpb25cbiAgICAgID8gbmV3IFNldChbLi4ucHJldmlvdXNTZWxlY3Rpb25dLmZpbHRlcigoaWQpID0+IGZpbmROb2RlKHRoaXMubm9kZXMsIGlkKSkpXG4gICAgICA6IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIGZvY3VzU2VsZWN0ZWROb2RlKCk6IHZvaWQge1xuICAgIGNvbnN0IGlkID0gWy4uLnRoaXMuc2VsZWN0ZWRJZHNdWzBdO1xuICAgIGlmICghaWQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBtaW5kbWFwIG5vZGUgc2VsZWN0ZWQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbnB1dCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oYGlucHV0W2RhdGEtbm9kZS1pZD1cIiR7Y3NzRXNjYXBlKGlkKX1cIl1gKTtcbiAgICBpbnB1dD8uZm9jdXMoKTtcbiAgICBpbnB1dD8uc2VsZWN0KCk7XG4gIH1cblxuICBhc3luYyBwcm9tcHRJbmR1Y2VQYXJlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA8IDIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJTZWxlY3QgYXQgbGVhc3QgdHdvIGFkamFjZW50IHNpYmxpbmcgbm9kZXMuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgUGFyZW50VGl0bGVNb2RhbCh0aGlzLmFwcCwgXCJcdTVGNTJcdTdFQjNcIiwgKHRpdGxlKSA9PiB7XG4gICAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKGluZHVjZVBhcmVudEZyb21TZWxlY3RlZCh0aGlzLm5vZGVzLCBbLi4udGhpcy5zZWxlY3RlZElkc10sIHRpdGxlIHx8IFwiXHU1RjUyXHU3RUIzXCIpKTtcbiAgICB9KS5vcGVuKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlcihzdGF0dXM/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJsb2NhbC1taW5kbWFwLXdvcmtiZW5jaFwiKTtcblxuICAgIGNvbnN0IHRvb2xiYXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtdG9vbGJhclwiIH0pO1xuICAgIHRvb2xiYXIuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJsb2NhbC1taW5kbWFwLXRpdGxlXCIsXG4gICAgICB0ZXh0OiB0aGlzLnNvdXJjZUZpbGUgPyB0aGlzLnNvdXJjZUZpbGUuYmFzZW5hbWUgOiBcIk1pbmRtYXAgV29ya2JlbmNoXCJcbiAgICB9KTtcbiAgICB0b29sYmFyLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwibG9jYWwtbWluZG1hcC1zdWJ0aXRsZVwiLFxuICAgICAgdGV4dDogdGhpcy5ibG9ja1xuICAgICAgICA/IGAke3RoaXMuc291cmNlRmlsZT8ucGF0aCA/PyBcIlwifSBcdTAwQjcgbGluZXMgJHt0aGlzLmJsb2NrLnN0YXJ0TGluZSArIDF9LSR7dGhpcy5ibG9jay5lbmRMaW5lICsgMX1gXG4gICAgICAgIDogXCJQbGFjZSB0aGUgY3Vyc29yIG9uIGEgcGxhaW4gTWFya2Rvd24gbGlzdCBpdGVtLlwiXG4gICAgfSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiUmVmcmVzaFwiLCAoKSA9PiB0aGlzLmxvYWRGcm9tQWN0aXZlTWFya2Rvd24oKSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiSW5kdWNlIHBhcmVudFwiLCAoKSA9PiB0aGlzLnByb21wdEluZHVjZVBhcmVudCgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPj0gMik7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiRm9jdXNcIiwgKCkgPT4gdGhpcy5mb2N1c1NlbGVjdGVkTm9kZSgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPiAwKTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCItXCIsICgpID0+IHRoaXMuc2V0U2NhbGUodGhpcy5zY2FsZSAtIDAuMSkpO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIitcIiwgKCkgPT4gdGhpcy5zZXRTY2FsZSh0aGlzLnNjYWxlICsgMC4xKSk7XG5cbiAgICBpZiAoc3RhdHVzKSB7XG4gICAgICBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW1wdHlcIiwgdGV4dDogc3RhdHVzIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuYmxvY2sgfHwgdGhpcy5ub2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbXB0eVwiLCB0ZXh0OiBcIk5vIG91dGxpbmUgYmxvY2sgbG9hZGVkLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWdlID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN0YWdlXCIgfSk7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN0YWdlLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN1cmZhY2VcIiB9KTtcbiAgICBzdXJmYWNlLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZSgke3RoaXMuc2NhbGV9KWA7XG4gICAgc3VyZmFjZS5zdHlsZS50cmFuc2Zvcm1PcmlnaW4gPSBcInRvcCBsZWZ0XCI7XG4gICAgY29uc3QgbGF5b3V0cyA9IGxheW91dE5vZGVzKHRoaXMubm9kZXMsIHRoaXMuY29sbGFwc2VkSWRzKTtcbiAgICBjb25zdCBtYXhYID0gTWF0aC5tYXgoLi4ubGF5b3V0cy5tYXAoKGVudHJ5KSA9PiBlbnRyeS54KSwgMCkgKyAzMjA7XG4gICAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmxheW91dHMubWFwKChlbnRyeSkgPT4gZW50cnkueSksIDApICsgMTIwO1xuICAgIHN1cmZhY2Uuc3R5bGUud2lkdGggPSBgJHttYXhYfXB4YDtcbiAgICBzdXJmYWNlLnN0eWxlLmhlaWdodCA9IGAke21heFl9cHhgO1xuXG4gICAgY29uc3Qgc3ZnID0gc3VyZmFjZS5jcmVhdGVTdmcoXCJzdmdcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1saW5rc1wiIH0pO1xuICAgIHN2Zy5zZXRBdHRyKFwid2lkdGhcIiwgU3RyaW5nKG1heFgpKTtcbiAgICBzdmcuc2V0QXR0cihcImhlaWdodFwiLCBTdHJpbmcobWF4WSkpO1xuICAgIGZvciAoY29uc3QgbGF5b3V0IG9mIGxheW91dHMpIHtcbiAgICAgIGlmICghbGF5b3V0LnBhcmVudElkKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGxheW91dHMuZmluZCgoZW50cnkpID0+IGVudHJ5Lm5vZGUuaWQgPT09IGxheW91dC5wYXJlbnRJZCk7XG4gICAgICBpZiAoIXBhcmVudCkgY29udGludWU7XG4gICAgICBjb25zdCBwYXRoID0gc3ZnLmNyZWF0ZVN2ZyhcInBhdGhcIik7XG4gICAgICBjb25zdCBzdGFydFggPSBwYXJlbnQueCArIDIyMDtcbiAgICAgIGNvbnN0IHN0YXJ0WSA9IHBhcmVudC55ICsgMjg7XG4gICAgICBjb25zdCBlbmRYID0gbGF5b3V0Lng7XG4gICAgICBjb25zdCBlbmRZID0gbGF5b3V0LnkgKyAyODtcbiAgICAgIGNvbnN0IG1pZFggPSBzdGFydFggKyBNYXRoLm1heCg0MCwgKGVuZFggLSBzdGFydFgpIC8gMik7XG4gICAgICBwYXRoLnNldEF0dHIoXCJkXCIsIGBNICR7c3RhcnRYfSAke3N0YXJ0WX0gQyAke21pZFh9ICR7c3RhcnRZfSwgJHttaWRYfSAke2VuZFl9LCAke2VuZFh9ICR7ZW5kWX1gKTtcbiAgICAgIHBhdGguc2V0QXR0cihcImNsYXNzXCIsIFwibG9jYWwtbWluZG1hcC1saW5rXCIpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgbGF5b3V0IG9mIGxheW91dHMpIHtcbiAgICAgIHRoaXMucmVuZGVyTm9kZShzdXJmYWNlLCBsYXlvdXQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyTm9kZShzdXJmYWNlOiBIVE1MRWxlbWVudCwgbGF5b3V0OiBOb2RlTGF5b3V0KTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IGxheW91dC5ub2RlO1xuICAgIGNvbnN0IHNlbGVjdGVkID0gdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZS5pZCk7XG4gICAgY29uc3QgY2FyZCA9IHN1cmZhY2UuY3JlYXRlRGl2KHsgY2xzOiBzZWxlY3RlZCA/IFwibG9jYWwtbWluZG1hcC1ub2RlIGlzLXNlbGVjdGVkXCIgOiBcImxvY2FsLW1pbmRtYXAtbm9kZVwiIH0pO1xuICAgIGNhcmQuc3R5bGUubGVmdCA9IGAke2xheW91dC54fXB4YDtcbiAgICBjYXJkLnN0eWxlLnRvcCA9IGAke2xheW91dC55fXB4YDtcbiAgICBjYXJkLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGlmICgoZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgKGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkudGFnTmFtZSA9PT0gXCJCVVRUT05cIikgcmV0dXJuO1xuICAgICAgdGhpcy5zZWxlY3ROb2RlKG5vZGUuaWQsIGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuY3RybEtleSB8fCBldmVudC5zaGlmdEtleSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCByb3cgPSBjYXJkLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLW5vZGUtcm93XCIgfSk7XG4gICAgY29uc3Qgc2VsZWN0ID0gcm93LmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWxlY3RcIiB9KTtcbiAgICBzZWxlY3QudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBzZWxlY3QuY2hlY2tlZCA9IHNlbGVjdGVkO1xuICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHRoaXMuc2VsZWN0Tm9kZShub2RlLmlkLCB0cnVlKSk7XG5cbiAgICBjb25zdCBjb2xsYXBzZSA9IHJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLWNvbGxhcHNlXCIsIHRleHQ6IG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCA/ICh0aGlzLmNvbGxhcHNlZElkcy5oYXMobm9kZS5pZCkgPyBcIitcIiA6IFwiLVwiKSA6IFwiXCIgfSk7XG4gICAgY29sbGFwc2UudHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgY29sbGFwc2UuZGlzYWJsZWQgPSBub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcbiAgICBjb2xsYXBzZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNlKG5vZGUuaWQpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgaW5wdXQgPSByb3cuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLW5vZGUtdGl0bGVcIiB9KTtcbiAgICBpbnB1dC5kYXRhc2V0Lm5vZGVJZCA9IG5vZGUuaWQ7XG4gICAgaW5wdXQudmFsdWUgPSBub2RlLnRpdGxlO1xuICAgIGlucHV0LnBsYWNlaG9sZGVyID0gXCJVbnRpdGxlZFwiO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c1wiLCAoKSA9PiB7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChbbm9kZS5pZF0pO1xuICAgICAgY2FyZC5hZGRDbGFzcyhcImlzLXNlbGVjdGVkXCIpO1xuICAgICAgc2VsZWN0LmNoZWNrZWQgPSB0cnVlO1xuICAgIH0pO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJibHVyXCIsICgpID0+IHRoaXMuY29tbWl0VGl0bGUobm9kZS5pZCwgaW5wdXQudmFsdWUpKTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZXZlbnQpID0+IHRoaXMuaGFuZGxlTm9kZUtleWRvd24oZXZlbnQsIG5vZGUuaWQsIGlucHV0KSk7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZU5vZGVLZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50LCBub2RlSWQ6IHN0cmluZywgaW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQpOiB2b2lkIHtcbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIkVudGVyXCIpIHtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB0aGlzLmNvbW1pdFRpdGxlKG5vZGVJZCwgaW5wdXQudmFsdWUsIHsgc2tpcFJlbmRlcjogdHJ1ZSB9KTtcbiAgICAgIHRoaXMuYXBwbHlPcGVyYXRpb24oaW5zZXJ0U2libGluZ0FmdGVyKHRoaXMubm9kZXMsIG5vZGVJZCwgXCJcIikpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoZXZlbnQua2V5ID09PSBcIlRhYlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5jb21taXRUaXRsZShub2RlSWQsIGlucHV0LnZhbHVlLCB7IHNraXBSZW5kZXI6IHRydWUgfSk7XG4gICAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKGV2ZW50LnNoaWZ0S2V5ID8gb3V0ZGVudE5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKSA6IGluZGVudE5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICgoZXZlbnQua2V5ID09PSBcIkJhY2tzcGFjZVwiIHx8IGV2ZW50LmtleSA9PT0gXCJEZWxldGVcIikgJiYgaW5wdXQudmFsdWUudHJpbSgpID09PSBcIlwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5hcHBseU9wZXJhdGlvbihkZWxldGVFbXB0eU5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjb21taXRUaXRsZShub2RlSWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgb3B0aW9uczogeyBza2lwUmVuZGVyPzogYm9vbGVhbiB9ID0ge30pOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gZmluZE5vZGUodGhpcy5ub2Rlcywgbm9kZUlkKTtcbiAgICBpZiAoIW5vZGUgfHwgbm9kZS50aXRsZSA9PT0gdGl0bGUpIHJldHVybjtcbiAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKHVwZGF0ZU5vZGVUaXRsZSh0aGlzLm5vZGVzLCBub2RlSWQsIHRpdGxlKSwgb3B0aW9ucyk7XG4gIH1cblxuICBwcml2YXRlIHNlbGVjdE5vZGUobm9kZUlkOiBzdHJpbmcsIGFkZGl0aXZlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCFhZGRpdGl2ZSkgdGhpcy5zZWxlY3RlZElkcy5jbGVhcigpO1xuICAgIGlmIChhZGRpdGl2ZSAmJiB0aGlzLnNlbGVjdGVkSWRzLmhhcyhub2RlSWQpKSB7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzLmRlbGV0ZShub2RlSWQpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNlbGVjdGVkSWRzLmFkZChub2RlSWQpO1xuICAgIH1cbiAgICB0aGlzLnJlbmRlcigpO1xuICB9XG5cbiAgcHJpdmF0ZSB0b2dnbGVDb2xsYXBzZShub2RlSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICh0aGlzLmNvbGxhcHNlZElkcy5oYXMobm9kZUlkKSkgdGhpcy5jb2xsYXBzZWRJZHMuZGVsZXRlKG5vZGVJZCk7XG4gICAgZWxzZSB0aGlzLmNvbGxhcHNlZElkcy5hZGQobm9kZUlkKTtcbiAgICB0aGlzLnJlbmRlcigpO1xuICAgIHZvaWQgdGhpcy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXRTY2FsZShuZXh0OiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLnNjYWxlID0gTWF0aC5taW4oMS44LCBNYXRoLm1heCgwLjUsIE51bWJlcihuZXh0LnRvRml4ZWQoMikpKSk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlPcGVyYXRpb24ocmVzdWx0OiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0LCBvcHRpb25zOiB7IHNraXBSZW5kZXI/OiBib29sZWFuIH0gPSB7fSk6IHZvaWQge1xuICAgIGlmICghcmVzdWx0Lm9rKSB7XG4gICAgICBuZXcgTm90aWNlKHJlc3VsdC5yZWFzb24pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLm5vZGVzID0gcmVzdWx0Lm5vZGVzO1xuICAgIHRoaXMuc2VsZWN0ZWRJZHMgPSBuZXcgU2V0KHJlc3VsdC5mb2N1c0lkID8gW3Jlc3VsdC5mb2N1c0lkXSA6IFsuLi50aGlzLnNlbGVjdGVkSWRzXS5maWx0ZXIoKGlkKSA9PiBmaW5kTm9kZSh0aGlzLm5vZGVzLCBpZCkpKTtcbiAgICBjb25zdCB3cml0dGVuID0gdGhpcy53cml0ZU5vZGVzVG9NYXJrZG93bigpO1xuICAgIGlmICghd3JpdHRlbikgcmV0dXJuO1xuICAgIGlmICghb3B0aW9ucy5za2lwUmVuZGVyKSB0aGlzLnJlbmRlcigpO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHRoaXMuZm9jdXNTZWxlY3RlZE5vZGUoKSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHdyaXRlTm9kZXNUb01hcmtkb3duKCk6IGJvb2xlYW4ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlIHx8ICF0aGlzLmJsb2NrKSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gc291cmNlIG91dGxpbmUgYmxvY2sgbG9hZGVkLlwiKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgbWFya2Rvd25WaWV3ID0gdGhpcy5wbHVnaW4uZmluZE1hcmtkb3duVmlld0ZvckZpbGUodGhpcy5zb3VyY2VGaWxlKTtcbiAgICBjb25zdCBuZXh0QmxvY2sgPSBzZXJpYWxpemVPdXRsaW5lKHRoaXMubm9kZXMsIHRoaXMucGx1Z2luLnNldHRpbmdzLmluZGVudFVuaXQpO1xuICAgIGlmIChtYXJrZG93blZpZXcpIHtcbiAgICAgIHJlcGxhY2VFZGl0b3JCbG9jayhtYXJrZG93blZpZXcuZWRpdG9yLCB0aGlzLmJsb2NrLCBuZXh0QmxvY2spO1xuICAgIH0gZWxzZSB7XG4gICAgICB2b2lkIHRoaXMucGx1Z2luLmFwcC52YXVsdC5jYWNoZWRSZWFkKHRoaXMuc291cmNlRmlsZSkudGhlbigobWFya2Rvd24pID0+IHtcbiAgICAgICAgY29uc3QgbmV4dCA9IHJlcGxhY2VPdXRsaW5lQmxvY2sobWFya2Rvd24sIHRoaXMuYmxvY2shLCB0aGlzLm5vZGVzLCB7XG4gICAgICAgICAgaW5kZW50VW5pdDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5kZW50VW5pdFxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMucGx1Z2luLmFwcC52YXVsdC5tb2RpZnkodGhpcy5zb3VyY2VGaWxlISwgbmV4dCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgdGhpcy5ibG9jayA9IHtcbiAgICAgIC4uLnRoaXMuYmxvY2ssXG4gICAgICBlbmRMaW5lOiB0aGlzLmJsb2NrLnN0YXJ0TGluZSArIG5leHRCbG9jay5zcGxpdChcIlxcblwiKS5sZW5ndGggLSAxLFxuICAgICAgbWFya2Rvd246IG5leHRCbG9jayxcbiAgICAgIGJsb2NrSGFzaDogaGFzaE91dGxpbmVCbG9jayhuZXh0QmxvY2spXG4gICAgfTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcGVyc2lzdENvbGxhcHNlU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnNvdXJjZUZpbGUgfHwgIXRoaXMuYmxvY2sgfHwgIXRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlKSByZXR1cm47XG4gICAgY29uc3QgbWFya2Rvd25WaWV3ID0gdGhpcy5wbHVnaW4uZmluZE1hcmtkb3duVmlld0ZvckZpbGUodGhpcy5zb3VyY2VGaWxlKTtcbiAgICBjb25zdCBtYXJrZG93biA9IG1hcmtkb3duVmlldz8uZ2V0Vmlld0RhdGEoKSA/PyAoYXdhaXQgdGhpcy5wbHVnaW4uYXBwLnZhdWx0LmNhY2hlZFJlYWQodGhpcy5zb3VyY2VGaWxlKSk7XG4gICAgY29uc3Qgc3RhdGUgPSByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duKTtcbiAgICBzdGF0ZS5ibG9ja3NbdGhpcy5ibG9jay5ibG9ja0hhc2hdID0ge1xuICAgICAgY29sbGFwc2VkSWRzOiBbLi4udGhpcy5jb2xsYXBzZWRJZHNdLFxuICAgICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKClcbiAgICB9O1xuICAgIGNvbnN0IG5leHQgPSB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93biwgc3RhdGUpO1xuICAgIGlmIChuZXh0ID09PSBtYXJrZG93bikgcmV0dXJuO1xuICAgIGF3YWl0IHRoaXMucGx1Z2luLmFwcC52YXVsdC5tb2RpZnkodGhpcy5zb3VyY2VGaWxlLCBuZXh0KTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkVG9vbGJhckJ1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcsIG9uQ2xpY2s6ICgpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LCBlbmFibGVkID0gdHJ1ZSk6IHZvaWQge1xuICAgIGNvbnN0IGJ1dHRvbiA9IGNvbnRhaW5lci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQgfSk7XG4gICAgYnV0dG9uLnR5cGUgPSBcImJ1dHRvblwiO1xuICAgIGJ1dHRvbi5kaXNhYmxlZCA9ICFlbmFibGVkO1xuICAgIGJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdm9pZCBvbkNsaWNrKCk7XG4gICAgfSk7XG4gIH1cbn1cblxuY2xhc3MgUGFyZW50VGl0bGVNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFRpdGxlOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgb25TdWJtaXQ6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgfVxuXG4gIG9uT3BlbigpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiSW5kdWNlIHBhcmVudFwiIH0pO1xuICAgIGNvbnN0IGlucHV0ID0gY29udGVudEVsLmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1tb2RhbC1pbnB1dFwiIH0pO1xuICAgIGlucHV0LnZhbHVlID0gdGhpcy5kZWZhdWx0VGl0bGU7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoZXZlbnQua2V5ICE9PSBcIkVudGVyXCIpIHJldHVybjtcbiAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB0aGlzLnN1Ym1pdChpbnB1dC52YWx1ZSk7XG4gICAgfSk7XG4gICAgbmV3IFNldHRpbmcoY29udGVudEVsKS5hZGRCdXR0b24oKGJ1dHRvbikgPT5cbiAgICAgIGJ1dHRvblxuICAgICAgICAuc2V0QnV0dG9uVGV4dChcIkNvbmZpcm1cIilcbiAgICAgICAgLnNldEN0YSgpXG4gICAgICAgIC5vbkNsaWNrKCgpID0+IHRoaXMuc3VibWl0KGlucHV0LnZhbHVlKSlcbiAgICApO1xuICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlucHV0LmZvY3VzKCk7XG4gICAgICBpbnB1dC5zZWxlY3QoKTtcbiAgICB9LCAwKTtcbiAgfVxuXG4gIHByaXZhdGUgc3VibWl0KHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLm9uU3VibWl0KHRpdGxlLnRyaW0oKSB8fCB0aGlzLmRlZmF1bHRUaXRsZSk7XG4gICAgdGhpcy5jbG9zZSgpO1xuICB9XG59XG5cbmNsYXNzIExvY2FsTWluZG1hcFNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luOiBMb2NhbE9ic2lkaWFuTWluZG1hcFBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkluZGVudCB1bml0XCIpXG4gICAgICAuc2V0RGVzYyhcIk51bWJlciBvZiBzcGFjZXMgdXNlZCBmb3Igb25lIG91dGxpbmUgbGV2ZWwuXCIpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5kZW50VW5pdCkpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IE51bWJlcih2YWx1ZSk7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5kZW50VW5pdCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWQpICYmIHBhcnNlZCA+IDAgPyBNYXRoLmZsb29yKHBhcnNlZCkgOiBERUZBVUxUX1NFVFRJTkdTLmluZGVudFVuaXQ7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIk9wZW4gaW4gcmlnaHQgc2lkZWJhclwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbkluUmlnaHRTaWRlYmFyKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vcGVuSW5SaWdodFNpZGViYXIgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiUGVyc2lzdCBjb2xsYXBzZSBzdGF0ZVwiKVxuICAgICAgLnNldERlc2MoXCJTYXZlIGZvbGRlZCBub2RlcyBpbiBhIGhpZGRlbiBtYW5hZ2VkIGJsb2NrIGF0IHRoZSBlbmQgb2YgdGhlIE1hcmtkb3duIGZpbGUuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGVyc2lzdENvbGxhcHNlU3RhdGUgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiRm9sbG93IGFjdGl2ZSBvdXRsaW5lXCIpXG4gICAgICAuc2V0RGVzYyhcIlJlZnJlc2ggdGhlIHdvcmtiZW5jaCB3aGVuIHRoZSBhY3RpdmUgTWFya2Rvd24gY3Vyc29yIGNoYW5nZXMuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVPdXRsaW5lKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb2xsb3dBY3RpdmVPdXRsaW5lID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VFZGl0b3JCbG9jayhlZGl0b3I6IEVkaXRvciwgYmxvY2s6IE91dGxpbmVCbG9jaywgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBoYXNGb2xsb3dpbmdMaW5lID0gYmxvY2suZW5kTGluZSArIDEgPCBlZGl0b3IubGluZUNvdW50KCk7XG4gIGNvbnN0IGZyb20gPSB7IGxpbmU6IGJsb2NrLnN0YXJ0TGluZSwgY2g6IDAgfTtcbiAgY29uc3QgdG8gPSBoYXNGb2xsb3dpbmdMaW5lXG4gICAgPyB7IGxpbmU6IGJsb2NrLmVuZExpbmUgKyAxLCBjaDogMCB9XG4gICAgOiB7IGxpbmU6IGJsb2NrLmVuZExpbmUsIGNoOiBlZGl0b3IuZ2V0TGluZShibG9jay5lbmRMaW5lKS5sZW5ndGggfTtcbiAgZWRpdG9yLnJlcGxhY2VSYW5nZShoYXNGb2xsb3dpbmdMaW5lID8gYCR7cmVwbGFjZW1lbnR9XFxuYCA6IHJlcGxhY2VtZW50LCBmcm9tLCB0byk7XG59XG5cbmZ1bmN0aW9uIGxheW91dE5vZGVzKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBjb2xsYXBzZWRJZHM6IFNldDxzdHJpbmc+KTogTm9kZUxheW91dFtdIHtcbiAgY29uc3QgcmVzdWx0OiBOb2RlTGF5b3V0W10gPSBbXTtcbiAgbGV0IHJvdyA9IDA7XG4gIGNvbnN0IHZpc2l0ID0gKG5vZGU6IE91dGxpbmVOb2RlLCBkZXB0aDogbnVtYmVyLCBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCkgPT4ge1xuICAgIHJlc3VsdC5wdXNoKHtcbiAgICAgIG5vZGUsXG4gICAgICBkZXB0aCxcbiAgICAgIHBhcmVudElkLFxuICAgICAgeDogMzYgKyBkZXB0aCAqIDI2MCxcbiAgICAgIHk6IDM2ICsgcm93ICogNzhcbiAgICB9KTtcbiAgICByb3cgKz0gMTtcbiAgICBpZiAoY29sbGFwc2VkSWRzLmhhcyhub2RlLmlkKSkgcmV0dXJuO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikgdmlzaXQoY2hpbGQsIGRlcHRoICsgMSwgbm9kZS5pZCk7XG4gIH07XG4gIGZvciAoY29uc3Qgbm9kZSBvZiBub2RlcykgdmlzaXQobm9kZSwgMCwgbnVsbCk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGZpbmROb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVOb2RlIHwgbnVsbCB7XG4gIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgIGlmIChub2RlLmlkID09PSBub2RlSWQpIHJldHVybiBub2RlO1xuICAgIGNvbnN0IGNoaWxkID0gZmluZE5vZGUobm9kZS5jaGlsZHJlbiwgbm9kZUlkKTtcbiAgICBpZiAoY2hpbGQpIHJldHVybiBjaGlsZDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY3NzRXNjYXBlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuICBpZiAodHlwZW9mIENTUyAhPT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgQ1NTLmVzY2FwZSA9PT0gXCJmdW5jdGlvblwiKSByZXR1cm4gQ1NTLmVzY2FwZSh2YWx1ZSk7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bXCJcXFxcXS9nLCBcIlxcXFwkJlwiKTtcbn1cbiIsICJleHBvcnQgY29uc3QgTUlORE1BUF9TVEFURV9CRUdJTiA9IFwiPCEtLSBCRUdJTiBMT0NBTC1PQlNJRElBTi1NSU5ETUFQLVNUQVRFXCI7XG5leHBvcnQgY29uc3QgTUlORE1BUF9TVEFURV9FTkQgPSBcIkVORCBMT0NBTC1PQlNJRElBTi1NSU5ETUFQLVNUQVRFIC0tPlwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIE91dGxpbmVOb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAgdGl0bGU6IHN0cmluZztcbiAgY2hpbGRyZW46IE91dGxpbmVOb2RlW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgT3V0bGluZUJsb2NrIHtcbiAgc3RhcnRMaW5lOiBudW1iZXI7XG4gIGVuZExpbmU6IG51bWJlcjtcbiAgbWFya2Rvd246IHN0cmluZztcbiAgbm9kZXM6IE91dGxpbmVOb2RlW107XG4gIGJsb2NrSGFzaDogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBPdXRsaW5lUGFyc2VSZXN1bHQgPVxuICB8IHsgb2s6IHRydWU7IGJsb2NrOiBPdXRsaW5lQmxvY2s7IHdhcm5pbmdzOiBzdHJpbmdbXSB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nOyBzdGFydExpbmU/OiBudW1iZXI7IGVuZExpbmU/OiBudW1iZXIgfTtcblxuZXhwb3J0IGludGVyZmFjZSBNaW5kbWFwU2V0dGluZ3NEYXRhIHtcbiAgc2NoZW1hVmVyc2lvbjogMTtcbiAgYmxvY2tzOiBSZWNvcmQ8c3RyaW5nLCB7IGNvbGxhcHNlZElkczogc3RyaW5nW107IHVwZGF0ZWRBdDogc3RyaW5nIH0+O1xufVxuXG5leHBvcnQgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBub2RlczogT3V0bGluZU5vZGVbXTsgZm9jdXNJZD86IHN0cmluZyB9XG4gIHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH07XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU91dGxpbmVBdExpbmUoXG4gIG1hcmtkb3duOiBzdHJpbmcsXG4gIGN1cnNvckxpbmU6IG51bWJlcixcbiAgb3B0aW9uczogeyBpbmRlbnRVbml0PzogbnVtYmVyIH0gPSB7fVxuKTogT3V0bGluZVBhcnNlUmVzdWx0IHtcbiAgY29uc3QgaW5kZW50VW5pdCA9IG9wdGlvbnMuaW5kZW50VW5pdCA/PyAyO1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMoc3RyaXBNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bikpO1xuICBjb25zdCBsaW5lcyA9IG5vcm1hbGl6ZWQuc3BsaXQoXCJcXG5cIik7XG4gIGlmIChjdXJzb3JMaW5lIDwgMCB8fCBjdXJzb3JMaW5lID49IGxpbmVzLmxlbmd0aCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkN1cnNvciBpcyBvdXRzaWRlIHRoZSBkb2N1bWVudC5cIiB9O1xuICB9XG5cbiAgY29uc3QgY3VycmVudCA9IHBhcnNlUGxhaW5MaXN0SXRlbShsaW5lc1tjdXJzb3JMaW5lXSwgaW5kZW50VW5pdCk7XG4gIGlmICghY3VycmVudC5vaykge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlB1dCB0aGUgY3Vyc29yIG9uIGEgcGxhaW4gdW5vcmRlcmVkIGxpc3QgaXRlbSAoYC0gaXRlbWApIGZpcnN0LlwiIH07XG4gIH1cblxuICBjb25zdCBzdGFydExpbmUgPSBmaW5kTGlzdEJsb2NrU3RhcnQobGluZXMsIGN1cnNvckxpbmUpO1xuICBjb25zdCBlbmRMaW5lID0gZmluZExpc3RCbG9ja0VuZChsaW5lcywgY3Vyc29yTGluZSk7XG4gIGNvbnN0IGJsb2NrTGluZXMgPSBsaW5lcy5zbGljZShzdGFydExpbmUsIGVuZExpbmUgKyAxKTtcbiAgY29uc3QgcGFyc2VkID0gcGFyc2VPdXRsaW5lQmxvY2tMaW5lcyhibG9ja0xpbmVzLCBpbmRlbnRVbml0KTtcbiAgaWYgKCFwYXJzZWQub2spIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogcGFyc2VkLnJlYXNvbiwgc3RhcnRMaW5lLCBlbmRMaW5lIH07XG4gIH1cblxuICBjb25zdCBtYXJrZG93bkJsb2NrID0gYmxvY2tMaW5lcy5qb2luKFwiXFxuXCIpO1xuICByZXR1cm4ge1xuICAgIG9rOiB0cnVlLFxuICAgIGJsb2NrOiB7XG4gICAgICBzdGFydExpbmUsXG4gICAgICBlbmRMaW5lLFxuICAgICAgbWFya2Rvd246IG1hcmtkb3duQmxvY2ssXG4gICAgICBub2RlczogcGFyc2VkLm5vZGVzLFxuICAgICAgYmxvY2tIYXNoOiBoYXNoT3V0bGluZUJsb2NrKG1hcmtkb3duQmxvY2spXG4gICAgfSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlcGxhY2VPdXRsaW5lQmxvY2soXG4gIG1hcmtkb3duOiBzdHJpbmcsXG4gIGJsb2NrOiBQaWNrPE91dGxpbmVCbG9jaywgXCJzdGFydExpbmVcIiB8IFwiZW5kTGluZVwiPixcbiAgbm9kZXM6IE91dGxpbmVOb2RlW10sXG4gIG9wdGlvbnM6IHsgaW5kZW50VW5pdD86IG51bWJlciB9ID0ge31cbik6IHN0cmluZyB7XG4gIGNvbnN0IGluZGVudFVuaXQgPSBvcHRpb25zLmluZGVudFVuaXQgPz8gMjtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKG1hcmtkb3duKTtcbiAgY29uc3QgaGFkRmluYWxOZXdsaW5lID0gbm9ybWFsaXplZC5lbmRzV2l0aChcIlxcblwiKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBjb25zdCByZXBsYWNlbWVudCA9IHNlcmlhbGl6ZU91dGxpbmUobm9kZXMsIGluZGVudFVuaXQpLnNwbGl0KFwiXFxuXCIpO1xuICBsaW5lcy5zcGxpY2UoYmxvY2suc3RhcnRMaW5lLCBibG9jay5lbmRMaW5lIC0gYmxvY2suc3RhcnRMaW5lICsgMSwgLi4ucmVwbGFjZW1lbnQpO1xuICBjb25zdCBuZXh0ID0gbGluZXMuam9pbihcIlxcblwiKTtcbiAgcmV0dXJuIGhhZEZpbmFsTmV3bGluZSAmJiAhbmV4dC5lbmRzV2l0aChcIlxcblwiKSA/IGAke25leHR9XFxuYCA6IG5leHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVPdXRsaW5lKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBpbmRlbnRVbml0ID0gMik6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBPdXRsaW5lTm9kZSwgZGVwdGg6IG51bWJlcikgPT4ge1xuICAgIGxpbmVzLnB1c2goYCR7XCIgXCIucmVwZWF0KGRlcHRoICogaW5kZW50VW5pdCl9LSAke25vZGUudGl0bGV9YCk7XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuKSB2aXNpdChjaGlsZCwgZGVwdGggKyAxKTtcbiAgfTtcbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB2aXNpdChub2RlLCAwKTtcbiAgcmV0dXJuIGxpbmVzLmpvaW4oXCJcXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVOb2RlVGl0bGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgbG9jYXRpb24ubm9kZS50aXRsZSA9IHRpdGxlO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5vZGVJZCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5zZXJ0U2libGluZ0FmdGVyKFxuICBub2RlczogT3V0bGluZU5vZGVbXSxcbiAgbm9kZUlkOiBzdHJpbmcsXG4gIHRpdGxlID0gXCJcIixcbiAgbmV3SWQgPSBjcmVhdGVHZW5lcmF0ZWROb2RlSWQoKVxuKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgbG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGxvY2F0aW9uLmluZGV4ICsgMSwgMCwgeyBpZDogbmV3SWQsIHRpdGxlLCBjaGlsZHJlbjogW10gfSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbmV3SWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluZGVudE5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgaWYgKGxvY2F0aW9uLmluZGV4ID09PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJDYW5ub3QgaW5kZW50OiB0aGVyZSBpcyBubyBwcmV2aW91cyBzaWJsaW5nLlwiIH07XG4gIGNvbnN0IFtub2RlXSA9IGxvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShsb2NhdGlvbi5pbmRleCwgMSk7XG4gIGxvY2F0aW9uLnNpYmxpbmdzW2xvY2F0aW9uLmluZGV4IC0gMV0uY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBub2RlSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG91dGRlbnROb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGlmICghbG9jYXRpb24ucGFyZW50SWQpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIkNhbm5vdCBvdXRkZW50IGEgdG9wLWxldmVsIG5vZGUuXCIgfTtcbiAgY29uc3QgcGFyZW50TG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbG9jYXRpb24ucGFyZW50SWQpO1xuICBpZiAoIXBhcmVudExvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJQYXJlbnQgbm9kZSBub3QgZm91bmQuXCIgfTtcbiAgY29uc3QgZnJlc2hMb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWZyZXNoTG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGNvbnN0IFtub2RlXSA9IGZyZXNoTG9jYXRpb24uc2libGluZ3Muc3BsaWNlKGZyZXNoTG9jYXRpb24uaW5kZXgsIDEpO1xuICBwYXJlbnRMb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UocGFyZW50TG9jYXRpb24uaW5kZXggKyAxLCAwLCBub2RlKTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBub2RlSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUVtcHR5Tm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBpZiAobG9jYXRpb24ubm9kZS50aXRsZS50cmltKCkgfHwgbG9jYXRpb24ubm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiT25seSBlbXB0eSBsZWFmIG5vZGVzIGNhbiBiZSBkZWxldGVkIHdpdGggQmFja3NwYWNlL0RlbGV0ZS5cIiB9O1xuICB9XG4gIGxvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShsb2NhdGlvbi5pbmRleCwgMSk7XG4gIGNvbnN0IGZvY3VzSWQgPSBsb2NhdGlvbi5zaWJsaW5nc1tNYXRoLm1heCgwLCBsb2NhdGlvbi5pbmRleCAtIDEpXT8uaWQgPz8gbG9jYXRpb24uc2libGluZ3NbMF0/LmlkO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluZHVjZVBhcmVudEZyb21TZWxlY3RlZChcbiAgbm9kZXM6IE91dGxpbmVOb2RlW10sXG4gIHNlbGVjdGVkSWRzOiBzdHJpbmdbXSxcbiAgdGl0bGUgPSBcIlx1NUY1Mlx1N0VCM1wiLFxuICBuZXdJZCA9IGNyZWF0ZUdlbmVyYXRlZE5vZGVJZCgpXG4pOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgdW5pcXVlSWRzID0gWy4uLm5ldyBTZXQoc2VsZWN0ZWRJZHMpXTtcbiAgaWYgKHVuaXF1ZUlkcy5sZW5ndGggPCAyKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJTZWxlY3QgYXQgbGVhc3QgdHdvIHNpYmxpbmcgbm9kZXMuXCIgfTtcblxuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9ucyA9IHVuaXF1ZUlkcy5tYXAoKGlkKSA9PiBmaW5kTG9jYXRpb24obmV4dCwgaWQpKTtcbiAgaWYgKGxvY2F0aW9ucy5zb21lKChsb2NhdGlvbikgPT4gIWxvY2F0aW9uKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiU29tZSBzZWxlY3RlZCBub2RlcyBubyBsb25nZXIgZXhpc3QuXCIgfTtcbiAgY29uc3QgY29uY3JldGUgPSBsb2NhdGlvbnMgYXMgTm9uTnVsbGFibGU8UmV0dXJuVHlwZTx0eXBlb2YgZmluZExvY2F0aW9uPj5bXTtcbiAgY29uc3QgcGFyZW50S2V5ID0gY29uY3JldGVbMF0ucGFyZW50SWQgPz8gXCJfX3Jvb3RfX1wiO1xuICBpZiAoY29uY3JldGUuc29tZSgobG9jYXRpb24pID0+IChsb2NhdGlvbi5wYXJlbnRJZCA/PyBcIl9fcm9vdF9fXCIpICE9PSBwYXJlbnRLZXkpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBub2RlcyB3aXRoIHRoZSBzYW1lIHBhcmVudC5cIiB9O1xuICB9XG5cbiAgY29uc3Qgc2libGluZ3MgPSBjb25jcmV0ZVswXS5zaWJsaW5ncztcbiAgaWYgKGNvbmNyZXRlLnNvbWUoKGxvY2F0aW9uKSA9PiBsb2NhdGlvbi5zaWJsaW5ncyAhPT0gc2libGluZ3MpKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBub2RlcyB3aXRoIHRoZSBzYW1lIHBhcmVudC5cIiB9O1xuICB9XG5cbiAgY29uc3Qgc29ydGVkID0gY29uY3JldGUuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gIGZvciAobGV0IGluZGV4ID0gMTsgaW5kZXggPCBzb3J0ZWQubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgaWYgKHNvcnRlZFtpbmRleF0uaW5kZXggIT09IHNvcnRlZFtpbmRleCAtIDFdLmluZGV4ICsgMSkge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUmV2ZXJzZSBpbmR1Y3Rpb24gb25seSBzdXBwb3J0cyBhZGphY2VudCBzaWJsaW5nIG5vZGVzLlwiIH07XG4gICAgfVxuICB9XG5cbiAgY29uc3QgZmlyc3RJbmRleCA9IHNvcnRlZFswXS5pbmRleDtcbiAgY29uc3Qgc2VsZWN0ZWROb2RlcyA9IHNpYmxpbmdzLnNwbGljZShmaXJzdEluZGV4LCBzb3J0ZWQubGVuZ3RoKTtcbiAgc2libGluZ3Muc3BsaWNlKGZpcnN0SW5kZXgsIDAsIHsgaWQ6IG5ld0lkLCB0aXRsZSwgY2hpbGRyZW46IHNlbGVjdGVkTm9kZXMgfSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbmV3SWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwTWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd246IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bikucmVwbGFjZShtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBcIlwiKS5yZXBsYWNlKC9cXG57Myx9JC9nLCBcIlxcblxcblwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRNaW5kbWFwU3RhdGUobWFya2Rvd246IHN0cmluZyk6IE1pbmRtYXBTZXR0aW5nc0RhdGEge1xuICBjb25zdCBtYXRjaCA9IG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCkuZXhlYyhub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bikpO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gZW1wdHlNaW5kbWFwU3RhdGUoKTtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG1hdGNoWzFdLnRyaW0oKSkgYXMgTWluZG1hcFNldHRpbmdzRGF0YTtcbiAgICBpZiAocGFyc2VkLnNjaGVtYVZlcnNpb24gIT09IDEgfHwgdHlwZW9mIHBhcnNlZC5ibG9ja3MgIT09IFwib2JqZWN0XCIgfHwgcGFyc2VkLmJsb2NrcyA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGVtcHR5TWluZG1hcFN0YXRlKCk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWQ7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBlbXB0eU1pbmRtYXBTdGF0ZSgpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayhtYXJrZG93bjogc3RyaW5nLCBzdGF0ZTogTWluZG1hcFNldHRpbmdzRGF0YSk6IHN0cmluZyB7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bikudHJpbUVuZCgpO1xuICBjb25zdCBibG9jayA9IGAke01JTkRNQVBfU1RBVEVfQkVHSU59XFxuJHtKU09OLnN0cmluZ2lmeShzdGF0ZSwgbnVsbCwgMil9XFxuJHtNSU5ETUFQX1NUQVRFX0VORH1gO1xuICBpZiAobWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKS50ZXN0KG5vcm1hbGl6ZWQpKSB7XG4gICAgcmV0dXJuIGAke25vcm1hbGl6ZWQucmVwbGFjZShtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLCBibG9jayl9XFxuYDtcbiAgfVxuICByZXR1cm4gYCR7bm9ybWFsaXplZH1cXG5cXG4ke2Jsb2NrfVxcbmA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNoT3V0bGluZUJsb2NrKG1hcmtkb3duOiBzdHJpbmcpOiBzdHJpbmcge1xuICBsZXQgaGFzaCA9IDIxNjYxMzYyNjE7XG4gIGZvciAoY29uc3QgY2hhciBvZiBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bikpIHtcbiAgICBoYXNoIF49IGNoYXIuY2hhckNvZGVBdCgwKTtcbiAgICBoYXNoID0gTWF0aC5pbXVsKGhhc2gsIDE2Nzc3NjE5KTtcbiAgfVxuICByZXR1cm4gKGhhc2ggPj4+IDApLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg4LCBcIjBcIik7XG59XG5cbmZ1bmN0aW9uIHBhcnNlT3V0bGluZUJsb2NrTGluZXMoXG4gIGJsb2NrTGluZXM6IHN0cmluZ1tdLFxuICBpbmRlbnRVbml0OiBudW1iZXJcbik6IHsgb2s6IHRydWU7IG5vZGVzOiBPdXRsaW5lTm9kZVtdIH0gfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gIGNvbnN0IHJvb3RzOiBPdXRsaW5lTm9kZVtdID0gW107XG4gIGNvbnN0IHN0YWNrOiBBcnJheTx7IG5vZGU6IE91dGxpbmVOb2RlOyBkZXB0aDogbnVtYmVyIH0+ID0gW107XG4gIGxldCBwcmV2aW91c0RlcHRoID0gMDtcblxuICBmb3IgKGxldCBsaW5lSW5kZXggPSAwOyBsaW5lSW5kZXggPCBibG9ja0xpbmVzLmxlbmd0aDsgbGluZUluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBwYXJzZWQgPSBwYXJzZVBsYWluTGlzdEl0ZW0oYmxvY2tMaW5lc1tsaW5lSW5kZXhdLCBpbmRlbnRVbml0KTtcbiAgICBpZiAoIXBhcnNlZC5vaykgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IHBhcnNlZC5yZWFzb24gfTtcbiAgICBpZiAobGluZUluZGV4ID09PSAwICYmIHBhcnNlZC5kZXB0aCAhPT0gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiVGhlIG91dGxpbmUgYmxvY2sgbXVzdCBzdGFydCBhdCBkZXB0aCAwLlwiIH07XG4gICAgaWYgKHBhcnNlZC5kZXB0aCA+IHByZXZpb3VzRGVwdGggKyAxKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJJbmRlbnRhdGlvbiBqdW1wcyBtb3JlIHRoYW4gb25lIGxldmVsLlwiIH07XG4gICAgY29uc3QgcGFyZW50ID0gcGFyc2VkLmRlcHRoID09PSAwID8gbnVsbCA6IHN0YWNrW3BhcnNlZC5kZXB0aCAtIDFdPy5ub2RlO1xuICAgIGlmIChwYXJzZWQuZGVwdGggPiAwICYmICFwYXJlbnQpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk1pc3NpbmcgcGFyZW50IGxpc3QgaXRlbS5cIiB9O1xuICAgIGNvbnN0IHNpYmxpbmdzID0gcGFyZW50ID8gcGFyZW50LmNoaWxkcmVuIDogcm9vdHM7XG4gICAgY29uc3Qgbm9kZTogT3V0bGluZU5vZGUgPSB7XG4gICAgICBpZDogYG4tJHtbLi4uc3RhY2suc2xpY2UoMCwgcGFyc2VkLmRlcHRoKS5tYXAoKGVudHJ5KSA9PiBlbnRyeS5ub2RlLmlkKSwgc2libGluZ3MubGVuZ3RoXS5qb2luKFwiLVwiKX1gLFxuICAgICAgdGl0bGU6IHBhcnNlZC50aXRsZSxcbiAgICAgIGNoaWxkcmVuOiBbXVxuICAgIH07XG4gICAgc2libGluZ3MucHVzaChub2RlKTtcbiAgICBzdGFja1twYXJzZWQuZGVwdGhdID0geyBub2RlLCBkZXB0aDogcGFyc2VkLmRlcHRoIH07XG4gICAgc3RhY2subGVuZ3RoID0gcGFyc2VkLmRlcHRoICsgMTtcbiAgICBwcmV2aW91c0RlcHRoID0gcGFyc2VkLmRlcHRoO1xuICB9XG5cbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiByb290cyB9O1xufVxuXG5mdW5jdGlvbiBwYXJzZVBsYWluTGlzdEl0ZW0oXG4gIGxpbmU6IHN0cmluZyxcbiAgaW5kZW50VW5pdDogbnVtYmVyXG4pOlxuICB8IHsgb2s6IHRydWU7IGRlcHRoOiBudW1iZXI7IHRpdGxlOiBzdHJpbmcgfVxuICB8IHsgb2s6IGZhbHNlOyByZWFzb246IHN0cmluZyB9IHtcbiAgaWYgKC9eXFxzKlxcZCtcXC5cXHMrLy50ZXN0KGxpbmUpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJPcmRlcmVkIGxpc3RzIGFyZSBub3Qgc3VwcG9ydGVkIGluIHYxLlwiIH07XG4gIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKS1cXHM/KC4qKSQvKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiT25seSBwbGFpbiB1bm9yZGVyZWQgbGlzdCBpdGVtcyBhcmUgc3VwcG9ydGVkLlwiIH07XG4gIGNvbnN0IGluZGVudCA9IG1hdGNoWzFdO1xuICBpZiAoaW5kZW50LmluY2x1ZGVzKFwiXFx0XCIpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUYWIgaW5kZW50YXRpb24gaXMgbm90IHN1cHBvcnRlZDsgdXNlIHNwYWNlcy5cIiB9O1xuICBpZiAoaW5kZW50Lmxlbmd0aCAlIGluZGVudFVuaXQgIT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBgSW5kZW50YXRpb24gbXVzdCB1c2UgJHtpbmRlbnRVbml0fSBzcGFjZXMuYCB9O1xuICBjb25zdCB0aXRsZSA9IG1hdGNoWzJdID8/IFwiXCI7XG4gIGlmICgvXlxcW1sgeFhdXFxdXFxzKy8udGVzdCh0aXRsZSkpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlRhc2sgbGlzdCBpdGVtcyBhcmUgbm90IHN1cHBvcnRlZCBpbiB2MS5cIiB9O1xuICByZXR1cm4geyBvazogdHJ1ZSwgZGVwdGg6IGluZGVudC5sZW5ndGggLyBpbmRlbnRVbml0LCB0aXRsZSB9O1xufVxuXG5mdW5jdGlvbiBmaW5kTGlzdEJsb2NrU3RhcnQobGluZXM6IHN0cmluZ1tdLCBjdXJzb3JMaW5lOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgbGluZSA9IGN1cnNvckxpbmU7XG4gIHdoaWxlIChsaW5lID4gMCkge1xuICAgIGNvbnN0IHByZXZpb3VzID0gbGluZXNbbGluZSAtIDFdO1xuICAgIGlmICghcHJldmlvdXMudHJpbSgpKSBicmVhaztcbiAgICBpZiAoL15cXHMqLVxccz8vLnRlc3QocHJldmlvdXMpIHx8IC9eXFxzK1xcUy8udGVzdChwcmV2aW91cykpIHtcbiAgICAgIGxpbmUgLT0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBicmVhaztcbiAgfVxuICByZXR1cm4gbGluZTtcbn1cblxuZnVuY3Rpb24gZmluZExpc3RCbG9ja0VuZChsaW5lczogc3RyaW5nW10sIGN1cnNvckxpbmU6IG51bWJlcik6IG51bWJlciB7XG4gIGxldCBsaW5lID0gY3Vyc29yTGluZTtcbiAgd2hpbGUgKGxpbmUgKyAxIDwgbGluZXMubGVuZ3RoKSB7XG4gICAgY29uc3QgbmV4dCA9IGxpbmVzW2xpbmUgKyAxXTtcbiAgICBpZiAoIW5leHQudHJpbSgpKSBicmVhaztcbiAgICBpZiAoL15cXHMqLVxccz8vLnRlc3QobmV4dCkgfHwgL15cXHMrXFxTLy50ZXN0KG5leHQpKSB7XG4gICAgICBsaW5lICs9IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIGxpbmU7XG59XG5cbmZ1bmN0aW9uIGZpbmRMb2NhdGlvbihcbiAgbm9kZXM6IE91dGxpbmVOb2RlW10sXG4gIG5vZGVJZDogc3RyaW5nLFxuICBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCA9IG51bGxcbik6IHsgbm9kZTogT3V0bGluZU5vZGU7IHNpYmxpbmdzOiBPdXRsaW5lTm9kZVtdOyBpbmRleDogbnVtYmVyOyBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbCB9IHwgbnVsbCB7XG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBub2Rlcy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXNbaW5kZXhdO1xuICAgIGlmIChub2RlLmlkID09PSBub2RlSWQpIHJldHVybiB7IG5vZGUsIHNpYmxpbmdzOiBub2RlcywgaW5kZXgsIHBhcmVudElkIH07XG4gICAgY29uc3QgY2hpbGQgPSBmaW5kTG9jYXRpb24obm9kZS5jaGlsZHJlbiwgbm9kZUlkLCBub2RlLmlkKTtcbiAgICBpZiAoY2hpbGQpIHJldHVybiBjaGlsZDtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY2xvbmVOb2Rlcyhub2RlczogT3V0bGluZU5vZGVbXSk6IE91dGxpbmVOb2RlW10ge1xuICByZXR1cm4gbm9kZXMubWFwKChub2RlKSA9PiAoe1xuICAgIGlkOiBub2RlLmlkLFxuICAgIHRpdGxlOiBub2RlLnRpdGxlLFxuICAgIGNoaWxkcmVuOiBjbG9uZU5vZGVzKG5vZGUuY2hpbGRyZW4pXG4gIH0pKTtcbn1cblxuZnVuY3Rpb24gZW1wdHlNaW5kbWFwU3RhdGUoKTogTWluZG1hcFNldHRpbmdzRGF0YSB7XG4gIHJldHVybiB7IHNjaGVtYVZlcnNpb246IDEsIGJsb2Nrczoge30gfTtcbn1cblxuZnVuY3Rpb24gbWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKTogUmVnRXhwIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoYCR7ZXNjYXBlUmVnRXhwKE1JTkRNQVBfU1RBVEVfQkVHSU4pfVxcXFxuKFtcXFxcc1xcXFxTXSo/KVxcXFxuJHtlc2NhcGVSZWdFeHAoTUlORE1BUF9TVEFURV9FTkQpfWAsIFwibVwiKTtcbn1cblxubGV0IGdlbmVyYXRlZElkQ291bnRlciA9IDA7XG5mdW5jdGlvbiBjcmVhdGVHZW5lcmF0ZWROb2RlSWQoKTogc3RyaW5nIHtcbiAgZ2VuZXJhdGVkSWRDb3VudGVyICs9IDE7XG4gIHJldHVybiBgbm9kZS0ke0RhdGUubm93KCkudG9TdHJpbmcoMzYpfS0ke2dlbmVyYXRlZElkQ291bnRlcn1gO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVOZXdsaW5lcyh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcclxcbi9nLCBcIlxcblwiKS5yZXBsYWNlKC9cXHIvZywgXCJcXG5cIik7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ0V4cCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCBcIlxcXFwkJlwiKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFhTzs7O0FDYkEsSUFBTSxzQkFBc0I7QUFDNUIsSUFBTSxvQkFBb0I7QUE2QjFCLFNBQVMsbUJBQ2QsVUFDQSxZQUNBLFVBQW1DLENBQUMsR0FDaEI7QUFDcEIsUUFBTSxhQUFhLFFBQVEsY0FBYztBQUN6QyxRQUFNLGFBQWEsa0JBQWtCLHVCQUF1QixRQUFRLENBQUM7QUFDckUsUUFBTSxRQUFRLFdBQVcsTUFBTSxJQUFJO0FBQ25DLE1BQUksYUFBYSxLQUFLLGNBQWMsTUFBTSxRQUFRO0FBQ2hELFdBQU8sRUFBRSxJQUFJLE9BQU8sUUFBUSxrQ0FBa0M7QUFBQSxFQUNoRTtBQUVBLFFBQU0sVUFBVSxtQkFBbUIsTUFBTSxVQUFVLEdBQUcsVUFBVTtBQUNoRSxNQUFJLENBQUMsUUFBUSxJQUFJO0FBQ2YsV0FBTyxFQUFFLElBQUksT0FBTyxRQUFRLGtFQUFrRTtBQUFBLEVBQ2hHO0FBRUEsUUFBTSxZQUFZLG1CQUFtQixPQUFPLFVBQVU7QUFDdEQsUUFBTSxVQUFVLGlCQUFpQixPQUFPLFVBQVU7QUFDbEQsUUFBTSxhQUFhLE1B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
