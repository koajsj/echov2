# 本地 MLS 集成验收 — 2026-11-15

整体 **PARTIAL**；产品双设备通信和生产准入 **BLOCKED**。基线 `8e419c3ba811fe4fb353acce401d148cf6d8f634`，本地 main 与 origin/main 一致且工作区干净后开始。3 个 Terra 分别审查 Rust、身份与存储，主代理复核并整合修改。

## 实际修复与证据

| 编号     | 文件 / 位置                                                        | 严重程度与根因                                                                             | 修改                                                                                                                                                                                    | 验证结果                                                                                                    |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| LOCAL-01 | `src/client/crypto/operation-store.ts` / `pendingCryptoOperations` | 中：随机操作 ID 字典序不能保证同群组的状态版本顺序；接通发送后可能先投递依赖后续状态的密文 | v4 Outbox 保存 group/version，并建立唯一复合索引；按 group/version 分页。确认删除分页位置后拒绝旧游标，要求从头读取；调用方仍须逐群组串行投递                                           | **FIXED**；真实 Chrome 验证反序 UUID、分页、确认幂等与回滚                                                  |
| LOCAL-02 | 同文件 / `onupgradeneeded`                                         | 中：新索引需要完整旧操作记录，不能重排或重新加密，也不能重新排队已确认操作                 | 从 v1/v2/v3 迁移原记录；校验待发记录及唯一版本，损坏时中止整个升级；保留已确认集合和原密文                                                                                              | **FIXED**；真实 Chrome 验证三种旧版本、损坏升级回滚；Inbox 脚本补齐合法 v2 待发样本                         |
| LOCAL-03 | `src/shared/mls-credential.ts`                                     | 高（接入前缺口）：现有设备授权不包含 MLS 公钥，实验签名密钥与根身份未绑定                  | 新增严格版本化、域隔离 MLS 授权声明和验签模块，包含账号、公共 ID、设备、根、设备凭据 ID、MLS 公钥、算法、固定套件、用途及期限；验证根自签、根 pin、设备双签、根授权和实际叶签名公钥相等 | **PARTIAL**；真实 WebCrypto Ed25519 签名链与 18 个拒绝用例 **PASS**；尚未接入产品 KeyPackage/Welcome/Commit |

凭据验证要求调用方提供可信且未过期的当前设备授权状态。此参数不是撤销证明协议；模块不查询网络，也不建立状态来源的可信性。根私钥没有导出；定向脚本中的独立 WebCrypto MLS 密钥仅用于验签契约，不是 Rust Signer 或产品设备。不能将验签函数通过视为产品 Credential 准入通过。

## 实际检查

- **PASS**：`npm run typecheck`、`npm run lint`、`npm run check:ast`。
- **PASS**：全项目 `npm run format:check`、17 个 JS/MJS 的 `node --check`、1 个 Shell 的 `bash -n`、`git diff --check`；变更文件有限私钥/GitHub Token/AWS Key 模式扫描零命中，不代表完整 SAST。
- **PASS**：`npm run build:server` 后 `npm run check:source`；仅编译服务端，未启动应用服务或连接数据库。
- **PASS**：`node scripts/check-mls-credential.mjs`，真实 Ed25519 链及 18 项拒绝检查。
- **PASS**：`check-local-crypto-browser.mjs`，Outbox 顺序/分页、v1/v3 迁移、损坏拒绝、双标签 CAS、刷新、Worker 提交后终止恢复、故障回滚、附件 AEAD。
- **PASS**：`check-inbox-browser.mjs`，Inbox/游标/状态同事务、重放/序号冲突/缺口拒绝、并发 CAS、事务内 Worker 终止共同回滚及 v2 迁移。
- 浏览器检查使用本机已有 Google Chrome，由 Playwright 启动独立临时上下文；临时 Vite 仅监听 `127.0.0.1:5173`。合成 sealed bytes 仅验证存储边界；注入错误不证明物理磁盘满或断电恢复。
- **NOT_AVAILABLE**：本机固定 Rust 1.99.1、WASM target、wasm-bindgen CLI 0.2.105、Cargo 锁文件对应包/索引、cargo-audit；现有 stable 工具链不替代锁定版本。
- **NOT_AVAILABLE**：semgrep、gitleaks；`CARGO_NET_OFFLINE=true RUSTUP_TOOLCHAIN=stable cargo audit --version` 明确返回未安装 audit 子命令。
- **NOT_RUN**：Rust fmt/clippy/audit/native/WASM 构建、产品双设备通信、隔离数据库与恢复验证；无可运行的安全产品 MLS 链路，未为外围检查创建数据库。

格式、语法、源码引用和完整 Diff 在交付前再核对；静态成功不证明密码学正确或全仓库无漏洞。未在本轮重新执行历史 Cloud 实验，不复用其结果作为本轮产品验收。

## RustSec 与最小解除条件

本轮核对现有锁文件与官方公告；没有修改 Cargo 清单/锁文件、使用 fork、audit ignore 或强制升级。离线完整依赖解析受缺少本地索引阻塞；以下活动性沿用仓库既有证据，不冒充本轮 cargo tree 输出。

| 公告                                                               | 锁文件与路径                                                                                   | 本轮状态 / 解除条件                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [2026-0387](https://rustsec.org/advisories/RUSTSEC-2026-0387.html) | crypto-bigint 0.5.5 ← elliptic-curve 0.13.8 ← RustCrypto 曲线 / HPKE；既有 WASM 活动树含该依赖 | **BLOCKED**；官方修复 >=0.7.6，需上游兼容 Provider 全链升级与构建验证 |
| [2026-0331](https://rustsec.org/advisories/RUSTSEC-2026-0331.html) | libcrux-kem 0.0.9 ← hpke-rs-libcrux 0.7.0；默认活动树未启用可选后端                            | **BLOCKED**（锁文件）；官方修复 >=0.0.10，需解除上游精确约束          |
| [2026-0330](https://rustsec.org/advisories/RUSTSEC-2026-0330.html) | 同上，另一 panic 公告                                                                          | **BLOCKED**；同上，不将可选未激活标为修复                             |
| [2026-0173](https://rustsec.org/advisories/RUSTSEC-2026-0173.html) | proc-macro-error2 2.0.1 ← hax-lib-macros 0.3.7；维护警告                                       | **BLOCKED**；无修复版本，等待上游宏迁移并验证行为                     |
| [2026-0459](https://rustsec.org/advisories/RUSTSEC-2026-0459.html) | libsqlite3-sys 0.35.0 ← rusqlite 0.37.0 ← 官方 SQLite Provider 候选，bundled                   | **BLOCKED**；修复 >=0.39.0 涉及另一兼容链；SQLite 不进入浏览器产品    |

## 产品验收矩阵

| 验收项                     | 状态                           | 当前边界 / 最小解除条件                                                       |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| 五项 RustSec               | **BLOCKED**                    | 需要官方兼容链、完整锁审计及固定工具构建证据                                  |
| 根身份与 MLS Signer 绑定   | **PARTIAL**                    | 验签契约已实现；缺 Rust Signer 生成、受保护持久化、根授权签发及产品接线       |
| 可信 Credential            | **PARTIAL**                    | 验证链和叶公钥匹配可用；缺网络撤销新鲜性、KeyPackage/Welcome/全部成员更新校验 |
| 完整 Provider              | **BLOCKED**                    | 缺固定源码与浏览器同步 Provider/完整状态写集；opaque sealedState 不算实现     |
| Worker 执行 MLS            | **BLOCKED**                    | 当前仅身份操作，缺可运行产品 WASM                                             |
| 独立双设备双向通信         | **NOT_RUN**                    | 产品链路阻塞；本轮存储测试没有真实登录、Welcome 或消息解密                    |
| 群组 Remove                | **BLOCKED**                    | 实验历史不证明账号设备撤权；需真实 Remove Commit 与持久化                     |
| 未来 Epoch 隔离            | **BLOCKED**                    | 需产品 Remove 后独立设备无法解密的证据                                        |
| Outbox/Inbox/Cursor 一致性 | **PARTIAL**                    | 存储事务/排序通过；未与完整 Provider 统一操作边界                             |
| 离线重连                   | **NEEDS_RUNTIME_VERIFICATION** | 产品收发阻塞，存储刷新通过不能替代投递重连                                    |
| 删除传播                   | **BLOCKED**                    | 缺 MLS 加密墓碑、设备补偿、独立删除证据及物理清理闭环                         |
| 根与密钥恢复               | **BLOCKED**                    | 缺独立恢复凭据、完整可信 Group State、删除新鲜性与防旧备份回滚                |
| SAS/QR、根轮换与续期       | **BLOCKED**                    | 不自创短码协议；需经过审查协议及状态机                                        |
| 生产准入                   | **BLOCKED**                    | crypto-gate 保持恒拒绝；不能恢复发送                                          |

## 下载清理与授权边界

附件起初授权项目隔离安装；随后用户明确“禁止下载，并删除已下载的”。本轮两个 rustup 安装进程已终止，新建 `.local-tools` 及约 98 MiB 内容已删除，后续没有继续安装。全局 Rust/Cargo 缓存保持原样。后续仅使用已有 Node、npm 依赖与 Chrome。没有生产连接、部署、真实用户数据、密码学算法改写或数据库操作。

继续实施需要预先提供固定 Rust/WASM 工具、Cargo 完整闭包和经审查的兼容修复；提供工具本身也不解除 Provider、撤销、删除与恢复的协议缺口。没有通过关闭规则或门禁缩小这些准入条件。
