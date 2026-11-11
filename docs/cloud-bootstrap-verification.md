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

## 迁移历史调查补充（2026-11-11）

本轮起点为修复分支 `011d4cd465af40dde181338022afec9c8f992697`。用户再次确认无法提供环境清单或迁移应用情况，答复“我也不知道”。调查结论为 **UNKNOWN**，不是“未部署”。按本轮情况 C，先提出兼容方案，**不执行迁移修复、不改写历史 SQL**。

### 已检查证据及其边界

| 来源              | 实际发现                                                                                  | 能证明的范围                                                |
| ----------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Git 完整本地历史  | 非浅克隆；001 仅在 `6b5900e3cac7700e8e1c6ddcdbaf9dbe1da213b3` 首次加入，此后无修改        | 当前可见提交内的文件历史；不能证明无人从其他副本手工执行    |
| 远端 refs         | main 仍为 `26626711139c97cd57bb041200c3657a4c4373e6`；仅 main、修复分支，无远端 tag       | 当前可见 refs；不是所有历史部署的证明                       |
| 全部迁移及 README | 001–005 是事务 SQL；无执行版本表或迁移 runner；文档记载当时未执行                         | 文档陈述及源文件，不是持久化环境的执行收据                  |
| 部署与应用入口    | systemd 仅启动 Node；preflight 仅检查程序；provision-admin 不执行迁移；应用不自动迁移     | 没有发现仓库内自动迁移路径；不排除人工执行                  |
| Cloud 配置        | 无声明的数据库秘密或运行变量；仅保留本会话创建的受保护本地配置，未读取或输出其值          | 当前 Cloud 配置，无外部数据库资产清单                       |
| Cloud 实例数据库  | 仅 postgres、echo_native 两个非模板库，两者均无用户表；echo schema 不存在，无迁移版本记录 | 仅此临时实例；旧失败日志及原先退出码 3 保留，不外推其他环境 |
| 其他持久化环境    | 用户无法提供清单或执行凭据；依任务边界未连接任何 VPS/外部数据库                           | **UNKNOWN**，缺少完整环境清单、应用版本和可审查执行记录     |

001 的 SHA-256 为 `bc404f56cf0658c138c2177a1d277a74ca4292d234a4269aba6c51fde5fb96e6`，本轮仍保持原字节。语法错误只能说明本文件在已测试 PostgreSQL 17.11 上失败；不能排除其他环境执行了手工加引号或其他本地变体。后续发现“成功执行”记录时，必须核对实际文件摘要和 schema，不能把它直接等同于原始文件。

### 情况 C 的兼容计划（提案，未实施）

共同目标是 `echo.account_identity_keys.authorization_proof bytea NOT NULL`，长度约束 1–16384 字节，保留既有 23 张基础表、增量结构、所有权、索引、外键、触发器和最小权限。合法的 `CREATE SCHEMA ... AUTHORIZATION` 保留。任何异常、未知列类型或版本差异均停止，不删除数据或自动猜测。

1. **先建立可审查的环境分类与版本证据**：由获授权运维提供每个持久化环境的标识、PostgreSQL 版本、001 实际文件摘要/变体、已执行版本、相关列/约束及权限的只读目录查询结果。不要提供密码或业务数据。无版本表时依实际结构和执行收据核验，不能单凭某一列推断 002–005 全部完成。对未知或部分完成的环境先冻结自动迁移。兼容方案需经用户明确选择/核准后才实现。
2. **新环境初始化路径（需要核准的新工件）**：原 001 保持原字节归档。新增单独命名、版本及校验和明确的修正版初始基线，仅修正字段及长度约束为 authorization_proof，明确不是原 001 的成功执行；随后严格执行原 002→003→004→005。记录初始基线变体和后续每份文件摘要及退出码。禁止原 001 失败后静默跳过或偷偷过滤替换输入。空库预检失败则停止，不能将已有 schema 当空库重建。若用户最终确认全部持久化环境均未应用且选择情况 A，则可改为审查原 001 的首次成功部署前修正，无需并行基线。
3. **旧环境升级路径（需要核准的向前迁移）**：保留 001–005。在已确认的旧基线库中，先核对实际版本，只补未执行的 002–005；尤其 003 遇已有消息/inbox/非零计数时会主动中止，必须另审查历史投递转换，不能绕过。之后新增向前迁移（候选编号 006，尚未创建），在 owner 事务中锁定 account_identity_keys，校验列类型、NOT NULL、长度约束及依赖，使用带引号的旧列名进行 RENAME COLUMN "authorization" TO authorization_proof。列重命名保留数据和依赖绑定，仍需对约束、视图/函数文本、列级 ACL 和客户端引用逐一验证。仅新列存在时验证完整目标结构并记录 no-op；双列并存、两列皆无或其他结构偏差则拒绝。禁止新建空表覆盖旧表。
4. **Schema 收敛证明**：在两个独立临时库分别走经核准的新库路径、旧库夹具升级路径，比较规范化 pg_dump --schema-only 及列/约束/索引/触发器/owner/ACL 目录结果；忽略仅属于版本登记的预期差异。旧库夹具的历史文件变体必须显式命名并单独记录，不能称原始 001 通过。以 owner 执行 DDL，普通 echo_native_api 执行业务及拒绝权限测试，使用合成数据验证行和引用保持不变。
5. **运行验收**：迁移逐份 ON_ERROR_STOP、记录退出码并首错停止；成功后再验证注册/operationId 重试/摘要冲突、邀请消费和幂等、用户名唯一、登录/Session/重新认证/退出及注册关闭。当前这些步骤均 **NOT_RUN/BLOCKED**，没有冒充运行成功的固定响应。失败时事务回滚，保留执行收据；不对历史表执行破坏性“回滚修复”。

该计划没有自行选定覆盖方案，也不声称仅添加 006 就能让无法解析的原 001 在新库成功。只有向前迁移而没有新库基线是不完整方案；只有修改 001 而无旧库升级方案也无法保证混合环境收敛。

### Cloud 网络与 PR 再核查

配置草稿 revision 4 包含自定义 `api.github.com`。当前实例仍使用原 source config version，spec/observed revision 均为 1，observations_current=true、策略 enforced，但实际 allowed/effective hosts 均未含该域名；新的 HTTPS CONNECT 请求被代理拒绝 403（curl 退出 56）。因此仅能确认**草稿已保存、当前实例未应用**；现有工具证据不足以独立确认用户是否已在其他版本发布，不能声称发布成功。

需要用户在环境设置审核并 Save draft 应用 `api.github.com`，再按产品流程 Publish。保存/发布后需刷新状态并用新连接重试；草稿写入本身不改变当前网络。未要求新 GitHub token：Git HTTPS 读写仍正常，但不等于 GitHub API 已获网络或凭据访问。

PR 当前 **BLOCKED/未创建**。完整交付要求包含迁移修复，而迁移策略尚未核准，因此当前分支先保留 React 修复和调查报告；即使网络恢复，也不能将它描述为完整数据库修复 PR。后续按选定路径完成验证后再创建目标 main 的 PR，不自动合并。

本轮报告检查：Prettier 全仓检查通过（退出 0）；check:source 退出 2、PARTIAL，111 文件、67 本地文档引用、零失败；git diff --check 通过。未改应用代码或依赖，无需重复此前已完成的构建/类型/Hook 浏览器检查；数据库工作流保持未执行。
