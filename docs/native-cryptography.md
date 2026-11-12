# MLS 与浏览器密码学

2026-11-12本地收敛。**产品集成 BLOCKED；独立实验 PARTIAL。** 固定候选 OpenMLS 0.9.2 / RustCrypto 0.6.0，RFC 9420套件1。当前只审查既有源码、锁文件、历史运行工件和官方公告；未下载依赖、修改密码学算法、构建或运行实验。

## 实际实现与候选

`crypto/mls-lab`使用 OpenMLS0.9.2、openmls_rust_crypto/basic_credential/traits0.6.0、tls_codec0.5.0、wasm-bindgen0.2.105；Cargo.lock固定192个package（包含实验根包）。真正的MLS算法由库实现，suite为 `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`。OpenMlsRustCrypto默认的MemoryStorage为易失存储；BasicCredential标签是合成身份，不能绑定Echo账号或设备。

历史Cloud证据包含native/WASM构建及两个隔离Chromium BrowserContext的KeyPackage、Add/Welcome、Application、重放/无效Commit拒绝、pending/staged discard、Merge、Remove与epoch变化；见[PC证据](evidence/pc-review.json)。实验不进入产品bundle，没有生产Worker、Provider持久化或可信身份。实验中`process(..., merge=false)`不保留可跨崩溃恢复的staged对象；丢弃staged与完整Provider回滚是不同问题。

OpenMLS仍为可行性优先候选；ts-mls1.6.4为条件备选，不能因Rust公告切换到未经相同审查的库。mls-rs与mlspp的先前对比、版本、审计范围和许可证出处保留于[研究来源](research-sources.md)及Git历史。OpenMLS核心审计不覆盖Echo、Crypto/Storage Provider、WASM绑定、身份服务或投递服务。没有发布/批准生产密码学选型。

## Rust公告与依赖路径

2026-11-12读取RustSec官方公告确认修复版本；没有下载crate或使用audit ignore。当前本机无cargo-audit；`cargo +stable tree --locked --offline --target wasm32-unknown-unknown -i crypto-bigint`退出101，缺getrandom索引/缓存。下列锁闭路径由Cargo.lock静态反向解析；活动features的依据是未改锁文件对应的历史Cloud树，不能把本轮离线失败当重新验证成功。

| 公告                                                                       | 实际版本及锁闭路径                                                                                                                            | 处理 / 解除条件                                                                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [RUSTSEC-2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387.html) | crypto-bigint0.5.5 ← elliptic-curve0.13.8 ← p256/p384/k256或ecdsa/primeorder ← OpenMLS RustCrypto、basic_credential与hpke-rs-rust-crypto0.7.0 | BLOCKED。官方修复>=0.7.6，非0.5兼容替换；历史WASM树活动。不选P-256不足以证明无秘密运算可达，不能强制改lock或自修算法                             |
| [RUSTSEC-2026-0331](https://rustsec.org/advisories/RUSTSEC-2026-0331.html) | libcrux-kem0.0.9 ← hpke-rs-libcrux0.7.0 ← hpke-rs0.7.0                                                                                        | BLOCKED。短混合key解码panic，官方修复>=0.0.10；历史WASM树未激活此可选路径，但锁闭仍含风险。需上游版本约束/特性及完整解析验证，不能直接替换校验和 |
| [RUSTSEC-2026-0330](https://rustsec.org/advisories/RUSTSEC-2026-0330.html) | 同上                                                                                                                                          | BLOCKED。短seed混合封装panic，官方修复>=0.0.10；不能以“不是套件1”忽略公告或关闭扫描                                                              |
| RUSTSEC-2026-0173（历史维护警告）                                          | proc-macro-error2 2.0.1 ← hax-lib-macros0.3.7 ← hax-lib/libcrux相关链                                                                         | BLOCKED待上游迁移/替代复核；本轮没有当前完整cargo审计，不自行fork宏/密码库                                                                       |

本机没有固定1.99.1工具链或wasm-bindgen CLI依赖闭包；使用已安装stable1.99.0仅执行rustfmt检查，不声称符合固定版本构建验证。npm/Rust锁文件未更改。最小安全替代是保留独立实验和关闭产品写入；兼容修复必须在获授权准备依赖的环境中重新锁闭、审查、编译、审计和互操作验证。

## 产品Crypto边界与状态转换

原生库负责MLS、HPKE、HKDF、签名和ratchet；Echo不实现算法或解析器。产品需真实Crypto Worker，固定版本原生API、可信Credential映射、完整Storage Provider与身份/设备命名空间；Worker隔离职责，不防同源恶意代码。现阶段不创建空Worker/适配器冒充接通。

1. 未初始化：原生key/Provider不可用或身份未可信时不创建活跃组、不发送。
2. 加入：验证实际KeyPackage/Credential与目标账号/设备，消费Welcome并将原生完整变更、收件去重及组映射原子持久化，失败不确认消费。
3. 活跃操作：在单写者边界从最新完整Provider开始，生成原生变更与精确wire/outbox，同一严格事务完成后才允许网络发送；未知回执只查询/原样重试。
4. Proposal/Commit：保留原生pending/staged状态及对应原操作；逐项验证群组/epoch/授权，DS接受后按已审查语义Merge或Discard。不能凭wireKind、HTTP ACK或route_version推进MLS epoch。
5. 冲突/中断：版本冲突、未知提交、缺Proposal或无效Commit冻结组，丢弃未持久实例；只有核实原生状态和原操作才能恢复，不能跳过或回滚ratchet。
6. 撤权：服务访问撤销与原生Remove分开；逐组移除所有leaf、新epoch成功且本地状态持久后才恢复发送。无授权在线客户端时保持冻结。
7. 恢复：旧活跃Group State不从归档导入；不能验证新鲜度时新设备重新授权入组。恢复根、可信设备、历史只读归档各自验证，不相互冒充。

上述为准入流程，产品实现仍缺失。实际实验API有`add_members`、`process_message`、`merge_staged_commit`、`merge_pending_commit`、`clear_pending_commit`、`StagedWelcome::new_from_welcome`、`into_group`；本轮未有依赖源码完成新的稳定API核验，禁止访问私有实现补缺。

## 本地持久化边界

`operation-store.ts`以Web Locks与strict IndexedDB事务提交调用方提供的sealedState、密文、operationId和CAS版本；输入在等待锁前复制，提交完成才返回。历史浏览器实验验证双标签CAS单胜者、重复操作拒绝、刷新恢复与注入配额失败的原子回滚。它没有生成或验证sealedState，不等于加密完整Provider，也没有收件游标/删除checkpoint/Commit/Outbox全生命周期。

原生存储接口的逐项读写必须与完整Provider快照、outbox/收件去重/游标作为同一可恢复操作；MemoryStorage不能作为生产来源，普通JSON不能冒充状态事务。缺浏览器锁/持久存储时拒绝。真实掉电、磁盘满、数据库逐出、跨标签领导者死亡和旧备份回滚仍NOT_RUN。

浏览器私钥、Epoch Secret和完整私有Group State不得上传服务器。WebCrypto附件AES-GCM和元数据文件PBKDF2/AES-GCM是有限前置功能，不构成MLS、根恢复或发送状态保护。non-extractable CryptoKey仍可被同源恶意代码调用，WASM/JS/OS副本和已解密内容不能保证擦除。

## 准入证据

G1–G6见[实施计划](native-implementation-plan.md)：安全的锁闭依赖/活动features；固定稳定API/套件1/互操作；真实浏览器Provider/Worker；完整原子持久化/崩溃；账号与设备认证/防重放；Commit/Welcome/撤权；删除新鲜性和隔离恢复。全部必须有独立范围的证据，实验通过不开放crypto-gate。

规范依据：[RFC9420](https://www.rfc-editor.org/rfc/rfc9420.html)、[RFC9750](https://www.rfc-editor.org/rfc/rfc9750.html)、[OpenMLS持久化](https://book.openmls.tech/user_manual/persistence.html)。上游book跟随主线，不能替代锁定版本源码审查。当前工程结果见[静态报告](static-verification-report.md)。
