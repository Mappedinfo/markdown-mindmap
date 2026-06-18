# Markdown Mindmap

Editable mindmap workbench for explicit Markdown `mindmap` fenced blocks in Obsidian.

## Quick Start

1. Open the command palette and run `Open Markdown Mindmap`, or click the ribbon icon.
2. If the current Markdown file has no mindmap yet, click `Create mindmap in current file`.
3. Edit either side:
   - Editing the fenced Markdown block refreshes the mindmap.
   - Editing nodes in the mindmap writes back to the fenced Markdown block.

## Markdown Format

Mindmaps are stored directly in the Markdown file:

````md
```mindmap id="research" title="博士研究"
- 博士研究
	- 研究问题
	- 文献综述
	- 实验设计
```
````

Notes:

- Only fenced blocks marked as `mindmap` are indexed.
- Ordinary Markdown lists are ignored.
- A single Markdown file can contain multiple mindmaps.
- New content is written with Tab indentation.
- Old two-space indentation can be read, but newly written content uses Tabs.

## Dashboard

The panel has a left dashboard and a right canvas.

- `Current file` lists mindmaps in the active Markdown file.
- `Vault` lists indexed mindmaps across the vault.
- Search filters by title, root node, and file path.

## Keyboard Editing

- `Enter`: create a sibling node after the current node.
- `Tab`: indent the current node under the previous sibling.
- `Shift+Tab`: outdent the current node.
- `Backspace` / `Delete`: delete an empty leaf node.

## Reverse Induction

Select two or more adjacent sibling nodes, then run `Induce Parent from Selected Nodes`.
The plugin creates a new parent node and moves the selected nodes under it.

## Managed State

The plugin may append a hidden managed block to the Markdown file:

```md
<!-- BEGIN MARKDOWN-MINDMAP-STATE
{"schemaVersion":1,"blocks":{}}
END MARKDOWN-MINDMAP-STATE -->
```

This block stores UI state only. The mindmap content remains in the fenced Markdown block.
