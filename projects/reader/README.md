# 拾页阅读器

Electron + React 离线桌面阅读器，支持 TXT/EPUB 导入、书架搜索、目录切章、翻页、字号调整和阅读位置恢复。

## 从源码运行

需要 Node.js 24.12 或以上。在本目录执行：

```text
npm ci
npm test
npm start
```

点击“导入书籍”选择本地 TXT 或 EPUB。运行 `npm run fixtures` 可在 `fixtures/` 生成自编测试书籍。翻页、切章和字号设置自动保存，重新打开时继续阅读；书架移除操作只处理应用副本。

每次最多导入 20 本，书库最多 100 本，单本不超过 20 MB。EPUB 采用文字阅读，支持 EPUB2/3 目录。

## 构建

```text
npm run build
npm run package
```

Windows 程序输出目录由 `package.json` 的 `build.directories.output` 指定。便携程序需保留同目录资源文件。

`npm run preview` 在 http://127.0.0.1:4245/ 提供网页预览，使用独立的 `.local/preview-library` 书库。桌面书库位于 Windows 应用数据目录，开发时可使用 `SHIYE_DATA_DIR` 指定目录。

需求、架构和验证范围见 [PRD.md](PRD.md)、[TECH_DESIGN.md](TECH_DESIGN.md)、[TESTING.md](TESTING.md)。旧版本变化见 [CHANGELOG.md](CHANGELOG.md)。
