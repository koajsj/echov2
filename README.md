# Echo Native

Private by Design.

自主通信系统的第一阶段研究、架构与实际代码基础，日期 **2026-11-11**。本仓库独立于旧 Echo V2；不使用 Matrix、Synapse 或 Matrix SDK。已有React/Fastify/PostgreSQL源码、配置与未执行迁移；没有安装依赖或启动服务。

**第一阶段交付代码基础；真实MLS集成与第二阶段准入 BLOCKED。** 推荐先验证 OpenMLS 0.9.2 的浏览器可行性，ts-mls 1.6.4 为条件备选；均未选定为生产库。原生库持久化事务、可信设备身份绑定、无效 Commit 处理、Safari/iOS 和独立删除证据仍须满足[准入门槛](docs/native-implementation-plan.md)。公开审计、编译支持和技术设计均不等于本产品安全验收。

## 架构与文档

React + TypeScript + Vite、HeroUI v3；Fastify + TypeScript 模块化单体；PostgreSQL 单实例、单业务数据库；WebSocket 实时提示，HTTPS 游标补齐；客户端 MLS 和附件加密；本地密文媒体；Caddy + systemd。AS 与 DS 是单体内部职责，不是额外服务。Rust 仅在采用原生 MLS/WASM 库时用于客户端密码学核心。

| 文档 | 权威职责 |
| --- | --- |
| [架构](docs/native-architecture.md) | 模块、信任边界、数据流、管理端及未来目录 |
| [密码学研究](docs/native-cryptography.md) | 标准、五个项目比较、Provider、版本、浏览器及原生 API |
| [身份、设备与恢复](docs/native-identity-devices-recovery.md) | 账号、Credential、设备授权/撤销、恢复边界 |
| [协议与投递](docs/native-protocol-delivery.md) | 消息 Schema、API、排序、幂等、Commit/Welcome、客户端事务 |
| [数据与生命周期](docs/native-data-lifecycle.md) | PostgreSQL 逻辑 Schema、附件、删除、到期和归档 |
| [威胁模型](docs/native-security-threat-model.md) | 全通道矩阵、攻击者、剩余风险与证据要求 |
| [部署与运维](docs/native-deployment-operations.md) | 低配预算、权限、外部删除日志、系统备份/隔离恢复 |
| [迁移](docs/native-migration.md) | 只读旧项目、复用筛选与用户设备历史转换 |
| [实施计划](docs/native-implementation-plan.md) | 三阶段、可验收任务、BLOCKED/OPEN 解除条件 |
| [研究来源](docs/research-sources.md) | 实际读取的官方证据、版本快照与核验范围 |
| [决策](docs/decisions.md) | 已决、条件推荐、未决事项及本轮交付检查 |

## 关键边界

- MLS 管理客户端群组密钥，不提供完整聊天产品、密码登录、角色治理或删除保证。一对一是两个用户的 MLS 群组，多设备会有两个以上 leaf。
- 服务器不持有 MLS 私钥、Epoch Secret、完整私有 Group State、恢复密钥或通信正文。参与关系、设备、公钥、流量、时间、密文长度和必要生命周期字段可见。
- PostgreSQL 能排序不透明 Commit 候选，不能证明其 MLS 有效性；存在无效候选时停止发送，不能以服务端 epoch 计数冒充密钥状态。
- 移除成员必须由授权客户端完成有效 MLS Commit。封禁、密码重置、HTTP 会话撤销不等于密码学撤权。
- 删除不能擦除接收者已解密内容、截图或外部副本。旧备份恢复必须取得独立且新鲜的删除证据；缺失时停止恢复。

## 实际代码与使用前提

已有密码注册/邀请事务、用户与管理员Cookie会话/CSRF/重新认证、用户名修改、待授权设备登记/服务撤销、独立超管provision工具、后台真实查询/分页/注册模式/邀请/封禁审计、WSS通知管理、密文顺序/幂等/分页/cursor事务、删除意图/到期持久调度。

**通过参数、CSRF、会话与可信设备验证的消息写入仍被503门禁拒绝；设备不自动可信。** MLS加解密、根签发、KeyPackage操作、群组创建/Welcome、媒体、私人墓碑、归档恢复/注销、物理清理和备份执行器尚未实现。相关表和设计为后续基础，不把页面、计数或pending状态冒充这些能力。

```text
echov2/
  src/client/      app、components、account/devices/messaging/data/admin、crypto、styles
  src/server/      accounts、identity、devices、delivery、messaging、lifecycle、admin、storage、api
  src/shared/      contracts、validation、capabilities
  migrations/     初始Schema/运行权限，仅供审查
  deploy/         Caddy、systemd、PostgreSQL预算
  scripts/        静态扫描、离线管理员provision、本地先决检查
  public/         Echo原创图标
  docs/           研究、规格、威胁/恢复/迁移/计划、交付记录
```

本机没有node_modules，缺失依赖的**精确名称/版本**在[package.json](package.json)；未选定的MLS库没有加入依赖来假装已接入。无锁文件，实际解析树/许可证/SBOM尚未验证；须获授权安装并锁定后才能做完整检查，不能直接npm ci。当前可运行的本地静态命令为`node --experimental-vm-modules scripts/check-source.mjs`，其退出2明确表示缺少完整类型/TSX验证，并非应用失败。

后续获授权准备依赖/数据库时，先审查[migrations说明](migrations/README.md)和[运维](docs/native-deployment-operations.md)。应用不自动迁移；使用受保护环境提供PUBLIC_ORIGIN/DATABASE_URL/MEDIA_PATH，不提交.env。账号页面需要同源HTTPS Cookie，Vite HTTP代理本身不提供生产认证条件。离线provision管理员工具会实际写DB，不在本轮执行；没有“首个HTTP用户自动成为管理员”。

## 本次交付边界

旧项目保持只读，仅[审查后选择性复用](docs/native-migration.md)原创图标、tokens和独立工具配置。未下载文件/源码、克隆、安装、测试、构建、启动服务、执行 SQL、连接 VPS 或部署。允许的网络操作仅为官方资料阅读、GitHub 元数据核查和本仓库获授权的 Git 提交/推送。检查和发布实况见[交付记录](docs/decisions.md)。

第一阶段结束后停止。第二阶段的下载、安装、浏览器原型、测试、构建和服务验证需要另行明确授权；本文中的后续验收步骤没有在本轮执行。
