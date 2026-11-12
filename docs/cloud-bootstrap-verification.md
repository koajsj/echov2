# Cloud 数据库兼容验证

2026-11-12，纯 Codex Cloud、临时 PostgreSQL 17.11、合成数据。迁移操作唯一维护于 [migrations/README.md](../migrations/README.md)；产品与工程结论分别见[第三阶段报告](phase-three-report.md)和[工程验证](static-verification-report.md)。

## 历史调查与决策

持久化环境实际执行历史为 UNKNOWN，用户也无法确认；本轮未连接生产或未授权持久化数据库。原始 001 的未加引号 `authorization` 触发真实 PostgreSQL 42601；失败事务回滚只证明临时库的结果。原 001–005 完整保留，另有修正版版本化基线及 006 向前兼容，合法 AUTHORIZATION 语法未替换。

当前与原 main 的历史 SHA-256 相同：

| 文件 | SHA-256                                                          |
| ---- | ---------------------------------------------------------------- |
| 001  | bc404f56cf0658c138c2177a1d277a74ca4292d234a4269aba6c51fde5fb96e6 |
| 002  | 8d94e1f7e4eca7814d7bd145978c73d098cfa8d971feeeabf0fa14f1ae076962 |
| 003  | 8c4bf81e53fa51af3c891a5530388b75334d0e5a1dc6394b024e9c0a2fef1ccf |
| 004  | 5f79462433d0d182c331767b599f3187e709cf993120945089f1632a422008bb |
| 005  | ccb640eb1f7e5c6b1fb740b6f6c2fe1d9291899fc1f306ac90ed3cbb54c0d65e |

独立基线 SHA-256 为 `22afb6fd24d654824f0021b77ba6ce5ec3efbffcac35647ba8e0bf46f011a2e8`，006 为 `ba2faca6bf545b5ba1002d82d178ac4ab5092e2207d9305589f9b825793ab999`。本轮这两个已发布工件及 manifest 也未修改。

## 两条路径与单份结果

A：独立新库 echo_final5_new，canonical baseline_id=echo-native-v1。
B：独立新库 echo_final5_legacy，先执行显式 synthetic legacy fixture，再执行兼容迁移；baseline_id=synthetic-legacy-v1。夹具只给旧 authorization 列和引用加引号，摘要 `0eaf99e9235e4330984eb3261392c18638f13dc1de407039a0b4834b25d6e943`，不是对真实旧库的自动 adopt。

| 顺序 | A                        | B                                |
| ---- | ------------------------ | -------------------------------- |
| 001  | exitCode 0，修正版基线   | exitCode 0，合成旧夹具           |
| 002  | exitCode 0               | exitCode 0                       |
| 003  | exitCode 0，无旧投递数据 | exitCode 0，无旧投递数据         |
| 004  | exitCode 0               | exitCode 0                       |
| 005  | exitCode 0               | exitCode 0                       |
| 006  | exitCode 0，新列验证     | exitCode 0，旧列重命名与约束保留 |

`pg_dump --schema-only --schema=echo` 去除随机 restrict nonce 后逐字相同；系统目录复核列/类型/默认值/Owner/表与列 ACL。最终业务结构：23 表、33 外键、23 主键、16 唯一约束、55 索引、3 触发器、3 函数、4 序列。旧列测试字节 000102ff 长度 4，迁移前后完全相同。

## 权限与失败停止

owner 与 API 均非超级用户、无 CREATEDB/CREATEROLE/BYPASSRLS，API 不是 owner 成员，无 TEMP、DDL、迁移记录、身份键写入、消息密文 UPDATE 或删除 complete 权限；允许实际注册业务。设备/群组激活触发器阻止 API 越权。

迁移单连接 advisory lock；checked SQL 自带 BEGIN/COMMIT，驱动遇错立即停止，语义等价 ON_ERROR_STOP。以下回归均 PASS：并发锁拒绝、文件/收据摘要与 baseline 不符、未记账对象拒绝、pending 基线非空拒绝、初始化失败回滚与锁释放、SQL 失败整段回滚、SQL 已提交但回执丢失/零行时停在 started、003 历史保护、006 双列/缺列/类型/约束/列 ACL/视图依赖/未记账新列七类拒绝。失败不跳版本、不清数据、不盲重试。

旧台账缺 baseline_id 时明确停止，需 owner 另行审查元数据升级；没有自动接管未知历史库。

## 真实 HTTP 与并发工作流

应用使用 echo_native_api，在独立临时 echo_native 数据库中验证：注册 201、同操作重试 201 且仍一条用户记录、请求摘要冲突 409、用户名唯一 409、邀请消耗一次/重试不重复消耗/耗尽 403、登录和会话 200、普通用户/管理员会话隔离、重新认证和改名 200、退出 204 后会话行消失且读取 401、关闭注册后 403 且无用户行。结束恢复 closed。

删除并发回归使用 owner 明确写入的合成结构凭证，应用调用仍为 API 角色；它只测试 SQL 并发，不冒充已验证 MLS 身份。两个不同账号在初始查询后同时争用同一 operationId：一条删除记录、一个隐藏目标、另一请求 409；原请求重试 pending-anchor。无 purge、独立锚或离线传播成功声明。

Chromium 还以真实页面完成注册、登录、重新认证、元数据归档导出/下载/只读预览、用户与管理员退出、真实管理员当前页 CSV 三次下载。具体浏览器范围见工程验证；健康检查不作为注册证据。
