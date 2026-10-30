# 运行与部署

FastAPI 在 `127.0.0.1:4250` 提供构建后的 Vue 页面和 API，SQLite 数据保存在项目的 `.local/` 目录。这是当前支持的本地单实例运行方式。

首次运行执行 `scripts/setup.ps1`，后续使用 `scripts/start.ps1`。依赖分别锁定于 `requirements.txt` 和 `package-lock.json`。数据库使用编号迁移升级，保留已有记录。

部署到服务器需要 Python 运行环境、持久化磁盘和 HTTPS 反向代理。静态资源位于 `dist/`，后端入口为 `run.py`；当前启动器绑定本机地址。公网部署前需要补充注册与登录限流、可信代理和域名配置，并制定数据库备份流程。
