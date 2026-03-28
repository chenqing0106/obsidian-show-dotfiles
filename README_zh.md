# Show Dotfiles

一个 Obsidian 插件，让你能在侧边栏面板中浏览和编辑以 `.` 开头的隐藏文件夹（如 `.claude`、`.cursor`、`.git`）。

## 为什么需要它

Obsidian 的文件浏览器会忽略所有以 `.` 开头的文件夹。如果你在隐藏目录里存放了配置文件或笔记（例如 `.claude/commands/`），通常只能离开 Obsidian 才能查看或编辑它们。这个插件把它们带回来了。

## 功能

- 侧边栏面板，列出 vault 根目录下所有的隐藏文件夹
- 点击展开文件夹，点击文件打开
- **双向同步**：在 Obsidian 中编辑后，自动写回原始隐藏文件
- 非文本文件（图片、二进制文件等）用系统默认程序打开
- 设置中可切换**仅显示 Markdown** 或**显示所有文件**
- 默认模式下，不含任何 Markdown 文件的隐藏文件夹会被自动过滤

## 安装

### 手动安装（社区插件审核通过前）

1. 从 [最新 Release](https://github.com/chenqing0106/obsidian-show-dotfiles/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 复制到 `<你的 vault>/.obsidian/plugins/show-dotfiles/` 目录下
3. 在 **设置 → 第三方插件** 中启用该插件

### 社区插件市场（即将上线）

在社区插件浏览器中搜索 "Show Dotfiles"。

## 使用方法

1. 点击左侧 ribbon 的文件夹图标，或通过命令面板执行 **Open Dotfiles panel**
2. 展开任意隐藏文件夹，浏览其中的文件
3. 点击文件打开——Markdown 文件会在新标签页中以 Obsidian 原生方式渲染
4. 正常编辑，500ms 内自动写回原始文件

## 设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| 显示所有文件 | 关 | 显示所有文件类型，而不仅限于 `.md`。非文本文件用系统默认程序打开。 |

## 已知限制

- **仅支持桌面端**——依赖 Node.js `fs` 和 Electron API
- 编辑同步方向为 Obsidian → 原始文件；若原始文件被外部程序修改，已打开的标签页不会自动刷新（关闭后重新打开即可获取最新内容）

## 开发

```bash
git clone https://github.com/chenqing0106/obsidian-show-dotfiles
cd obsidian-show-dotfiles
npm install
npm run dev   # 监听模式
npm run build # 生产构建
```

将插件目录复制（或软链接）到 vault 的 `.obsidian/plugins/` 目录，然后在设置中启用。

## License

MIT
