# 课程应用

| 应用 | 功能 | 技术 |
| --- | --- | --- |
| [拾页](projects/reader/) | TXT/EPUB、目录、阅读位置 | Electron + React |
| [知练](projects/practice/) | 答题、错题、笔记、个人题库、统计 | Vue 3 + FastAPI + SQLite |
| [课间](projects/todo/) | 任务、日期、分类、JSON 备份 | JavaScript |
| [纸页](projects/markdown-notes/) | Markdown 编辑、预览、导入导出 | JavaScript |
| [晴窗](projects/weather/) | 城市天气、三天预报 | JavaScript + Open-Meteo |

## 运行

小工具在仓库根目录执行 `python tools/serve.py`，打开 http://127.0.0.1:4173/ 。阅读器和知练分别按项目 README 安装依赖、启动。

网页核心检查：`node --test tools/core.test.mjs`。桌面与后端检查见各项目 README。

[个人网站](https://github.com/aszz007/school-intership-portfolio) 和 [ImageGrab](https://github.com/aszz007/school-intership-imagegrab) 独立维护。
