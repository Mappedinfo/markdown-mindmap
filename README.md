# Markdown Mindmap

Editable mindmap workbench for plain Markdown outline blocks in Obsidian.

## v1 behavior

- Source of truth: the current Markdown file.
- Editable range: the unordered list block under the active cursor.
- Supported syntax: plain `- item` lists with two-space indentation by default.
- Unsupported syntax: task lists, ordered lists, tabs, multi-line list items, and indentation jumps.

## Commands

- `Open Mindmap for Current Outline`
- `Induce Parent from Selected Nodes`
- `Focus Mindmap Node`

## Keyboard editing

- `Enter`: create a sibling node after the current node.
- `Tab`: indent the current node under the previous sibling.
- `Shift+Tab`: outdent the current node.
- `Backspace` / `Delete`: delete an empty leaf node.

## Reverse induction

Select two or more adjacent sibling nodes, then run `Induce Parent from Selected Nodes`.
The plugin creates a new parent node and moves the selected nodes under it.

## Managed state

The plugin may append a hidden managed block to the Markdown file:

```md
<!-- BEGIN LOCAL-OBSIDIAN-MINDMAP-STATE
{"schemaVersion":1,"blocks":{}}
END LOCAL-OBSIDIAN-MINDMAP-STATE -->
```

This block stores UI state only. The outline content remains in Markdown lists.
