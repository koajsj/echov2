# Cloud 启动与迁移兼容验证

2026-11-11，Cloud 分支 `codex/fix-cloud-bootstrap-lint`，main 基线 `26626711139c97cd57bb041200c3657a4c4373e6`，本轮起点 `023d93a29cabd9ef6cb941f9f514f43d3438aa35`。本报告是当前运行证据；技术操作唯一来源为 [迁移说明](../migrations/README.md)。先前调查及失败记录保留在 Git 历史中。

**FIXED/PASS**：新库基线、旧库 006、轻量执行器、版本/摘要记录、两路径收敛、合成数据保留、最小权限和真实 HTTP 认证。**UNKNOWN/NEEDS_RUNTIME_VERIFICATION**：其他持久化环境是否执行过原始/手工变体迁移，仍无完整证据；本次不自动 adopt。Cloud 临时成功不能证明未知历史安全。MLS、信任设备准入、加密聊天和生产部署继续 **BLOCKED**，没有新增第四阶段。

## 001–005 字节保护

执行前保存 SHA-256，执行后逐份核对；与 main 的 Git 差异也为零。原始 001 保留未加引号的 authorization，包括此前 PostgreSQL 17.11 语法错误、退出 3 和事务回滚事实；没有把它称为新库成功基线。

| 历史文件                           | 执行前与执行后 SHA-256                                             | 比对       |
| ---------------------------------- | ------------------------------------------------------------------ | ---------- |
| 001-initial.sql                    | `bc404f56cf0658c138c2177a1d277a74ca4292d234a4269aba6c51fde5fb96e6` | PASS，相同 |
| 002-runtime-permissions.sql        | `8d94e1f7e4eca7814d7bd145978c73d098cfa8d971feeeabf0fa14f1ae076962` | PASS，相同 |
| 003-route-version-and-delivery.sql | `8c4bf81e53fa51af3c891a5530388b75334d0e5a1dc6394b024e9c0a2fef1ccf` | PASS，相同 |
| 004-invitation-idempotency.sql     | `5f79462433d0d182c331767b599f3187e709cf993120945089f1632a422008bb` | PASS，相同 |
| 005-admin-lifecycle.sql            | `ccb640eb1f7e5c6b1fb740b6f6c2fe1d9291899fc1f306ac90ed3cbb54c0d65e` | PASS，相同 |

## 新工件与执行器

新基线：`migrations/baselines/echo-native-v1/001-initial.sql`，baseline_id 为 echo-native-v1；manifest 固定文件路径、摘要、PostgreSQL major 17 验证范围、来源摘要和差异。逐字比较确认只修改目标列和其 CHECK 显式名称；合法 CREATE SCHEMA AUTHORIZATION 未变。

- 新基线 SHA-256：`22afb6fd24d654824f0021b77ba6ce5ec3efbffcac35647ba8e0bf46f011a2e8`。
- 006 SHA-256：`ba2faca6bf545b5ba1002d82d178ac4ab5092e2207d9305589f9b825793ab999`。
- 合成旧夹具 SHA-256：`0eaf99e9235e4330984eb3261392c18638f13dc1de407039a0b4834b25d6e943`。夹具只给旧列定义及 CHECK 引用加引号，使用 synthetic-legacy-fixture 收据，未修改原文件。

006 完整 SQL 见 [006-authorization-proof.sql](../migrations/006-authorization-proof.sql)：owner 校验、事务/表锁、明确基线收据、双列/缺列/未知新列拒绝，检查 bytea、NOT NULL、无意外默认/列 ACL、唯一精确长度 CHECK、约束依赖、列相关索引/视图依赖和函数文本引用。只执行 RENAME COLUMN 与 RENAME CONSTRAINT，不复制/删除数据；已明确 canonical 基线或 006 完成收据的新列只校验。两路径统一 account_identity_keys_authorization_proof_check。

`scripts/migrate.mjs` 提供 inspect/plan/status/apply 和显式 --manifest；空库检查、普通 owner 连接、服务端版本范围、全部文件摘要、既有记录顺序/名称/摘要、元数据所有权/ACL、目标库名确认及数据库 advisory lock。应用启动完全不调用执行器。没有新依赖或迁移框架。

独立 echo_meta.schema_migrations：唯一 version、migration_name、sha256、status、started_at、applied_at、postgres_version、error_code。SQL 前持久化 started；确认 SQL 错误后回滚并记 failed；SQL 成功提交后才写 applied。提交确认丢失或记账失败保留 started；所有 failed/started 拒绝自动续跑。未知历史无记录库直接拒绝，人工核验/授权接管不由本工具自动完成。元数据只授权 owner，API/PUBLIC 无访问权。

## 数据库与 SQL 结果

使用新建隔离 PostgreSQL **17.11** 集群、工作区 Unix socket/55432。Cloud 管理连接只创建普通角色/临时库；所有业务 Schema DDL 和迁移元数据 DDL 由无超级权限的 echo_native_owner 执行。API 实际运行账号为 echo_native_api，连接 loopback echo_native；没有访问生产 VPS、生产数据库或真实用户数据。最终独立路径验收库为 echo_release_new、echo_release_legacy（此前 echo_accept_new/echo_accept_legacy 也通过）。

| 步骤   | 新库路径                           | synthetic legacy fixture 路径        |
| ------ | ---------------------------------- | ------------------------------------ |
| 001    | 独立修正版，exit 0                 | 明确标记的带引号夹具，exit 0         |
| 原 002 | exit 0                             | exit 0                               |
| 原 003 | exit 0                             | exit 0                               |
| 原 004 | exit 0                             | exit 0                               |
| 原 005 | exit 0                             | exit 0                               |
| 006    | canonical 结构验证/no-op，exit 0   | 列/约束重命名，exit 0                |
| 记录   | 001–006 全 applied，原文件摘要匹配 | 001–006 全 applied，001 夹具摘要明确 |

这里 exit 0 是执行器对每份完整 SQL query 成功返回后的记录，Node 回归命令实际退出 0；不是未运行的 psql 命令。每份 SQL 自带事务，服务端错误立即停止，未吞掉任何失败退出码。新/旧初始测试及最终验收库独立，临时集群之外的环境未作成功推断。

**PASS**：两库 `pg_dump --schema-only --schema=echo` 逐字一致（仅去除每次随机生成的 dump restrict/unrestrict 令牌行）；并比较系统目录的表/字段/类型/默认/NOT NULL、owner、关系和列 ACL。dump 覆盖 PK/FK/唯一/CHECK/索引/触发器/函数/序列与授权；元数据不在 echo Schema，按要求排除。

最终 echo：23 张表、23 主键、33 外键、16 唯一约束、60 CHECK、55 索引、3 非内部触发器。所有对象通过实际 PostgreSQL 解析/DDL；历史原始 001 仍是明确记录的预期语法失败，不能声称所有历史 SQL 可直接运行。

**PASS（数据保留）**：006 前插入合成账户和 identity key，证明值 `000102ff`、4 字节在重命名后不变；公钥、账号引用和其余 Schema 未替换。规范化 Schema 完全收敛。

## 安全回归与权限

可复核工具：`scripts/check-migrations.mjs`，Cloud 受确认的临时目标与 socket/端口才运行。每次使用新空的 legacy 目标；不覆盖已有库。负例数据库是脚本自己创建的随机临时库，finally 仅删除这些库。

**PASS**：并发 advisory lock 拒绝、磁盘文件摘要和既有收据摘要不符拒绝、无记录已有 Schema、伪系统前缀 Schema、public 函数/类型拒绝、已完成空计划不重复执行；真实 SQL 失败回滚/failed 收据阻止重试；模拟 SQL 已 COMMIT 而记账 UPDATE 失败时保留 started 并拒绝重跑。003 在非零历史计数时失败，保留原计数，不执行后续文件。

**PASS**：006 七类负例均失败并留下 failed 收据：双列、缺列、错误类型、缺长度 CHECK、意外列 ACL、依赖视图、无相符 canonical/006 完成收据的新列。失败未创建替代表或丢弃数据。

**PASS**：owner/API 均无 SUPERUSER/CREATEDB/CREATEROLE/BYPASSRLS，API 不是 owner 成员，无数据库 TEMP 授权。实际以 API 连接验证拒绝：创建 Schema/角色，读取或更新迁移表，写 identity key、改聊天密文、直接将删除记录完成；对有合成记录的设备激活/群组激活，分别由实际触发器拒绝。业务注册 INSERT 仍允许。Schema dump 比较同时覆盖所有表/序列/函数/Schema/列 ACL。测试没有扩大 API 权限。

**NOT_AVAILABLE（MLS 私钥存储）**：Schema 本就没有 MLS 私钥列或私有 Group State 表；读取 private_key 被 PostgreSQL 拒绝为列不存在，不能把这个结果冒充已实现 MLS 的密钥访问控制认证。

## 真实 HTTP 认证

`scripts/check-auth-workflow.mjs` 使用实际 Fastify TCP HTTP 和真实 PostgreSQL，不用 inject/Mock；真实部署拓扑的 TLS 由 Caddy 提供，内部 API 请求通过 loopback，Origin 固定为配置的 HTTPS origin。合成密码随机生成且不打印，限流规则保持原样；独立 RFC 5737 源 IP 仅用于隔离测试场景。实际命令退出 0。

| 行为                    | HTTP                   | 数据库核对                                                |
| ----------------------- | ---------------------- | --------------------------------------------------------- |
| 注册模式读取/开放后注册 | 200/201                | 随机 operationId 对应一行                                 |
| 相同 operationId 重试   | 201                    | 同一 account id，不新增行                                 |
| 不同摘要冲突            | 409 OPERATION_CONFLICT | 原记录保留                                                |
| 用户名唯一              | 409                    | 唯一约束拒绝                                              |
| 邀请消费/同操作重复     | 201/201                | uses 仅增至 1                                             |
| 邀请耗尽再使用          | 403                    | 不额外消费                                                |
| 登录/Session            | 200/200                | 真正 session 行与 account id 相符；Secure Cookie 真实生成 |
| 重新认证                | 200                    | reauth-success 和 login-success 事件各一条                |
| 修改用户名              | 200                    | 更新同一 UUID 记录                                        |
| 登出/旧 Session         | 204/401                | session 行删除                                            |
| 注册关闭及拒绝新注册    | 200/403                | 对应 operationId 无用户行                                 |

早期认证测试曾误把 `{account: ...}` 响应读作顶层 username，修正测试断言后完整重跑通过，没有修改 API 返回契约。过程中重复启动服务曾因本次已运行的进程占用 3001 失败；端口归属、当前配置和真实功能请求已确认，复用同一本任务服务，不当作数据库缺陷。

## 工程检查与边界

| 命令                 | 实际退出码 | 结果                                            |
| -------------------- | ---------- | ----------------------------------------------- |
| npm run typecheck    | 0          | PASS                                            |
| npm run lint         | 0          | PASS                                            |
| npm run format:check | 0          | PASS                                            |
| npm run check:ast    | 0          | PASS                                            |
| npm run check:source | 2          | PARTIAL，117 文件、42 解析、30 JSX 跳过、零失败 |
| npm run build:client | 0          | PASS                                            |
| npm run build:server | 0          | PASS                                            |

未禁用检查、未更改依赖声明/锁文件/MLS 门禁。历史五份 SHA-256 再次一致；原字段在历史 SQL/合成夹具中的引用有意保留，其他源码无业务列名使用需要替换。React 修复保持已有提交，先前下载/Hook 浏览器回归证据仍只覆盖其组件范围；本轮新增认证验收是实际 HTTP/DB，未额外宣称生产浏览器、跨设备、容量或恢复已通过。

## GitHub 与待审查范围

新运行环境 source config version 已更新，observations_current=true，api.github.com 在当前 enforced effective hosts 中；`gh pr list` 实际成功，草稿与运行策略不再混淆。本轮不重新应用旧草稿，也不发布环境。main 实际仍为上述基线；保持原修复分支和全部提交，不 force push，不合并/部署。

实现提交 `4b7d78a9bedc852fbde7e654970554f52c6434a6` 已通过正常 Git HTTPS 推送。已创建 [PR #1](https://github.com/koajsj/echov2/pull/1)，目标 main，状态 OPEN，包含先前 React 修复、本轮兼容迁移和验证报告；未合并或部署。此后仅追加交付记录提交。

未知持久化环境依然需要独立资产清单、实际 SQL 变体/版本/结构/执行收据和接管授权；本工具拒绝自动 adopt。旧投递历史触发 003 时需要独立转换审查。PostgreSQL 其他 major、真实 MLS、生产硬件容量、备份恢复及跨设备安全仍 NEEDS_RUNTIME_VERIFICATION/BLOCKED，不能因为 Cloud 注册成功提前解除门禁。
