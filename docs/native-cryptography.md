# MLS 与浏览器密码学

## 当前结论

2026-11-15，Codex Cloud，基线 `cec82e57603b31f1d77030a15b827d76729f4427`。密码学准入 **BLOCKED**，整体 **PARTIAL**。本次实际安装固定工具链、完整解析锁闭依赖、构建 native/WASM、运行 Chromium 实验及 cargo audit；不再沿用“本机缺缓存”的旧阻塞原因。[本轮报告](cloud-review-report.md)与[原始审计](evidence/cloud-review/cargo-audit.json)记录范围。

固定 Rust 1.99.1、wasm32-unknown-unknown、wasm-bindgen CLI 0.2.105；OpenMLS 0.9.2、RustCrypto/basic credential/traits 0.6.0、tls_codec 0.5.0。未改变 Cargo.lock、算法或上游源码，未设置 audit ignore。

## Rust 公告与兼容性

完整 `cargo audit --json` 退出 1：三项漏洞、一项维护警告，数据库提交 `02e2517f457a359fc6d3440ea4560c8ea188fee8`。审计整个锁文件，不能把构建成功或无活动依赖当成修复。

| 官方公告                                                                   | 核实结果                                                                                                                           | 状态与最小解除条件                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [RUSTSEC-2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387.html) | crypto-bigint 0.5.5 经 elliptic-curve 0.13.8、p256/p384/k256、BasicCredential/RustCrypto/HPKE 进入 WASM 活动树。官方修复 >=0.7.6。 | **BLOCKED**。现有 p256/p384 0.13 的版本约束不接受 bigint 0.7；等待兼容官方后端发布，或另行审查完整官方迁移。                  |
| [RUSTSEC-2026-0331](https://rustsec.org/advisories/RUSTSEC-2026-0331.html) | libcrux-kem 0.0.9 的短混合密钥解析 panic；锁闭 hpke-rs-libcrux 0.7.0 精确要求 =0.0.9。默认 native/WASM 活动图未启用此可选后端。    | **BLOCKED**（锁文件），默认活动图不含该包；官方修复 >=0.0.10，不能强行替换精确约束。                                          |
| [RUSTSEC-2026-0330](https://rustsec.org/advisories/RUSTSEC-2026-0330.html) | 同一路径的短 seed 混合封装 panic，官方修复 >=0.0.10。                                                                              | **BLOCKED**（锁文件），与上一项采用相同解除条件。                                                                             |
| [RUSTSEC-2026-0173](https://rustsec.org/advisories/RUSTSEC-2026-0173.html) | proc-macro-error2 2.0.1 未维护，无修复版本。hax-lib-macros 0.3.7 在 cfg(hax) 下引入；默认构建未启用该 cfg。                        | **BLOCKED**（维护警告）。上游建议 manyhow / proc-macro2-diagnostics；须由上游宏维护者完成迁移并核验行为，不直接替换传递依赖。 |

[WASM 活动树](evidence/cloud-review/wasm-tree.txt)、[完整 feature 树](evidence/cloud-review/wasm-features.txt)与锁闭 crate 源码分别核对。`cargo tree --target all` 含条件图，不能用它证明默认活动性。suite 1 的 X25519/Ed25519 路径不选择 P256，但后端保留曲线实现，本轮没有对攻击者输入可达性和最终机器码完成穷尽证明，不能排除时序风险。

截至本轮查询，crates.io 最新 openmls_rust_crypto 仍为 0.6.0，hpke-rs/libcrux 后端最新为 0.8.0，查询 0.7.1 返回不存在。官方 OpenMLS main 提交 `6100df3fb1d8c3eeab53e349fcbd621f98c44fe2` 的[后端清单](evidence/cloud-review/upstream-provider.toml)已转向 p256/p384 0.14、HPKE 0.8、Ed25519 3.0 等整套升级；这是未发布主线材料，不能冒充 0.6.0 的兼容补丁。没有采用 Git fork、主线替换或不兼容强制升级。

## 实际实现与实验

`crypto/mls-lab` 仍是隔离实验，使用真实 OpenMLS、RFC 9420 与固定套件 `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`。两份独立 Chromium context 验证 KeyPackage、Welcome、Commit、Application、重放拒绝、无效 Commit 拒绝、pending/staged discard、成员移除和 epoch 1→2。实验使用合成标签和 MemoryStorage，不是可信产品 Credential、Crypto Worker 或持久化 Provider。

消息写入在服务端 `requireReviewedCrypto()` 拒绝 `503 MLS_NOT_READY`。未创建空 Worker 或包装实验伪装产品接通。私聊、群聊、成员治理和 MLS 分发仍 **BLOCKED**。

## 产品 Crypto 状态转换

原生库负责 MLS、HPKE、HKDF、签名和 ratchet。完整 Provider 与私钥限于客户端；同源恶意代码仍能调用密钥，Worker 不构成 XSS 安全边界。

1. 未初始化：身份未可信或 Provider 不完整时不创建活跃组、不发送。
2. 加入：验证实际 KeyPackage/Credential 的账号与设备绑定；原生 Welcome 变更、收件去重及映射原子持久化，失败不确认消费。
3. 活跃操作：单写者边界从最新完整 Provider 开始生成状态与精确 wire；strict 事务写入状态和 Outbox 完成后才发送。未知回执查询原 ID 或原样重试，不重新加密。
4. Proposal/Commit：保留原生 pending/staged 和原操作，验证群组/epoch/授权，再按审查语义 Merge/Discard。HTTP 确认、wireKind、route_version 和 seq 均不能推进 MLS epoch。
5. 冲突：未知 epoch、缺 Proposal、无效 Commit 或不明提交结果冻结群组；禁止跳过消息或回滚 ratchet。
6. 撤权：Session/WS 与 MLS Remove 分别确认；所有 leaf 移除、新 epoch 与本地状态持久化成功后才能恢复发送。
7. 恢复：旧 Group State 不从元数据归档导入。无法核实删除新鲜性与状态防回滚时拒绝恢复。

以上为准入要求，产品实现尚未完成。没有以自主密码算法补齐协议。

## 本地持久化与 Outbox

`operation-store.ts` 是前置存储模块。调用方提供 opaque sealedState；模块不生成或证明它是完整且正确加密的 Provider。Web Locks 目前覆盖提交与确认，尚未覆盖原生 Provider 加载和推进，CAS 不能替代完整操作边界。

本次数据库升级 v2：Group Record、不可变原操作与 Outbox ID 在同一 strict IndexedDB 事务提交。v1 操作保守回填 pending，保留原 ID/原密文，不能推定已送达。分页限制 1–100 条；未知发送结果从 Outbox 读取原记录。确认核对原密文 SHA-256、消息 ID 格式、seq 与 route_version 的 PostgreSQL bigint 范围，原记录保存收据和移出 Outbox 同事务完成。重复相同确认幂等，摘要或收据冲突拒绝；不修改 Group State、不代表收件人解密或 MLS 验证。调用方必须按原 operationId 查询认证服务的结果，不能凭任意 HTTP 200 删除 Outbox。

真实 Chromium 验证双标签 CAS 单胜者、刷新、重复操作拒绝、注入配额失败回滚、确认事务失败回滚、冲突确认拒绝、Worker 完成提交后终止并从持久记录恢复、v1 升级、受阻升级拒绝，以及打开请求排在受阻删除后的超时与迟到连接关闭。注入故障不是物理磁盘满；Worker 结束是在提交完成后，不证明提交中崩溃。Provider/Inbox/游标/去重/pending Commit 的统一事务、状态加密与回滚保护仍缺失。

附件仅本地 WebCrypto AES-256-GCM 前置：独立密钥和 96-bit IV、128-bit tag、最大 10 MiB；验证往返、篡改拒绝、独立随机材料和大小边界。文件名/MIME 仍在本地敏感对象，未接通加密上传/下载、MLS 密钥分发和媒体清理。non-extractable CryptoKey 与内存覆盖不保证擦除 JS/WASM/OS 副本。

## 准入证据

必须先完成安全锁闭依赖、真实身份与 Provider/Worker、完整原子收发状态、Commit/Welcome/撤权、删除新鲜性与隔离恢复。物理掉电/磁盘满、数据库逐出、旧备份回滚和外部灾备仍 **NOT_RUN** 或 **BLOCKED**。不得因实验通过开放 crypto-gate。

规范：[RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)、[RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html)、[OpenMLS 持久化](https://book.openmls.tech/user_manual/persistence.html)。主线文档不能替代固定版本源码核查。
