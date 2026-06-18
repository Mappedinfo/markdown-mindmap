import {
  App,
  Editor,
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  normalizePath
} from "obsidian";
import {
  deleteEmptyNode,
  hashOutlineBlock,
  indentNode,
  induceParentFromSelected,
  insertSiblingAfter,
  outdentNode,
  parseOutlineAtLine,
  readMindmapState,
  replaceOutlineBlock,
  serializeOutline,
  updateNodeTitle,
  upsertMindmapStateBlock,
  type MindmapSettingsData,
  type OutlineBlock,
  type OutlineNode,
  type OutlineOperationResult
} from "./outline.ts";

const VIEW_TYPE_MINDMAP = "local-obsidian-mindmap-workbench";

interface LocalMindmapSettings {
  indentUnit: number;
  openInRightSidebar: boolean;
  persistCollapseState: boolean;
  followActiveOutline: boolean;
}

const DEFAULT_SETTINGS: LocalMindmapSettings = {
  indentUnit: 2,
  openInRightSidebar: true,
  persistCollapseState: true,
  followActiveOutline: true
};

interface NodeLayout {
  node: OutlineNode;
  depth: number;
  x: number;
  y: number;
  parentId: string | null;
}

export default class LocalObsidianMindmapPlugin extends Plugin {
  settings: LocalMindmapSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
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

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openMindmapForCurrentOutline(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!leaf) {
      leaf = this.settings.openInRightSidebar
        ? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true)
        : this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MindmapWorkbenchView) {
      await leaf.view.loadFromActiveMarkdown();
    }
  }

  getActiveMarkdownView(): MarkdownView | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView);
  }

  findMarkdownViewForFile(file: TFile): MarkdownView | null {
    let found: MarkdownView | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
        found = leaf.view;
      }
    });
    return found;
  }

  private refreshOpenMindmapViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) {
        void leaf.view.loadFromActiveMarkdown({ preserveSelection: true });
      }
    }
  }

  private withMindmapView(callback: (view: MindmapWorkbenchView) => void | Promise<void>): void {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!(leaf?.view instanceof MindmapWorkbenchView)) {
      new Notice("Open the Mindmap Workbench first.");
      return;
    }
    void callback(leaf.view);
  }
}

class MindmapWorkbenchView extends ItemView {
  private sourceFile: TFile | null = null;
  private block: OutlineBlock | null = null;
  private nodes: OutlineNode[] = [];
  private selectedIds = new Set<string>();
  private collapsedIds = new Set<string>();
  private scale = 1;
  private refreshTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LocalObsidianMindmapPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return "Mindmap Workbench";
  }

  getIcon(): string {
    return "git-fork";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.loadFromActiveMarkdown({ preserveSelection: true });
    }, 120);
  }

  async loadFromActiveMarkdown(options: { preserveSelection?: boolean } = {}): Promise<void> {
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
    this.selectedIds = options.preserveSelection
      ? new Set([...previousSelection].filter((id) => findNode(this.nodes, id)))
      : new Set([this.nodes[0]?.id].filter((id): id is string => Boolean(id)));
    this.render();
  }

  focusSelectedNode(): void {
    const id = [...this.selectedIds][0];
    if (!id) {
      new Notice("No mindmap node selected.");
      return;
    }
    const input = this.contentEl.querySelector<HTMLInputElement>(`input[data-node-id="${cssEscape(id)}"]`);
    input?.focus();
    input?.select();
  }

  async promptInduceParent(): Promise<void> {
    if (this.selectedIds.size < 2) {
      new Notice("Select at least two adjacent sibling nodes.");
      return;
    }
    new ParentTitleModal(this.app, "归纳", (title) => {
      this.applyOperation(induceParentFromSelected(this.nodes, [...this.selectedIds], title || "归纳"));
    }).open();
  }

  private render(status?: string): void {
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
      text: this.block
        ? `${this.sourceFile?.path ?? ""} · lines ${this.block.startLine + 1}-${this.block.endLine + 1}`
        : "Place the cursor on a plain Markdown list item."
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

  private renderNode(surface: HTMLElement, layout: NodeLayout): void {
    const node = layout.node;
    const selected = this.selectedIds.has(node.id);
    const card = surface.createDiv({ cls: selected ? "local-mindmap-node is-selected" : "local-mindmap-node" });
    card.style.left = `${layout.x}px`;
    card.style.top = `${layout.y}px`;
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).tagName === "INPUT" || (event.target as HTMLElement).tagName === "BUTTON") return;
      this.selectNode(node.id, event.metaKey || event.ctrlKey || event.shiftKey);
    });

    const row = card.createDiv({ cls: "local-mindmap-node-row" });
    const select = row.createEl("input", { cls: "local-mindmap-select" });
    select.type = "checkbox";
    select.checked = selected;
    select.addEventListener("change", () => this.selectNode(node.id, true));

    const collapse = row.createEl("button", { cls: "local-mindmap-collapse", text: node.children.length > 0 ? (this.collapsedIds.has(node.id) ? "+" : "-") : "" });
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

  private handleNodeKeydown(event: KeyboardEvent, nodeId: string, input: HTMLInputElement): void {
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

  private commitTitle(nodeId: string, title: string, options: { skipRender?: boolean } = {}): void {
    const node = findNode(this.nodes, nodeId);
    if (!node || node.title === title) return;
    this.applyOperation(updateNodeTitle(this.nodes, nodeId, title), options);
  }

  private selectNode(nodeId: string, additive: boolean): void {
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
    } else {
      this.selectedIds.add(nodeId);
    }
    this.render();
  }

  private toggleCollapse(nodeId: string): void {
    if (this.collapsedIds.has(nodeId)) this.collapsedIds.delete(nodeId);
    else this.collapsedIds.add(nodeId);
    this.render();
    void this.persistCollapseState();
  }

  private setScale(next: number): void {
    this.scale = Math.min(1.8, Math.max(0.5, Number(next.toFixed(2))));
    this.render();
  }

  private applyOperation(result: OutlineOperationResult, options: { skipRender?: boolean } = {}): void {
    if (!result.ok) {
      new Notice(result.reason);
      return;
    }
    this.nodes = result.nodes;
    this.selectedIds = new Set(result.focusId ? [result.focusId] : [...this.selectedIds].filter((id) => findNode(this.nodes, id)));
    const written = this.writeNodesToMarkdown();
    if (!written) return;
    if (!options.skipRender) this.render();
    window.setTimeout(() => this.focusSelectedNode(), 0);
  }

  private writeNodesToMarkdown(): boolean {
    if (!this.sourceFile || !this.block) {
      new Notice("No source outline block loaded.");
      return false;
    }
    const markdownView = this.plugin.findMarkdownViewForFile(this.sourceFile);
    const nextBlock = serializeOutline(this.nodes, this.plugin.settings.indentUnit);
    if (markdownView) {
      replaceEditorBlock(markdownView.editor, this.block, nextBlock);
    } else {
      void this.plugin.app.vault.cachedRead(this.sourceFile).then((markdown) => {
        const next = replaceOutlineBlock(markdown, this.block!, this.nodes, {
          indentUnit: this.plugin.settings.indentUnit
        });
        return this.plugin.app.vault.modify(this.sourceFile!, next);
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

  private async persistCollapseState(): Promise<void> {
    if (!this.sourceFile || !this.block || !this.plugin.settings.persistCollapseState) return;
    const markdownView = this.plugin.findMarkdownViewForFile(this.sourceFile);
    const markdown = markdownView?.getViewData() ?? (await this.plugin.app.vault.cachedRead(this.sourceFile));
    const state = readMindmapState(markdown);
    state.blocks[this.block.blockHash] = {
      collapsedIds: [...this.collapsedIds],
      updatedAt: new Date().toISOString()
    };
    const next = upsertMindmapStateBlock(markdown, state);
    if (next === markdown) return;
    await this.plugin.app.vault.modify(this.sourceFile, next);
  }

  private addToolbarButton(container: HTMLElement, text: string, onClick: () => void | Promise<void>, enabled = true): void {
    const button = container.createEl("button", { text });
    button.type = "button";
    button.disabled = !enabled;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      void onClick();
    });
  }
}

class ParentTitleModal extends Modal {
  constructor(app: App, private readonly defaultTitle: string, private readonly onSubmit: (title: string) => void) {
    super(app);
  }

  onOpen(): void {
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
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText("Confirm")
        .setCta()
        .onClick(() => this.submit(input.value))
    );
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  private submit(title: string): void {
    this.onSubmit(title.trim() || this.defaultTitle);
    this.close();
  }
}

class LocalMindmapSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LocalObsidianMindmapPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Indent unit")
      .setDesc("Number of spaces used for one outline level.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.indentUnit)).onChange(async (value) => {
          const parsed = Number(value);
          this.plugin.settings.indentUnit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.indentUnit;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Open in right sidebar")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openInRightSidebar).onChange(async (value) => {
          this.plugin.settings.openInRightSidebar = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Persist collapse state")
      .setDesc("Save folded nodes in a hidden managed block at the end of the Markdown file.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistCollapseState).onChange(async (value) => {
          this.plugin.settings.persistCollapseState = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Follow active outline")
      .setDesc("Refresh the workbench when the active Markdown cursor changes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.followActiveOutline).onChange(async (value) => {
          this.plugin.settings.followActiveOutline = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

function replaceEditorBlock(editor: Editor, block: OutlineBlock, replacement: string): void {
  const hasFollowingLine = block.endLine + 1 < editor.lineCount();
  const from = { line: block.startLine, ch: 0 };
  const to = hasFollowingLine
    ? { line: block.endLine + 1, ch: 0 }
    : { line: block.endLine, ch: editor.getLine(block.endLine).length };
  editor.replaceRange(hasFollowingLine ? `${replacement}\n` : replacement, from, to);
}

function layoutNodes(nodes: OutlineNode[], collapsedIds: Set<string>): NodeLayout[] {
  const result: NodeLayout[] = [];
  let row = 0;
  const visit = (node: OutlineNode, depth: number, parentId: string | null) => {
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

function findNode(nodes: OutlineNode[], nodeId: string): OutlineNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const child = findNode(node.children, nodeId);
    if (child) return child;
  }
  return null;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
