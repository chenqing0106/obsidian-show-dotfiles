import { App, ItemView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, debounce } from "obsidian";
import * as fs from "node:fs";
import * as path from "node:path";

const VIEW_TYPE = "show-dotfiles";

// 在 Obsidian vault 里用 temp copy 打开的扩展名
const VAULT_OPENABLE_EXTS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ts", ".js", ".css", ".html", ".sh", ".env"]);

interface DirEntry {
  name: string;
  fullPath: string;
  isDir: boolean;
  children?: DirEntry[];
  expanded?: boolean;
}

interface ShowDotfilesSettings {
  showAllFiles: boolean;
}

const DEFAULT_SETTINGS: ShowDotfilesSettings = {
  showAllFiles: false,
};

class DotfilesView extends ItemView {
  private vaultPath: string;
  private tree: DirEntry[] = [];
  private syncMap: Map<string, string> = new Map();
  private plugin: ShowDotfilesPlugin;

  constructor(leaf: WorkspaceLeaf, vaultPath: string, plugin: ShowDotfilesPlugin) {
    super(leaf);
    this.vaultPath = vaultPath;
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Dotfiles"; }
  getIcon() { return "folder-dot"; }

  async onOpen() {
    this.tree = this.readDotEntries(this.vaultPath);
    this.render();

    const writeBack = debounce((file: TFile) => {
      const originalPath = this.syncMap.get(file.path);
      if (!originalPath) return;
      this.app.vault.read(file).then(content => {
        fs.writeFileSync(originalPath, content, "utf-8");
      });
    }, 500, true);

    this.registerEvent(this.app.vault.on("modify", writeBack));
  }

  private shouldShow(name: string, isDir: boolean, fullPath?: string): boolean {
    if (this.plugin.settings.showAllFiles) return true;
    if (!isDir) return name.endsWith(".md");
    // 目录：只有递归包含 md 文件时才显示
    if (fullPath) return this.hasMdFiles(fullPath);
    return true;
  }

  private hasMdFiles(dirPath: string): boolean {
    try {
      for (const name of fs.readdirSync(dirPath)) {
        const fullPath = path.join(dirPath, name);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (this.hasMdFiles(fullPath)) return true;
        } else if (name.endsWith(".md")) {
          return true;
        }
      }
    } catch {}
    return false;
  }

  private readDotEntries(dirPath: string): DirEntry[] {
    try {
      return fs.readdirSync(dirPath)
        .filter(name => name.startsWith(".") && name !== ".obsidian")
        .map(name => {
          const fullPath = path.join(dirPath, name);
          const stat = fs.statSync(fullPath);
          return { name, fullPath, isDir: stat.isDirectory(), expanded: false };
        })
        .filter(e => this.shouldShow(e.name, e.isDir, e.fullPath))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  }

  private readChildren(entry: DirEntry): DirEntry[] {
    if (!entry.isDir) return [];
    try {
      return fs.readdirSync(entry.fullPath)
        .map(name => {
          const fullPath = path.join(entry.fullPath, name);
          const stat = fs.statSync(fullPath);
          return { name, fullPath, isDir: stat.isDirectory(), expanded: false };
        })
        .filter(e => this.shouldShow(e.name, e.isDir, e.fullPath))
        .sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  }

  render() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("dotfiles-view");

    const header = container.createDiv("dotfiles-header");
    header.createEl("span", { text: "Dotfiles", cls: "dotfiles-title" });

    const refreshBtn = header.createEl("button", { cls: "dotfiles-refresh-btn", attr: { "aria-label": "Refresh" } });
    refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
    refreshBtn.addEventListener("click", () => {
      this.tree = this.readDotEntries(this.vaultPath);
      this.render();
    });

    const list = container.createDiv("dotfiles-list");
    this.renderEntries(list, this.tree, 0);
  }

  private renderEntries(container: HTMLElement, entries: DirEntry[], depth: number) {
    for (const entry of entries) {
      const row = container.createDiv("dotfiles-row");
      row.style.paddingLeft = `${depth * 16 + 8}px`;

      const icon = row.createSpan("dotfiles-icon");
      if (entry.isDir) {
        icon.setText(entry.expanded ? "▾" : "▸");
      } else {
        icon.setText("·");
        icon.style.opacity = "0.4";
      }

      const label = row.createSpan("dotfiles-label");
      label.setText(entry.name);
      if (entry.isDir) label.style.fontWeight = "500";

      row.addEventListener("click", async () => {
        if (entry.isDir) {
          entry.expanded = !entry.expanded;
          if (entry.expanded && !entry.children) {
            entry.children = this.readChildren(entry);
          }
          this.render();
        } else {
          await this.openFile(entry.fullPath);
        }
      });

      if (entry.isDir && entry.expanded && entry.children) {
        this.renderEntries(container, entry.children, depth + 1);
      }
    }
  }

  private async openFile(filePath: string) {
    const vaultRelative = path.relative(this.vaultPath, filePath);
    const file = this.app.vault.getAbstractFileByPath(vaultRelative);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();

    if (VAULT_OPENABLE_EXTS.has(ext)) {
      // 文本文件：temp copy + 写回同步
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const tmpPath = `__dotfile_preview__/${path.basename(filePath)}`;
        let tmpFile = this.app.vault.getAbstractFileByPath(tmpPath);
        if (!(tmpFile instanceof TFile)) {
          await this.app.vault.adapter.mkdir("__dotfile_preview__");
          tmpFile = await this.app.vault.create(tmpPath, content);
        } else {
          await this.app.vault.modify(tmpFile as TFile, content);
        }
        this.syncMap.set(tmpPath, filePath);
        await this.app.workspace.getLeaf("tab").openFile(tmpFile as TFile);
      } catch (e) {
        console.error("show-dotfiles: failed to open text file", e);
      }
    } else {
      // 二进制或未知格式：用系统默认程序打开
      const { shell } = require("electron");
      shell.openPath(filePath);
    }
  }

  async onClose() {}
}

class ShowDotfilesSettingTab extends PluginSettingTab {
  plugin: ShowDotfilesPlugin;

  constructor(app: App, plugin: ShowDotfilesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Show all files")
      .setDesc("Show all file types in dot-folders, not just .md files. Non-text files will open with the system default app.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showAllFiles)
        .onChange(async (value) => {
          this.plugin.settings.showAllFiles = value;
          await this.plugin.saveSettings();
          // 刷新已打开的视图
          this.plugin.refreshView();
        })
      );
  }
}

export default class ShowDotfilesPlugin extends Plugin {
  settings: ShowDotfilesSettings;

  async onload() {
    await this.loadSettings();
    this.excludePreviewFolder();

    const vaultPath = (this.app.vault.adapter as any).getBasePath();
    this.registerView(VIEW_TYPE, (leaf) => new DotfilesView(leaf, vaultPath, this));

    this.addRibbonIcon("folder-dot", "Show Dotfiles", () => this.activateView());

    this.addCommand({
      id: "open-dotfiles-panel",
      name: "Open Dotfiles panel",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new ShowDotfilesSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false)!;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf?.view instanceof DotfilesView) {
      (leaf.view as DotfilesView).render();
    }
  }

  private excludePreviewFolder() {
    // 从搜索/Graph 排除
    const vault = this.app.vault as any;
    const filters: string[] = vault.getConfig("userIgnoreFilters") ?? [];
    if (!filters.includes("__dotfile_preview__")) {
      vault.setConfig("userIgnoreFilters", [...filters, "__dotfile_preview__"]);
    }
    // 从文件列表隐藏
    this.register(() => {});
    const style = document.createElement("style");
    style.id = "show-dotfiles-hide-preview";
    style.textContent = `.nav-folder-title[data-path="__dotfile_preview__"] ~ *,
      .nav-folder:has(> .nav-folder-title[data-path="__dotfile_preview__"]) { display: none !important; }`;
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
