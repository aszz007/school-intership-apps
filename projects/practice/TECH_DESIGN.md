# 知练技术设计

## 架构

Vue 3 + Vite 构建前端；FastAPI 提供同源 JSON API，并在构建后提供静态文件；Python sqlite3 使用参数化 SQL 存储业务数据。开发阶段 Vite 将 /api 代理至本机后端；交付演示由单个127.0.0.1服务提供前后端。未部署公网。

## 数据库先行

schema.sql 为编号1的初始迁移，先建表再实现接口。表：schema_migrations、users、sessions、questions、attempts、reviews。view_user_topic_stats 汇总用户与主题的答题记录。SQLite 开启 foreign_keys、busy_timeout 和 WAL，每次请求独立连接与事务。

questions 的 owner_id 为空时为公共自编题；否则仅题主可见。questions.version 递增；attempts 保存题干、答案、解析和版本的快照，因此以后修改题目不改写历史。reviews 以(user_id, question_id)唯一标识，保存笔记与掌握状态。attempts 的(user_id, request_id)唯一约束实现重复提交幂等；相同键不同内容返回冲突。

## 接口合约

| 接口 | 用途 |
| --- | --- |
| GET /api/health | 服务及数据库迁移版本 |
| GET /api/session | 当前用户及 CSRF；未登录不暴露用户记录 |
| POST /api/register、/api/login、/api/logout | 注册、会话和退出 |
| GET /api/questions | 按 topic、difficulty、q、mode=all/wrong/own 和 mastery 筛选 |
| POST /api/questions、PUT /api/questions/{id} | 创建/修改自己的题，version 冲突检测；归档通过 archived 字段 |
| POST /api/attempts | question_id、answers数组、request_id；后端判分及保存快照 |
| GET /api/reviews | 自己错题及笔记、最近答题结果 |
| PUT /api/reviews/{question_id} | note、mastered；只改自己的复习项 |
| GET /api/stats | 真实次数、正确率、覆盖和最近七天 |
| GET /api/export | 个人答题/题目/笔记导出，排除认证字段 |

未答题列表不返回正确答案或解析；自己管理题目的 mode=own 可以返回自己题的编辑内容。输入采用严格模型、长度和选项校验。答案使用集合完全相等判分，多选漏选/多选均判错。

## 身份与数据

密码使用随机盐 PBKDF2；随机会话令牌只保存 SHA-256，HttpOnly、SameSite=Lax cookie，有效期24小时。写接口检查同源 Origin，登录后还需会话 CSRF header。数据库/备份目录不挂静态服务，静态目录仅为 dist；无任意路径读写接口。公网部署必须另核对 HTTPS、备份、限流与域名，不用开发模式直接暴露。

统计按北京时间归日，时间戳使用UTC ISO格式。服务器重启沿用.local/practice.sqlite3；自动测试使用临时数据库。

## 设计方案（实际应用 frontend-design）

技能原文：根目录 tools/design-skills/frontend-design/SKILL.md，已实际读取。设计原则为围绕真实学习任务组织布局、主次操作有区别、空结果提供下一步、克制装饰和可访问性。

配色：白 #ffffff、浅灰 #f5f7fa、正文 #182638、主蓝 #2556a8、边线 #dce3ed、反馈绿 #237253；错误另用深红。中文系统字体负责控件，题干使用更宽松行高，正文行长控制在约65字以内。采用侧栏导航和开放题目区域。

文字布局：`导航 | 主题 / 难度 / 搜索 [查找题目] → 题目与选项 → [提交答案] → 对错及解析`。

答题结果使用红绿反馈；统计来自数据库，零数据时提供开始练习入口。
