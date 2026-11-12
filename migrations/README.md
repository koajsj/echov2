# PostgreSQL 迁移

## 当前迁移清单：001–008（008未执行）

新增 `008-device-revocation.sql`，只作为待审工件；本机未执行SQL。001–007及独立基线SQL不变，manifest追加008摘要，执行器只接受明确有序前缀。008要求普通owner，固定pg_catalog search_path、全表名限定的SECURITY DEFINER触发器在设备状态转为revoked的同事务标记公开Credential撤销并删除未领取KeyPackage。API无直接Credential/KeyPackage写权限，PUBLIC/API无函数执行权；不授予签发、激活或解冻能力。已经领取的包和凭证字节保留供对账，不承诺追回外部分发副本。

008会补偿此前已撤销设备的上述公开材料；申请SHARE ROW EXCLUSIVE锁，执行窗口需独立规划。数据库中原生MLS Group State/私钥不存在；本迁移不是Remove Commit，也不解除组冻结。使用前必须在隔离环境验证owner/ACL、触发器回滚、重复撤销、并发领包、历史回填和两条迁移路径；本轮均NOT_RUN。现有维护脚本使用manifest加载008，历史Cloud报告只覆盖至007。

此前新增 `007-public-user-id.sql`，在006之后由独立owner显式执行；不是新项目阶段。001–006、初始基线SQL原字节保持不变，现有manifest仅追加007及其SHA-256，baseline_id不变。迁移执行器仍验证旧回执和完整有序前缀，不自动认领未知数据库，应用启动不运行迁移。

007为users新增唯一、非空、12位大写RFC4648 Base32公共ID。使用PostgreSQL内置CSPRNG UUID取随机位生成60位标识；独立唯一约束裁决碰撞。旧行原位回填，内部UUID、外键、会话及身份关联保留。回填遇到此唯一约束碰撞重新生成；新注册使用SAVEPOINT重试，最多8次，耗尽整体回滚并返回503。公共ID不是凭据，API没有该列UPDATE权限。

Cloud隔离验证：从006含旧账户/设备升级007、5,000个样本、强制首次碰撞/重试成功、持续碰撞/零写入、并发注册幂等和API修改拒绝。运行 `node --import tsx scripts/check-public-user-id.mjs` 必须显式设置其源码要求的临时Cloud目标。当前23表、33外键、17唯一约束、56索引、3业务触发器、4函数。旧001 authorization语法错误依然仅作为保留历史工件，不应用于新库。

历史007运行证据见[PC审查](../docs/evidence/pc-review.json)，本轮静态边界见[工程报告](../docs/static-verification-report.md)。以下保留兼容路径与执行安全要求；旧001–006及007结论不是008运行证据。

## 兼容路径与迁移操作

这是迁移机制的权威说明。Cloud 实测结果见 [验证报告](../docs/cloud-bootstrap-verification.md)，数据职责见 [数据生命周期](../docs/native-data-lifecycle.md)。历史持久化环境状态仍 **UNKNOWN**；本次授权仅覆盖 Cloud 隔离数据库，不能自动接管其他已有数据库。

## 工件与顺序

- `001-initial.sql` 至 `005-admin-lifecycle.sql` 是不可变历史文件。原 001 含未加引号的保留字 authorization，不能用于新库初始化；不要修改、过滤执行或把失败标成成功。
- `baselines/echo-native-v1/001-initial.sql` 是独立修正版基线，仅改为 `authorization_proof bytea NOT NULL` 并显式命名长度 CHECK 为 `account_identity_keys_authorization_proof_check`（1–16384 字节）。合法 `CREATE SCHEMA ... AUTHORIZATION` 不变。
- `baselines/echo-native-v1/manifest.json` 固定基线来源、SHA-256、验证过的 PostgreSQL major 范围（当前仅 17）以及全部有序增量摘要。修改已发布工件会造成摘要冲突，必须以新的版本交付，不能更新已有库的摘要来掩盖差异。
- 新库：修正版基线 → 原 002 → 原 003 → 原 004 → 原 005 → 006。006 对有 canonical 基线收据的新列仅做结构验证并记账，不重命名。
- 旧库：获审查的旧基线/版本收据 → 仅缺失的 002–005 → 006。006 使用事务和表锁，将 `"authorization"` 重命名为 authorization_proof，并统一 CHECK 名称；不复制表/列，不删除数据。旧列类型、NOT NULL、长度 CHECK、列 ACL、约束/索引/视图/函数依赖无法确认时拒绝。双列、缺列或无明确记录的新列拒绝。执行器不会重跑完成版本。

003 在消息/inbox 或非零 group head 存在时主动中止。不得绕过或清空数据；此情况需要独立历史投递转换方案。旧应用回滚不等于可以回滚 Schema。MLS、设备信任、聊天写入和生产部署门禁不变。

## 角色和连接

由获授权运维单独创建数据库 echo_native、echo_native_owner 和 echo_native_api。数据库及 Schema 由 owner 拥有；owner 迁移连接必须是非超级用户，无 CREATEDB/CREATEROLE/BYPASSRLS，使用其正常受保护凭据，不能以 superuser 代替。owner 是否 LOGIN 取决于独立的运维连接策略；执行器校验 current_user 必须为 echo_native_owner。

API 是普通应用 LOGIN，不授 Schema/数据库所有权，不加入 owner 角色。撤销 PUBLIC 数据库 CONNECT/TEMP 和 public Schema CREATE；只授 API CONNECT 和历史权限文件中明确列出的业务授权。连接只走经授权目标；Cloud 测试固定工作区 Unix socket/55432，应用固定 loopback。不得把测试 trust 认证用于生产。

## 执行器

在仓库根目录运行现有 Node/pg，无迁移框架或新增依赖。通过受保护环境设置 MIGRATION_DATABASE_URL，或使用 pg 原生 PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD；不要在命令行或报告粘贴密码。

```sh
node scripts/migrate.mjs inspect
node scripts/migrate.mjs plan
node scripts/migrate.mjs status
node scripts/migrate.mjs apply --confirm-database echo_native
```

inspect/plan/status 不修改数据库。apply 必须明确匹配数据库名，取得数据库范围的 session advisory lock；先检查目标版本及所有文件摘要、已有收据的版本顺序/名称/摘要/状态。新库必须无业务 Schema 或 public 对象；不会清空已有库。已有未记账的数据库一律拒绝，没有自动 adopt 子命令。

旧库必须先取得完整结构证据、历史文件和版本执行凭据、明确授权，另行审查 owner 登记及恢复方案。**本工具不提供自动 adopt 或自动补收据**。在已经明确登记的旧库上，可显式传 `--manifest /protected/reviewed-legacy-manifest.json`，其 001 名称和摘要必须逐项匹配既有收据，002–006 路径/摘要也需审查。不能把 Cloud synthetic legacy fixture 的收据当实际部署证据。

apply 单连接持锁贯穿整个计划。每个受校验 SQL 自带 BEGIN/COMMIT，服务端遇错立即抛出、停止本文件及后续文件，相当于 ON_ERROR_STOP；不会通过 shell 管道吞掉退出状态。每次成功输出版本、SHA-256 和 exitCode 0，命令失败退出 1；失败详情在 owner 收据中保留 SQLSTATE。所有 CLI 驱动异常均抑制原文，避免数据库 URL 凭据进入日志；使用 inspect/plan/status 排查，不打印环境或凭据文件。

## 记录与恢复

独立 `echo_meta.schema_migrations` 仅 owner 有访问授权（系统管理员固有权限不在此保证内），PUBLIC/API 无 Schema/table 权限。字段为唯一 version、migration_name、sha256、baseline_id、status、started_at、applied_at、postgres_version、error_code。执行器验证元数据对象所有权与 ACL 后才信任记录。

1. 新台账初始化先把 manifest 全部版本及 baseline_id 以 pending 独立提交；SQL 前要求恰好一行 pending→started，写 started_at 后再执行文件事务。pending 基线尚未执行时仍必须空库。初始化失败先回滚，再释放 advisory lock。
2. 已确认服务端错误：ROLLBACK 后记录 failed/SQLSTATE，不执行后续版本。
3. SQL COMMIT 后独立记录 applied/applied_at，必须恰好更新一行；触发器吞掉 UPDATE（零行）也不是成功。若执行结果或记账无法确认，保留 started，禁止重跑。
4. failed/started、摘要/名称/顺序不符或 Schema 与基线记录不一致，一律阻止自动续跑。已完成版本不再执行，完全完成的 apply 为空计划。
5. Owner 必须人工核对执行日志、文件摘要、实际 Schema/数据和依赖，明确 SQL 是否提交，审查恢复操作后才能修复收据或提交新的恢复版本。本工具不会自动把未知状态标为 applied，也不提供盲目清除收据/重试功能。不要仅因为应用能启动就改账。

## Cloud 回归

`scripts/check-migrations.mjs` 只允许明确确认的工作区 socket/55432。两个目标库应是本任务刚创建的独立空库（new 路径也允许已完成同一 manifest 的空计划）；旧夹具路径需要空库，不会覆盖或自动清库。仅 test admin 创建/删除测试工具自己生成的随机负例数据库；全部迁移/业务 Schema DDL 均由普通 owner 执行。

```sh
PGHOST=/workspace/.cloud-setup/compat-socket PGPORT=55432 \
TEST_NEW_DATABASE=echo_verify_new TEST_LEGACY_DATABASE=echo_verify_legacy \
CONFIRM_CLOUD_TEST_DATABASES=echo_verify_new,echo_verify_legacy \
node scripts/check-migrations.mjs

PGHOST=/workspace/.cloud-setup/compat-socket PGPORT=55432 \
CONFIRM_CLOUD_AUTH=echo_native node scripts/check-auth-workflow.mjs
```

迁移测试显式生成临时 `synthetic legacy fixture`（仅将旧列定义/约束引用加引号），以独立名称、摘要和 started/applied 收据从空库执行，不自动接管任何现存历史库。它验证数据保留、pg_dump/目录一致性、权限拒绝、校验和/锁/失败/未知状态、003 历史保护及七类 006 异常。认证测试连接真实运行的 Fastify 和 PostgreSQL，使用随机合成账号/密码、独立 RFC 5737 测试地址隔离速率限制场景，不关闭生产限流规则；结束后恢复注册关闭。

应用启动禁止自动迁移。离线管理员 provision、生产数据库、未知历史接管、真实用户数据导入及生产部署均需独立授权，不属于本次 Cloud 验证。

## 2026-11-12 台账模型与验证补充

历史 001–005、已发布 006、独立基线及 manifest 的字节和摘要全部保持不变。本轮只修正执行器与回归工具，不修改已发布 SQL 来补元数据。新台账包含 baseline_id、pending/started/applied/failed；同一台账的 baseline_id、名称、摘要、版本前缀和状态必须逐项匹配。

旧版台账若缺 baseline_id，执行器明确拒绝自动升级。Owner 须先保存既有收据/Schema/文件摘要证据，核对实际历史、是否有 started/failed 和提交结果，再单独审查 ALTER 台账、约束变更及逐行绑定基线的恢复脚本；不得默认填 echo-native-v1，也不得删除原台账后重跑。未知持久化环境继续 UNKNOWN，无自动 adopt 路径。Cloud 既有应用测试库的旧台账不会被悄悄更新。

当前新路径 echo_final5_new 与 synthetic legacy 路径 echo_final5_legacy 已完成 001–006；每份记录 exitCode 0。23 张业务表、pg_dump --schema-only、目录、Owner/ACL 一致，旧 proof 的 000102ff 字节保留。附加回归覆盖 pending 后出现未记账对象、初始化事务回滚/解锁、零行 applied 回执、失败/未知结果停止、摘要/基线不符、003 旧数据保护和 006 七类异常。具体结果见[数据库验证](../docs/cloud-bootstrap-verification.md)。这些临时数据库测试不证明任何持久化环境的迁移历史。
