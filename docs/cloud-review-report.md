# Cloud 核心集成与运行复核报告

## 最新产品身份工程 — 2026-11-15

基线 ec47b6a。本轮已实际实现账户 Ed25519 根身份、设备持有证明/根签名授权、五张公开材料表的009增量迁移、真实客户端身份 Worker、设备页面和签名会话重绑定。六个独立浏览器上下文及真实HTTP/PostgreSQL验证通过。产品 MLS、完整 Provider、SAS/QR 与恢复仍 BLOCKED，五项 RustSec 未解除。

详见[本轮身份集成报告](product-identity-integration-report.md)和[实际证据](evidence/product-identity/results.json)。下文保留此前轮次记录；历史“未实现根身份/Worker”描述不代表本轮新增身份子系统的状态，历史 MLS 与恢复阻塞仍然适用。

2026-11-15，直接开发 `main`，起点 `cec82e57603b31f1d77030a15b827d76729f4427`；远端已 fetch 核验，起始工作区干净。仅使用 Codex Cloud，未连接 VPS、真实用户或生产密钥，未创建收费资源。生产部署未获授权、未执行。

## 环境与证据

所选 Cloud 实例配置 spec_revision=observed_spec_revision=1、running、connected；配置观测一致。接口没有“所有配置中的最新发布版本”信息，**NOT_AVAILABLE**，不能据此宣称已核对全局最新发布。工具链安装在 `/workspace`，系统包仅在工作区提取，未修改用户 Mac。临时 PostgreSQL 17.11 从官方源码构建，独立目录与 Unix socket `/workspace/.echo-test/socket`、55432，仅合成数据；trust 仅限隔离测试，不用于生产。

Node 24.22.1、npm 11.9.0、Rust 1.99.1、Cargo 1.99.1 对应工具链、wasm-bindgen CLI 0.2.105。工具的精确版本、命令、退出码及结果保存在[本轮证据](evidence/cloud-review/results.json)。浏览器 TLS 使用本轮临时自签名证书和测试专用 Chromium 包装器；证书错误豁免仅作用于隔离运行，不验证生产 HTTPS/Caddy 配置。

## 交付状态

| 要求              | 状态                           | 实际结果与剩余边界                                                                                                                                                                                            |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四项 Rust 公告    | **BLOCKED**                    | 完整审计检出三项漏洞与一项维护警告；官方公告、活动 features、源码和兼容性研究见[密码学权威文档](native-cryptography.md)。未忽略公告或强制升级。                                                               |
| OpenMLS 产品集成  | **BLOCKED**                    | native/WASM 构建和真实双 context 实验 **PASS**。仍为合成 Credential、MemoryStorage 的独立实验；未接入产品，不宣称真实 Provider/Worker。                                                                       |
| Provider 持久化   | **PARTIAL**                    | IndexedDB/Web Locks 的 opaque 状态提交前置可用；完整真实 Provider、私钥保护、pending/staged Commit 与回滚防护未实现。                                                                                         |
| 原子 Outbox       | **PARTIAL**                    | **FIXED**：v2 迁移、原 ID/密文恢复、分页、摘要绑定确认、冲突拒绝、确认/移出队列原子性。浏览器 **PASS**；尚未连接真实 MLS，不能作为可用通信。                                                                  |
| 可信设备授权/撤销 | **PARTIAL**                    | 真实 HTTP 撤销与 WebSocket 断开、公开 Credential 标记、未消费 KeyPackage 清理、已消费记录保留与群组冻结验证 **PASS**。根授权、SAS/QR、KeyPackage 密码学消费、MLS Remove 和未来 epoch 隔离 **BLOCKED**。       |
| 私聊与群组        | **BLOCKED**                    | 现有服务端基础保留；503 MLS_NOT_READY 门禁未开放，无明文/Mock 替代。                                                                                                                                          |
| 离线同步          | **PARTIAL**                    | 本地原操作恢复验证通过；设备 Inbox、游标/去重与 MLS 接收状态统一事务、真实断网重连 **BLOCKED**。                                                                                                              |
| 消息/附件         | **PARTIAL**                    | 本地 AES-256-GCM 往返、独立 key/IV、篡改拒绝和 10 MiB 上限 **PASS**；MLS 分发、加密文件元数据、授权上传/下载和编辑/撤回等产品功能 **BLOCKED**。                                                               |
| 删除传播          | **PARTIAL**                    | 原作者删除意图、SQL 幂等和跨账号竞争 **PASS**。独立新鲜删除证据、加密墓碑、多设备同步、七天回收、物理 purge 和 complete **BLOCKED**。没有把 pending-anchor 改为 complete。                                    |
| 密钥恢复          | **BLOCKED**                    | 独立根恢复凭据、可信设备迁移和活跃 Group State 防回滚恢复未实现；现有归档仅服务元数据加密导出/只读预览。                                                                                                      |
| 灾难恢复          | **BLOCKED**                    | 没有独立外部备份目标或删除锚；系统数据库/媒体加密签名备份、隔离恢复 **NOT_RUN**。缺新鲜删除证据继续拒绝恢复。                                                                                                 |
| 前后端业务        | **PARTIAL**                    | PC 双入口、真实 API/BoardUI、账户、管理、公共 ID、归档已有功能运行回归；新增截图来自 Cloud Chromium。完整用户通信业务仍阻塞。没有引入未授权 Pro 组件或假统计。                                                |
| 全项目修复/审查   | **PARTIAL**                    | 增补 Outbox；修复浏览器回归对 Chrome HTTP 原因文本的误判，按实际 URL/状态与响应记录核对；增加设备撤销 SQL 验证。现有类型、Lint、AST、引用、构建、npm audit 与迁移/认证/并发回归运行。不是完整第三方安全审计。 |
| 低配资源          | **BLOCKED**                    | 实际 memory.max=34359738368、cpu.max=400000 100000，即 32 GiB/4核；不符合2 GiB/1核。没有20 GiB磁盘限制、受限持续负载或容量验收结果。                                                                          |
| main 交付         | **PASS**（以最终远端核验为准） | 完成后直接提交并推送 main；准确 SHA 由 Git 和最终回复提供，避免文档自引用提交哈希。                                                                                                                           |
| 生产部署准入      | **BLOCKED**                    | 供应链、身份、Provider/Worker、MLS 通信、删除新鲜性、恢复和资源验收均未通过；未部署。                                                                                                                         |

## 本轮代码与验证范围

Outbox 的 strict 事务覆盖 opaque Group State、操作和 pending ID；确认只更新传输收据和 pending 状态，不推进 MLS epoch。旧数据库操作保守回填；调用方必须按原 operationId 核实结果并发送原密文。配额/I/O 是定向故障注入；Worker 测试验证提交成功后终止和未知调用结果恢复，没有测试提交中的进程/系统崩溃。真实磁盘满、掉电、浏览器逐出与恶意旧状态导入仍 **NOT_RUN**。

设备撤销验证由 owner 写入明确标注的合成授权行，实际业务执行使用最小权限 API 角色，覆盖 trigger 回滚、禁止直接调用/重新激活、Session 删除、公开材料撤销和冻结。它不能证明 Credential 签名可信或密码学撤权。既有 008 SQL 原字节和摘要未改变。

完整 SAST 专用扫描器未安装，**NOT_RUN**；现有 TypeScript/ESLint/AST/源码链接与人工检查为 **PARTIAL**。没有将静态通过等同于全项目无缺陷。浏览器首轮因预期401/403原因文本变化失败；修复后重跑。连续运行中出现图表等待超时，重启隔离应用且不改变限流后，完整浏览器流程通过；超时根因未充分证明，失败记录保留在证据中。最终无意外 HTTP/console 或 page errors，不能据此证明生产 TLS 或产品通信安全。

## 最小解除条件

先取得经过审查的官方兼容密码库与无未处理公告的锁闭依赖，再完成真实客户端 Provider/Worker、根/设备授权和单写者原子收发状态。此后验证私聊/群组 Welcome/Proposal/Commit、epoch、成员撤权、无效提交冻结、离线恢复与附件分发。删除与恢复另需独立新鲜删除证据、完整执行器、备份目标和隔离恢复；最后执行真实2 GiB/1核/20 GiB资源验收。上述依赖不能由接口占位或实验数据代替。
