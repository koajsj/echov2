# Cloud 启动阻塞修复验证

2026-11-11，基线 `26626711139c97cd57bb041200c3657a4c4373e6`，分支 `codex/fix-cloud-bootstrap-lint`。本报告补充此前静态报告；仅在 Codex Cloud 工作，未连接生产 VPS/数据库，未修改旧 echo-v2。整体 **PARTIAL**，等待历史迁移应用情况核查；MLS 等安全门禁不变，不增加第四阶段。

## 修复范围

- **FIXED**：`useApiQuery` 删除 Effect 内同步 loading 更新，request key 不匹配时派生空数据/loading；保留 AbortController、取消、sessionId/revision 依赖、异步错误和 aborted 检查。旧请求不得覆盖新结果。
- **FIXED**：`DownloadFile` 改为可键盘操作的 HeroUI secondary Button，用户点击时创建临时链接与 Blob URL，设置文件名、触发下载，在 finally 移除链接并通过下一任务 revoke。每次点击独立释放，不在渲染、Effect 或 useMemo 创建 URL。CsvExport/MetadataArchivePanel 的 props 无变化。
- **BLOCKED**：001 中 `account_identity_keys.authorization` 是 PostgreSQL 保留字，未加引号导致语法错误（SQLSTATE 42601）。全仓库检索仅发现该列定义及长度约束；合法 `CREATE SCHEMA echo AUTHORIZATION echo_native_owner` 和 HTTP authorization 日志脱敏无需变更。
- 用户对其他持久化环境是否成功应用旧迁移答复“不确定，需要先核查”。因此本次**未修改历史迁移**，不能宣称已确认首次成功部署前。待确认从未应用后，才可将字段及约束改为 `authorization_proof`；若已有成功应用环境，先制定兼容迁移方案。

## PostgreSQL 实际结果

Cloud 隔离 PostgreSQL 17.11，数据库 echo_native。DDL 使用 `SET ROLE echo_native_owner`，每次 psql 带 `-X -v ON_ERROR_STOP=1`。应用账号 echo_native_api 为普通 LOGIN，owner 为 NOLOGIN；两者均无 superuser/CREATEDB/CREATEROLE/BYPASSRLS。密码仅在 Cloud 受保护配置中，不纳入 Git。

| 迁移                               | 实际退出码 | 状态                                                          |
| ---------------------------------- | ---------- | ------------------------------------------------------------- |
| 001-initial.sql                    | 3          | BLOCKED：第 62 行 authorization，报错定位第 65 行表定义结束处 |
| 002-runtime-permissions.sql        | 未执行     | NOT_RUN，遵守首错停止                                         |
| 003-route-version-and-delivery.sql | 未执行     | NOT_RUN                                                       |
| 004-invitation-idempotency.sql     | 未执行     | NOT_RUN                                                       |
| 005-admin-lifecycle.sql            | 未执行     | NOT_RUN                                                       |

**PASS（回滚）**：失败连接退出后另开连接查询 pg_namespace，echo schema 数量为 0；本次事务创建的表/函数等均随 schema 回滚。未跳过迁移或搭建替代 Schema。

**PARTIAL（权限）**：角色属性、数据库 owner、撤销 PUBLIC 数据库权限已检查。由于 Schema 不存在，23 张基础表、增量结构、外键、唯一约束、索引、触发器、运行时 DML 授权均 **NOT_RUN**，不能宣称 API 最小权限完整通过。

## 工程命令

在 `/workspace/echov2` 使用 Node 24.22.1、npm 11.9.0 和仓库精确依赖运行，无依赖声明或锁文件变更。

| 命令                 | 退出码 | 结果                                                                   |
| -------------------- | ------ | ---------------------------------------------------------------------- |
| npm run typecheck    | 0      | PASS，client/server/tools                                              |
| npm run lint         | 0      | PASS，无禁用规则/忽略文件                                              |
| npm run format:check | 0      | PASS                                                                   |
| npm run check:ast    | 0      | PASS，66 TS/TSX 文件、234 本地绑定                                     |
| npm run check:source | 2      | PARTIAL，111 文件、39 解析、30 JSX 跳过、零失败，退出 2 为脚本覆盖限制 |
| npm run build:client | 0      | PASS                                                                   |
| npm run build:server | 0      | PASS                                                                   |

## 浏览器与真实工作流

使用 Cloud Chromium/Playwright，未伪造注册或数据库响应。

- **PASS**：真实登录页面渲染、页面切换；页面 JavaScript 错误为零。真实注册模式 API 返回 500，页面显示模式不可用。
- **PASS（组件级）**：挂载真实 CsvExport/DownloadFile，使用合成数据，连续三次下载 `synthetic.csv`，核对文件内容和公式转义；键盘 Enter 下载 `echo-service-metadata.echo`，核对 ECHOMD01 文件头，并用实际 WebCrypto seal/open 验证合成元数据往返。四次创建、四次 revoke，无遗留 URL。测试未伪造已登录页面。
- **PASS（Hook 回归）**：使用可控 Promise 检查 sessionId 切换立即隐藏旧数据、revision 重新请求、AbortSignal 取消、迟到响应不覆盖新结果、真实错误状态。该组件级测试不是服务端工作流证据。
- **BLOCKED**：注册成功、operationId 重试/摘要冲突、用户名唯一、登录、会话读取、退出、关闭注册拒绝行为，以及登录后的 MetadataArchivePanel 和管理员 CSV 完整流程；须先解除迁移核查阻碍。没有将健康接口返回 alive 视为注册通过。
- **NEEDS_RUNTIME_VERIFICATION**：五份迁移成功后的上述数据库和浏览器完整流程，及既有文档列出的真实 MLS/跨设备/恢复/容量准入。

Cloud 复核脚本和详细日志保存在 `/workspace/.cloud-setup/browser/fix-downloads.mjs`、`fix-query.mjs` 及 `/workspace/.cloud-setup/fix-evidence/`；均不包含实际用户数据，不提交 Cloud 临时产物。

## 交付限制

已检查 Git 跟踪差异、迁移原字节、依赖原字节及敏感文件边界。保留全部提交，不覆盖 main，不 force push。GitHub API `api.github.com` 当前被 Cloud 代理 CONNECT 403 拒绝；已保存该域名到环境网络配置草稿，须在环境设置保存应用后才能重试创建 PR。草稿保存不代表网络已生效或环境已发布。分支推送与 PR 的实际结果以交付回复为准。

代码修复提交 `2220d92756103db7d41f7033b5064f00c2de41d2` 已成功推送并核对远端分支。PR 尚未创建，原因是上述 GitHub API 网络阻碍；不是已有 PR 链接遗漏。工作区未提交凭据、Cloud 数据库、缓存或临时测试文件。
