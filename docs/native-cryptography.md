# MLS 与浏览器密码学研究

## 当前实验结果 — 2026-11-12

**PARTIAL；生产选型仍 BLOCKED。** 本轮重新复核 OpenMLS 0.9.2、ts-mls 1.6.4、mls-rs 0.57.0 的官方实现/公告与接口。选择 OpenMLS 做可行性实验，不把库审计扩大到应用、provider 或浏览器存储。ts-mls 既有成员移除公告及缺少正式审计，mls-rs 浏览器套件/provider 成熟度，仍需独立准入。以下旧研究快照保留来源，当前实际版本与验证以本节为准。

### 实际构建与运行

独立 `crypto/mls-lab`：OpenMLS 0.9.2、openmls_rust_crypto / basic_credential / traits 0.6.0、tls_codec 0.5.0、wasm-bindgen 0.2.105。Rust 1.99.1、Cargo.lock 固定依赖；官方 Crypto Provider 与 MemoryStorage，固定 RFC 9420 套件 1（X25519/AES128GCM/SHA256/Ed25519）。没有自写 MLS、HPKE、HKDF、签名或 Ratchet。原生 release 和 wasm32 release 均已真实构建。

两个独立 Chromium BrowserContext 使用真实 WASM，验证 KeyPackage、Welcome、Commit、Application Message、重放拒绝、无效 Commit 拒绝、发送方 pending discard、接收方 staged discard、Merge、成员移除与 Epoch 1→2。被移除实例不能继续创建消息。合成 BasicCredential 标签没有账号/设备认证意义；这不是产品群组撤权证明。

### 仍未解决的依赖风险

Cargo audit 实际退出 1：RUSTSEC-2026-0387（crypto-bigint 0.5.5 的时序问题）进入实际 WASM 依赖树，经 p256/p384/elliptic-curve。修复要求 >=0.7.6，当前曲线 0.13 约束不兼容。套件 1 不选择 P-256 分支，但未提供完整可达性证明，因此不忽略公告、不自制密码库补丁、不把未发布上游 main 当兼容修复。

锁闭还包含可选、当前 WASM 依赖树未启用的 libcrux-kem 0.0.9 两项公告，以及 proc-macro-error2 停止维护警告。其修复/活动范围见工程验证中的审计证据；锁闭与活动依赖不能混淆。生产门禁等待上游兼容修复或经过同等验证的成熟替代 provider。

### 本地状态边界

`operation-store.ts` 将调用方提供的 sealedState、operationId、密文与版本放进单个 strict-durability IndexedDB 事务，并用 Web Locks 串行化多标签写入；事务完成前不返回可发送结果。输入在等待锁前复制，冲突后必须重载状态；原操作不能重新推进 ratchet。真实浏览器已验证 CAS 单胜者、刷新后状态/密文同时恢复、重复操作拒绝和注入 QuotaExceededError 后全部回滚。

该模块未接入发送，没有实现完整 provider snapshot 加密/恢复、Pending Commit/Outbox/游标的全部协议、真实掉电、物理磁盘满或备份回滚检测。MemoryStorage 仍为易失；不能把 IndexedDB 实验描述为 MLS 崩溃恢复。完整集成在这些边界和可信身份通过审查前保持关闭。Firefox/WebKit 下载遭 Cloud 403；真实 iOS 未验证。

2026-11-11。以下资料为早期只读研究快照；本轮新增联网复核、构建和运行见上节，不将旧快照视为当前最新声明。[来源索引](research-sources.md)记录版本与提交。本章“支持”表示上游声明或接口证据，不表示 Echo 已验证。

## 标准与结论

**已确认事实。** [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html)规定 MLS 1.0，强制实现套件为 `0x0001 MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`；设备持有群组私有状态，组从单成员起步。MLS 以 Proposal/Commit 更新状态，Welcome 加入，Application Data 承载业务。[RFC 9750](https://www.rfc-editor.org/rfc/rfc9750.html)是 Informational 架构指南，区分 AS/DS、用户与设备、多设备、排序及无效 Commit；它不是完整产品协议。两个用户的私聊沿用 MLS，多设备可有多个 leaf。

[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)定义 HPKE；[RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html)定义 HKDF。二者由候选库调用，不是绕开 MLS 自写密钥交换、Ratchet、nonce 管理或恢复协议的依据。

**推荐。** 第一版固定套件0x0001；所有客户端同时支持同一固定配置；不自动降级，不启用后量子/混合套件、草案扩展、外部提交、任意自定义 proposal 或未经审查的 fork-resolution。附件独立 AES-256-GCM，不改变 MLS 套件。服务器不持有完整私有 Group State，不执行 MLS 加解密；使用库生成/解析/验证 MLS wire bytes，禁止自写解析器。

## 实现对比

| 项目                                                                | 版本与维护快照                                                                        | License / Provider                                                  | 浏览器与成熟度                                                                                                                               | 当前决定                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [ts-mls](https://github.com/LukaJCB/ts-mls)                         | 稳定 v1.6.4，2026-08-28 release；2.0 RC 不是稳定版；main提交2026-11-04                | MIT；标签声明套件1；WebCrypto/HPKE路径，额外算法可引入 peer         | TypeScript便于集成；未正式审计；浏览器持久化/平台验证未闭环                                                                                  | 条件备选；未获生产批准                                        |
| [mls-rs](https://github.com/awslabs/mls-rs)                         | 稳定编号tag0.57.0，2026-10-28提交；无GitHub release条目；main提交2026-11-02           | Apache-2.0 OR MIT；OpenSSL/AWS-LC、RustCrypto、WebCrypto、CryptoKit | wasm方向存在；官方WebCrypto实验性仅列2/5/7，RustCrypto列1/2/3（表中的Experimental限定X.509支持，不代表整个Provider）；官方称无完整第三方审计 | WebCrypto路线因套件1/成熟度 BLOCKED；RustCrypto路线待独立评估 |
| [OpenMLS](https://github.com/openmls/openmls)                       | 已发布crate0.9.2/tagv0.9.2，2026-10-22提交；GitHub Latest仍0.9.0；main提交2026-11-10  | MIT；RustCrypto/libcrux provider，明确列套件1/2/3                   | 有独立核心审计；`js`可编译WASM，WASM与iOS目标明确未支持、仅CI构建不测试                                                                      | 首选开展可行性验证；生产选型 BLOCKED                          |
| [mlspp](https://github.com/cisco/mlspp)                             | 无GitHub release；v0.1.0 tag提交2021-05-26，不冒充当前稳定release；main提交2026-09-21 | BSD-2-Clause；C++17、OpenSSL/BoringSSL                              | 缺少已核实的浏览器发行/存储/审计证据，C++/WASM/JS桥成本高                                                                                    | 否决首版浏览器主库，保留未来互操作参考                        |
| [mls-implementations](https://github.com/mlswg/mls-implementations) | main提交2026-10-07，无版本tag/release；API未识别license                               | 互操作协调、向量、harness                                           | 不是MLS密码库，列入名单不证明当前版本组合通过                                                                                                | 否决作为运行依赖；只作验证资料                                |

“最新”仅指本轮观察渠道，不混淆tag、crate与release；未发布分支API不能套在稳定版本上。具体ref和许可证见[研究记录](research-sources.md)。

### 审计与已知漏洞

- **ts-mls：** [正式审计免责声明](https://github.com/LukaJCB/ts-mls#️-security-disclaimer)仍存在；[GHSA-gwp3-968w-m7gv](https://github.com/LukaJCB/ts-mls/security/advisories/GHSA-gwp3-968w-m7gv)指出 `<1.6.4` 的单Remove Commit缺失UpdatePath可能让移除成员读取后续epoch，1.6.4修复。一个补丁不证明全部成员撤权安全。main示例使用的 `unsafeTestingAuthenticationService` 禁止进入真实身份实现。
- **OpenMLS：** [SRLabs报告v1.2](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf)日期2026-03-11，范围含核心、traits/basic credential，排除crypto/storage provider、应用和DS。[维护者2026-05-27说明](https://blog.phnx.im/openmls-independent-security-audit/)当时8项中7项修复、1项Low处理中；不能推断今天仍未修，也不能把报告覆盖到0.9.2全部新增代码。[GHSA-gc79-23g3-8g52](https://github.com/openmls/openmls/security/advisories/GHSA-gc79-23g3-8g52)影响 `<0.8.2` 和0.9.0，0.8.2/0.9.1修复解析递归风险；不得只按GitHub Latest选0.9.0。0.9.2仍须完整公告/依赖及集成审查。
- **mls-rs：** 上游“规范一致性验证”与“完整第三方安全审计”分开，当前README明确后者未完成。**mlspp：** 本轮未取得足够审计范围证据，状态OPEN，不断言绝对不存在审计。

### 依赖数量与许可证边界

[ts-mls v1.6.4 package](https://github.com/LukaJCB/ts-mls/blob/v1.6.4/package.json)直接依赖1项`@hpke/core=1.9.0`，peer7项，其中6项标optional，`@noble/ciphers`未标optional。不能把“套件1无需额外算法”误报为包管理器只装1项。dev依赖、peer自动安装、动态导入与实际bundle闭包须后续锁版本解析。

Rust库按Cargo features产生不同依赖闭包：OpenMLS涉及TLS codec、序列化、provider及其曲线/AEAD/RNG/存储；mls-rs涉及codec/core/provider/identity/storage workspace；mlspp至少crypto和JSON两类直接前提，构建/验证工具另计。**本轮没有解析下载后的lock树，三者完整直接/传递启用数量NOT_RUN，不能提供虚假总数。** Phase-two gate要求选定features后列精确SBOM、直接/传递数、许可证与实际WASM大小；不把仓库工具和测试依赖全带入产品。

## 原生API与事务能力

OpenMLS官方提供[Add](https://book.openmls.tech/user_manual/add_members.html)、[process](https://book.openmls.tech/user_manual/processing.html)、[Welcome](https://book.openmls.tech/user_manual/join_from_welcome.html)流程。已看到`add_members`、`process_message`、`merge_staged_commit`、`merge_pending_commit`、`StagedWelcome::new_from_welcome`/`into_group`，但book跟踪主线，必须在0.9.2绑定层逐一核对。Welcome不得先于对应Commit被DS接受；加入过程会消费KeyPackage私有材料。

[OpenMLS persistence](https://book.openmls.tech/user_manual/persistence.html)持续写StorageProvider、信任持久状态；[migration文档](https://book.openmls.tech/user_manual/migration.html)明确trait不提供事务API。后端数据库事务不能解决浏览器provider/outbox/业务效果原子性。[application消息说明](https://book.openmls.tech/user_manual/application_messages.html)还明确发送后立即丢弃相关密钥，发送者须另存需要保留的内容。不能寄希望于以后从服务端密文重新解密自己的全部历史。

[mls-rs Group 0.57.0 API](https://docs.rs/mls-rs/0.57.0/mls_rs/group/struct.Group.html)列`apply_pending_commit`、`clear_pending_commit`、`process_incoming_message`及存储方法；只证明接口存在，不证明IndexedDB事务或浏览器provider已合格。ts-mls的newState/Commit/Welcome与序列化路径需按v1.6.4实际API另做适配验证，不能照搬main/2.0示例或先造假的SDK外壳。

## 浏览器、WASM与本地持久化

**已确认事实。** [WebCrypto Level 1](https://www.w3.org/TR/WebCryptoAPI/)链接目前重定向Level2草案，草案不证明浏览器实现；[WebKit Safari17 beta说明](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/)列Ed25519支持，不足以证明完整套件或iOS端到端成功。[mls-rs issue312](https://github.com/awslabs/mls-rs/issues/312)含套件1、Worker与私钥表示的集成疑问，用户评论不是维护者支持承诺。

**推荐与风险。** 以OpenMLS0.9.2 + 上游现有套件1 provider + 最薄WASM边界做候选，不写新provider补缺；禁用content-debug/crypto-debug/实验扩展。WebCrypto用于附件及本地保护，不宣称WASM私钥均是non-extractable CryptoKey。内存、GC、WASM副本和浏览器磁盘均有残留风险；non-extractable也不防同源恶意调用。

| 必须评估                                           | 本轮状态          | 解除条件                                                       |
| -------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| 桌面Chromium/Firefox/Safari与真实iOS Safari        | BLOCKED / NOT_RUN | 固定最低版本、HTTPS、suite1原生生成/加入/解密/移除，无静默降级 |
| Worker RNG/curve/signature/HPKE/AEAD               | BLOCKED           | 上游provider源码+向量+目标浏览器验证，无自行修补算法           |
| IndexedDB加密provider、跨标签互斥、磁盘满/事务中断 | BLOCKED           | 原生状态变更与outbox/去重原子持久化，崩溃不回用ratchet         |
| Group State完整性、过期epoch清除、浏览器备份回滚   | BLOCKED           | 受保护本地存储/恢复策略；不能证明新鲜度即重新入群              |
| KeyPackage私钥、消费/过期/撤销、Commit/Welcome     | BLOCKED           | 验证具体版本语义和崩溃窗口，不复用未知包                       |
| 当前版本互操作、安全审计及provider范围             | BLOCKED           | 固定构建互操作证据、审计整改、实际集成独立评审                 |

因此首选是**研究顺序**而非生产定稿。若OpenMLS浏览器门槛不能满足，转评ts-mls时仍需完整审计与同样事务/撤权验证；不通过便暂停核心建设，不能以“TS更简单”降低标准。详细准入证据见[实施计划](native-implementation-plan.md)。

## 第二/三阶段本地核对（2026-11-11）

本轮未重新联网查询上述版本/维护状态；以上为第一阶段来源快照。实际本地package与源码无OpenMLS/ts-mls/mls-rs依赖、Cargo/WASM构建、provider或稳定版本绑定，且禁止下载/安装/构建/运行。无法验证固定API、套件1、WASM导出、Welcome消费或原生storage事务，因此没有新增空适配器/Worker或自造MLS状态机。OpenMLS0.9.2仍只是可行性优先顺序，不能确定为已完成生产选型。

独立附件基础仅使用浏览器标准AES-GCM，见数据生命周期的实际边界；不是MLS集成。浏览器API存在也不证明算法、IndexedDB、跨标签单写者或故障恢复已通过。解除G1–G4至少需要：明确授权准备固定原生库/provider、审查稳定版实际源码/导出、编译WASM或评估ts-mls、运行互操作/真实浏览器与持久化故障验证。当前限制下不能安全完成，聊天/初始化/恢复保持关闭。

第三阶段本地仓库仍无MLS运行依赖、Cargo/WASM构建或provider；检查的本机Cargo registry及既有工具目录也未发现可用候选，不能把此有限盘点表述为扫描全机。G1–G4保持BLOCKED。新metadata-archive只调用WebCrypto既有PBKDF2/AES-GCM处理有限服务元数据，不做MLS、HPKE、HKDF、签名或根恢复；格式与参数唯一规格见[生命周期](native-data-lifecycle.md)。相关局部strict/AST与运行NOT_RUN见[静态报告](static-verification-report.md)。

## PC收敛复测

2026-11-12基线32f09d8之后，Cargo格式/native release/wasm32 release/wasm-bindgen再次退出0，两个独立BrowserContext的真实OpenMLS实验及本地CAS/附件实验通过。Cargo audit再次退出1，三项公告与停止维护警告仍存在；没有改写Cargo锁闭或忽略公告。公共ID、PC界面与管理图表不改变G1–G6；crypto-gate保持关闭。实验与产品边界及最新退出码见[PC证据](evidence/pc-review.json)。
