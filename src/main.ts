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
  WorkspaceLeaf
} from "obsidian";
import {
  buildMindmapIndex,
  createMindmapId,
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
  updateNodeTitle,
  upsertMindmapStateBlock,
  type MindmapBlock,
  type MindmapIndexEntry,
  type MindmapStateData,
  type OutlineNode,
  type OutlineOperationResult
} from "./outline.ts";

const VIEW_TYPE_MINDMAP = "markdown-mindmap-workbench";

interface LocalMindmapSettings {
  openInRightSidebar: boolean;
  persistCollapseState: boolean;
  followActiveFile: boolean;
  scanVaultOnOpen: boolean;
}

const DEFAULT_SETTINGS: LocalMindmapSettings = {
  openInRightSidebar: true,
  persistCollapseState: true,
  followActiveFile: true,
  scanVaultOnOpen: true
};

interface FileMindmapCache {
  activeBlockId?: string;
  selectedIds: string[];
  collapsedIds: string[];
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  lastContentHash?: string;
}

interface NodeLayout {
  node: OutlineNode;
  depth: number;
  x: number;
  y: number;
  parentId: string | null;
}

export default class MarkdownMindmapPlugin extends Plugin {
  settings: LocalMindmapSettings = DEFAULT_SETTINGS;
  readonly fileCache = new Map<string, FileMindmapCache>();
  readonly mindmapIndex = new Map<string, MindmapIndexEntry[]>();
  readonly suppressModifyPaths = new Set<string>();

  private vaultScanTimer: number | null = null;
  private lastMarkdownFilePath: string | null = null;

  async onload(): Promise<void> {
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
        if (!(file instanceof TFile) || file.extension !== "md") return;
        void this.handleMarkdownFileModified(file);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.captureActiveMarkdownFile();
      if (this.settings.scanVaultOnOpen) void this.refreshVaultIndex();
    });
  }

  onunload(): void {
    if (this.vaultScanTimer !== null) window.clearTimeout(this.vaultScanTimer);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MINDMAP);
  }

  async loadSettings(): Promise<void> {
    const raw = (await this.loadData()) as Partial<LocalMindmapSettings> & { followActiveOutline?: boolean; indentUnit?: number } | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(raw ?? {}),
      followActiveFile: raw?.followActiveFile ?? raw?.followActiveOutline ?? DEFAULT_SETTINGS.followActiveFile
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openMindmapPanel(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!leaf) {
      leaf = this.settings.openInRightSidebar
        ? this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true)
        : this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_MINDMAP, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof MindmapWorkbenchView) {
      await leaf.view.loadCurrentFile();
    }
  }

  async createMindmapInCurrentFile(targetFile?: TFile): Promise<void> {
    const view = this.getActiveMarkdownView();
    const file = targetFile ?? view?.file ?? this.getActiveMarkdownFile();
    if (!file) {
      new Notice("Open a Markdown file first.");
      return;
    }
    this.lastMarkdownFilePath = file.path;
    const sourceView = view?.file?.path === file.path ? view : this.findMarkdownViewForFile(file);
    const title = file.basename || "Mindmap";
    const id = createMindmapId(`${file.path}:${Date.now()}`);
    const markdown = sourceView?.getViewData() ?? (await this.app.vault.cachedRead(file));
    const insertLine = sourceView?.editor.getCursor().line ?? markdown.split("\n").length;
    const next = insertMindmapBlockAtLine(markdown, insertLine, { id, title });
    await this.writeMarkdownFile(file, next);
    this.setActiveBlockForFile(file.path, id);
    await this.refreshIndexForFile(file, next);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) await leaf.view.loadFileBlock(file, id);
    }
  }

  getActiveMarkdownView(): MarkdownView | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView);
  }

  getActiveMarkdownFile(): TFile | null {
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

  getFileCache(filePath: string): FileMindmapCache {
    let cache = this.fileCache.get(filePath);
    if (!cache) {
      cache = { selectedIds: [], collapsedIds: [], scale: 1, scrollLeft: 0, scrollTop: 0 };
      this.fileCache.set(filePath, cache);
    }
    return cache;
  }

  setActiveBlockForFile(filePath: string, blockId: string): void {
    this.getFileCache(filePath).activeBlockId = blockId;
  }

  rememberMarkdownFile(file: TFile): void {
    if (file.extension === "md") this.lastMarkdownFilePath = file.path;
  }

  getAllIndexEntries(): MindmapIndexEntry[] {
    return [...this.mindmapIndex.values()].flat().sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  }

  getIndexEntriesForFile(filePath: string): MindmapIndexEntry[] {
    return this.mindmapIndex.get(filePath) ?? [];
  }

  async readMarkdownFile(file: TFile): Promise<string> {
    const view = this.findMarkdownViewForFile(file);
    return view?.getViewData() ?? this.app.vault.cachedRead(file);
  }

  async writeMarkdownFile(file: TFile, markdown: string): Promise<void> {
    this.suppressModifyPaths.add(file.path);
    const view = this.findMarkdownViewForFile(file);
    if (view) {
      replaceWholeEditorData(view.editor, markdown);
    } else {
      await this.app.vault.modify(file, markdown);
    }
    window.setTimeout(() => this.suppressModifyPaths.delete(file.path), 350);
  }

  async normalizeMindmapMetadata(file: TFile, markdown: string): Promise<string> {
    const next = normalizeMindmapBlockMetadata(markdown, {
      sourcePath: file.path,
      fallbackTitle: file.basename
    });
    if (next === markdown) return markdown;
    await this.writeMarkdownFile(file, next);
    await this.refreshIndexForFile(file, next);
    return next;
  }

  async refreshVaultIndex(): Promise<void> {
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

  async refreshIndexForFile(file: TFile, knownMarkdown?: string): Promise<void> {
    const markdown = knownMarkdown ?? (await this.readMarkdownFile(file));
    const entries = buildMindmapIndex(markdown, file.path, file.basename);
    if (entries.length > 0) this.mindmapIndex.set(file.path, entries);
    else this.mindmapIndex.delete(file.path);
  }

  private async handleMarkdownFileModified(file: TFile): Promise<void> {
    if (this.suppressModifyPaths.has(file.path)) return;
    await this.refreshIndexForFile(file);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) leaf.view.scheduleMarkdownRefresh(file.path);
    }
  }

  private refreshOpenMindmapViews(options: { preserveSelection?: boolean; fromEditorChange?: boolean } = {}): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) {
        void leaf.view.loadCurrentFile(options);
      }
    }
  }

  private refreshOpenDashboardOnly(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)) {
      if (leaf.view instanceof MindmapWorkbenchView) leaf.view.render();
    }
  }

  private captureActiveMarkdownFile(): void {
    const activeMarkdown = this.getActiveMarkdownView();
    if (activeMarkdown?.file) {
      this.lastMarkdownFilePath = activeMarkdown.file.path;
      return;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile?.extension === "md") this.lastMarkdownFilePath = activeFile.path;
  }

  private getLastMarkdownFile(): TFile | null {
    if (!this.lastMarkdownFilePath) return null;
    const file = this.app.vault.getAbstractFileByPath(this.lastMarkdownFilePath);
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  private withMindmapView(callback: (view: MindmapWorkbenchView) => void | Promise<void>): void {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    if (!(leaf?.view instanceof MindmapWorkbenchView)) {
      new Notice("Open the Markdown Mindmap panel first.");
      return;
    }
    void callback(leaf.view);
  }
}

class MindmapWorkbenchView extends ItemView {
  private sourceFile: TFile | null = null;
  private block: MindmapBlock | null = null;
  private nodes: OutlineNode[] = [];
  private selectedIds = new Set<string>();
  private collapsedIds = new Set<string>();
  private scale = 1;
  private scrollLeft = 0;
  private scrollTop = 0;
  private searchQuery = "";
  private refreshTimer: number | null = null;
  private statePersistTimer: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: MarkdownMindmapPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return "Markdown Mindmap";
  }

  getIcon(): string {
    return "git-fork";
  }

  async onOpen(): Promise<void> {
    this.render();
    await this.loadCurrentFile();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.statePersistTimer !== null) window.clearTimeout(this.statePersistTimer);
    await this.persistState();
  }

  scheduleMarkdownRefresh(filePath?: string): void {
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

  async loadCurrentFile(options: { preserveSelection?: boolean; fromEditorChange?: boolean } = {}): Promise<void> {
    const activeFile = this.plugin.getActiveMarkdownFile();
    if (!activeFile || activeFile.extension !== "md") {
      if (!this.sourceFile) this.render("Open a Markdown file or choose a mindmap from the dashboard.");
      return;
    }
    if (options.fromEditorChange && this.sourceFile?.path === activeFile.path) {
      this.scheduleMarkdownRefresh(activeFile.path);
      return;
    }
    await this.loadFile(activeFile, undefined, options);
  }

  async loadFileBlock(file: TFile, blockId: string): Promise<void> {
    await this.loadFile(file, blockId);
  }

  async promptInduceParent(): Promise<void> {
    if (this.selectedIds.size < 2) {
      new Notice("Select at least two adjacent sibling nodes.");
      return;
    }
    new ParentTitleModal(this.app, "归纳", (title) => {
      void this.applyOperation(induceParentFromSelected(this.nodes, [...this.selectedIds], title || "归纳"));
    }).open();
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

  render(status?: string): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("local-mindmap-workbench");

    const shell = contentEl.createDiv({ cls: "local-mindmap-shell" });
    const dashboard = shell.createDiv({ cls: "local-mindmap-dashboard" });
    const main = shell.createDiv({ cls: "local-mindmap-main" });
    this.renderDashboard(dashboard);
    this.renderMain(main, status);
  }

  private async loadFile(file: TFile, requestedBlockId?: string, options: { preserveSelection?: boolean } = {}): Promise<void> {
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
    this.selectedIds = options.preserveSelection
      ? new Set([...previousSelection].filter((id) => findNode(this.nodes, id)))
      : new Set([this.nodes[0]?.id].filter((id): id is string => Boolean(id)));
    cache.lastContentHash = block.contentHash;
    this.updateCache();
    this.render(block.warning);
  }

  private async refreshCurrentBlockFromMarkdown(): Promise<void> {
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
      this.selectedIds = new Set([this.nodes[0]?.id].filter((id): id is string => Boolean(id)));
      this.render(this.block ? this.block.warning : undefined);
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

  private renderDashboard(container: HTMLElement): void {
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
      void this.plugin.createMindmapInCurrentFile(this.sourceFile ?? undefined);
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
    const allEntries = this.plugin
      .getAllIndexEntries()
      .filter((entry) =>
        !query ||
        `${entry.title} ${entry.rootTitle} ${entry.filePath}`.toLowerCase().includes(query)
      )
      .slice(0, 80);
    this.renderEntrySection(container, query ? "Search results" : "Vault", allEntries);
  }

  private renderEntrySection(container: HTMLElement, title: string, entries: MindmapIndexEntry[]): void {
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
      button.createDiv({ cls: "local-mindmap-entry-path", text: `${entry.filePath} · line ${entry.line}` });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        void this.openIndexEntry(entry);
      });
    }
  }

  private renderMain(container: HTMLElement, status?: string): void {
    const toolbar = container.createDiv({ cls: "local-mindmap-toolbar" });
    const titleGroup = toolbar.createDiv({ cls: "local-mindmap-heading" });
    titleGroup.createDiv({
      cls: "local-mindmap-title",
      text: this.block?.title ?? this.sourceFile?.basename ?? "Markdown Mindmap"
    });
    titleGroup.createDiv({
      cls: "local-mindmap-subtitle",
      text: this.block && this.sourceFile
        ? `${this.sourceFile.path} · lines ${this.block.startLine + 1}-${this.block.endLine + 1}`
        : this.sourceFile
          ? `${this.sourceFile.path} · no mindmap block`
          : "Choose a mindmap or create one in the active file."
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
      button.addEventListener("click", () => void this.plugin.createMindmapInCurrentFile(this.sourceFile ?? undefined));
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
    input.addEventListener("focus", () => {
      this.selectedIds = new Set([node.id]);
      this.updateCache();
      card.addClass("is-selected");
      select.checked = true;
    });
    input.addEventListener("blur", () => void this.commitTitle(node.id, input.value));
    input.addEventListener("keydown", (event) => this.handleNodeKeydown(event, node.id, input));
  }

  private handleNodeKeydown(event: KeyboardEvent, nodeId: string, input: HTMLInputElement): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void this.commitTitle(nodeId, input.value, { skipRender: true }).then(() => this.applyOperation(insertSiblingAfter(this.nodes, nodeId, "")));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      void this.commitTitle(nodeId, input.value, { skipRender: true }).then(() =>
        this.applyOperation(event.shiftKey ? outdentNode(this.nodes, nodeId) : indentNode(this.nodes, nodeId))
      );
      return;
    }
    if ((event.key === "Backspace" || event.key === "Delete") && input.value.trim() === "") {
      event.preventDefault();
      void this.applyOperation(deleteEmptyNode(this.nodes, nodeId));
    }
  }

  private async commitTitle(nodeId: string, title: string, options: { skipRender?: boolean } = {}): Promise<void> {
    const node = findNode(this.nodes, nodeId);
    if (!node || node.title === title) return;
    await this.applyOperation(updateNodeTitle(this.nodes, nodeId, title), options);
  }

  private selectNode(nodeId: string, additive: boolean): void {
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
    } else {
      this.selectedIds.add(nodeId);
    }
    this.updateCache();
    this.render();
  }

  private toggleCollapse(nodeId: string): void {
    if (this.collapsedIds.has(nodeId)) this.collapsedIds.delete(nodeId);
    else this.collapsedIds.add(nodeId);
    this.updateCache();
    this.render();
    this.scheduleStatePersist();
  }

  private setScale(next: number): void {
    this.scale = Math.min(1.8, Math.max(0.5, Number(next.toFixed(2))));
    this.updateCache();
    this.render();
    this.scheduleStatePersist();
  }

  private async applyOperation(result: OutlineOperationResult, options: { skipRender?: boolean } = {}): Promise<void> {
    if (!result.ok) {
      new Notice(result.reason);
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

  private async writeNodesToMarkdown(): Promise<boolean> {
    if (!this.sourceFile || !this.block) {
      new Notice("No source mindmap block loaded.");
      return false;
    }
    const markdown = await this.plugin.readMarkdownFile(this.sourceFile);
    const blocks = parseMindmapBlocks(markdown, { sourcePath: this.sourceFile.path, fallbackTitle: this.sourceFile.basename });
    const freshBlock = blocks.find((candidate) => candidate.id === this.block?.id);
    if (!freshBlock) {
      new Notice("The source mindmap block no longer exists.");
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

  private async openIndexEntry(entry: MindmapIndexEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (!(file instanceof TFile)) {
      new Notice("Mindmap source file no longer exists.");
      return;
    }
    this.plugin.setActiveBlockForFile(file.path, entry.id);
    const existingView = this.plugin.findMarkdownViewForFile(file);
    if (!existingView) {
      await this.app.workspace.getLeaf(false).openFile(file, { active: false });
    }
    await this.loadFileBlock(file, entry.id);
  }

  private currentFileEntries(): MindmapIndexEntry[] {
    if (!this.sourceFile) return [];
    return this.plugin.getIndexEntriesForFile(this.sourceFile.path);
  }

  private updateCache(): void {
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

  private scheduleStatePersist(): void {
    if (!this.plugin.settings.persistCollapseState) return;
    if (this.statePersistTimer !== null) window.clearTimeout(this.statePersistTimer);
    this.statePersistTimer = window.setTimeout(() => {
      this.statePersistTimer = null;
      void this.persistState();
    }, 500);
  }

  private async persistState(): Promise<void> {
    if (!this.sourceFile || !this.block || !this.plugin.settings.persistCollapseState) return;
    const markdown = await this.plugin.readMarkdownFile(this.sourceFile);
    const state: MindmapStateData = readMindmapState(markdown);
    state.blocks[this.block.id] = {
      collapsedIds: [...this.collapsedIds],
      scale: this.scale,
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      updatedAt: new Date().toISOString()
    };
    const next = upsertMindmapStateBlock(markdown, state);
    if (next === markdown) return;
    await this.plugin.writeMarkdownFile(this.sourceFile, next);
    await this.plugin.refreshIndexForFile(this.sourceFile, next);
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

class MarkdownMindmapSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: MarkdownMindmapPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Open in right sidebar")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openInRightSidebar).onChange(async (value) => {
          this.plugin.settings.openInRightSidebar = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Persist view state")
      .setDesc("Save collapsed nodes, zoom, and scroll in a hidden managed block in the Markdown file.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistCollapseState).onChange(async (value) => {
          this.plugin.settings.persistCollapseState = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Follow active file")
      .setDesc("Keep the panel pointed at the active Markdown file without clearing state on cursor movement.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.followActiveFile).onChange(async (value) => {
          this.plugin.settings.followActiveFile = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Scan vault on open")
      .setDesc("Build the dashboard index from all Markdown files after Obsidian layout is ready.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.scanVaultOnOpen).onChange(async (value) => {
          this.plugin.settings.scanVaultOnOpen = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

function replaceWholeEditorData(editor: Editor, replacement: string): void {
  const lastLine = Math.max(0, editor.lineCount() - 1);
  const end = { line: lastLine, ch: editor.getLine(lastLine).length };
  editor.replaceRange(replacement, { line: 0, ch: 0 }, end);
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
