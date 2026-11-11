# 第三阶段最终产品与静态安全报告

2026-11-11 Cloud 启动修复补充：两处 React Hooks 错误已修复并通过工程检查；历史迁移是否曾成功应用尚待用户核查，SQL 修复及真实账号工作流仍 BLOCKED。详情及实际退出码见 [Cloud 验证报告](cloud-bootstrap-verification.md)。此前阶段记录保留，不表示本轮新增第四阶段或解除 MLS 门禁。

2026-11-11。基线 `1473395355575ea44e865904e0978794fa585afb`，第一/二阶段历史保留。**整体 PARTIAL；G1–G6仍BLOCKED，不具备生产部署准入。** 本阶段结束后停止，不增加第四阶段。源码实现、静态检查、运行验收分别记录。

## 保护与审查范围

核对完整工作区、Git历史/远端main、源码/资源/依赖/配置/全部文档、23表和001–005增量迁移。旧echo-v2在开始和交付前均做185文件路径/内容SHA-256核对，完全只读；Logo、字体Token、001–004历史迁移保持原字节。起始工作区干净，本轮没有覆盖用户介入修改，没有reset/clean/stash/改写历史。

本轮主智能体统一修改，按权限/事务、前端/文件、完整Diff分轮复核；没有新派子智能体，不把第二阶段Terra结果冒充本轮独立审查或运行证据。

## 用户端完整功能清单

“PARTIAL/源码”表示有真实API和交互代码，但未运行；BLOCKED包含尚未实现源码，不能称作只差测试。

| 功能                     | 当前代码与操作闭环                                                                         | 状态/缺口                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 登录注册                 | 密码/真实注册模式查询、开放/邀请/关闭、同库注册/邀请消费幂等、错误/加载；独立管理员登录    | PARTIAL；无数据库/浏览器验收、逐用户名分布式防爆破仍缺                |
| 设置/改名                | 新近认证、稳定UUID、版本CAS；重认证已改为按UUID并事务重验                                  | PARTIAL；没有私密资料同步                                             |
| 聊天列表                 | 当前授权设备目录50+1页、WSS唤醒和实际路由信息                                              | PARTIAL；没有消息读取/展示或自动ACK                                   |
| 私聊/群组/治理           | 不透明投递SQL与失败冻结基础保留                                                            | BLOCKED：真实MLS、Credential、Add/Welcome/Commit/Remove和角色投影缺失 |
| 编辑/撤回/转发/多选      | 未展示空操作按钮或假正文                                                                   | BLOCKED：原生验证/作者/墓碑及聊天管线缺失                             |
| 搜索/收藏/置顶/草稿/未读 | 不上传明文，不建立第二套消息系统                                                           | BLOCKED：本地解密与私人同步缺失                                       |
| 联系人与备注             | 真实精确账号UUID查找，显式未验证目录                                                       | PARTIAL；备注/联系人授权加密同步未实现                                |
| 隐私                     | 如实展示无正文通知/typing/回执、无明文资料上传的当前行为                                   | PARTIAL；邀请/黑名单/头像等加密设置未实现，无假开关                   |
| 设备管理                 | pending登记、完整分页、本人服务撤销、加载/确认/错误反馈                                    | PARTIAL；不能激活/核验设备或完成MLS撤权                               |
| 服务端会话               | 设置页新近认证、本人分页、撤单条/其他全部；当前会话用登出                                  | PARTIAL；只覆盖事务中观察到的服务会话，不阻止未来合法登录             |
| 密钥恢复                 | 真实根目录查询、五类恢复边界                                                               | BLOCKED：不生成假恢复key/QR，不导入旧Group State                      |
| 回收站/删除              | 本人含expiry记录真实分页，待锚状态明确                                                     | PARTIAL；Delete for me/七天恢复/离线墓碑/物理擦除仍BLOCKED            |
| 数据中心                 | 标准附件临时AEAD、浏览器前提、服务元数据一致快照加密导出、文件认证和只读导入预览、关闭下载 | PARTIAL；不含完整历史/媒体/联系人/设置归档、密钥备份和系统备份        |
| 注销                     | 无仅删users行的伪注销                                                                      | BLOCKED：Owner交接/Remove、删除传播/备份证据缺失                      |

所有现有服务操作接真实Native API，无Mock、假聊天/统计、假进度/成功。被阻断的业务没有凭页面存在算完成。布局、Logo、五档系统字体、深浅主题和reduced-motion保留；桌面/平板/手机仅静态审查，视觉运行NOT_RUN。

## 管理后台

| 区域           | 实际来源与能力                                                                                              | 缺口/限制                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dashboard      | 用户/今日UTC新增、active目录设备、持有效服务会话账号、登记envelope/附件密文字节、待删数；真实30日观测注册桶 | 不是DAU/真实可信设备在线或密码学验证消息数；不补缺日零值                           |
| 在线与存储     | 当前进程60秒通知窗口去重session数、媒体所在卷statfs总量/可用字节                                            | 不是可信设备在线/媒体物理inventory；缺目录为null+原因，其他失败503                 |
| 用户           | ASCII不区分大小写精确查询、UUID分页、详情、暂停/恢复、会话查询/全撤、CSV                                    | 暂停/撤销冻结关联组，不代表MLS Remove；暂停后恢复不自动解冻                        |
| 设备           | 真实目录分页、管理员服务撤销，与本人同事务逻辑/审计                                                         | 不签发Credential，不撤回已分发密钥                                                 |
| 认证与IP       | 可信认证处理器存储结果/IP；新登录与重认证分类                                                               | 密码处理成功不保证session最终签发/更新时间提交；IP取决可信代理，地区/浏览器/OS未知 |
| 安全中心       | 真实事件、人工审阅字段及结构化审计event_id                                                                  | reviewed=true不等于resolved；无完整异常检测/身份变化源                             |
| 注册/邀请      | 模式CAS、操作幂等/凭据仅首次、分页/CSV、撤销邀请码                                                          | 不回滚已完成注册；未知创建结果仍沿原操作，不凭空恢复原token                        |
| 删除/备份/审计 | 实际表分页、状态、CSV，不提供私钥/正文/邀请码hash                                                           | 备份表不等于执行器；没有创建/恢复假任务                                            |
| 系统           | 真实准入/容量、配置来源与资源边界                                                                           | 保留/配额执行器、全站/媒体流量、GeoIP/UA仍BLOCKED；没有假设置按钮                  |

管理写操作复核单超管/新近认证/CSRF/会话上下文，事务内审计；只有实际变更才新增对应撤销/审阅审计。CSV仅当前可见页或观测桶，确认后生成，有公式中和和下载URL释放；不是全站一致快照导出。

## 本轮实际修复

1. **重新认证身份竞态**：旧流程通过可变用户名查密码，用户名变更/重用可能验证另一个账号。现在按session永久UUID查，更新前在事务中复核活跃账号、当前session和admin audience。登录/重新认证密码结果单独分类。
2. **设备目录截断**：原LIMIT100无续页可能隐藏后续当前设备；现在50+1 UUID分页并接页面。
3. **服务运营缺口**：补本人/管理员会话管理、管理员设备撤销、邀请码撤销、事件审阅及真实审计；复用现有锁/认证/设备逻辑，不引入第二套权限。
4. **未知与数据来源**：区分空列表、null未记录、字段缺失、请求失败；在线通知session/数据库附件量/statfs卷容量分别标注，禁止冒充可信设备在线或媒体占用核查。
5. **数据导出缺口**：实现范围有限且明确的本人服务元数据一致快照/标准AEAD归档和只读预览；超限失败，不截断、恢复删除状态或导入活跃state。
6. **服务凭据生命周期**：既有维护循环加入数据库时间的有界过期会话清理，失败单独报告；不清设备/根/备份，也未运行。
7. **低配配置**：锁等待/空闲事务上限、关闭duration/core日志、systemd权限边界、Node先决最低版本对齐。均为未运行配置，不是性能验收。

## G1–G6与E2EE安全覆盖

| ID         | 结果/技术原因                                                                           | 残余风险                                | 最小替代与解除条件                                                      |
| ---------- | --------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| G1 BLOCKED | 无实际OpenMLS0.9.2或ts-mls1.6.4依赖、套件1/WASM/provider稳定API证据；安装/构建/运行禁止 | 不能编写并证明真实加密适配              | 保留Service503；获授权固定库/features/API与真实浏览器/向量/互操作审查   |
| G2 BLOCKED | 原生Proposal/Commit/Welcome和确认投影未接入                                             | 无效/竞争候选可能卡组，路由不是epoch    | 保留冻结、不推进/解冻；需native staged/merge/discard、并发/未知结果证据 |
| G3 BLOCKED | 无原生状态变更+outbox/游标原子事务/跨标签单写者                                         | 崩溃/回滚可能复用ratchet或丢发送状态    | 不存JSON冒充、不开消息；需provider事务/故障验证                         |
| G4 BLOCKED | 根绑定、Credential/KeyPackage、防重放/恢复未实现                                        | 密码或目录不能证明设备可信              | pending/服务撤销；需固定授权profile/实际leaf/根pin与恢复验证            |
| G5 BLOCKED | 无逐设备Remove/new epoch、内层作者校验、私人墓碑/删除checkpoint/媒体清理                | HTTP撤权不撤秘密，旧设备/备份可持副本   | 冻结、待锚/读取隐藏；需MLS撤权、离线删除、引用清理证据                  |
| G6 BLOCKED | 无独立新鲜删除日志头、跨存储收据、外部介质密钥或执行器                                  | 旧备份可能使内容复活，dump/摘要不能解决 | 自动恢复/purge关闭；需停写一致捕获、独立头、隔离恢复与回滚验证          |

逐通道威胁/保护范围/静态证据/未保护范围集中在[安全矩阵](native-security-threat-model.md)，本轮没有运行安全PASS：

- 房间/消息/编辑/转发、私密资料/备注/收藏：BLOCKED，未接MLS；不展示/不发送。
- 原生Welcome/密钥后台接收、私人account-data替代：BLOCKED，没有通用明文旁路。
- 历史/离线HTTP：PARTIAL，服务授权/到期和待删门控；缺删除checkpoint，前端不消费消息。
- WSS：PARTIAL，仅通知/Origin/session/上限，不带正文或秘密。
- 媒体：BLOCKED，只有页内AEAD和禁止公开目录，没有授权密文上传/下载/清理。
- 搜索/聊天缓存/历史导出：BLOCKED；新增服务元数据文件是独立范围，不填聊天缺口。
- 日志/统计/管理/前端发布：PARTIAL，固定来源/敏感抑制/CSP候选；无锁供应链、发布真实性和运行验证。

服务器可见必要账号、设备标签、路由、时间、IP、密文大小及删除元数据。恶意客户端可主动把秘密写入元数据，不能承诺服务器绝无明文。旧密钥/已经解密内容、截图、外部文件与恶意现成员转发不可远程擦除。

## 删除、备份、恢复与生产准备

到期由Fastify数据库时间调度，零浏览器在线也可登记删除意图；无物理purge、独立锚或完整墓碑同步，不能宣称已销毁。元数据文件AEAD认证只证明口令/文件一致，不证明来源真实、最新删除状态或聊天可恢复。预览不写数据库/IndexedDB，不重发历史。

用户元数据归档、完整历史归档、系统数据库/媒体/必要配置备份、MLS身份/设备恢复分别管理。系统备份不含浏览器私钥。完整停写捕获/清单/外部密钥/隔离恢复/最新删除证据核对/回滚规格以[运维](native-deployment-operations.md)为准；无执行器时保持BLOCKED。

Debian2GB/1核/20GB仅预算：Node heap384MiB/MemoryMax768MiB，PG连接20/API池5，附件10MiB但无配额/上传执行器；日志上限/保留清理/独立备份容量仍未闭环。未构建、无锁依赖/SBOM、未真实验证权限/容量/前端/密码学，**不得部署为安全通信服务**。

## 文件与文档整理

保留已有职责目录，不做无理由移动；本轮无文件移动或删除，不删除不明文件。新增accounts下数据/会话管理路由、admin下动作/存储观测；共用CsvExport/DownloadFile/SessionPanel；metadata-archive与页面同属data特性。新增005迁移和本报告。DataPage重复首屏删除列表移除并链接TrashPage；图表孤立secondary class改用已有muted。未新增字体/图片/运行依赖/空目录、Matrix接口或旧协议兼容层。Schema中的KeyPackage/inbox/analytics/receipts及gated投递基础为已要求但未启用的原生建设基础，明确保留而非当成可用功能；批准的Typography备用Token也不因暂未消费而删除。

README只列实际范围；各技术主题原文更新为唯一权威。实施计划收敛为三阶段结果/G1–G7，不另建重复路线图；第二阶段审查报告和来源快照作为历史证据保留。没有为减少文件数合并不同职责。

## 验证与Git交付

实际命令/计数/退出码见[静态报告](static-verification-report.md)。AST、本地引用、局部严格类型、格式和Diff静态事实可PASS；完整类型/Lint被依赖BLOCKED，SQL/权限仅人工静态PARTIAL；测试/构建/服务/SQL/数据库/浏览器/真实加密/恢复/性能/部署均NOT_RUN。相关源码和流程运行仍NEEDS_RUNTIME_VERIFICATION；没有以源码编写算安全通过。

仅向echov2 main非强制提交推送，保留此前历史，推送前重查远端和敏感/忽略/文件集合；远端非预期变化即停止。最终SHA、GitHub返回和本地远端树一致性由交付回复记录，本文不预写推送成功。

## 最终目录树

<!-- Current tree follows; includes author files only, no .git/dependencies/generated output. -->

```text
echov2/
├── deploy/
│   ├── Caddyfile
│   ├── echo-native.service
│   └── postgresql.conf
├── docs/
│   ├── decisions.md
│   ├── native-architecture.md
│   ├── native-cryptography.md
│   ├── native-data-lifecycle.md
│   ├── native-deployment-operations.md
│   ├── native-identity-devices-recovery.md
│   ├── native-implementation-plan.md
│   ├── native-migration.md
│   ├── native-protocol-delivery.md
│   ├── native-security-threat-model.md
│   ├── phase-three-report.md
│   ├── phase-two-report.md
│   ├── research-sources.md
│   └── static-verification-report.md
├── migrations/
│   ├── 001-initial.sql
│   ├── 002-runtime-permissions.sql
│   ├── 003-route-version-and-delivery.sql
│   ├── 004-invitation-idempotency.sql
│   ├── 005-admin-lifecycle.sql
│   └── README.md
├── public/
│   └── echo.svg
├── scripts/
│   ├── check-source.mjs
│   ├── check-typescript-ast.mjs
│   ├── preflight.sh
│   └── provision-admin.ts
├── src/
│   ├── client/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── Workspace.tsx
│   │   │   ├── api.ts
│   │   │   ├── navigation.ts
│   │   │   ├── use-api-query.ts
│   │   │   └── use-delivery-notifications.ts
│   │   ├── components/
│   │   │   ├── Brand.tsx
│   │   │   ├── Charts.tsx
│   │   │   ├── CsvExport.tsx
│   │   │   ├── DownloadFile.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── Icon.tsx
│   │   │   ├── ReauthenticationForm.tsx
│   │   │   └── ServiceState.tsx
│   │   ├── crypto/
│   │   │   ├── attachment-crypto.ts
│   │   │   └── readiness.ts
│   │   ├── features/
│   │   │   ├── account/
│   │   │   │   ├── AccountPage.tsx
│   │   │   │   ├── AuthPage.tsx
│   │   │   │   └── PrivacyPage.tsx
│   │   │   ├── admin/
│   │   │   │   ├── AdminRecordsPage.tsx
│   │   │   │   ├── AdminSettingsPage.tsx
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── RegistrationPage.tsx
│   │   │   │   └── UsersPage.tsx
│   │   │   ├── contacts/
│   │   │   │   └── ContactsPage.tsx
│   │   │   ├── data/
│   │   │   │   ├── AttachmentPreparationPanel.tsx
│   │   │   │   ├── DataPage.tsx
│   │   │   │   ├── MetadataArchivePanel.tsx
│   │   │   │   └── metadata-archive.ts
│   │   │   ├── devices/
│   │   │   │   ├── DevicesPage.tsx
│   │   │   │   ├── RecoveryPage.tsx
│   │   │   │   └── SessionPanel.tsx
│   │   │   ├── messaging/
│   │   │   │   └── ConversationsPage.tsx
│   │   │   └── personal/
│   │   │       ├── SavedPage.tsx
│   │   │       └── TrashPage.tsx
│   │   ├── styles/
│   │   │   ├── app.css
│   │   │   ├── charts.css
│   │   │   ├── screens.css
│   │   │   ├── shell.css
│   │   │   └── tokens.css
│   │   └── main.tsx
│   ├── server/
│   │   ├── accounts/
│   │   │   ├── account-routes.ts
│   │   │   ├── account-service.ts
│   │   │   ├── data-routes.ts
│   │   │   ├── passwords.ts
│   │   │   ├── session-access.ts
│   │   │   ├── session-management.ts
│   │   │   └── sessions.ts
│   │   ├── admin/
│   │   │   ├── admin-action-routes.ts
│   │   │   ├── admin-read-routes.ts
│   │   │   ├── admin-routes.ts
│   │   │   └── storage-routes.ts
│   │   ├── api/
│   │   │   └── http-error.ts
│   │   ├── delivery/
│   │   │   ├── connection-hub.ts
│   │   │   ├── delivery-routes.ts
│   │   │   └── delivery-service.ts
│   │   ├── devices/
│   │   │   └── device-service.ts
│   │   ├── identity/
│   │   │   └── identity-service.ts
│   │   ├── lifecycle/
│   │   │   ├── deletion-service.ts
│   │   │   └── lifecycle-routes.ts
│   │   ├── messaging/
│   │   │   └── crypto-gate.ts
│   │   ├── storage/
│   │   │   └── database.ts
│   │   ├── app.ts
│   │   ├── config.ts
│   │   └── main.ts
│   └── shared/
│       ├── capabilities.ts
│       ├── contracts.ts
│       └── validation.ts
├── .env.example
├── .gitignore
├── .prettierignore
├── CHANGELOG.md
├── README.md
├── eslint.config.js
├── index.html
├── package.json
├── tsconfig.client.json
├── tsconfig.json
├── tsconfig.server.json
├── tsconfig.tools.json
└── vite.config.ts
```

作者文件共110个；不含.git、依赖、构建或用户数据。
