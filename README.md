# Echo Native

Private by Design.

独立于旧Echo V2的自主通信项目。React 19 + TypeScript + Vite + HeroUI v3，Fastify模块化单体，单实例PostgreSQL，HTTPS/WSS，Caddy + systemd。没有Matrix/Synapse依赖、第二套消息队列或密码学协议实现。

**2026-11-11：第二阶段源码交付为PARTIAL，真实MLS与核心通信仍BLOCKED，聊天写入关闭。** 原生库、可信身份、Group State原子持久化、Commit/Welcome与删除传播尚未接通，不能部署为可用安全聊天产品。第一阶段提交`6b5900e3cac7700e8e1c6ddcdbaf9dbe1da213b3`保留。

## 实际已有与未完成

- 已编写：密码注册/邀请事务、Cookie/CSRF/独立管理audience/重新认证、改名、pending设备/服务撤销、有界目录/不透明投递SQL/原操作查询/cursor、WSS提示、删除意图/数据库到期调度、真实后台元数据操作与页面。
- 本轮修复：route_version与seq/MLS状态分离、Service内总门禁、Commit候选冻结、事务内会话/当前根目录条件、重复撤销无重复副作用、删除操作绑定/本人到期记录分页、邀请码未知结果幂等。
- 前端：Echo原创图标、五档系统字体、衬线标题/无衬线正文、Achromatic Ledger、深浅主题、桌面/移动布局；主要用户与管理员页面入口已覆盖。页面存在不等于对应加密功能完成。
- 附件：仅页内标准AES-256-GCM加解密、临时不可导出key/IV、Object URL释放；未上传、未发送、无MLS传key或持久化。不是生产附件端到端集成。
- 未实现：真实MLS、根授权/Credential/可信设备、KeyPackage、组创建/角色/Remove、Commit+Welcome、加密消息业务、私人收藏/备注/墓碑、完整离线同步、媒体投递/清理、注销/恢复/备份执行器。无假SDK、Mock聊天或备份成功按钮。

服务器仅负责不透明数据及必要元数据，但不能证明任意客户端提交的是合法密文；恶意前端/现成员可泄露内容。服务撤销不等于MLS撤权，删除请求不等于物理擦除，旧备份无新鲜独立删除证据不能自动恢复。

## 文档

| 权威文档                                                                              | 范围                                                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [第二阶段报告](docs/phase-two-report.md)                                              | 验收清单、实际迁移、剩余阻塞、文件树与Git交付            |
| [静态报告](docs/static-verification-report.md)                                        | 实际工具/命令、结果、证据边界                            |
| [架构](docs/native-architecture.md)                                                   | 模块、数据流与信任边界                                   |
| [密码学研究](docs/native-cryptography.md)                                             | 固定版本候选、Provider/API/审计范围与本地缺口            |
| [身份与恢复](docs/native-identity-devices-recovery.md)                                | 账户、设备、根授权和五类恢复                             |
| [协议](docs/native-protocol-delivery.md)                                              | 当前API、route_version/seq、目标Commit/Welcome与原生门禁 |
| [数据生命周期](docs/native-data-lifecycle.md)                                         | Schema/事务/权限、附件、删除、归档与注销                 |
| [威胁模型](docs/native-security-threat-model.md)                                      | 全通道矩阵、保护范围及残余风险                           |
| [运维](docs/native-deployment-operations.md)                                          | 低配预算、独立删除证据与隔离灾备设计                     |
| [迁移台账](docs/native-migration.md)                                                  | 旧项目只读、视觉复用、业务重写及历史转换限制             |
| [实施计划](docs/native-implementation-plan.md)                                        | 三阶段及G1–G7解除条件                                    |
| [研究来源](docs/research-sources.md)、[决策](docs/decisions.md)、[变更](CHANGELOG.md) | 来源快照、决策与历史                                     |

## 本地检查与后续准备

本仓库无node_modules/锁文件；精确依赖声明见[package.json](package.json)，本轮没有增加运行依赖或安装工具。当前检查不启动应用：

```sh
node --experimental-vm-modules scripts/check-source.mjs
node scripts/check-typescript-ast.mjs /absolute/path/to/existing/typescript/lib/typescript.js
```

第一条退出2表示该扫描覆盖PARTIAL；第二条只做AST/本地直接导出，不做类型/运行校验。系统发现已有TypeScript 5.9.3用于AST及局部strict检查；全项目严格检查因缺vite/client与node类型入口退出2，不能记PASS。直接调用本机既有缓存Prettier 3.9.10完成全项目格式检查；ESLint 10.14.0因缺配置插件而阻塞；详见静态报告。

[migrations](migrations/README.md)按001→002→003→004审查，全部未执行，不自动迁移。003拒绝旧投递历史的静默转换；新源码不能配旧Schema直接启动。正式准备前须获授权安装固定依赖/原生库、审查实际API与锁定供应链、隔离数据库和真实浏览器验证。不能直接npm ci，也不能以手写声明或假模块绕过依赖缺失。

旧`echo-v2`完整保留、只读。未下载、安装、克隆、测试、构建、启动、执行SQL、连接VPS或部署。阶段发布只限本仓库非强制提交/推送；远程返回和SHA以交付回复为准。交付后停止，等待审查，不自动进入第三阶段。
