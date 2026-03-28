# Show Dotfiles

[中文文档](README_zh.md)

An Obsidian plugin that lets you browse and edit dot-prefixed hidden folders (like `.claude`, `.cursor`, `.git`) directly in a sidebar panel.

## Why

Obsidian's file explorer ignores any folder starting with `.`. If you keep configuration or notes in hidden folders (e.g. `.claude/commands/`), you'd normally have to leave Obsidian to read or edit them. This plugin brings them back in.

## Features

- Sidebar panel listing all dot-folders in your vault root
- Click to expand folders, click files to open them
- **Two-way sync**: edits in Obsidian write back to the original hidden file automatically
- Non-text files (images, binaries) open with the system default app
- Toggle between **Markdown-only** view and **all files** view in Settings
- Hidden folders with no Markdown files are automatically filtered out (in default mode)

## Installation

### Manual (until listed in community plugins)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/chenqing0106/obsidian-show-dotfiles/releases)
2. Copy them to `<your-vault>/.obsidian/plugins/show-dotfiles/`
3. Enable the plugin in **Settings → Community plugins**

### From Community Plugins (coming soon)

Search for "Show Dotfiles" in the Community plugins browser.

## Usage

1. Click the folder icon in the left ribbon, or run **Open Dotfiles panel** from the command palette
2. Expand any dot-folder to browse its contents
3. Click a file to open it — Markdown files open in a new tab with full Obsidian rendering
4. Edit normally; changes sync back to the original file within 500ms

## Settings

| Setting | Default | Description |
|---|---|---|
| Show all files | Off | Show all file types, not just `.md`. Non-text files open with the system default app. |

## Known Limitations

- **Desktop only** — relies on Node.js `fs` and Electron APIs
- Edits sync from Obsidian → original file, but if the original file is changed externally while open, the tab won't auto-refresh (close and reopen to get latest)
- Files open via a temporary copy inside the vault; the copy is hidden from search and file explorer automatically

## Development

```bash
git clone https://github.com/chenqing0106/obsidian-show-dotfiles
cd obsidian-show-dotfiles
npm install
npm run dev   # watch mode
npm run build # production build
```

Copy (or symlink) the plugin folder into your vault's `.obsidian/plugins/` directory, then enable it.

## License

MIT
