# 知练

Vue 3 + FastAPI + SQLite 学习练习系统，支持账号、单选与多选、错题复习、笔记、学习统计和个人题库。内置 18 道自编软件开发基础题。

## 运行

需要 Python 3.12 和 Node.js 24。在本目录执行：

```powershell
powershell -NoProfile -File scripts/setup.ps1
powershell -NoProfile -File scripts/start.ps1
```

打开 http://127.0.0.1:4250/，创建学习账号即可使用。用户名为 3–24 位字母、数字或下划线，密码至少 10 个字符。服务窗口按 Ctrl+C 停止。

## 开发

```powershell
.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -v
npm run build
.venv/Scripts/python.exe -X utf8 run.py
```

`npm run dev` 在 4251 端口提供前端开发服务，将 `/api` 请求转发到 4250。构建后由 FastAPI 在 4250 同时提供前端和 API。

数据库位于 `.local/practice.sqlite3`，重启后保留。页面可导出当前账号的学习记录；完整数据库备份请先停止服务，再复制数据库文件。

接口与数据库设计见 [TECH_DESIGN.md](TECH_DESIGN.md)，功能见 [PRD.md](PRD.md)，测试范围见 [TESTING.md](TESTING.md)，部署方式见 [DEPLOYMENT.md](DEPLOYMENT.md)。
