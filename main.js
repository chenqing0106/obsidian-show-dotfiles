var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ShowDotfilesPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var import_electron = require("electron");
var VIEW_TYPE = "show-dotfiles";
var VAULT_OPENABLE_EXTS = /* @__PURE__ */ new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".ts", ".js", ".css", ".html", ".sh", ".env"]);
var DEFAULT_SETTINGS = {
  showAllFiles: false
};
var DotfilesView = class extends import_obsidian.ItemView {
  constructor(leaf, vaultPath, plugin) {
    super(leaf);
    this.tree = [];
    this.syncMap = /* @__PURE__ */ new Map();
    this.vaultPath = vaultPath;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Dotfiles";
  }
  getIcon() {
    return "folder-dot";
  }
  onOpen() {
    this.tree = this.readDotEntries(this.vaultPath);
    this.render();
    const writeBack = (0, import_obsidian.debounce)((file) => {
      const originalPath = this.syncMap.get(file.path);
      if (!originalPath) return;
      void this.app.vault.read(file).then((content) => {
        fs.writeFileSync(originalPath, content, "utf-8");
      });
    }, 500, true);
    this.registerEvent(this.app.vault.on("modify", writeBack));
    return Promise.resolve();
  }
  shouldShow(name, isDir, fullPath) {
    if (this.plugin.settings.showAllFiles) return true;
    if (!isDir) return name.endsWith(".md");
    if (fullPath) return this.hasMdFiles(fullPath);
    return true;
  }
  hasMdFiles(dirPath) {
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
    } catch (e) {
    }
    return false;
  }
  readDotEntries(dirPath) {
    try {
      return fs.readdirSync(dirPath).filter((name) => name.startsWith(".") && name !== this.app.vault.configDir).map((name) => {
        const fullPath = path.join(dirPath, name);
        const stat = fs.statSync(fullPath);
        return { name, fullPath, isDir: stat.isDirectory(), expanded: false };
      }).filter((e) => this.shouldShow(e.name, e.isDir, e.fullPath)).sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (e) {
      return [];
    }
  }
  readChildren(entry) {
    if (!entry.isDir) return [];
    try {
      return fs.readdirSync(entry.fullPath).map((name) => {
        const fullPath = path.join(entry.fullPath, name);
        const stat = fs.statSync(fullPath);
        return { name, fullPath, isDir: stat.isDirectory(), expanded: false };
      }).filter((e) => this.shouldShow(e.name, e.isDir, e.fullPath)).sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (e) {
      return [];
    }
  }
  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("dotfiles-view");
    const header = container.createDiv("dotfiles-header");
    header.createEl("span", { text: "Dotfiles", cls: "dotfiles-title" });
    const refreshBtn = header.createEl("button", { cls: "dotfiles-refresh-btn", attr: { "aria-label": "Refresh" } });
    (0, import_obsidian.setIcon)(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => {
      this.tree = this.readDotEntries(this.vaultPath);
      this.render();
    });
    const list = container.createDiv("dotfiles-list");
    this.renderEntries(list, this.tree, 0);
  }
  renderEntries(container, entries, depth) {
    for (const entry of entries) {
      const row = container.createDiv("dotfiles-row");
      row.setCssProps({ "--row-indent": `${depth * 16 + 8}px` });
      const icon = row.createSpan("dotfiles-icon");
      if (entry.isDir) {
        icon.setText(entry.expanded ? "\u25BE" : "\u25B8");
      } else {
        icon.setText("\xB7");
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
  async openFile(filePath) {
    const vaultRelative = path.relative(this.vaultPath, filePath);
    const file = this.app.vault.getAbstractFileByPath(vaultRelative);
    if (file instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (VAULT_OPENABLE_EXTS.has(ext)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const tmpPath = `__dotfile_preview__/${path.basename(filePath)}`;
        let tmpFile = this.app.vault.getAbstractFileByPath(tmpPath);
        if (!(tmpFile instanceof import_obsidian.TFile)) {
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
      void import_electron.shell.openPath(filePath);
    }
  }
  async onClose() {
  }
};
var ShowDotfilesSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Show all files").setDesc("Show all file types in dot-folders, not just .md files. Non-text files will open with the system default app.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showAllFiles).onChange(async (value) => {
        this.plugin.settings.showAllFiles = value;
        await this.plugin.saveSettings();
        this.plugin.refreshView();
      })
    );
  }
};
var ShowDotfilesPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.excludePreviewFolder();
    const adapter = this.app.vault.adapter;
    const vaultPath = adapter instanceof import_obsidian.FileSystemAdapter ? adapter.getBasePath() : "";
    this.registerView(VIEW_TYPE, (leaf) => new DotfilesView(leaf, vaultPath, this));
    this.addRibbonIcon("folder-dot", "Show dotfiles", () => this.activateView());
    this.addCommand({
      id: "open-dotfiles-panel",
      name: "Open dotfiles panel",
      callback: () => this.activateView()
    });
    this.addSettingTab(new ShowDotfilesSettingTab(this.app, this));
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeftLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
  refreshView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if ((leaf == null ? void 0 : leaf.view) instanceof DotfilesView) {
      leaf.view.render();
    }
  }
  excludePreviewFolder() {
    var _a;
    const vault = this.app.vault;
    const filters = (_a = vault.getConfig("userIgnoreFilters")) != null ? _a : [];
    if (!filters.includes("__dotfile_preview__")) {
      vault.setConfig("userIgnoreFilters", [...filters, "__dotfile_preview__"]);
    }
  }
  onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
