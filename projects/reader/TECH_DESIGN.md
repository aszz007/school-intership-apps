# 拾页阅读器技术设计

当前源码维护版 0.3.4（2026年10月30日）：Electron 44.10.0、fast-uri 3.1.9；16项核心测试、React构建和独立Windows打包通过。下文0.3.3及以前的记录保留为历史版本说明。

历史0.3.3版本：Electron负责窗口、文件选择与本地存储，React负责界面，Vite构建资源。输出release/v0.3.3，依赖由package-lock.json锁定。

## 模块与数据

| 模块 | 职责 |
| --- | --- |
| core/parser.mjs、epub.mjs | TXT编码及EPUB2/3解析、章节目录 |
| core/validation.mjs | 书架元数据、章节偏移和字号校验 |
| core/library.mjs | 导入、串行原子写入、进度和偏好 |
| electron/main.mjs、preload.cjs | 窗口、文件对话框、命名IPC |
| src/api.mjs | 桌面桥和网页预览适配 |
| src/App.jsx、reading.mjs | 书架、分页、目录、筛选和焦点 |

书籍ID为文件SHA256，同内容重复导入合并。保存字符偏移，翻页和跳章后写入。字号16—28px、步进2px；旧书库偏好缺省20px，下次保存写入。

单本导入20MB，书库100本。EPUB限制500条目、单条目8MB、总解压50MB、1000章与500万字符。索引、章节偏移及缓存读取检查异常，原文件保留。

## 安全与界面边界

app://提供打包资源。contextIsolation和sandbox开启，nodeIntegration关闭。IPC检查主窗口来源；原生文件选择器导入书籍。正文使用React文本，EPUB脚本和远程资源跳过。

app.whenReady后初始化，退出等待写入队列。SHIYE_DATA_DIR用于独立测试书库；预览HTTP调用超时15秒。初始化失败提供重试，确认框支持Escape、键盘循环及关闭后焦点恢复。

## 检查与交付

npm test执行16项解析、持久化与兼容测试；npm run build构建；npm run package生成Windows便携目录。网页预览为127.0.0.1:4245，书库位于.local/preview-library；桌面书库位于Windows应用数据目录。

0.3.3整理界面和预览提示，11项ASAR资源与构建一致，EXE版本、名称和7项图标字节校验通过。旧0.3/0.3.1原生导入及重开记录、0.3.2本人截图保留。0.3.4曾实际启动并打开已有EPUB；本次未重新验收完整导入和退出重开流程。
