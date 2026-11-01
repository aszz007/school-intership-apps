# 纸页笔记

支持新增、编辑、删除、搜索笔记和Markdown实时预览。点击“导入.md”新增文件，标题取文件名，正文保留原文；支持UTF-8 BOM，单文件不超过1MB、100000个字符。

解析器位于../shared/core.mjs，支持标题、段落、列表、引用、代码块和HTTP/HTTPS链接。HTML按文本显示。导出保留Markdown原文，并整理Windows文件名。

笔记保存在当前浏览器的paper-notes.v1。重要内容可下载留存。示例笔记可主动加载、编辑和删除。

从仓库根目录运行python tools/serve.py，访问http://127.0.0.1:4173/markdown-notes/。
