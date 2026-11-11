# Echo Native

Private by Design.

自主通信项目：React 19 / TypeScript / Vite / HeroUI v3，Fastify 模块化单体、PostgreSQL、HTTPS/WSS、Caddy、systemd。旧 `echo-v2` 仅作只读参考，无 Matrix/Synapse 运行依赖，不引入微服务或第二套认证。

**2026-11-11，第三阶段交付为 PARTIAL，尚不是可上线的安全聊天产品。** MLS、可信设备、原子 Group State、群组撤权、删除传播和完整恢复仍 BLOCKED，聊天写入继续关闭。三阶段到此停止，不增加第四阶段；不能将已编写源码或页面入口当成运行验收。

## 实际源码

- 注册模式/邀请事务与幂等、密码认证、Secure Cookie/CSRF、独立管理 audience、按稳定 UUID 重新认证、改名。
- pending 设备目录与分页、本人会话管理、管理员全部服务会话撤销、设备服务撤销和关联群组冻结。服务权限与 MLS 信任分开。
- 有界不透明投递基础、原操作查询、WSS 目录提示、删除请求与数据库时间到期调度；Service 总门禁仍拒绝聊天写入。没有 MLS Commit/Welcome、消息解密展示或伪造的聊天内容。
- 管理员真实账号/设备/认证记录/注册趋势/审计/删除与备份状态，用户查询、暂停恢复、邀请码创建撤销、事件人工审阅、当前页 CSV。未知统计保持未知；审阅不是风险已解决。
- 本人服务元数据一致快照导出，标准 WebCrypto 口令加密文件、认证和只读导入预览。范围仅账号、设备、本人消息删除请求，不含聊天历史、附件、会话凭据或私钥；不能用于恢复状态。
- 本地附件 AES-GCM 临时准备与主动解密下载；未上传、未接 MLS 密钥分发。
- 继承原创 Logo、Achromatic Ledger、五档系统字体、衬线标题/无衬线正文、深浅主题、响应式与 reduced-motion，无字体/图片下载或新增依赖。

未实现的产品功能包括私聊/建群、加密编辑/撤回/转发/多选/搜索/收藏/置顶/草稿/未读、私人备注同步、身份核验/恢复、Delete for me、离线墓碑、七天回收恢复、媒体发送/清理、历史/媒体归档、注销、系统备份执行器。没有以明文或 Mock 替代。

## 权威文档

| 文档                                                                                                | 内容                                     |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [第三阶段报告](docs/phase-three-report.md)                                                          | 完整功能清单、缺口矩阵、目录、交付边界   |
| [静态验证](docs/static-verification-report.md)                                                      | 实际命令/退出码、工具缺失和运行限制      |
| [架构](docs/native-architecture.md) / [协议](docs/native-protocol-delivery.md)                      | 模块与当前 API、投递语义                 |
| [密码学](docs/native-cryptography.md) / [身份与恢复](docs/native-identity-devices-recovery.md)      | 固定候选、原生准入、设备和恢复边界       |
| [数据生命周期](docs/native-data-lifecycle.md) / [威胁模型](docs/native-security-threat-model.md)    | Schema/事务/归档、通道和残余风险         |
| [运维](docs/native-deployment-operations.md) / [实施与准入](docs/native-implementation-plan.md)     | 低配预算、独立删除证据、隔离恢复与 G1–G7 |
| [迁移台账](docs/native-migration.md) / [决策](docs/decisions.md) / [来源](docs/research-sources.md) | 迁移边界、决策和第一阶段研究快照         |

[第二阶段报告](docs/phase-two-report.md)保留历史审查证据，以第三阶段报告和当前源码为准。

## 静态检查和使用前提

仓库未安装依赖，无锁文件；精确声明见 [package.json](package.json)。本轮未下载、安装、测试、构建、启动、执行 SQL、访问数据库/VPS或部署。可使用本地既有工具解析源码：

```sh
node --experimental-vm-modules scripts/check-source.mjs
node scripts/check-typescript-ast.mjs /absolute/path/to/existing/typescript/lib/typescript.js
```

前一脚本退出 2 代表覆盖 PARTIAL；AST 不验证完整类型、外部 API、数据库或密码学。完整 tsc / ESLint 因缺项目依赖而 BLOCKED，不能绕过或伪报通过。真实浏览器、跨设备、恢复和容量验证没有执行。

迁移 [001→005](migrations/README.md)全部仅供审阅；001–004 保持原字节。003 对已有旧投递历史中止，005 是本轮增量权限/审计变更。新源码不能配旧 Schema 直接使用，不自动迁移。启用产品必须另获必要原生依赖与运行验证授权，先解除 G1–G6；没有这些证据不能部署。发布源码不代表生产准入。
