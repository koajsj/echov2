# Echo Native

Private by Design.

React 19 / TypeScript / HeroUI v3，Fastify 模块化单体、PostgreSQL、HTTPS/WSS、Caddy 与 systemd。无 Matrix/Synapse 运行依赖，不增加第四阶段。

**整体 PARTIAL，不具备生产上线条件。** 密码认证、管理元数据和迁移兼容已真实验证；完整消息产品尚未完成。聊天写入继续返回 `503 MLS_NOT_READY`。OpenMLS 浏览器实验通过不代表应用已实现端到端通信，生产门禁不因本次交付解除。

## 已实现与验证

- 新库独立修正版基线与旧库 006 兼容路径；原 001–005 字节不变。Owner 迁移、版本摘要、baseline_id、四态收据、并发锁和未知结果停止。未知持久化环境不自动接管。
- 真实注册、邀请码及操作幂等、唯一用户名、Argon2id 登录、会话、重新认证、改名和退出。普通用户会话不能查看或撤销管理员会话。
- 设备目录、服务访问撤销、管理查询、注册管理、审计及 CSV；目录记录和密码登录不构成可信密码学身份。
- 本人服务元数据加密归档、下载和只读导入预览；本地附件 AES-256-GCM 准备与解密。不是聊天历史备份、密钥恢复或系统灾备。
- 独立 OpenMLS 0.9.2 / RustCrypto 0.6.0 WASM 实验，套件 1；两个独立 Chromium 上下文真实 KeyPackage、Welcome、Commit、应用加解密、重放拒绝、成员移除和 Epoch 更新。未接入产品，不保存真实身份或消息。
- 未接入发送的 IndexedDB/Web Locks 原子操作存储前置模块；多标签 CAS、刷新恢复和注入配额失败回滚已验证。尚无完整 provider 状态封装、崩溃恢复或防回滚证明。

## 仍未完成

可信设备根绑定、SAS/QR、完整设备恢复、原生 MLS 持久化与应用通信、私聊/群聊业务、离线同步、加密编辑/搜索/收藏、附件上传与 MLS 分发、墓碑传播、物理删除、七天回收、独立删除锚与系统隔离恢复。不得用明文、Mock 或 HTTP 撤销代替这些能力。

Rust 依赖审计有未解决公告；Firefox/WebKit 下载受 Cloud 网络策略阻止，iOS 实机未验证。Cloud Docker 未实际施加指定的 2 GB / 1 核限制，不能声称低配容量验收通过。

## 开发与检查

仅在获授权环境使用 Node 24.17+（小于 25）；本轮实际 Node 24.22.1。依赖精确声明并提交 package-lock.json；Rust 实验另有 Cargo.lock 与固定工具链。

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run check:ast
npm run check:source
npm run build:client
npm run build:server
```

数据库操作见 [迁移唯一操作说明](migrations/README.md)。应用启动不自动迁移，不连接未知环境。实验构建和浏览器测试见 [MLS 实验说明](crypto/mls-lab/README.md)。生成的 WASM 绑定及 Cargo target 不提交；执行源码 Lint 前清除生成的 pkg。

## 权威文档

| 主题                             | 文档                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 本轮结果、产品缺口与生产结论     | [第三阶段报告](docs/phase-three-report.md)                                                                                  |
| 命令、退出码、安全扫描与资源限制 | [工程验证](docs/static-verification-report.md)                                                                              |
| 数据库迁移证据                   | [Cloud 数据库验证](docs/cloud-bootstrap-verification.md)                                                                    |
| 系统/API 与投递                  | [架构](docs/native-architecture.md)、[协议](docs/native-protocol-delivery.md)                                               |
| MLS 与信任                       | [密码学](docs/native-cryptography.md)、[身份设备恢复](docs/native-identity-devices-recovery.md)                             |
| 删除、归档与灾备                 | [生命周期](docs/native-data-lifecycle.md)、[运维](docs/native-deployment-operations.md)                                     |
| 安全与准入                       | [威胁模型](docs/native-security-threat-model.md)、[实施准入](docs/native-implementation-plan.md)、[决策](docs/decisions.md) |
| 依赖清单                         | [npm SBOM](docs/evidence/npm-sbom.json)、[Rust SBOM](docs/evidence/rust-sbom.json)                                          |

早期阶段记录保留必要历史证据，以当前报告和源码为准。旧 echo-v2 未修改；没有生产部署或自动合并。
