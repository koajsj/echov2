# 第二阶段源码交付报告

2026-11-11。基线为第一阶段提交`6b5900e3cac7700e8e1c6ddcdbaf9dbe1da213b3`，接管时main工作区干净、远程同提交。**总体PARTIAL：安全可实施增量已落地，真实MLS与核心通信仍BLOCKED。不能宣称第二阶段功能完整或已满足进入第三阶段的准入。** 本轮结束后停止，不开始第三阶段。

## 第一阶段审查与修复

| 状态    | 原有问题                                     | 实际修复/边界                                                                                                         |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FIXED   | baseEpoch/routeEpoch与服务计数易混淆原生状态 | 共享类型/API/SQL统一baseRouteVersion/routeVersion/route_version，seq独立；服务端不推算mls_epoch                       |
| FIXED   | 按声明wireKind=commit自动推进路由            | 不推进版本；仅持久pending候选并冻结，收据persisted-unverified，没有解冻API；总503下移至Service入口                    |
| FIXED   | 迁移可能继承未经验证的旧候选计数             | 003先排他锁，再检查无旧消息/inbox或非零head；否则中止，不改写/删除旧历史                                              |
| FIXED   | 事务外校验后的session撤销竞态                | 投递/删除/撤设备/改名/管理员写事务内重验session；会话签发在账号锁内重验active/admin；部分只读元数据在途响应仍不能追回 |
| FIXED   | 活跃凭证不检查公开根退休                     | 查询关联当前未退休根；仍不等于Credential签名/实际leaf绑定完成                                                         |
| FIXED   | 已撤设备重复操作递增版本并重复审计           | 先锁查状态；已revoked无重复副作用；HTTP/WSS撤销与MLS移除分开                                                          |
| FIXED   | 删除新操作ID未绑定却返回成功                 | 同目标不同operation明确409，原ID重试才返回原状态；全局唯一竞争映射409 CONFLICT                                        |
| FIXED   | 到期任务记录对原作者不可查、只有100条        | 按原发送账号关联，包含expiry，50+1分页；不是完整多设备删除checkpoint                                                  |
| FIXED   | 邀请创建未知结果可重复生成                   | 004操作ID/请求摘要、超管锁串行；原ID核实不重扣/重建，原token仅首响应可见，无法找回时明确tokenUnavailable              |
| FIXED   | 异步查询切换前一帧可能保留旧路径数据         | query key隔离path/revision/session、AbortController取消；旧数据在render立即隐藏                                       |
| PARTIAL | WSS仅服务端提示，无前端订阅                  | session context双重核对、有界通知/退避重连，客户端只刷新目录，不自动读消息/ACK或假装已离线同步                        |

三项Terra只读审查覆盖MLS/原生持久化、身份与投递一致性、生命周期；主智能体统一修改。复核指出的迁移/到期可查询问题已处理；最后复核所查范围未再确认确定性回归。不是完整安全审计或运行验证。

## 20项验收

| #                 | 状态                              | 实际成果与缺口                                                                                                     |
| ----------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 第一阶段审查    | FIXED / PARTIAL                   | 已修上述确定缺陷；依赖/完整类型及运行仍有边界                                                                      |
| 2 用户页面迁移    | PARTIAL                           | 登录/注册、聊天、联系人、收藏、设置/隐私、设备/恢复、回收站、数据入口均有页面；加密业务大量BLOCKED，非完整功能迁移 |
| 3 管理页面迁移    | PARTIAL                           | 独立登录、概览、用户/详情、设备、登录、安全、审计、分析/地区、注册邀请、备份与设置入口；第三阶段完整运营操作未做   |
| 4 设计继承        | PASS / NEEDS_RUNTIME_VERIFICATION | 原Logo/tokens、Icon/EmptyState、选用图表、系统字体/主题/克制布局；仅源码层，浏览器视觉未验收                       |
| 5 旧协议清理      | PASS                              | Native源码/package无Matrix/Synapse SDK/hook/Room模型；文档历史比较不等于运行依赖                                   |
| 6 Identity        | PARTIAL                           | UUID/可变唯一username、Argon2id、Cookie/CSRF/重认证/邀请事务与超管；根签发/可信绑定BLOCKED                         |
| 7 Devices         | PARTIAL                           | pending登记/列表/服务撤销、session关闭/群冻结；授权、验证、迁移、Remove、新设备入组BLOCKED                         |
| 8 Crypto/MLS      | BLOCKED                           | 无本地成熟MLS库/provider/WASM；没有空适配器或自研协议                                                              |
| 9 一对一          | BLOCKED                           | 双用户MLS组设计；没有原生组创建/发送实现                                                                           |
| 10 群组           | BLOCKED                           | 现有角色/路由基础，原生Add/Remove/Owner转让与成员隔离未实现                                                        |
| 11 Commit/Welcome | BLOCKED                           | 只有DS候选/顺序SQL及失败冻结基础；无Welcome生产/消费/关联、staged/merge/discard闭环                                |
| 12 离线同步       | PARTIAL                           | 有界日志/cursor/原操作查询与WSS目录唤醒；无native处理和本地原子持久收件/完整删状态                                 |
| 13 消息业务       | BLOCKED                           | 文字、编辑、撤回、多选、转发、置顶、回执、草稿、搜索等未接通；无Mock或明文替代                                     |
| 14 附件           | PARTIAL                           | 标准页内AES-256-GCM及清理入口；没有MLS传key、授权媒体上传/引用/下载/持久重试                                       |
| 15 删除生命周期   | PARTIAL                           | 原作者意图、数据库到期扫描、读取隐藏/本人状态分页；无私人墓碑、七天恢复、独立锚、物理/媒体purge或备份传播          |
| 16 数据库增量     | FIXED / NOT_RUN                   | 新003/004，001/002不改；未执行SQL/迁移/权限验证                                                                    |
| 17 目录整理       | PASS                              | 职责/命名清晰，删除确认无引用的旧聚合AdminPage；没有空目录或依赖搬迁                                               |
| 18 文档           | FIXED                             | 权威规格、迁移台账、阶段/静态报告更新；去掉旧决策中的重复文件树/检查表                                             |
| 19 静态检查       | PARTIAL                           | AST/本地导出/局部strict、引用/敏感/权限/Diff；全项目类型被依赖入口阻塞，Prettier全项目格式通过；ESLint因缺插件阻塞 |
| 20 第三阶段准备   | PARTIAL                           | 明确三阶段与准入清单；G1–G6未解除，不自动进入第三阶段                                                              |

## 前端、文件与依赖

完整页面与旧新映射集中在[迁移台账](native-migration.md)。保留第一阶段账号/设备/数据功能、原创图标、tokens、配置与安全门禁；重写聊天目录、工作区导航和管理页数据层，复用独立Icon/EmptyState与ChartFrame/LineChart。Charts只保留使用部分，未复制无数据的area/donut/heatmap；CSS同样裁剪。唯一删除的既有源码为新项目`src/client/features/admin/AdminPage.tsx`，职责拆入Dashboard/Users/Registration。没有移动或删除旧项目文件。

统一了原有22个格式不一致文件，仅作格式整理；历史001/002、Logo与tokens字节保留。

新增服务层session-access用于统一有序锁和事务权限复核，有明确复用收益；没有第二套认证/权限系统。依赖版本未变，仅package新增check:ast脚本；无运行依赖、锁文件、node_modules或构建产物新增。新检查脚本只加载本地已存在TypeScript工具，不运行应用。

## BLOCKED缺口与最小替代

| 项              | 技术原因/残余风险                                                  | 解除条件                                                  | 当前替代                                |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| 原生MLS G1      | 无本地库/WASM/provider，禁止安装/构建/运行；无法核实稳定API及套件1 | 获授权固定依赖/features、实际API和浏览器/向量/互操作证据  | 总503，禁止假实现                       |
| 原子状态 G2/G3  | 无native staged/merge/discard与事务变更集；IndexedDB简单存JSON不足 | 原生持久化+精确outbox/去重/cursor单事务、跨标签及故障验证 | 未验证候选冻结、不推进、未知保留        |
| 身份 G4         | 根授权profile/成熟实现未接通，目录不能绑定真实leaf                 | 标准凭证、可信根pin、设备授权/撤销、防重放和恢复审查      | 仅pending/服务撤销，不伪验证            |
| 群隔离 G5       | 无Remove Commit、新epoch或历史key处理；服务封禁不撤秘密            | 固定库实际Add/Remove/Welcome与新旧成员/设备验证           | 冻结群组，拒未来发送                    |
| 墓碑/媒体 G5/G6 | 无私人组/完整删除checkpoint/独立新鲜证据/跨存储清理                | native私人同步、锚、幂等purge/引用核查及离线/恢复验证     | 仅authorized待锚/读取隐藏，不标complete |
| 恢复/备份 G4/G6 | 无标准恢复封装/执行器/外部介质和可信最新头                         | 外部密钥与删除证据、停写一致捕获、隔离恢复核验            | 自动恢复/旧state导入关闭                |
| 完整前端功能    | 业务缺少上述服务和原生能力；仅迁移视觉不能完成                     | 核心准入后接真实API与原生结果、权限/进度/失败闭环         | 明确状态，不加假按钮/数据               |

附件目前不可导出key，只是页内加解密，不是直接可接MLS发送的密钥接口；正式封装/持久重试仍需设计和评审。没有靠降低标准消除BLOCKED。

## NOT_RUN与静态证据

所有测试、构建、服务、SQL/迁移、数据库、浏览器/移动端、真实MLS/跨设备/撤权、删除传播、附件浏览器运行、系统备份/恢复、性能、VPS与部署均NOT_RUN。具体工具/数量/退出码见[静态报告](static-verification-report.md)。PASS只覆盖相应静态事实，FIXED表示源码已调整，不表示运行验收。

## Git交付

只提交新echov2，保留第一阶段历史；先核对远端main、全部暂存/忽略文件、敏感候选和Diff，再非强制推送。远端非预期变动即停止，不覆盖。最终SHA、GitHub返回及本地远端tree/ref一致性由交付回复记录，不在尚未推送时预写成功。Git发布源码不表示第二阶段安全准入通过。

## 最终文件树

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
│   ├── phase-two-report.md
│   ├── research-sources.md
│   └── static-verification-report.md
├── migrations/
│   ├── 001-initial.sql
│   ├── 002-runtime-permissions.sql
│   ├── 003-route-version-and-delivery.sql
│   ├── 004-invitation-idempotency.sql
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
│   │   │   │   └── DataPage.tsx
│   │   │   ├── devices/
│   │   │   │   ├── DevicesPage.tsx
│   │   │   │   └── RecoveryPage.tsx
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
│   │   │   ├── passwords.ts
│   │   │   ├── session-access.ts
│   │   │   └── sessions.ts
│   │   ├── admin/
│   │   │   ├── admin-read-routes.ts
│   │   │   └── admin-routes.ts
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
