# 课间校园待办清单

在仓库根目录运行`python tools/serve.py`，打开http://127.0.0.1:4173/todo/。

源码版支持增删改、完成状态、截止日期、优先级、课程/日常分类、组合搜索、排序、统计、JSON备份与12秒撤销。日期使用上海日历日期，输入以普通文字处理。

index.html组织界面，styles.css负责响应式布局，app.js处理状态和事件。校验、迁移、筛选与日期函数位于../shared/core.mjs。存储键为campus-list.tasks.v1，保存version 2对象，兼容本地旧version 1。

秒哒平台版已发布至v6，地址https://app-f1dgvuck4jk1.miaoda.online。源码版与平台版是分别实现的同类应用，备份结构不同，不能混用导入文件；本目录不是秒哒付费导出源码。

实际测试和限制造成的待检查项见../../docs/final/测试文档.md。示例任务可主动加载、编辑和删除。
