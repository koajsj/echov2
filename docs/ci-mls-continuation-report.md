# CI 修复与 MLS 工程续进

2026-11-15，Codex Cloud；从干净 main `06f37b995f26fd95b2bdfae56c9ed36439d2555f` fetch 并 fast-forward 核对。直接 main 提交，无功能分支、PR、force push、生产连接或部署。整体 **PARTIAL**；密码学与生产准入 **BLOCKED**。

## FIXED：干净 CI 缺少服务端产物

[失败运行 43714125188](https://github.com/koajsj/echov2/actions/runs/43714125188) 在 `check:source` 检测 `scripts/check-device-revocation.mjs` 的静态导入时找不到 `../dist/server/server/devices/device-service.js`。`tsconfig.server.json` 的 `rootDir: ./src` 与 `build:server` 的 `--outDir dist/server` 正确生成 `dist/server/server/devices/device-service.js`，无须改导入。

提交 `10bf6de45b55efc85b84f066328b7bea5e1e18dd` 仅在 `check:source` 前增加 `npm run build:server`。[完整修复运行 43714563417](https://github.com/koajsj/echov2/actions/runs/43714563417) 已成功，类型、Lint、格式、AST、真实服务端构建、引用、JS/Shell、固定 Rust 安装与 Rust 格式步骤全部执行。没有排除脚本、忽略引用、容错成功或关闭规则。后续改动另将新原生持久化测试和格式检查纳入同一工作流；最终 SHA 的 Actions 结果需单独核对。

## 本轮工程

### 浏览器原子 Inbox / Cursor 前置

`operation-store.ts` 数据库升级 v3，增加 Inbox 与 Cursor。一次 strict IndexedDB 事务共同提交状态、收件记录与游标；group/version CAS 与原有 Outbox 共用命名空间 Web Lock。相同 group/seq 必须绑定相同 messageId 与密文 SHA-256；重复收件读回原结果，不重写状态、不推进游标。group/messageId 唯一索引防止同消息 ID 换序号；序号只允许期望游标 +1，拒绝缺口、过期版本及超出 PostgreSQL bigint 的值。v1 保留原 Outbox 回填语义；v2 保留已确认与未确认集合，不重新排队已确认操作。

真实 Chromium 验证刷新恢复、重复/冲突/缺口/溢出、跨标签同消息只提交一次、发送与收件 CAS 竞争、游标写入故障完整回滚、Worker 在事务内被终止后三表共同回滚，以及 v2 升级。最初 Worker 测试使用 Blob 中的相对模块地址失败，改为实际同源绝对 URL 后通过，没有放宽断言。

这是**存储前置**：输入 sealedState/sealedEvent 仍是调用方提供的字节。本轮测试为合成占位数据，不能证明完整 Provider 或状态加密正确。Web Lock 未覆盖真实 Provider 的加载、MLS 处理、加密封存全过程；没有新建空 Crypto Worker 冒充集成。库升级也没有为现有群组推断或跳过任何历史游标。缺失/已删密文须冻结并等待独立可信规则，不能凭服务端 deleted/highWatermark 推进。

### 官方原生持久化 Provider 验证

新增[独立原生验证](../crypto/mls-persistence/README.md)，固定官方 SQLite StorageProvider 0.3.0，直接组合 RustCrypto 0.6.0。Provider 不实例化 MemoryStorage；后者仍是上游传递依赖。它确实存储 OpenMLS 的类型化状态、实际 signer、KeyPackage 私有材料、树与 epoch/message secrets、own leaf、proposal queue 和 pending Commit，重新打开实际数据库后从官方 API 加载；没有用 opaque 字节冒充完整状态。

单写者事务在加载 MLS 对象**之前**开始；状态变更与精确 Outbox wire、Inbox 去重及游标共同提交。失败时丢弃对象与 rollback。原生测试覆盖两写者重试、请求冲突、真实发送/接收 ratchet 与日志共同回滚、离线有序消费、重放拒绝、pending Commit 重启恢复、Self Update proposal/私钥/队列持久化、三设备 Remove 与后续 epoch 解密隔离。子进程在事务中及提交后被强制杀死，分别确认回滚和原密文恢复；不是抛异常替代进程崩溃。六个验收测试通过，另一个 ignored 测试入口专供父测试启动子进程，实际调用两次。

**边界：原生实验，不是产品实现。** SQLite 官方不支持 WASM；数据库未加密，包含合成测试秘密；身份仅测试 BasicCredential 标签。测试库全部现场生成，不导入外部数据库/WAL，不接 HTTP、账户、根授权或产品发送链路。没有据此开放门禁。此候选依赖另命中 SQLite 公告，见下节。

## RustSec 与兼容性

固定工具链 1.99.1；既有 native/WASM release 构建及 Chromium MLS 实验成功。重新查询官方注册表：OpenMLS 0.9.2、RustCrypto/basic credential 0.6.0、SQLite provider 0.3.0；未修改既有 MLS Cargo.lock 或强行升级传递依赖。[版本元数据](evidence/ci-mls-continuation/registry-versions.json)与[原始审计](evidence/ci-mls-continuation/cargo-audit-lab.json)保存本轮结果。审计退出 **1**，ignore 列表为空。

| 公告              | 当前实际状态                                                                                | 解除条件                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| RUSTSEC-2026-0387 | **BLOCKED**；crypto-bigint 0.5.5 经曲线/HPKE 在活动图，修复 >=0.7.6                         | 审查接受新版曲线/后端的官方兼容迁移；不能把 0.7 强塞给 0.5 约束                              |
| RUSTSEC-2026-0331 | **BLOCKED**；libcrux-kem 0.0.9，默认 RustCrypto 未激活，但锁仍命中                          | hpke-rs-libcrux 0.7 的精确版本约束需上游兼容修复，>=0.0.10                                   |
| RUSTSEC-2026-0330 | **BLOCKED**；同包短 seed 混合封装 panic                                                     | 同上，不能用未激活解释为已经修复                                                             |
| RUSTSEC-2026-0173 | **BLOCKED**；proc-macro-error2 2.0.1 维护警告，默认 cfg(hax) 未激活，无修复版本             | 上游宏迁移并验证行为，不能任意替换宏 crate                                                   |
| RUSTSEC-2026-0459 | **BLOCKED，新原生候选独有**；libsqlite3-sys 0.35.0 bundled SQLite 有数据库/WAL 内存泄露风险 | 官方 SQLite provider 迁移到包含 patched >=0.39.0 的兼容 rusqlite；候选不得进入产品或导入备份 |

[新候选审计](evidence/ci-mls-continuation/cargo-audit-persistence.json)为四项漏洞加一项维护警告；**不要和既有 MLS 锁的三项漏洞加一项警告混计**。SQLite 测试不打开不可信文件只是限制实验攻击面，不消除公告。官方 libcrux provider 0.4.0 也依赖 hpke-rs-libcrux 0.7，不能通过切换后端消除原有锁闭风险；未采用。官方清单与新 SQLite 公告原文/摘要见[来源](evidence/ci-mls-continuation/sources.json)。

## 十二项需求的准确状态

| 要求                           | 状态        | 已做与剩余条件                                                                         |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| 四项 RustSec                   | **BLOCKED** | 实际重新 audit、官方版本与约束核对；未获得兼容修复，未 ignore                          |
| OpenMLS 真实产品集成           | **BLOCKED** | 库实验和新原生持久化验证通过；真实账户/投递链路未接通                                  |
| Crypto Worker                  | **BLOCKED** | 真实 Worker 事务中断测试通过；没有受信身份/完整 WASM Provider 的产品 Worker            |
| 完整 Provider 持久化           | **PARTIAL** | 原生官方完整 StorageProvider 验证通过；浏览器完整持久化、加密与防回滚缺失              |
| 原子 Outbox / Inbox / Cursor   | **PARTIAL** | 浏览器存储前置 + 原生 MLS 事务验证；产品 WASM 统一收发状态缺失                         |
| 可信根身份 / Device Credential | **BLOCKED** | 没有用合成 Credential 冒充认证；需根信任引导、设备密钥绑定与验证                       |
| SAS / QR 授权                  | **BLOCKED** | 尚无真实根授权/完整协议实现；不能用二维码展示代替授权                                  |
| MLS Remove / Epoch             | **PARTIAL** | 双上下文及原生三设备真实 Remove/epoch/未来消息隔离通过；产品逐组撤权与服务器同步未实现 |
| 私聊 / 群组                    | **BLOCKED** | 两/三参与者仅实验；产品会话建立和消息写入继续 503                                      |
| 离线同步                       | **PARTIAL** | 原生持久化有序消费、浏览器重复/缺口/游标事务通过；真实网络重连/多设备同步未完成        |
| 加密删除墓碑                   | **BLOCKED** | 尚无受信 MLS 墓碑及离线传播；服务端元数据不能代替密码学删除                            |
| 密钥恢复 / 隔离灾备            | **BLOCKED** | 本地崩溃恢复通过；身份恢复、独立删除新鲜性锚与加密备份恢复仍缺失                       |

## 验证与范围

本任务固定工具链位于 `/workspace/.echo-rustup`、Cargo 位于 `/workspace/.echo-cargo`；实际命令设置相应 `RUSTUP_HOME`/`CARGO_HOME` 并将 Cargo bin 加入 PATH。浏览器仅访问临时 Vite `127.0.0.1:5173`；本轮未启动产品数据库/API。新实验 SQLite 数据仅由测试创建并清理。

**PASS**：CI 最小修复的完整 GitHub 运行；锁闭 Rust native/WASM release 构建；同一 OpenMLS 实现两份独立 Chromium context 的 Welcome/Commit/Application/Remove、pending/staged discard、重放/无效 Commit 拒绝；新原生六项持久化/并发/进程崩溃测试；浏览器旧 Outbox/附件及新 Inbox 测试。运行日志与退出码见[本轮证据](evidence/ci-mls-continuation/results.json)。

**PARTIAL**：人工源码审查与安全依赖约束分析，非第三方审计；两份同一 OpenMLS 实例通信不是跨实现互操作。加密状态及根身份没有借占位数据宣称通过。

**BLOCKED**：上述安全依赖、可信身份、浏览器完整 Provider/Worker、端到端产品闭环和恢复新鲜性。

**NOT_RUN**：跨实现 MLS 互操作；真实账户双设备授权/SAS/QR；真实产品网络离线同步、加密墓碑、密钥恢复及异机加密灾备；物理磁盘满/OS 掉电/旧备份回滚；专用 SAST/外部独立审计。本轮未重跑未改的 SQL/账户/管理员端到端验证，上一轮证据保留为历史。未接生产 VPS、未自动部署。

`requireReviewedCrypto()` 保持无条件拒绝。CI 通过、原生持久化及 MLS 实验通过均不构成产品级安全准入。
