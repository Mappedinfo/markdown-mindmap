/* Local Obsidian Mindmap */
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
var VIEW_TYPE_MINDMAP = "local-obsidian-mindmap-workbench";
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
    input.addEventListener("focus", () => this.selectNode(node.id, false));
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL291dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7XG4gIEFwcCxcbiAgRWRpdG9yLFxuICBJdGVtVmlldyxcbiAgTWFya2Rvd25WaWV3LFxuICBNb2RhbCxcbiAgTm90aWNlLFxuICBQbHVnaW4sXG4gIFBsdWdpblNldHRpbmdUYWIsXG4gIFNldHRpbmcsXG4gIFRGaWxlLFxuICBXb3Jrc3BhY2VMZWFmLFxuICBub3JtYWxpemVQYXRoXG59IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHtcbiAgZGVsZXRlRW1wdHlOb2RlLFxuICBoYXNoT3V0bGluZUJsb2NrLFxuICBpbmRlbnROb2RlLFxuICBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQsXG4gIGluc2VydFNpYmxpbmdBZnRlcixcbiAgb3V0ZGVudE5vZGUsXG4gIHBhcnNlT3V0bGluZUF0TGluZSxcbiAgcmVhZE1pbmRtYXBTdGF0ZSxcbiAgcmVwbGFjZU91dGxpbmVCbG9jayxcbiAgc2VyaWFsaXplT3V0bGluZSxcbiAgdXBkYXRlTm9kZVRpdGxlLFxuICB1cHNlcnRNaW5kbWFwU3RhdGVCbG9jayxcbiAgdHlwZSBNaW5kbWFwU2V0dGluZ3NEYXRhLFxuICB0eXBlIE91dGxpbmVCbG9jayxcbiAgdHlwZSBPdXRsaW5lTm9kZSxcbiAgdHlwZSBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0XG59IGZyb20gXCIuL291dGxpbmUudHNcIjtcblxuY29uc3QgVklFV19UWVBFX01JTkRNQVAgPSBcImxvY2FsLW9ic2lkaWFuLW1pbmRtYXAtd29ya2JlbmNoXCI7XG5cbmludGVyZmFjZSBMb2NhbE1pbmRtYXBTZXR0aW5ncyB7XG4gIGluZGVudFVuaXQ6IG51bWJlcjtcbiAgb3BlbkluUmlnaHRTaWRlYmFyOiBib29sZWFuO1xuICBwZXJzaXN0Q29sbGFwc2VTdGF0ZTogYm9vbGVhbjtcbiAgZm9sbG93QWN0aXZlT3V0bGluZTogYm9vbGVhbjtcbn1cblxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSB7XG4gIGluZGVudFVuaXQ6IDIsXG4gIG9wZW5JblJpZ2h0U2lkZWJhcjogdHJ1ZSxcbiAgcGVyc2lzdENvbGxhcHNlU3RhdGU6IHRydWUsXG4gIGZvbGxvd0FjdGl2ZU91dGxpbmU6IHRydWVcbn07XG5cbmludGVyZmFjZSBOb2RlTGF5b3V0IHtcbiAgbm9kZTogT3V0bGluZU5vZGU7XG4gIGRlcHRoOiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBwYXJlbnRJZDogc3RyaW5nIHwgbnVsbDtcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTG9jYWxPYnNpZGlhbk1pbmRtYXBQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTG9jYWxNaW5kbWFwU2V0dGluZ3MgPSBERUZBVUxUX1NFVFRJTkdTO1xuXG4gIGFzeW5jIG9ubG9hZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTG9jYWxNaW5kbWFwU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJWaWV3KFZJRVdfVFlQRV9NSU5ETUFQLCAobGVhZikgPT4gbmV3IE1pbmRtYXBXb3JrYmVuY2hWaWV3KGxlYWYsIHRoaXMpKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWN1cnJlbnQtb3V0bGluZS1taW5kbWFwXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gTWluZG1hcCBmb3IgQ3VycmVudCBPdXRsaW5lXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5vcGVuTWluZG1hcEZvckN1cnJlbnRPdXRsaW5lKClcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJpbmR1Y2UtcGFyZW50LWZyb20tc2VsZWN0ZWQtbm9kZXNcIixcbiAgICAgIG5hbWU6IFwiSW5kdWNlIFBhcmVudCBmcm9tIFNlbGVjdGVkIE5vZGVzXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy53aXRoTWluZG1hcFZpZXcoKHZpZXcpID0+IHZpZXcucHJvbXB0SW5kdWNlUGFyZW50KCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZm9jdXMtbWluZG1hcC1ub2RlXCIsXG4gICAgICBuYW1lOiBcIkZvY3VzIE1pbmRtYXAgTm9kZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMud2l0aE1pbmRtYXBWaWV3KCh2aWV3KSA9PiB2aWV3LmZvY3VzU2VsZWN0ZWROb2RlKCkpXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJhY3RpdmUtbGVhZi1jaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZm9sbG93QWN0aXZlT3V0bGluZSkgcmV0dXJuO1xuICAgICAgICB0aGlzLnJlZnJlc2hPcGVuTWluZG1hcFZpZXdzKCk7XG4gICAgICB9KVxuICAgICk7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJlZGl0b3ItY2hhbmdlXCIsICgpID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLmZvbGxvd0FjdGl2ZU91dGxpbmUpIHJldHVybjtcbiAgICAgICAgdGhpcy5yZWZyZXNoT3Blbk1pbmRtYXBWaWV3cygpO1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgb251bmxvYWQoKTogdm9pZCB7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLmRldGFjaExlYXZlc09mVHlwZShWSUVXX1RZUEVfTUlORE1BUCk7XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zZXR0aW5ncyA9IHtcbiAgICAgIC4uLkRFRkFVTFRfU0VUVElOR1MsXG4gICAgICAuLi4oYXdhaXQgdGhpcy5sb2FkRGF0YSgpKVxuICAgIH07XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIGFzeW5jIG9wZW5NaW5kbWFwRm9yQ3VycmVudE91dGxpbmUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgbGV0IGxlYWYgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0TGVhdmVzT2ZUeXBlKFZJRVdfVFlQRV9NSU5ETUFQKVswXTtcbiAgICBpZiAoIWxlYWYpIHtcbiAgICAgIGxlYWYgPSB0aGlzLnNldHRpbmdzLm9wZW5JblJpZ2h0U2lkZWJhclxuICAgICAgICA/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRSaWdodExlYWYoZmFsc2UpID8/IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWFmKHRydWUpXG4gICAgICAgIDogdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYodHJ1ZSk7XG4gICAgICBhd2FpdCBsZWFmLnNldFZpZXdTdGF0ZSh7IHR5cGU6IFZJRVdfVFlQRV9NSU5ETUFQLCBhY3RpdmU6IHRydWUgfSk7XG4gICAgfVxuICAgIGF3YWl0IHRoaXMuYXBwLndvcmtzcGFjZS5yZXZlYWxMZWFmKGxlYWYpO1xuICAgIGlmIChsZWFmLnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykge1xuICAgICAgYXdhaXQgbGVhZi52aWV3LmxvYWRGcm9tQWN0aXZlTWFya2Rvd24oKTtcbiAgICB9XG4gIH1cblxuICBnZXRBY3RpdmVNYXJrZG93blZpZXcoKTogTWFya2Rvd25WaWV3IHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gIH1cblxuICBmaW5kTWFya2Rvd25WaWV3Rm9yRmlsZShmaWxlOiBURmlsZSk6IE1hcmtkb3duVmlldyB8IG51bGwge1xuICAgIGxldCBmb3VuZDogTWFya2Rvd25WaWV3IHwgbnVsbCA9IG51bGw7XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLml0ZXJhdGVBbGxMZWF2ZXMoKGxlYWYpID0+IHtcbiAgICAgIGlmIChmb3VuZCkgcmV0dXJuO1xuICAgICAgaWYgKGxlYWYudmlldyBpbnN0YW5jZW9mIE1hcmtkb3duVmlldyAmJiBsZWFmLnZpZXcuZmlsZT8ucGF0aCA9PT0gZmlsZS5wYXRoKSB7XG4gICAgICAgIGZvdW5kID0gbGVhZi52aWV3O1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBmb3VuZDtcbiAgfVxuXG4gIHByaXZhdGUgcmVmcmVzaE9wZW5NaW5kbWFwVmlld3MoKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBsZWFmIG9mIHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApKSB7XG4gICAgICBpZiAobGVhZi52aWV3IGluc3RhbmNlb2YgTWluZG1hcFdvcmtiZW5jaFZpZXcpIHtcbiAgICAgICAgdm9pZCBsZWFmLnZpZXcubG9hZEZyb21BY3RpdmVNYXJrZG93bih7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgd2l0aE1pbmRtYXBWaWV3KGNhbGxiYWNrOiAodmlldzogTWluZG1hcFdvcmtiZW5jaFZpZXcpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG4gICAgY29uc3QgbGVhZiA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRMZWF2ZXNPZlR5cGUoVklFV19UWVBFX01JTkRNQVApWzBdO1xuICAgIGlmICghKGxlYWY/LnZpZXcgaW5zdGFuY2VvZiBNaW5kbWFwV29ya2JlbmNoVmlldykpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJPcGVuIHRoZSBNaW5kbWFwIFdvcmtiZW5jaCBmaXJzdC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZvaWQgY2FsbGJhY2sobGVhZi52aWV3KTtcbiAgfVxufVxuXG5jbGFzcyBNaW5kbWFwV29ya2JlbmNoVmlldyBleHRlbmRzIEl0ZW1WaWV3IHtcbiAgcHJpdmF0ZSBzb3VyY2VGaWxlOiBURmlsZSB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIGJsb2NrOiBPdXRsaW5lQmxvY2sgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBub2RlczogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBwcml2YXRlIHNlbGVjdGVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgY29sbGFwc2VkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHByaXZhdGUgc2NhbGUgPSAxO1xuICBwcml2YXRlIHJlZnJlc2hUaW1lcjogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbiAgY29uc3RydWN0b3IobGVhZjogV29ya3NwYWNlTGVhZiwgcHJpdmF0ZSByZWFkb25seSBwbHVnaW46IExvY2FsT2JzaWRpYW5NaW5kbWFwUGx1Z2luKSB7XG4gICAgc3VwZXIobGVhZik7XG4gIH1cblxuICBnZXRWaWV3VHlwZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiBWSUVXX1RZUEVfTUlORE1BUDtcbiAgfVxuXG4gIGdldERpc3BsYXlUZXh0KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFwiTWluZG1hcCBXb3JrYmVuY2hcIjtcbiAgfVxuXG4gIGdldEljb24oKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJnaXQtZm9ya1wiO1xuICB9XG5cbiAgYXN5bmMgb25PcGVuKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBhc3luYyBvbkNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgc2NoZWR1bGVSZWZyZXNoKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnJlZnJlc2hUaW1lciAhPT0gbnVsbCkgd2luZG93LmNsZWFyVGltZW91dCh0aGlzLnJlZnJlc2hUaW1lcik7XG4gICAgdGhpcy5yZWZyZXNoVGltZXIgPSB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB0aGlzLnJlZnJlc2hUaW1lciA9IG51bGw7XG4gICAgICB2b2lkIHRoaXMubG9hZEZyb21BY3RpdmVNYXJrZG93bih7IHByZXNlcnZlU2VsZWN0aW9uOiB0cnVlIH0pO1xuICAgIH0sIDEyMCk7XG4gIH1cblxuICBhc3luYyBsb2FkRnJvbUFjdGl2ZU1hcmtkb3duKG9wdGlvbnM6IHsgcHJlc2VydmVTZWxlY3Rpb24/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHZpZXcgPSB0aGlzLnBsdWdpbi5nZXRBY3RpdmVNYXJrZG93blZpZXcoKTtcbiAgICBpZiAoIXZpZXc/LmZpbGUpIHtcbiAgICAgIHRoaXMuc291cmNlRmlsZSA9IG51bGw7XG4gICAgICB0aGlzLmJsb2NrID0gbnVsbDtcbiAgICAgIHRoaXMubm9kZXMgPSBbXTtcbiAgICAgIHRoaXMucmVuZGVyKFwiT3BlbiBhIE1hcmtkb3duIGZpbGUgYW5kIHBsYWNlIHRoZSBjdXJzb3Igb24gYSBwbGFpbiBsaXN0IGl0ZW0uXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGN1cnNvciA9IHZpZXcuZWRpdG9yLmdldEN1cnNvcigpO1xuICAgIGNvbnN0IG1hcmtkb3duID0gdmlldy5nZXRWaWV3RGF0YSgpO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlT3V0bGluZUF0TGluZShtYXJrZG93biwgY3Vyc29yLmxpbmUsIHsgaW5kZW50VW5pdDogdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5kZW50VW5pdCB9KTtcbiAgICB0aGlzLnNvdXJjZUZpbGUgPSB2aWV3LmZpbGU7XG4gICAgaWYgKCFwYXJzZWQub2spIHtcbiAgICAgIHRoaXMuYmxvY2sgPSBudWxsO1xuICAgICAgdGhpcy5ub2RlcyA9IFtdO1xuICAgICAgdGhpcy5yZW5kZXIocGFyc2VkLnJlYXNvbik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgcHJldmlvdXNTZWxlY3Rpb24gPSBuZXcgU2V0KHRoaXMuc2VsZWN0ZWRJZHMpO1xuICAgIHRoaXMuYmxvY2sgPSBwYXJzZWQuYmxvY2s7XG4gICAgdGhpcy5ub2RlcyA9IHBhcnNlZC5ibG9jay5ub2RlcztcbiAgICBjb25zdCBzdGF0ZSA9IHJlYWRNaW5kbWFwU3RhdGUobWFya2Rvd24pO1xuICAgIHRoaXMuY29sbGFwc2VkSWRzID0gbmV3IFNldChzdGF0ZS5ibG9ja3NbcGFyc2VkLmJsb2NrLmJsb2NrSGFzaF0/LmNvbGxhcHNlZElkcyA/PyBbXSk7XG4gICAgdGhpcy5zZWxlY3RlZElkcyA9IG9wdGlvbnMucHJlc2VydmVTZWxlY3Rpb25cbiAgICAgID8gbmV3IFNldChbLi4ucHJldmlvdXNTZWxlY3Rpb25dLmZpbHRlcigoaWQpID0+IGZpbmROb2RlKHRoaXMubm9kZXMsIGlkKSkpXG4gICAgICA6IG5ldyBTZXQoW3RoaXMubm9kZXNbMF0/LmlkXS5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IEJvb2xlYW4oaWQpKSk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIGZvY3VzU2VsZWN0ZWROb2RlKCk6IHZvaWQge1xuICAgIGNvbnN0IGlkID0gWy4uLnRoaXMuc2VsZWN0ZWRJZHNdWzBdO1xuICAgIGlmICghaWQpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJObyBtaW5kbWFwIG5vZGUgc2VsZWN0ZWQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBpbnB1dCA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oYGlucHV0W2RhdGEtbm9kZS1pZD1cIiR7Y3NzRXNjYXBlKGlkKX1cIl1gKTtcbiAgICBpbnB1dD8uZm9jdXMoKTtcbiAgICBpbnB1dD8uc2VsZWN0KCk7XG4gIH1cblxuICBhc3luYyBwcm9tcHRJbmR1Y2VQYXJlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHRoaXMuc2VsZWN0ZWRJZHMuc2l6ZSA8IDIpIHtcbiAgICAgIG5ldyBOb3RpY2UoXCJTZWxlY3QgYXQgbGVhc3QgdHdvIGFkamFjZW50IHNpYmxpbmcgbm9kZXMuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBuZXcgUGFyZW50VGl0bGVNb2RhbCh0aGlzLmFwcCwgXCJcdTVGNTJcdTdFQjNcIiwgKHRpdGxlKSA9PiB7XG4gICAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKGluZHVjZVBhcmVudEZyb21TZWxlY3RlZCh0aGlzLm5vZGVzLCBbLi4udGhpcy5zZWxlY3RlZElkc10sIHRpdGxlIHx8IFwiXHU1RjUyXHU3RUIzXCIpKTtcbiAgICB9KS5vcGVuKCk7XG4gIH1cblxuICBwcml2YXRlIHJlbmRlcihzdGF0dXM/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuZW1wdHkoKTtcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoXCJsb2NhbC1taW5kbWFwLXdvcmtiZW5jaFwiKTtcblxuICAgIGNvbnN0IHRvb2xiYXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtdG9vbGJhclwiIH0pO1xuICAgIHRvb2xiYXIuY3JlYXRlRGl2KHtcbiAgICAgIGNsczogXCJsb2NhbC1taW5kbWFwLXRpdGxlXCIsXG4gICAgICB0ZXh0OiB0aGlzLnNvdXJjZUZpbGUgPyB0aGlzLnNvdXJjZUZpbGUuYmFzZW5hbWUgOiBcIk1pbmRtYXAgV29ya2JlbmNoXCJcbiAgICB9KTtcbiAgICB0b29sYmFyLmNyZWF0ZURpdih7XG4gICAgICBjbHM6IFwibG9jYWwtbWluZG1hcC1zdWJ0aXRsZVwiLFxuICAgICAgdGV4dDogdGhpcy5ibG9ja1xuICAgICAgICA/IGAke3RoaXMuc291cmNlRmlsZT8ucGF0aCA/PyBcIlwifSBcdTAwQjcgbGluZXMgJHt0aGlzLmJsb2NrLnN0YXJ0TGluZSArIDF9LSR7dGhpcy5ibG9jay5lbmRMaW5lICsgMX1gXG4gICAgICAgIDogXCJQbGFjZSB0aGUgY3Vyc29yIG9uIGEgcGxhaW4gTWFya2Rvd24gbGlzdCBpdGVtLlwiXG4gICAgfSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiUmVmcmVzaFwiLCAoKSA9PiB0aGlzLmxvYWRGcm9tQWN0aXZlTWFya2Rvd24oKSk7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiSW5kdWNlIHBhcmVudFwiLCAoKSA9PiB0aGlzLnByb21wdEluZHVjZVBhcmVudCgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPj0gMik7XG4gICAgdGhpcy5hZGRUb29sYmFyQnV0dG9uKHRvb2xiYXIsIFwiRm9jdXNcIiwgKCkgPT4gdGhpcy5mb2N1c1NlbGVjdGVkTm9kZSgpLCB0aGlzLnNlbGVjdGVkSWRzLnNpemUgPiAwKTtcbiAgICB0aGlzLmFkZFRvb2xiYXJCdXR0b24odG9vbGJhciwgXCItXCIsICgpID0+IHRoaXMuc2V0U2NhbGUodGhpcy5zY2FsZSAtIDAuMSkpO1xuICAgIHRoaXMuYWRkVG9vbGJhckJ1dHRvbih0b29sYmFyLCBcIitcIiwgKCkgPT4gdGhpcy5zZXRTY2FsZSh0aGlzLnNjYWxlICsgMC4xKSk7XG5cbiAgICBpZiAoc3RhdHVzKSB7XG4gICAgICBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtZW1wdHlcIiwgdGV4dDogc3RhdHVzIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuYmxvY2sgfHwgdGhpcy5ub2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6IFwibG9jYWwtbWluZG1hcC1lbXB0eVwiLCB0ZXh0OiBcIk5vIG91dGxpbmUgYmxvY2sgbG9hZGVkLlwiIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YWdlID0gY29udGVudEVsLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN0YWdlXCIgfSk7XG4gICAgY29uc3Qgc3VyZmFjZSA9IHN0YWdlLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLXN1cmZhY2VcIiB9KTtcbiAgICBzdXJmYWNlLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZSgke3RoaXMuc2NhbGV9KWA7XG4gICAgc3VyZmFjZS5zdHlsZS50cmFuc2Zvcm1PcmlnaW4gPSBcInRvcCBsZWZ0XCI7XG4gICAgY29uc3QgbGF5b3V0cyA9IGxheW91dE5vZGVzKHRoaXMubm9kZXMsIHRoaXMuY29sbGFwc2VkSWRzKTtcbiAgICBjb25zdCBtYXhYID0gTWF0aC5tYXgoLi4ubGF5b3V0cy5tYXAoKGVudHJ5KSA9PiBlbnRyeS54KSwgMCkgKyAzMjA7XG4gICAgY29uc3QgbWF4WSA9IE1hdGgubWF4KC4uLmxheW91dHMubWFwKChlbnRyeSkgPT4gZW50cnkueSksIDApICsgMTIwO1xuICAgIHN1cmZhY2Uuc3R5bGUud2lkdGggPSBgJHttYXhYfXB4YDtcbiAgICBzdXJmYWNlLnN0eWxlLmhlaWdodCA9IGAke21heFl9cHhgO1xuXG4gICAgY29uc3Qgc3ZnID0gc3VyZmFjZS5jcmVhdGVTdmcoXCJzdmdcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1saW5rc1wiIH0pO1xuICAgIHN2Zy5zZXRBdHRyKFwid2lkdGhcIiwgU3RyaW5nKG1heFgpKTtcbiAgICBzdmcuc2V0QXR0cihcImhlaWdodFwiLCBTdHJpbmcobWF4WSkpO1xuICAgIGZvciAoY29uc3QgbGF5b3V0IG9mIGxheW91dHMpIHtcbiAgICAgIGlmICghbGF5b3V0LnBhcmVudElkKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHBhcmVudCA9IGxheW91dHMuZmluZCgoZW50cnkpID0+IGVudHJ5Lm5vZGUuaWQgPT09IGxheW91dC5wYXJlbnRJZCk7XG4gICAgICBpZiAoIXBhcmVudCkgY29udGludWU7XG4gICAgICBjb25zdCBwYXRoID0gc3ZnLmNyZWF0ZVN2ZyhcInBhdGhcIik7XG4gICAgICBjb25zdCBzdGFydFggPSBwYXJlbnQueCArIDIyMDtcbiAgICAgIGNvbnN0IHN0YXJ0WSA9IHBhcmVudC55ICsgMjg7XG4gICAgICBjb25zdCBlbmRYID0gbGF5b3V0Lng7XG4gICAgICBjb25zdCBlbmRZID0gbGF5b3V0LnkgKyAyODtcbiAgICAgIGNvbnN0IG1pZFggPSBzdGFydFggKyBNYXRoLm1heCg0MCwgKGVuZFggLSBzdGFydFgpIC8gMik7XG4gICAgICBwYXRoLnNldEF0dHIoXCJkXCIsIGBNICR7c3RhcnRYfSAke3N0YXJ0WX0gQyAke21pZFh9ICR7c3RhcnRZfSwgJHttaWRYfSAke2VuZFl9LCAke2VuZFh9ICR7ZW5kWX1gKTtcbiAgICAgIHBhdGguc2V0QXR0cihcImNsYXNzXCIsIFwibG9jYWwtbWluZG1hcC1saW5rXCIpO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgbGF5b3V0IG9mIGxheW91dHMpIHtcbiAgICAgIHRoaXMucmVuZGVyTm9kZShzdXJmYWNlLCBsYXlvdXQpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyTm9kZShzdXJmYWNlOiBIVE1MRWxlbWVudCwgbGF5b3V0OiBOb2RlTGF5b3V0KTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IGxheW91dC5ub2RlO1xuICAgIGNvbnN0IHNlbGVjdGVkID0gdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZS5pZCk7XG4gICAgY29uc3QgY2FyZCA9IHN1cmZhY2UuY3JlYXRlRGl2KHsgY2xzOiBzZWxlY3RlZCA/IFwibG9jYWwtbWluZG1hcC1ub2RlIGlzLXNlbGVjdGVkXCIgOiBcImxvY2FsLW1pbmRtYXAtbm9kZVwiIH0pO1xuICAgIGNhcmQuc3R5bGUubGVmdCA9IGAke2xheW91dC54fXB4YDtcbiAgICBjYXJkLnN0eWxlLnRvcCA9IGAke2xheW91dC55fXB4YDtcbiAgICBjYXJkLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZXZlbnQpID0+IHtcbiAgICAgIGlmICgoZXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KS50YWdOYW1lID09PSBcIklOUFVUXCIgfHwgKGV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkudGFnTmFtZSA9PT0gXCJCVVRUT05cIikgcmV0dXJuO1xuICAgICAgdGhpcy5zZWxlY3ROb2RlKG5vZGUuaWQsIGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuY3RybEtleSB8fCBldmVudC5zaGlmdEtleSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCByb3cgPSBjYXJkLmNyZWF0ZURpdih7IGNsczogXCJsb2NhbC1taW5kbWFwLW5vZGUtcm93XCIgfSk7XG4gICAgY29uc3Qgc2VsZWN0ID0gcm93LmNyZWF0ZUVsKFwiaW5wdXRcIiwgeyBjbHM6IFwibG9jYWwtbWluZG1hcC1zZWxlY3RcIiB9KTtcbiAgICBzZWxlY3QudHlwZSA9IFwiY2hlY2tib3hcIjtcbiAgICBzZWxlY3QuY2hlY2tlZCA9IHNlbGVjdGVkO1xuICAgIHNlbGVjdC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsICgpID0+IHRoaXMuc2VsZWN0Tm9kZShub2RlLmlkLCB0cnVlKSk7XG5cbiAgICBjb25zdCBjb2xsYXBzZSA9IHJvdy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLWNvbGxhcHNlXCIsIHRleHQ6IG5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCA/ICh0aGlzLmNvbGxhcHNlZElkcy5oYXMobm9kZS5pZCkgPyBcIitcIiA6IFwiLVwiKSA6IFwiXCIgfSk7XG4gICAgY29sbGFwc2UudHlwZSA9IFwiYnV0dG9uXCI7XG4gICAgY29sbGFwc2UuZGlzYWJsZWQgPSBub2RlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcbiAgICBjb2xsYXBzZS5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKGV2ZW50KSA9PiB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICB0aGlzLnRvZ2dsZUNvbGxhcHNlKG5vZGUuaWQpO1xuICAgIH0pO1xuXG4gICAgY29uc3QgaW5wdXQgPSByb3cuY3JlYXRlRWwoXCJpbnB1dFwiLCB7IGNsczogXCJsb2NhbC1taW5kbWFwLW5vZGUtdGl0bGVcIiB9KTtcbiAgICBpbnB1dC5kYXRhc2V0Lm5vZGVJZCA9IG5vZGUuaWQ7XG4gICAgaW5wdXQudmFsdWUgPSBub2RlLnRpdGxlO1xuICAgIGlucHV0LnBsYWNlaG9sZGVyID0gXCJVbnRpdGxlZFwiO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJmb2N1c1wiLCAoKSA9PiB0aGlzLnNlbGVjdE5vZGUobm9kZS5pZCwgZmFsc2UpKTtcbiAgICBpbnB1dC5hZGRFdmVudExpc3RlbmVyKFwiYmx1clwiLCAoKSA9PiB0aGlzLmNvbW1pdFRpdGxlKG5vZGUuaWQsIGlucHV0LnZhbHVlKSk7XG4gICAgaW5wdXQuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGV2ZW50KSA9PiB0aGlzLmhhbmRsZU5vZGVLZXlkb3duKGV2ZW50LCBub2RlLmlkLCBpbnB1dCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVOb2RlS2V5ZG93bihldmVudDogS2V5Ym9hcmRFdmVudCwgbm9kZUlkOiBzdHJpbmcsIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50KTogdm9pZCB7XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJFbnRlclwiKSB7XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5jb21taXRUaXRsZShub2RlSWQsIGlucHV0LnZhbHVlLCB7IHNraXBSZW5kZXI6IHRydWUgfSk7XG4gICAgICB0aGlzLmFwcGx5T3BlcmF0aW9uKGluc2VydFNpYmxpbmdBZnRlcih0aGlzLm5vZGVzLCBub2RlSWQsIFwiXCIpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGV2ZW50LmtleSA9PT0gXCJUYWJcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHRoaXMuY29tbWl0VGl0bGUobm9kZUlkLCBpbnB1dC52YWx1ZSwgeyBza2lwUmVuZGVyOiB0cnVlIH0pO1xuICAgICAgdGhpcy5hcHBseU9wZXJhdGlvbihldmVudC5zaGlmdEtleSA/IG91dGRlbnROb2RlKHRoaXMubm9kZXMsIG5vZGVJZCkgOiBpbmRlbnROb2RlKHRoaXMubm9kZXMsIG5vZGVJZCkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoKGV2ZW50LmtleSA9PT0gXCJCYWNrc3BhY2VcIiB8fCBldmVudC5rZXkgPT09IFwiRGVsZXRlXCIpICYmIGlucHV0LnZhbHVlLnRyaW0oKSA9PT0gXCJcIikge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHRoaXMuYXBwbHlPcGVyYXRpb24oZGVsZXRlRW1wdHlOb2RlKHRoaXMubm9kZXMsIG5vZGVJZCkpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY29tbWl0VGl0bGUobm9kZUlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIG9wdGlvbnM6IHsgc2tpcFJlbmRlcj86IGJvb2xlYW4gfSA9IHt9KTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IGZpbmROb2RlKHRoaXMubm9kZXMsIG5vZGVJZCk7XG4gICAgaWYgKCFub2RlIHx8IG5vZGUudGl0bGUgPT09IHRpdGxlKSByZXR1cm47XG4gICAgdGhpcy5hcHBseU9wZXJhdGlvbih1cGRhdGVOb2RlVGl0bGUodGhpcy5ub2Rlcywgbm9kZUlkLCB0aXRsZSksIG9wdGlvbnMpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZWxlY3ROb2RlKG5vZGVJZDogc3RyaW5nLCBhZGRpdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICghYWRkaXRpdmUpIHRoaXMuc2VsZWN0ZWRJZHMuY2xlYXIoKTtcbiAgICBpZiAoYWRkaXRpdmUgJiYgdGhpcy5zZWxlY3RlZElkcy5oYXMobm9kZUlkKSkge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5kZWxldGUobm9kZUlkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zZWxlY3RlZElkcy5hZGQobm9kZUlkKTtcbiAgICB9XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgdG9nZ2xlQ29sbGFwc2Uobm9kZUlkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5jb2xsYXBzZWRJZHMuaGFzKG5vZGVJZCkpIHRoaXMuY29sbGFwc2VkSWRzLmRlbGV0ZShub2RlSWQpO1xuICAgIGVsc2UgdGhpcy5jb2xsYXBzZWRJZHMuYWRkKG5vZGVJZCk7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB2b2lkIHRoaXMucGVyc2lzdENvbGxhcHNlU3RhdGUoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0U2NhbGUobmV4dDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5zY2FsZSA9IE1hdGgubWluKDEuOCwgTWF0aC5tYXgoMC41LCBOdW1iZXIobmV4dC50b0ZpeGVkKDIpKSkpO1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5T3BlcmF0aW9uKHJlc3VsdDogT3V0bGluZU9wZXJhdGlvblJlc3VsdCwgb3B0aW9uczogeyBza2lwUmVuZGVyPzogYm9vbGVhbiB9ID0ge30pOiB2b2lkIHtcbiAgICBpZiAoIXJlc3VsdC5vaykge1xuICAgICAgbmV3IE5vdGljZShyZXN1bHQucmVhc29uKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5ub2RlcyA9IHJlc3VsdC5ub2RlcztcbiAgICB0aGlzLnNlbGVjdGVkSWRzID0gbmV3IFNldChyZXN1bHQuZm9jdXNJZCA/IFtyZXN1bHQuZm9jdXNJZF0gOiBbLi4udGhpcy5zZWxlY3RlZElkc10uZmlsdGVyKChpZCkgPT4gZmluZE5vZGUodGhpcy5ub2RlcywgaWQpKSk7XG4gICAgY29uc3Qgd3JpdHRlbiA9IHRoaXMud3JpdGVOb2Rlc1RvTWFya2Rvd24oKTtcbiAgICBpZiAoIXdyaXR0ZW4pIHJldHVybjtcbiAgICBpZiAoIW9wdGlvbnMuc2tpcFJlbmRlcikgdGhpcy5yZW5kZXIoKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzU2VsZWN0ZWROb2RlKCksIDApO1xuICB9XG5cbiAgcHJpdmF0ZSB3cml0ZU5vZGVzVG9NYXJrZG93bigpOiBib29sZWFuIHtcbiAgICBpZiAoIXRoaXMuc291cmNlRmlsZSB8fCAhdGhpcy5ibG9jaykge1xuICAgICAgbmV3IE5vdGljZShcIk5vIHNvdXJjZSBvdXRsaW5lIGJsb2NrIGxvYWRlZC5cIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG1hcmtkb3duVmlldyA9IHRoaXMucGx1Z2luLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgY29uc3QgbmV4dEJsb2NrID0gc2VyaWFsaXplT3V0bGluZSh0aGlzLm5vZGVzLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmRlbnRVbml0KTtcbiAgICBpZiAobWFya2Rvd25WaWV3KSB7XG4gICAgICByZXBsYWNlRWRpdG9yQmxvY2sobWFya2Rvd25WaWV3LmVkaXRvciwgdGhpcy5ibG9jaywgbmV4dEJsb2NrKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdm9pZCB0aGlzLnBsdWdpbi5hcHAudmF1bHQuY2FjaGVkUmVhZCh0aGlzLnNvdXJjZUZpbGUpLnRoZW4oKG1hcmtkb3duKSA9PiB7XG4gICAgICAgIGNvbnN0IG5leHQgPSByZXBsYWNlT3V0bGluZUJsb2NrKG1hcmtkb3duLCB0aGlzLmJsb2NrISwgdGhpcy5ub2Rlcywge1xuICAgICAgICAgIGluZGVudFVuaXQ6IHRoaXMucGx1Z2luLnNldHRpbmdzLmluZGVudFVuaXRcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzLnBsdWdpbi5hcHAudmF1bHQubW9kaWZ5KHRoaXMuc291cmNlRmlsZSEsIG5leHQpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHRoaXMuYmxvY2sgPSB7XG4gICAgICAuLi50aGlzLmJsb2NrLFxuICAgICAgZW5kTGluZTogdGhpcy5ibG9jay5zdGFydExpbmUgKyBuZXh0QmxvY2suc3BsaXQoXCJcXG5cIikubGVuZ3RoIC0gMSxcbiAgICAgIG1hcmtkb3duOiBuZXh0QmxvY2ssXG4gICAgICBibG9ja0hhc2g6IGhhc2hPdXRsaW5lQmxvY2sobmV4dEJsb2NrKVxuICAgIH07XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHBlcnNpc3RDb2xsYXBzZVN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zb3VyY2VGaWxlIHx8ICF0aGlzLmJsb2NrIHx8ICF0aGlzLnBsdWdpbi5zZXR0aW5ncy5wZXJzaXN0Q29sbGFwc2VTdGF0ZSkgcmV0dXJuO1xuICAgIGNvbnN0IG1hcmtkb3duVmlldyA9IHRoaXMucGx1Z2luLmZpbmRNYXJrZG93blZpZXdGb3JGaWxlKHRoaXMuc291cmNlRmlsZSk7XG4gICAgY29uc3QgbWFya2Rvd24gPSBtYXJrZG93blZpZXc/LmdldFZpZXdEYXRhKCkgPz8gKGF3YWl0IHRoaXMucGx1Z2luLmFwcC52YXVsdC5jYWNoZWRSZWFkKHRoaXMuc291cmNlRmlsZSkpO1xuICAgIGNvbnN0IHN0YXRlID0gcmVhZE1pbmRtYXBTdGF0ZShtYXJrZG93bik7XG4gICAgc3RhdGUuYmxvY2tzW3RoaXMuYmxvY2suYmxvY2tIYXNoXSA9IHtcbiAgICAgIGNvbGxhcHNlZElkczogWy4uLnRoaXMuY29sbGFwc2VkSWRzXSxcbiAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgfTtcbiAgICBjb25zdCBuZXh0ID0gdXBzZXJ0TWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd24sIHN0YXRlKTtcbiAgICBpZiAobmV4dCA9PT0gbWFya2Rvd24pIHJldHVybjtcbiAgICBhd2FpdCB0aGlzLnBsdWdpbi5hcHAudmF1bHQubW9kaWZ5KHRoaXMuc291cmNlRmlsZSwgbmV4dCk7XG4gIH1cblxuICBwcml2YXRlIGFkZFRvb2xiYXJCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGV4dDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPiwgZW5hYmxlZCA9IHRydWUpOiB2b2lkIHtcbiAgICBjb25zdCBidXR0b24gPSBjb250YWluZXIuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0IH0pO1xuICAgIGJ1dHRvbi50eXBlID0gXCJidXR0b25cIjtcbiAgICBidXR0b24uZGlzYWJsZWQgPSAhZW5hYmxlZDtcbiAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIChldmVudCkgPT4ge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIHZvaWQgb25DbGljaygpO1xuICAgIH0pO1xuICB9XG59XG5cbmNsYXNzIFBhcmVudFRpdGxlTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRUaXRsZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IG9uU3VibWl0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCkge1xuICAgIHN1cGVyKGFwcCk7XG4gIH1cblxuICBvbk9wZW4oKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkluZHVjZSBwYXJlbnRcIiB9KTtcbiAgICBjb25zdCBpbnB1dCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImlucHV0XCIsIHsgY2xzOiBcImxvY2FsLW1pbmRtYXAtbW9kYWwtaW5wdXRcIiB9KTtcbiAgICBpbnB1dC52YWx1ZSA9IHRoaXMuZGVmYXVsdFRpdGxlO1xuICAgIGlucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChldmVudCkgPT4ge1xuICAgICAgaWYgKGV2ZW50LmtleSAhPT0gXCJFbnRlclwiKSByZXR1cm47XG4gICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5zdWJtaXQoaW5wdXQudmFsdWUpO1xuICAgIH0pO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbCkuYWRkQnV0dG9uKChidXR0b24pID0+XG4gICAgICBidXR0b25cbiAgICAgICAgLnNldEJ1dHRvblRleHQoXCJDb25maXJtXCIpXG4gICAgICAgIC5zZXRDdGEoKVxuICAgICAgICAub25DbGljaygoKSA9PiB0aGlzLnN1Ym1pdChpbnB1dC52YWx1ZSkpXG4gICAgKTtcbiAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpbnB1dC5mb2N1cygpO1xuICAgICAgaW5wdXQuc2VsZWN0KCk7XG4gICAgfSwgMCk7XG4gIH1cblxuICBwcml2YXRlIHN1Ym1pdCh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5vblN1Ym1pdCh0aXRsZS50cmltKCkgfHwgdGhpcy5kZWZhdWx0VGl0bGUpO1xuICAgIHRoaXMuY2xvc2UoKTtcbiAgfVxufVxuXG5jbGFzcyBMb2NhbE1pbmRtYXBTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwcml2YXRlIHJlYWRvbmx5IHBsdWdpbjogTG9jYWxPYnNpZGlhbk1pbmRtYXBQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gIH1cblxuICBkaXNwbGF5KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJJbmRlbnQgdW5pdFwiKVxuICAgICAgLnNldERlc2MoXCJOdW1iZXIgb2Ygc3BhY2VzIHVzZWQgZm9yIG9uZSBvdXRsaW5lIGxldmVsLlwiKVxuICAgICAgLmFkZFRleHQoKHRleHQpID0+XG4gICAgICAgIHRleHQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmluZGVudFVuaXQpKS5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICBjb25zdCBwYXJzZWQgPSBOdW1iZXIodmFsdWUpO1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLmluZGVudFVuaXQgPSBOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSAmJiBwYXJzZWQgPiAwID8gTWF0aC5mbG9vcihwYXJzZWQpIDogREVGQVVMVF9TRVRUSU5HUy5pbmRlbnRVbml0O1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJPcGVuIGluIHJpZ2h0IHNpZGViYXJcIilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT5cbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm9wZW5JblJpZ2h0U2lkZWJhcikub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Mub3BlbkluUmlnaHRTaWRlYmFyID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlBlcnNpc3QgY29sbGFwc2Ugc3RhdGVcIilcbiAgICAgIC5zZXREZXNjKFwiU2F2ZSBmb2xkZWQgbm9kZXMgaW4gYSBoaWRkZW4gbWFuYWdlZCBibG9jayBhdCB0aGUgZW5kIG9mIHRoZSBNYXJrZG93biBmaWxlLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucGVyc2lzdENvbGxhcHNlU3RhdGUpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBlcnNpc3RDb2xsYXBzZVN0YXRlID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkZvbGxvdyBhY3RpdmUgb3V0bGluZVwiKVxuICAgICAgLnNldERlc2MoXCJSZWZyZXNoIHRoZSB3b3JrYmVuY2ggd2hlbiB0aGUgYWN0aXZlIE1hcmtkb3duIGN1cnNvciBjaGFuZ2VzLlwiKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlKSA9PlxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9sbG93QWN0aXZlT3V0bGluZSkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9sbG93QWN0aXZlT3V0bGluZSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXBsYWNlRWRpdG9yQmxvY2soZWRpdG9yOiBFZGl0b3IsIGJsb2NrOiBPdXRsaW5lQmxvY2ssIHJlcGxhY2VtZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgY29uc3QgaGFzRm9sbG93aW5nTGluZSA9IGJsb2NrLmVuZExpbmUgKyAxIDwgZWRpdG9yLmxpbmVDb3VudCgpO1xuICBjb25zdCBmcm9tID0geyBsaW5lOiBibG9jay5zdGFydExpbmUsIGNoOiAwIH07XG4gIGNvbnN0IHRvID0gaGFzRm9sbG93aW5nTGluZVxuICAgID8geyBsaW5lOiBibG9jay5lbmRMaW5lICsgMSwgY2g6IDAgfVxuICAgIDogeyBsaW5lOiBibG9jay5lbmRMaW5lLCBjaDogZWRpdG9yLmdldExpbmUoYmxvY2suZW5kTGluZSkubGVuZ3RoIH07XG4gIGVkaXRvci5yZXBsYWNlUmFuZ2UoaGFzRm9sbG93aW5nTGluZSA/IGAke3JlcGxhY2VtZW50fVxcbmAgOiByZXBsYWNlbWVudCwgZnJvbSwgdG8pO1xufVxuXG5mdW5jdGlvbiBsYXlvdXROb2Rlcyhub2RlczogT3V0bGluZU5vZGVbXSwgY29sbGFwc2VkSWRzOiBTZXQ8c3RyaW5nPik6IE5vZGVMYXlvdXRbXSB7XG4gIGNvbnN0IHJlc3VsdDogTm9kZUxheW91dFtdID0gW107XG4gIGxldCByb3cgPSAwO1xuICBjb25zdCB2aXNpdCA9IChub2RlOiBPdXRsaW5lTm9kZSwgZGVwdGg6IG51bWJlciwgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwpID0+IHtcbiAgICByZXN1bHQucHVzaCh7XG4gICAgICBub2RlLFxuICAgICAgZGVwdGgsXG4gICAgICBwYXJlbnRJZCxcbiAgICAgIHg6IDM2ICsgZGVwdGggKiAyNjAsXG4gICAgICB5OiAzNiArIHJvdyAqIDc4XG4gICAgfSk7XG4gICAgcm93ICs9IDE7XG4gICAgaWYgKGNvbGxhcHNlZElkcy5oYXMobm9kZS5pZCkpIHJldHVybjtcbiAgICBmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHZpc2l0KGNoaWxkLCBkZXB0aCArIDEsIG5vZGUuaWQpO1xuICB9O1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHZpc2l0KG5vZGUsIDAsIG51bGwpO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBmaW5kTm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lTm9kZSB8IG51bGwge1xuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4gbm9kZTtcbiAgICBjb25zdCBjaGlsZCA9IGZpbmROb2RlKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNzc0VzY2FwZSh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKHR5cGVvZiBDU1MgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIENTUy5lc2NhcGUgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIENTUy5lc2NhcGUodmFsdWUpO1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvW1wiXFxcXF0vZywgXCJcXFxcJCZcIik7XG59XG4iLCAiZXhwb3J0IGNvbnN0IE1JTkRNQVBfU1RBVEVfQkVHSU4gPSBcIjwhLS0gQkVHSU4gTE9DQUwtT0JTSURJQU4tTUlORE1BUC1TVEFURVwiO1xuZXhwb3J0IGNvbnN0IE1JTkRNQVBfU1RBVEVfRU5EID0gXCJFTkQgTE9DQUwtT0JTSURJQU4tTUlORE1BUC1TVEFURSAtLT5cIjtcblxuZXhwb3J0IGludGVyZmFjZSBPdXRsaW5lTm9kZSB7XG4gIGlkOiBzdHJpbmc7XG4gIHRpdGxlOiBzdHJpbmc7XG4gIGNoaWxkcmVuOiBPdXRsaW5lTm9kZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE91dGxpbmVCbG9jayB7XG4gIHN0YXJ0TGluZTogbnVtYmVyO1xuICBlbmRMaW5lOiBudW1iZXI7XG4gIG1hcmtkb3duOiBzdHJpbmc7XG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdO1xuICBibG9ja0hhc2g6IHN0cmluZztcbn1cblxuZXhwb3J0IHR5cGUgT3V0bGluZVBhcnNlUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBibG9jazogT3V0bGluZUJsb2NrOyB3YXJuaW5nczogc3RyaW5nW10gfVxuICB8IHsgb2s6IGZhbHNlOyByZWFzb246IHN0cmluZzsgc3RhcnRMaW5lPzogbnVtYmVyOyBlbmRMaW5lPzogbnVtYmVyIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWluZG1hcFNldHRpbmdzRGF0YSB7XG4gIHNjaGVtYVZlcnNpb246IDE7XG4gIGJsb2NrczogUmVjb3JkPHN0cmluZywgeyBjb2xsYXBzZWRJZHM6IHN0cmluZ1tdOyB1cGRhdGVkQXQ6IHN0cmluZyB9Pjtcbn1cblxuZXhwb3J0IHR5cGUgT3V0bGluZU9wZXJhdGlvblJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZTsgbm9kZXM6IE91dGxpbmVOb2RlW107IGZvY3VzSWQ/OiBzdHJpbmcgfVxuICB8IHsgb2s6IGZhbHNlOyByZWFzb246IHN0cmluZyB9O1xuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VPdXRsaW5lQXRMaW5lKFxuICBtYXJrZG93bjogc3RyaW5nLFxuICBjdXJzb3JMaW5lOiBudW1iZXIsXG4gIG9wdGlvbnM6IHsgaW5kZW50VW5pdD86IG51bWJlciB9ID0ge31cbik6IE91dGxpbmVQYXJzZVJlc3VsdCB7XG4gIGNvbnN0IGluZGVudFVuaXQgPSBvcHRpb25zLmluZGVudFVuaXQgPz8gMjtcbiAgY29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZU5ld2xpbmVzKHN0cmlwTWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd24pKTtcbiAgY29uc3QgbGluZXMgPSBub3JtYWxpemVkLnNwbGl0KFwiXFxuXCIpO1xuICBpZiAoY3Vyc29yTGluZSA8IDAgfHwgY3Vyc29yTGluZSA+PSBsaW5lcy5sZW5ndGgpIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJDdXJzb3IgaXMgb3V0c2lkZSB0aGUgZG9jdW1lbnQuXCIgfTtcbiAgfVxuXG4gIGNvbnN0IGN1cnJlbnQgPSBwYXJzZVBsYWluTGlzdEl0ZW0obGluZXNbY3Vyc29yTGluZV0sIGluZGVudFVuaXQpO1xuICBpZiAoIWN1cnJlbnQub2spIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJQdXQgdGhlIGN1cnNvciBvbiBhIHBsYWluIHVub3JkZXJlZCBsaXN0IGl0ZW0gKGAtIGl0ZW1gKSBmaXJzdC5cIiB9O1xuICB9XG5cbiAgY29uc3Qgc3RhcnRMaW5lID0gZmluZExpc3RCbG9ja1N0YXJ0KGxpbmVzLCBjdXJzb3JMaW5lKTtcbiAgY29uc3QgZW5kTGluZSA9IGZpbmRMaXN0QmxvY2tFbmQobGluZXMsIGN1cnNvckxpbmUpO1xuICBjb25zdCBibG9ja0xpbmVzID0gbGluZXMuc2xpY2Uoc3RhcnRMaW5lLCBlbmRMaW5lICsgMSk7XG4gIGNvbnN0IHBhcnNlZCA9IHBhcnNlT3V0bGluZUJsb2NrTGluZXMoYmxvY2tMaW5lcywgaW5kZW50VW5pdCk7XG4gIGlmICghcGFyc2VkLm9rKSB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IHBhcnNlZC5yZWFzb24sIHN0YXJ0TGluZSwgZW5kTGluZSB9O1xuICB9XG5cbiAgY29uc3QgbWFya2Rvd25CbG9jayA9IGJsb2NrTGluZXMuam9pbihcIlxcblwiKTtcbiAgcmV0dXJuIHtcbiAgICBvazogdHJ1ZSxcbiAgICBibG9jazoge1xuICAgICAgc3RhcnRMaW5lLFxuICAgICAgZW5kTGluZSxcbiAgICAgIG1hcmtkb3duOiBtYXJrZG93bkJsb2NrLFxuICAgICAgbm9kZXM6IHBhcnNlZC5ub2RlcyxcbiAgICAgIGJsb2NrSGFzaDogaGFzaE91dGxpbmVCbG9jayhtYXJrZG93bkJsb2NrKVxuICAgIH0sXG4gICAgd2FybmluZ3M6IFtdXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsYWNlT3V0bGluZUJsb2NrKFxuICBtYXJrZG93bjogc3RyaW5nLFxuICBibG9jazogUGljazxPdXRsaW5lQmxvY2ssIFwic3RhcnRMaW5lXCIgfCBcImVuZExpbmVcIj4sXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBvcHRpb25zOiB7IGluZGVudFVuaXQ/OiBudW1iZXIgfSA9IHt9XG4pOiBzdHJpbmcge1xuICBjb25zdCBpbmRlbnRVbml0ID0gb3B0aW9ucy5pbmRlbnRVbml0ID8/IDI7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVOZXdsaW5lcyhtYXJrZG93bik7XG4gIGNvbnN0IGhhZEZpbmFsTmV3bGluZSA9IG5vcm1hbGl6ZWQuZW5kc1dpdGgoXCJcXG5cIik7XG4gIGNvbnN0IGxpbmVzID0gbm9ybWFsaXplZC5zcGxpdChcIlxcblwiKTtcbiAgY29uc3QgcmVwbGFjZW1lbnQgPSBzZXJpYWxpemVPdXRsaW5lKG5vZGVzLCBpbmRlbnRVbml0KS5zcGxpdChcIlxcblwiKTtcbiAgbGluZXMuc3BsaWNlKGJsb2NrLnN0YXJ0TGluZSwgYmxvY2suZW5kTGluZSAtIGJsb2NrLnN0YXJ0TGluZSArIDEsIC4uLnJlcGxhY2VtZW50KTtcbiAgY29uc3QgbmV4dCA9IGxpbmVzLmpvaW4oXCJcXG5cIik7XG4gIHJldHVybiBoYWRGaW5hbE5ld2xpbmUgJiYgIW5leHQuZW5kc1dpdGgoXCJcXG5cIikgPyBgJHtuZXh0fVxcbmAgOiBuZXh0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplT3V0bGluZShub2RlczogT3V0bGluZU5vZGVbXSwgaW5kZW50VW5pdCA9IDIpOiBzdHJpbmcge1xuICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgdmlzaXQgPSAobm9kZTogT3V0bGluZU5vZGUsIGRlcHRoOiBudW1iZXIpID0+IHtcbiAgICBsaW5lcy5wdXNoKGAke1wiIFwiLnJlcGVhdChkZXB0aCAqIGluZGVudFVuaXQpfS0gJHtub2RlLnRpdGxlfWApO1xuICAgIGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikgdmlzaXQoY2hpbGQsIGRlcHRoICsgMSk7XG4gIH07XG4gIGZvciAoY29uc3Qgbm9kZSBvZiBub2RlcykgdmlzaXQobm9kZSwgMCk7XG4gIHJldHVybiBsaW5lcy5qb2luKFwiXFxuXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTm9kZVRpdGxlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGxvY2F0aW9uLm5vZGUudGl0bGUgPSB0aXRsZTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkOiBub2RlSWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluc2VydFNpYmxpbmdBZnRlcihcbiAgbm9kZXM6IE91dGxpbmVOb2RlW10sXG4gIG5vZGVJZDogc3RyaW5nLFxuICB0aXRsZSA9IFwiXCIsXG4gIG5ld0lkID0gY3JlYXRlR2VuZXJhdGVkTm9kZUlkKClcbik6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGxvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShsb2NhdGlvbi5pbmRleCArIDEsIDAsIHsgaWQ6IG5ld0lkLCB0aXRsZSwgY2hpbGRyZW46IFtdIH0pO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5ld0lkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbmRlbnROb2RlKG5vZGVzOiBPdXRsaW5lTm9kZVtdLCBub2RlSWQ6IHN0cmluZyk6IE91dGxpbmVPcGVyYXRpb25SZXN1bHQge1xuICBjb25zdCBuZXh0ID0gY2xvbmVOb2Rlcyhub2Rlcyk7XG4gIGNvbnN0IGxvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIG5vZGVJZCk7XG4gIGlmICghbG9jYXRpb24pIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGlmIChsb2NhdGlvbi5pbmRleCA9PT0gMCkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiQ2Fubm90IGluZGVudDogdGhlcmUgaXMgbm8gcHJldmlvdXMgc2libGluZy5cIiB9O1xuICBjb25zdCBbbm9kZV0gPSBsb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UobG9jYXRpb24uaW5kZXgsIDEpO1xuICBsb2NhdGlvbi5zaWJsaW5nc1tsb2NhdGlvbi5pbmRleCAtIDFdLmNoaWxkcmVuLnB1c2gobm9kZSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbm9kZUlkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvdXRkZW50Tm9kZShub2RlczogT3V0bGluZU5vZGVbXSwgbm9kZUlkOiBzdHJpbmcpOiBPdXRsaW5lT3BlcmF0aW9uUmVzdWx0IHtcbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbiA9IGZpbmRMb2NhdGlvbihuZXh0LCBub2RlSWQpO1xuICBpZiAoIWxvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBpZiAoIWxvY2F0aW9uLnBhcmVudElkKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJDYW5ub3Qgb3V0ZGVudCBhIHRvcC1sZXZlbCBub2RlLlwiIH07XG4gIGNvbnN0IHBhcmVudExvY2F0aW9uID0gZmluZExvY2F0aW9uKG5leHQsIGxvY2F0aW9uLnBhcmVudElkKTtcbiAgaWYgKCFwYXJlbnRMb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiUGFyZW50IG5vZGUgbm90IGZvdW5kLlwiIH07XG4gIGNvbnN0IGZyZXNoTG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFmcmVzaExvY2F0aW9uKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJOb2RlIG5vdCBmb3VuZC5cIiB9O1xuICBjb25zdCBbbm9kZV0gPSBmcmVzaExvY2F0aW9uLnNpYmxpbmdzLnNwbGljZShmcmVzaExvY2F0aW9uLmluZGV4LCAxKTtcbiAgcGFyZW50TG9jYXRpb24uc2libGluZ3Muc3BsaWNlKHBhcmVudExvY2F0aW9uLmluZGV4ICsgMSwgMCwgbm9kZSk7XG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2RlczogbmV4dCwgZm9jdXNJZDogbm9kZUlkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVFbXB0eU5vZGUobm9kZXM6IE91dGxpbmVOb2RlW10sIG5vZGVJZDogc3RyaW5nKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IG5leHQgPSBjbG9uZU5vZGVzKG5vZGVzKTtcbiAgY29uc3QgbG9jYXRpb24gPSBmaW5kTG9jYXRpb24obmV4dCwgbm9kZUlkKTtcbiAgaWYgKCFsb2NhdGlvbikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiTm9kZSBub3QgZm91bmQuXCIgfTtcbiAgaWYgKGxvY2F0aW9uLm5vZGUudGl0bGUudHJpbSgpIHx8IGxvY2F0aW9uLm5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk9ubHkgZW1wdHkgbGVhZiBub2RlcyBjYW4gYmUgZGVsZXRlZCB3aXRoIEJhY2tzcGFjZS9EZWxldGUuXCIgfTtcbiAgfVxuICBsb2NhdGlvbi5zaWJsaW5ncy5zcGxpY2UobG9jYXRpb24uaW5kZXgsIDEpO1xuICBjb25zdCBmb2N1c0lkID0gbG9jYXRpb24uc2libGluZ3NbTWF0aC5tYXgoMCwgbG9jYXRpb24uaW5kZXggLSAxKV0/LmlkID8/IGxvY2F0aW9uLnNpYmxpbmdzWzBdPy5pZDtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIG5vZGVzOiBuZXh0LCBmb2N1c0lkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbmR1Y2VQYXJlbnRGcm9tU2VsZWN0ZWQoXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBzZWxlY3RlZElkczogc3RyaW5nW10sXG4gIHRpdGxlID0gXCJcdTVGNTJcdTdFQjNcIixcbiAgbmV3SWQgPSBjcmVhdGVHZW5lcmF0ZWROb2RlSWQoKVxuKTogT3V0bGluZU9wZXJhdGlvblJlc3VsdCB7XG4gIGNvbnN0IHVuaXF1ZUlkcyA9IFsuLi5uZXcgU2V0KHNlbGVjdGVkSWRzKV07XG4gIGlmICh1bmlxdWVJZHMubGVuZ3RoIDwgMikgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiU2VsZWN0IGF0IGxlYXN0IHR3byBzaWJsaW5nIG5vZGVzLlwiIH07XG5cbiAgY29uc3QgbmV4dCA9IGNsb25lTm9kZXMobm9kZXMpO1xuICBjb25zdCBsb2NhdGlvbnMgPSB1bmlxdWVJZHMubWFwKChpZCkgPT4gZmluZExvY2F0aW9uKG5leHQsIGlkKSk7XG4gIGlmIChsb2NhdGlvbnMuc29tZSgobG9jYXRpb24pID0+ICFsb2NhdGlvbikpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlNvbWUgc2VsZWN0ZWQgbm9kZXMgbm8gbG9uZ2VyIGV4aXN0LlwiIH07XG4gIGNvbnN0IGNvbmNyZXRlID0gbG9jYXRpb25zIGFzIE5vbk51bGxhYmxlPFJldHVyblR5cGU8dHlwZW9mIGZpbmRMb2NhdGlvbj4+W107XG4gIGNvbnN0IHBhcmVudEtleSA9IGNvbmNyZXRlWzBdLnBhcmVudElkID8/IFwiX19yb290X19cIjtcbiAgaWYgKGNvbmNyZXRlLnNvbWUoKGxvY2F0aW9uKSA9PiAobG9jYXRpb24ucGFyZW50SWQgPz8gXCJfX3Jvb3RfX1wiKSAhPT0gcGFyZW50S2V5KSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlJldmVyc2UgaW5kdWN0aW9uIG9ubHkgc3VwcG9ydHMgbm9kZXMgd2l0aCB0aGUgc2FtZSBwYXJlbnQuXCIgfTtcbiAgfVxuXG4gIGNvbnN0IHNpYmxpbmdzID0gY29uY3JldGVbMF0uc2libGluZ3M7XG4gIGlmIChjb25jcmV0ZS5zb21lKChsb2NhdGlvbikgPT4gbG9jYXRpb24uc2libGluZ3MgIT09IHNpYmxpbmdzKSkge1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlJldmVyc2UgaW5kdWN0aW9uIG9ubHkgc3VwcG9ydHMgbm9kZXMgd2l0aCB0aGUgc2FtZSBwYXJlbnQuXCIgfTtcbiAgfVxuXG4gIGNvbnN0IHNvcnRlZCA9IGNvbmNyZXRlLnNsaWNlKCkuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICBmb3IgKGxldCBpbmRleCA9IDE7IGluZGV4IDwgc29ydGVkLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgIGlmIChzb3J0ZWRbaW5kZXhdLmluZGV4ICE9PSBzb3J0ZWRbaW5kZXggLSAxXS5pbmRleCArIDEpIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlJldmVyc2UgaW5kdWN0aW9uIG9ubHkgc3VwcG9ydHMgYWRqYWNlbnQgc2libGluZyBub2Rlcy5cIiB9O1xuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGZpcnN0SW5kZXggPSBzb3J0ZWRbMF0uaW5kZXg7XG4gIGNvbnN0IHNlbGVjdGVkTm9kZXMgPSBzaWJsaW5ncy5zcGxpY2UoZmlyc3RJbmRleCwgc29ydGVkLmxlbmd0aCk7XG4gIHNpYmxpbmdzLnNwbGljZShmaXJzdEluZGV4LCAwLCB7IGlkOiBuZXdJZCwgdGl0bGUsIGNoaWxkcmVuOiBzZWxlY3RlZE5vZGVzIH0pO1xuICByZXR1cm4geyBvazogdHJ1ZSwgbm9kZXM6IG5leHQsIGZvY3VzSWQ6IG5ld0lkIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdHJpcE1pbmRtYXBTdGF0ZUJsb2NrKG1hcmtkb3duOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pLnJlcGxhY2UobWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKSwgXCJcIikucmVwbGFjZSgvXFxuezMsfSQvZywgXCJcXG5cXG5cIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkTWluZG1hcFN0YXRlKG1hcmtkb3duOiBzdHJpbmcpOiBNaW5kbWFwU2V0dGluZ3NEYXRhIHtcbiAgY29uc3QgbWF0Y2ggPSBtaW5kbWFwU3RhdGVCbG9ja1JlZ0V4cCgpLmV4ZWMobm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuIGVtcHR5TWluZG1hcFN0YXRlKCk7XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShtYXRjaFsxXS50cmltKCkpIGFzIE1pbmRtYXBTZXR0aW5nc0RhdGE7XG4gICAgaWYgKHBhcnNlZC5zY2hlbWFWZXJzaW9uICE9PSAxIHx8IHR5cGVvZiBwYXJzZWQuYmxvY2tzICE9PSBcIm9iamVjdFwiIHx8IHBhcnNlZC5ibG9ja3MgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBlbXB0eU1pbmRtYXBTdGF0ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZW1wdHlNaW5kbWFwU3RhdGUoKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBzZXJ0TWluZG1hcFN0YXRlQmxvY2sobWFya2Rvd246IHN0cmluZywgc3RhdGU6IE1pbmRtYXBTZXR0aW5nc0RhdGEpOiBzdHJpbmcge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pLnRyaW1FbmQoKTtcbiAgY29uc3QgYmxvY2sgPSBgJHtNSU5ETUFQX1NUQVRFX0JFR0lOfVxcbiR7SlNPTi5zdHJpbmdpZnkoc3RhdGUsIG51bGwsIDIpfVxcbiR7TUlORE1BUF9TVEFURV9FTkR9YDtcbiAgaWYgKG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCkudGVzdChub3JtYWxpemVkKSkge1xuICAgIHJldHVybiBgJHtub3JtYWxpemVkLnJlcGxhY2UobWluZG1hcFN0YXRlQmxvY2tSZWdFeHAoKSwgYmxvY2spfVxcbmA7XG4gIH1cbiAgcmV0dXJuIGAke25vcm1hbGl6ZWR9XFxuXFxuJHtibG9ja31cXG5gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaE91dGxpbmVCbG9jayhtYXJrZG93bjogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IGhhc2ggPSAyMTY2MTM2MjYxO1xuICBmb3IgKGNvbnN0IGNoYXIgb2Ygbm9ybWFsaXplTmV3bGluZXMobWFya2Rvd24pKSB7XG4gICAgaGFzaCBePSBjaGFyLmNoYXJDb2RlQXQoMCk7XG4gICAgaGFzaCA9IE1hdGguaW11bChoYXNoLCAxNjc3NzYxOSk7XG4gIH1cbiAgcmV0dXJuIChoYXNoID4+PiAwKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgXCIwXCIpO1xufVxuXG5mdW5jdGlvbiBwYXJzZU91dGxpbmVCbG9ja0xpbmVzKFxuICBibG9ja0xpbmVzOiBzdHJpbmdbXSxcbiAgaW5kZW50VW5pdDogbnVtYmVyXG4pOiB7IG9rOiB0cnVlOyBub2RlczogT3V0bGluZU5vZGVbXSB9IHwgeyBvazogZmFsc2U7IHJlYXNvbjogc3RyaW5nIH0ge1xuICBjb25zdCByb290czogT3V0bGluZU5vZGVbXSA9IFtdO1xuICBjb25zdCBzdGFjazogQXJyYXk8eyBub2RlOiBPdXRsaW5lTm9kZTsgZGVwdGg6IG51bWJlciB9PiA9IFtdO1xuICBsZXQgcHJldmlvdXNEZXB0aCA9IDA7XG5cbiAgZm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgYmxvY2tMaW5lcy5sZW5ndGg7IGxpbmVJbmRleCArPSAxKSB7XG4gICAgY29uc3QgcGFyc2VkID0gcGFyc2VQbGFpbkxpc3RJdGVtKGJsb2NrTGluZXNbbGluZUluZGV4XSwgaW5kZW50VW5pdCk7XG4gICAgaWYgKCFwYXJzZWQub2spIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBwYXJzZWQucmVhc29uIH07XG4gICAgaWYgKGxpbmVJbmRleCA9PT0gMCAmJiBwYXJzZWQuZGVwdGggIT09IDApIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIlRoZSBvdXRsaW5lIGJsb2NrIG11c3Qgc3RhcnQgYXQgZGVwdGggMC5cIiB9O1xuICAgIGlmIChwYXJzZWQuZGVwdGggPiBwcmV2aW91c0RlcHRoICsgMSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiSW5kZW50YXRpb24ganVtcHMgbW9yZSB0aGFuIG9uZSBsZXZlbC5cIiB9O1xuICAgIGNvbnN0IHBhcmVudCA9IHBhcnNlZC5kZXB0aCA9PT0gMCA/IG51bGwgOiBzdGFja1twYXJzZWQuZGVwdGggLSAxXT8ubm9kZTtcbiAgICBpZiAocGFyc2VkLmRlcHRoID4gMCAmJiAhcGFyZW50KSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJNaXNzaW5nIHBhcmVudCBsaXN0IGl0ZW0uXCIgfTtcbiAgICBjb25zdCBzaWJsaW5ncyA9IHBhcmVudCA/IHBhcmVudC5jaGlsZHJlbiA6IHJvb3RzO1xuICAgIGNvbnN0IG5vZGU6IE91dGxpbmVOb2RlID0ge1xuICAgICAgaWQ6IGBuLSR7Wy4uLnN0YWNrLnNsaWNlKDAsIHBhcnNlZC5kZXB0aCkubWFwKChlbnRyeSkgPT4gZW50cnkubm9kZS5pZCksIHNpYmxpbmdzLmxlbmd0aF0uam9pbihcIi1cIil9YCxcbiAgICAgIHRpdGxlOiBwYXJzZWQudGl0bGUsXG4gICAgICBjaGlsZHJlbjogW11cbiAgICB9O1xuICAgIHNpYmxpbmdzLnB1c2gobm9kZSk7XG4gICAgc3RhY2tbcGFyc2VkLmRlcHRoXSA9IHsgbm9kZSwgZGVwdGg6IHBhcnNlZC5kZXB0aCB9O1xuICAgIHN0YWNrLmxlbmd0aCA9IHBhcnNlZC5kZXB0aCArIDE7XG4gICAgcHJldmlvdXNEZXB0aCA9IHBhcnNlZC5kZXB0aDtcbiAgfVxuXG4gIHJldHVybiB7IG9rOiB0cnVlLCBub2Rlczogcm9vdHMgfTtcbn1cblxuZnVuY3Rpb24gcGFyc2VQbGFpbkxpc3RJdGVtKFxuICBsaW5lOiBzdHJpbmcsXG4gIGluZGVudFVuaXQ6IG51bWJlclxuKTpcbiAgfCB7IG9rOiB0cnVlOyBkZXB0aDogbnVtYmVyOyB0aXRsZTogc3RyaW5nIH1cbiAgfCB7IG9rOiBmYWxzZTsgcmVhc29uOiBzdHJpbmcgfSB7XG4gIGlmICgvXlxccypcXGQrXFwuXFxzKy8udGVzdChsaW5lKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiT3JkZXJlZCBsaXN0cyBhcmUgbm90IHN1cHBvcnRlZCBpbiB2MS5cIiB9O1xuICBjb25zdCBtYXRjaCA9IGxpbmUubWF0Y2goL14oXFxzKiktXFxzPyguKikkLyk7XG4gIGlmICghbWF0Y2gpIHJldHVybiB7IG9rOiBmYWxzZSwgcmVhc29uOiBcIk9ubHkgcGxhaW4gdW5vcmRlcmVkIGxpc3QgaXRlbXMgYXJlIHN1cHBvcnRlZC5cIiB9O1xuICBjb25zdCBpbmRlbnQgPSBtYXRjaFsxXTtcbiAgaWYgKGluZGVudC5pbmNsdWRlcyhcIlxcdFwiKSkgcmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb246IFwiVGFiIGluZGVudGF0aW9uIGlzIG5vdCBzdXBwb3J0ZWQ7IHVzZSBzcGFjZXMuXCIgfTtcbiAgaWYgKGluZGVudC5sZW5ndGggJSBpbmRlbnRVbml0ICE9PSAwKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogYEluZGVudGF0aW9uIG11c3QgdXNlICR7aW5kZW50VW5pdH0gc3BhY2VzLmAgfTtcbiAgY29uc3QgdGl0bGUgPSBtYXRjaFsyXSA/PyBcIlwiO1xuICBpZiAoL15cXFtbIHhYXVxcXVxccysvLnRlc3QodGl0bGUpKSByZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbjogXCJUYXNrIGxpc3QgaXRlbXMgYXJlIG5vdCBzdXBwb3J0ZWQgaW4gdjEuXCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIGRlcHRoOiBpbmRlbnQubGVuZ3RoIC8gaW5kZW50VW5pdCwgdGl0bGUgfTtcbn1cblxuZnVuY3Rpb24gZmluZExpc3RCbG9ja1N0YXJ0KGxpbmVzOiBzdHJpbmdbXSwgY3Vyc29yTGluZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgbGV0IGxpbmUgPSBjdXJzb3JMaW5lO1xuICB3aGlsZSAobGluZSA+IDApIHtcbiAgICBjb25zdCBwcmV2aW91cyA9IGxpbmVzW2xpbmUgLSAxXTtcbiAgICBpZiAoIXByZXZpb3VzLnRyaW0oKSkgYnJlYWs7XG4gICAgaWYgKC9eXFxzKi1cXHM/Ly50ZXN0KHByZXZpb3VzKSB8fCAvXlxccytcXFMvLnRlc3QocHJldmlvdXMpKSB7XG4gICAgICBsaW5lIC09IDE7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgYnJlYWs7XG4gIH1cbiAgcmV0dXJuIGxpbmU7XG59XG5cbmZ1bmN0aW9uIGZpbmRMaXN0QmxvY2tFbmQobGluZXM6IHN0cmluZ1tdLCBjdXJzb3JMaW5lOiBudW1iZXIpOiBudW1iZXIge1xuICBsZXQgbGluZSA9IGN1cnNvckxpbmU7XG4gIHdoaWxlIChsaW5lICsgMSA8IGxpbmVzLmxlbmd0aCkge1xuICAgIGNvbnN0IG5leHQgPSBsaW5lc1tsaW5lICsgMV07XG4gICAgaWYgKCFuZXh0LnRyaW0oKSkgYnJlYWs7XG4gICAgaWYgKC9eXFxzKi1cXHM/Ly50ZXN0KG5leHQpIHx8IC9eXFxzK1xcUy8udGVzdChuZXh0KSkge1xuICAgICAgbGluZSArPSAxO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGJyZWFrO1xuICB9XG4gIHJldHVybiBsaW5lO1xufVxuXG5mdW5jdGlvbiBmaW5kTG9jYXRpb24oXG4gIG5vZGVzOiBPdXRsaW5lTm9kZVtdLFxuICBub2RlSWQ6IHN0cmluZyxcbiAgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsXG4pOiB7IG5vZGU6IE91dGxpbmVOb2RlOyBzaWJsaW5nczogT3V0bGluZU5vZGVbXTsgaW5kZXg6IG51bWJlcjsgcGFyZW50SWQ6IHN0cmluZyB8IG51bGwgfSB8IG51bGwge1xuICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbm9kZXMubGVuZ3RoOyBpbmRleCArPSAxKSB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzW2luZGV4XTtcbiAgICBpZiAobm9kZS5pZCA9PT0gbm9kZUlkKSByZXR1cm4geyBub2RlLCBzaWJsaW5nczogbm9kZXMsIGluZGV4LCBwYXJlbnRJZCB9O1xuICAgIGNvbnN0IGNoaWxkID0gZmluZExvY2F0aW9uKG5vZGUuY2hpbGRyZW4sIG5vZGVJZCwgbm9kZS5pZCk7XG4gICAgaWYgKGNoaWxkKSByZXR1cm4gY2hpbGQ7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNsb25lTm9kZXMobm9kZXM6IE91dGxpbmVOb2RlW10pOiBPdXRsaW5lTm9kZVtdIHtcbiAgcmV0dXJuIG5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICBpZDogbm9kZS5pZCxcbiAgICB0aXRsZTogbm9kZS50aXRsZSxcbiAgICBjaGlsZHJlbjogY2xvbmVOb2Rlcyhub2RlLmNoaWxkcmVuKVxuICB9KSk7XG59XG5cbmZ1bmN0aW9uIGVtcHR5TWluZG1hcFN0YXRlKCk6IE1pbmRtYXBTZXR0aW5nc0RhdGEge1xuICByZXR1cm4geyBzY2hlbWFWZXJzaW9uOiAxLCBibG9ja3M6IHt9IH07XG59XG5cbmZ1bmN0aW9uIG1pbmRtYXBTdGF0ZUJsb2NrUmVnRXhwKCk6IFJlZ0V4cCB7XG4gIHJldHVybiBuZXcgUmVnRXhwKGAke2VzY2FwZVJlZ0V4cChNSU5ETUFQX1NUQVRFX0JFR0lOKX1cXFxcbihbXFxcXHNcXFxcU10qPylcXFxcbiR7ZXNjYXBlUmVnRXhwKE1JTkRNQVBfU1RBVEVfRU5EKX1gLCBcIm1cIik7XG59XG5cbmxldCBnZW5lcmF0ZWRJZENvdW50ZXIgPSAwO1xuZnVuY3Rpb24gY3JlYXRlR2VuZXJhdGVkTm9kZUlkKCk6IHN0cmluZyB7XG4gIGdlbmVyYXRlZElkQ291bnRlciArPSAxO1xuICByZXR1cm4gYG5vZGUtJHtEYXRlLm5vdygpLnRvU3RyaW5nKDM2KX0tJHtnZW5lcmF0ZWRJZENvdW50ZXJ9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplTmV3bGluZXModmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9cXHJcXG4vZywgXCJcXG5cIikucmVwbGFjZSgvXFxyL2csIFwiXFxuXCIpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVSZWdFeHAodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsc0JBYU87OztBQ2JBLElBQU0sc0JBQXNCO0FBQzVCLElBQU0sb0JBQW9CO0FBNkIxQixTQUFTLG1CQUNkLFVBQ0EsWUFDQSxVQUFtQyxDQUFDLEdBQ2hCO0FBQ3BCLFFBQU0sYUFBYSxRQUFRLGNBQWM7QUFDekMsUUFBTSxhQUFhLGtCQUFrQix1QkFBdUIsUUFBUSxDQUFDO0FBQ3JFLFFBQU0sUUFBUSxXQUFXLE1BQU0sSUFBSTtBQUNuQyxNQUFJLGFBQWEsS0FBSyxjQUFjLE1BQU0sUUFBUTtBQUNoRCxXQUFPLEVBQUUsSUFBSSxPQUFPLFFBQVEsa0NBQWtDO0FBQUEsRUFDaEU7QUFFQSxRQUFNLFVBQVUsbUJBQW1CLE1BQU0sVUFBVSxHQUFHLFVBQVU7QUFDaEUsTUFBSSxDQUFDLFFBQVEsSUFBSTtBQUNmLFdBQU8sRUFBRSxJQUFJLE9BQU8sUUFBUSxrRUFBa0U7QUFBQSxFQUNoRztBQUVBLFFBQU0sWUFBWSxtQkFBbUIsT0FBTyxVQUFVO0FBQ3RELFFBQU0sVUFBVSxpQkFBaUIsT0FBTyxVQUFVO0FBQ2xELFFBQU0sYUFBYSxNQUFNLE1BQU0sV0FBVyxVQUFVLENBQUM7QUFDckQsUUFBTSxTQUFTLHVCQUF1QixZQUFZLFVBQVU7QUFDNUQsTUFBSSxDQUFDLE9BQU8sSUFBSTtBQUNk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
