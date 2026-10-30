# 知练验证记录

当前维护版0.1.1，2026年10月20日复核。

10组FastAPI与临时SQLite集成测试通过，覆盖账号隔离、CSRF、单多选判分、重复及并发提交、错题笔记、掌握状态、题目权限、版本冲突、历史快照、归档恢复、重开持久化与导出。命令：.venv/Scripts/python.exe -X utf8 -m unittest discover -s tests -v。

Vue/Vite构建通过。内置浏览器已有登录、答题、错题、笔记、统计、个人题目、筛选及窄屏检查。当前图片位于根目录evidence/final-audit-20261019/browser；历史完整流程位于evidence/practice-2026-10-19。

现有Starlette对httpx测试适配器有弃用提醒。后续可在依赖升级时迁移并复测。

待检查：公网、高并发、真实手机硬件、最终讲解视频。当前运行方式为本机SQLite单实例。
