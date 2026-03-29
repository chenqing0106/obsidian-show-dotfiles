import { App, FileSystemAdapter, ItemView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, debounce, setIcon } from "obsidian";
import * as fs from "node:fs";
import * as path from "node:path";
import { shell } from "electron";

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

  onOpen(): Promise<void> {
    this.tree = this.readDotEntries(this.vaultPath);
    this.render();

    const writeBack = debounce((file: TFile) => {
      const originalPath = this.syncMap.get(file.path);
      if (!originalPath) return;
      void this.app.vault.read(file).then(content => {
        fs.writeFileSync(originalPath, content, "utf-8");
      });
    }, 500, true);

    this.registerEvent(this.app.vault.on("modify", writeBack));
    return Promise.resolve();
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
    } catch {
      // unable to read directory
    }
    return false;
  }

  private readDotEntries(dirPath: string): DirEntry[] {
    try {
      return fs.readdirSync(dirPath)
        .filter(name => name.startsWith(".") && name !== this.app.vault.configDir)
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
    setIcon(refreshBtn, "refresh-cw");
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
      row.setCssProps({ "--row-indent": `${depth * 16 + 8}px` });

      const icon = row.createSpan("dotfiles-icon");
      if (entry.isDir) {
        icon.setText(entry.expanded ? "▾" : "▸");
      } else {
        icon.setText("·");
        icon.addClass("dotfiles-icon-file");
      }

      const label = row.createSpan("dotfiles-label");
      label.setText(entry.name);
      if (entry.isDir) label.addClass("dotfiles-label-dir");

      row.addEventListener("click", () => {
        if (entry.isDir) {
          entry.expanded = !entry.expanded;
          if (entry.expanded && !entry.children) {
            entry.children = this.readChildren(entry);
          }
          this.render();
        } else {
          void this.openFile(entry.fullPath);
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
          await this.app.vault.modify(tmpFile, content);
        }
        this.syncMap.set(tmpPath, filePath);
        await this.app.workspace.getLeaf("tab").openFile(tmpFile);
      } catch (e) {
        console.error("show-dotfiles: failed to open text file", e);
      }
    } else {
      // 二进制或未知格式：用系统默认程序打开
      void shell.openPath(filePath);
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

    const adapter = this.app.vault.adapter;
    const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    this.registerView(VIEW_TYPE, (leaf) => new DotfilesView(leaf, vaultPath, this));

    this.addRibbonIcon("folder-dot", "Show dotfiles", () => this.activateView());

    this.addCommand({
      id: "open-dotfiles-panel",
      name: "Open dotfiles panel",
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
    await workspace.revealLeaf(leaf);
  }

  refreshView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (leaf?.view instanceof DotfilesView) {
      leaf.view.render();
    }
  }

  private excludePreviewFolder() {
    // 从搜索/Graph 排除
    const vault = this.app.vault as unknown as { getConfig: (key: string) => string[] | null; setConfig: (key: string, value: string[]) => void };
    const filters: string[] = vault.getConfig("userIgnoreFilters") ?? [];
    if (!filters.includes("__dotfile_preview__")) {
      vault.setConfig("userIgnoreFilters", [...filters, "__dotfile_preview__"]);
    }
  }

  onunload() {
    // intentionally empty — do not detach leaves to preserve user's layout
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
