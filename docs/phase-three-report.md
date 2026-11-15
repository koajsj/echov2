# 第三阶段交付报告

2026-11-15，本地与GitHub main核对一致：`c6068557a53ca5fd6b99fef07b88e00605c18578`。本次核心复核从干净的`981948b9e8d201cab33762f57273ef9da13cd840`继续，在`codex/native-hardening-review`保留前序全部提交和组件改动。**整体PARTIAL，产品通信和生产准入BLOCKED。** 无依赖安装、测试、构建、服务、SQL或部署；已执行现有工具的全项目静态检查。前次f54fc345构建和历史Cloud证据不能替代本轮运行验证。

## 核心安全缺口复核 — 2026-11-15

PR #4是唯一整合路径，保持Draft；PR #3开始时已关闭，其有效提交仍在历史中。本次重新核对GitHub、本地状态与四项RustSec官方公告，三项Terra只读复核及修复后复核。以下FIXED仅为源码和静态结果，未获得运行或生产安全准入。新增记录保存在同一[收敛证据](evidence/final-convergence.json)的coreConvergence字段，保留前轮字段。

| ID      | 文件 / 当前位置                                                                       | 严重程度 | 根因与修复                                                                                                            | 验证方式与结果                                                                                            |
| ------- | ------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CORE-01 | `src/server/config.ts:21`；`scripts/provision-admin.ts:18`；`scripts/migrate.mjs:319` | 中       | API/初始化URL缺端口仍通过校验，pg读取PGPORT可能选另一同机实例；要求显式非零端口，迁移CLI同步拒绝0，更新配置及运维契约 | FIXED；已安装pg解析调用链、类型/Lint/JS语法PASS；实际启动/初始化/数据库NOT_RUN                            |
| CORE-02 | `src/client/crypto/operation-store.ts:31`                                             | 低       | 打开排在受阻删除之后可无限等待且无自身blocked；10秒计时拒绝并清理，blocked亦拒绝，迟到升级abort/连接close             | FIXED；类型/Hooks Lint、事件清理路径及Terra复核PASS；跨标签竞争NEEDS_RUNTIME_VERIFICATION；非Provider集成 |
| CORE-03 | `src/client/features/devices/DevicesPage.tsx:40`                                      | 中       | 登记已提交但响应丢失时保留旧session绑定，页面无核实入口；结束后重取目录，提供设备/会话刷新，未知不称失败              | FIXED；session query→工作区重建→目录重新读取调用链、类型/Lint PASS；真实交互NEEDS_RUNTIME_VERIFICATION    |
| CORE-04 | `src/client/features/admin/RegistrationPage.tsx:130`                                  | 低       | 撤销已提交但响应丢失时旧列表不刷新；finally刷新并提供主动查询，提示与查询状态分离，服务端幂等不变                     | FIXED；前后端契约、Hooks Lint、类型和复核PASS；HTTP/浏览器NOT_RUN                                         |

本轮没有可审查的完整Provider/Worker依赖源码和产物，WASM离线树仍缺getrandom索引；不能安全实施升级、根授权、产品MLS或恢复。0387、0331、0330、0173分别按官方修复/维护状态继续BLOCKED。实际私聊/群组、可信Credential/KeyPackage与Welcome、Proposal/Commit/Merge/Discard、epoch更新、Provider持久化/原子Outbox/去重/游标、多设备墓碑、身份及系统恢复沿用下表G1–G6解除条件；未用新空接口扩充实验。存储锁只包提交，不能声称覆盖Provider从加载到推进的单写者操作。

目录/依赖引用复核未给出需要额外迁移或删除的确定依据；保留八张历史真实截图、SQL/manifest、依赖声明与锁及许可的25个受保护工件原字节。未为了命名统一移动有效组件/文档或清理生成目录，前端保留按需加载与真实BoardUI图表。扇形/环形/排行仍无已接入授权组件及可靠数据源，不添加假数据。

## 前轮集中修复台账 — 981948b

前轮工作以PR #4为唯一整合路径；PR #3的d17b0d6是f54fc345祖先，保留分支和提交，关闭冗余PR，没有重复cherry-pick或合并main。FIXED只表示源码与下列静态证据；完整结构化记录见[最终收敛证据](evidence/final-convergence.json)。

| ID       | 文件 / 位置                                                         | 严重程度 | 根因与修复                                                                                                                                      | 验证结果                                                                                     |
| -------- | ------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| FINAL-01 | `src/server/delivery/delivery-routes.ts:46`；`connection-hub.ts:35` | 中       | 入站拒绝监听在异步认证/行锁之后才安装；移到路由同步入口，error terminate，移除重复监听                                                          | FIXED；类型/Lint/唯一message与attach调用链PASS，WSS竞争NOT_RUN                               |
| FINAL-02 | `scripts/migrate.mjs:315`；迁移README                               | 中       | 缺URL可用pg默认目标，缺端口仍读PGPORT；连接前要求明确本地协议/主机/端口/owner/库且无query/hash，5秒连接上限                                     | FIXED；JS语法/Lint/校验先于connect顺序PASS；CLI/数据库NOT_RUN                                |
| FINAL-03 | `src/server/accounts/account-routes.ts:251`                         | 低       | schema允许19位超bigint值传SQL导致500；rename前复用sequence，400拒绝                                                                             | FIXED；类型/Lint/调用契约PASS，HTTP NOT_RUN                                                  |
| FINAL-04 | `RegistrationPage.tsx:73`；`AccountPage.tsx:100`                    | 中       | 配置/账号CAS冲突后只能重试旧version；设置finally刷新，账户提供明确刷新，保留错误可见                                                            | FIXED；类型/Hooks Lint/权威query链PASS，浏览器NEEDS_RUNTIME_VERIFICATION                     |
| FINAL-05 | `AuthPage.tsx:24`                                                   | 中       | 注册响应未知后清空原参数但保留operationId，换参数会冲突；保留当前页原用户名/邀请码并锁定，密码每次清空重输，原ID重试/登录核实，明确确认才新操作 | FIXED；类型/Hooks/字段与操作生命周期PASS，页面刷新不持久，真实交互NEEDS_RUNTIME_VERIFICATION |
| FINAL-06 | `ErrorBoundary.tsx:13`                                              | 低       | 错误页未保留正常页面的主内容定位与可聚焦契约；补main ID和tabIndex                                                                               | FIXED；类型/AST/目标引用PASS，键盘读屏NEEDS_RUNTIME_VERIFICATION                             |
| FINAL-07 | `styles/app.css:149`；`styles/screens.css:88`                       | 低       | BoardUI替代后残留metrics/chart-observations无引用样式；仅删死规则，保留split-panels                                                             | FIXED；全仓引用/格式PASS，最终CSS体积NOT_RUN                                                 |
| FINAL-08 | README/CHANGELOG与八份技术文档；`migrations/README.md`              | 低       | 当前/历史构建审计混淆，身份文档仍将公共ID说作UUID，依赖状态过时；同步实际API、历史范围、公告/阻塞、子智能体和检查证据                           | FIXED；格式/链接/锁/SBOM/截图摘要核验PASS，不改历史运行记录                                  |

## 前次2026-11-15修复台账（f54fc345）

FIXED仅指源码修复及列出的静态核验；浏览器和竞争运行不在其中。具体行号和产物字节保存在[结构化证据](evidence/native-hardening-review.json)，命令结果见[工程报告](static-verification-report.md)。

| ID        | 文件 / 位置                                                                                  | 严重程度 | 根因与修复                                                                                                                                                                                                   | 验证 / 结果                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| HARDEN-01 | `cultui/CopyButton.tsx:8`、`PublicUserId.tsx:3`                                              | 中       | 承接Cult组件缺少公共ID约束与同步防重入。统一用户/管理公共入口；仅大写Base32十二位，拒绝UUID；await真实写入后成功、不可用/拒绝显示失败；两秒effect清理、按ID重建、HeroUI键盘与status、reduced-motion、MIT保留 | FIXED；类型/Lint/AST与唯一clipboard调用链PASS；真实复制与辅助技术NEEDS_RUNTIME_VERIFICATION                           |
| HARDEN-02 | `App.tsx:5`、`UserApp.tsx:10`、`AdminApp.tsx:11`、`AdminWorkspace.tsx:8`、`Workspace.tsx:13` | 中       | 页面静态引入使用户首屏加载全部管理图表。按工作区/图表/归档懒加载，保留共享基础、Suspense和既有ErrorBoundary；保留KPI/柱状/折线及真实API                                                                      | FIXED；实际构建PASS，初始静态JS1,014,265→447,321字节；11块无超阈警告/非空模块重复。页面切换NEEDS_RUNTIME_VERIFICATION |
| HARDEN-03 | `UserApp.tsx:64`、`AdminApp.tsx:69`                                                          | 中       | 工作区key只含账号ID，账号相同而服务session替换时可复用旧子树。改为sessionId+revision+page重建，隔离本地临时状态                                                                                              | FIXED；完整类型、Hooks Lint、调用链PASS；跨标签真实会话更换NOT_RUN                                                    |
| HARDEN-04 | `accounts/session-access.ts:23`、`devices/device-service.ts:29`                              | 高       | SELECT FOR UPDATE的时间谓词可在未变行的锁等待前求值。先锁账号/session/device，再独立查询clock_timestamp复核会话/近期认证/设备凭证及根退休；设备登记复用相同检查                                              | FIXED；服务端类型/Lint、参数与所有调用方、锁序静态核验PASS；PG竞争NOT_RUN                                             |
| HARDEN-05 | `accounts/account-service.ts:60`                                                             | 中       | 邀请消费UPDATE可能等待未变邀请码行，过期谓词已预先求值。先获取邀请码行锁，再带当前时间、撤销和次数条件原子UPDATE；异常仍整事务回滚                                                                           | FIXED；SQL/事务/幂等与调用链静态复核PARTIAL；真实行锁过期竞争NOT_RUN                                                  |
| HARDEN-06 | `delivery/connection-hub.ts:11`、`delivery/delivery-routes.ts:57`                            | 中       | 固定60秒通知寿命可能跨越服务session到期。锁内取得数据库实际期限，取与60秒较早值；已到期拒挂载，notify和online统计不包含过期连接，现有维护循环回收                                                            | FIXED；类型/Lint、唯一attach调用及期限路径PASS；WSS/时钟/清理竞争NOT_RUN。通知不含正文，非MLS撤权                     |
| HARDEN-07 | `features/data/metadata-archive.ts:23`                                                       | 低       | Date.parse接受并自动纠正2月30日等非法日历日期。保留严格格式/有限值检查，并要求ISO回序列化逐字一致                                                                                                            | FIXED；归档契约和类型/Lint静态复核PASS；文件导入运行NOT_RUN                                                           |
| HARDEN-08 | README、CHANGELOG、工程/密码学/运维报告                                                      | 低       | 文档仍描述本机缺Node依赖且本轮禁止构建，并把历史运行写作当前结论。更新实际工具、构建图、修复/阻塞和历史范围；保留八张真实PC截图及历史证据                                                                    | FIXED；格式/源码链接核验PASS；新截图NOT_RUN                                                                           |

## 2026-11-12前序修复台账

FIXED 表示源码缺陷已修正并经静态复核，不表示并发、数据库或浏览器运行验收通过。

| ID       | 位置                                                    | 根因与修改                                                                                                                               | 状态 / 验证边界                                                                                  |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| LOCAL-01 | `delivery-routes.ts:54`；`app.ts`                       | 会话查询与 WSS 挂载之间可被撤销穿过，撤销方看不到尚未挂载连接。改为账号→session 锁内复核并同步挂载；失败强制断开                         | FIXED；AST、调用链及锁顺序复核。实际竞争 NOT_RUN                                                 |
| LOCAL-02 | `connection-hub.ts:32`                                  | 通知发送未检查60秒期限；关闭时仍等对端握手才释放登记。发送前检查期限/背压，撤销、过期和停服即时移除/终止                                 | FIXED；源码复核。对端可能看到1006而非关闭原因，必须仍重新认证，不能据此恢复游标；运行 NOT_RUN    |
| LOCAL-03 | `008-device-revocation.sql:14`；manifest；`migrate.mjs` | 服务撤销未同时标记公开 Credential 撤销或清除未领取 KeyPackage。新增 owner 触发器，同事务失效，保留已领取记录和凭证字节；仅补偿已撤销设备 | PARTIAL；SQL 与权限人工复核、摘要通过；迁移未执行，触发器运行/权限/竞争 NOT_RUN。不是 MLS Remove |
| LOCAL-04 | `admin-routes.ts:234`；`UsersPage.tsx`                  | 旧标签页可无版本校验地暂停/恢复账号。列表返回 version，写入必传 version，锁内对比，冲突409后前端刷新；同状态不重复审计                   | FIXED；路由/调用方/AST复核；HTTP与锁竞争 NOT_RUN                                                 |
| LOCAL-05 | `check-source.mjs`                                      | 本机无项目依赖时无法使用已有 TypeScript 工具执行源码扫描。允许显式传已有编译器路径，与 AST 脚本一致                                      | FIXED；真实执行扫描全部作者文件、TS/TSX语法、字面引用和文档链接。没有改变检查规则或补假类型      |
| LOCAL-06 | README、主题文档和两份报告                              | 旧文档仍要求 Cloud 主开发，且混有“无 Cargo/锁文件”等过时结论                                                                             | FIXED；切换本地主目录，收敛当前结论与历史证据；保留真实PC截图及审计工件                          |

## 当前产品能力

| 范围                                        | 状态    | 实际实现与限制                                                                                                  |
| ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| 账户、邀请、12位公共ID、改名、会话/重新认证 | PARTIAL | 继承 PR #2 的真实 API 和 Cloud 证据；本轮未运行。密码登录不授予可信设备                                         |
| PC用户端与管理端                            | PARTIAL | 独立入口/权限，React19、HeroUI3、BoardUI免费卡、深浅主题；本轮按需加载及复制收尾，没有重新设计                  |
| 管理元数据                                  | PARTIAL | 账户/设备/安全/审计/邀请、分页CSV与7/30/90日真实业务趋势；未知数据不补零                                        |
| MLS独立实验                                 | PARTIAL | OpenMLS0.9.2/RustCrypto0.6.0、suite1与真实历史WASM实验；MemoryStorage、合成Credential，未进入产品               |
| 产品私聊/群组和消息业务                     | BLOCKED | 无安全Provider/Worker/账号绑定与完整持久化，聊天写入仍503；编辑、搜索、转发、置顶、收藏、草稿与未读不能绕开门禁 |
| 附件                                        | PARTIAL | 当前页WebCrypto AES-GCM准备/解密；无上传下载、MLS传key或清理执行器                                              |
| 删除/回收/恢复                              | PARTIAL | 原作者删除意图、幂等、读取隐藏、零客户端在线时仍有到期调度源码；离线墓碑与物理清理尚缺                          |
| 用户归档                                    | PARTIAL | 本人服务元数据加密下载/只读预览；不含聊天、附件内容、私钥、session凭据；不是恢复                                |
| 系统备份、密钥恢复、账号注销                | BLOCKED | 没有安全执行闭环，未增加假按钮或成功接口                                                                        |

## 安全缺口矩阵与最小解除条件

| ID / 问题                        | 当前证据与残余风险                                                                                         | 状态    | 最小替代 / 解除条件                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| G1 MLS与供应链                   | crypto-bigint0.5.5位于锁闭曲线路径；WASM产物/完整Provider本机不可用，不能证明无敏感路径                    | BLOCKED | 总门禁继续拒写；取得兼容上游修复及固定依赖源码，在授权环境重新解析活动features、构建、互操作/侧信道适用性审查       |
| G2 Commit/Welcome                | 只有独立实验，产品无有效Commit确认、Welcome原子关联、Proposal/staged/discard或安全解冻                     | BLOCKED | 保留route_version/seq/mls_epoch分离、候选冻结；完成实际库账号绑定、并发与未知结果恢复再准入                         |
| G3 本地状态                      | strict IndexedDB + Web Locks只存调用方opaque字节；无完整Provider快照、Worker、收件去重/Outbox/游标联合恢复 | BLOCKED | 不用合成sealedState或JSON冒充Group State；固定原生存储API、完整加密快照与原子事务，并验证跨标签/掉电/配额/回滚      |
| G4 身份/设备/恢复                | pending目录不是Credential；无根授权profile、成熟SAS/QR和恢复封装。008只是服务公开材料撤销                  | BLOCKED | 不自动active、不从密码恢复私钥；成熟签名/引导方案与库、真实设备KeyPackage绑定、原生准入及独立恢复凭据               |
| G5 群组隔离与删除                | 撤session/冻结组不能清除旧key；删除意图不等于离线多设备删除或媒体清除                                      | BLOCKED | 逐leaf有效Remove/new epoch、旧设备禁止未来key、历史共享边界验证；加密墓碑/删除优先checkpoint及媒体引用/失败重试闭环 |
| G6 灾备和防回滚                  | 数据库删除记录/时间/摘要不是独立最新头；无外部目标、保护key和系统执行器                                    | BLOCKED | 保持旧State/备份恢复关闭；独立持久删除证据与最新头、停写切点、完整加密捕获、隔离核对和人工切换/回滚验证             |
| D1 Delete for me/7天回收         | 无可信多设备加密墓碑、新鲜性与恢复冲突处理                                                                 | BLOCKED | 完成G1–G5后以同一MLS私人组同步；缺证据停止自动恢复，不做localStorage假同步                                          |
| D2 Delete for everyone/定时/媒体 | 当前202 pending-anchor；到期SQL只隐藏和登记，不发送MLS撤回、不purge                                        | PARTIAL | 保留调度与隐藏；需要独立锚、客户端原作者语义、已验证密文到期字段、媒体执行器/引用核对及离线补偿                     |
| D3 注销和保留                    | 无Owner交接/全组Remove/删除传播；IP/审计保留尚为政策候选，数据可能持续积累                                 | BLOCKED | 不只删用户行；明确政策与执行器、G5/G6、对账及不可撤回清理边界                                                       |
| A1 运营分布                      | 无可靠GeoIP、UA、Caddy字节来源、历史活跃口径                                                               | BLOCKED | 现状显示未知；先审定最小化采集/保留来源，再接官方免费组件，无Pro替代或假比例                                        |
| O1 低配与发布                    | Cloud旧资源限额未生效；无20GB配额、持续压力与发布完整性运行证据                                            | BLOCKED | 保留单体与现有预算；在实际2GB/1核/限额环境进行容量、磁盘满、日志与灾备验证                                          |

## 全通道边界

| 通道                         | 当前范围与信任主体                                                                                                         | 状态    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| 消息/编辑/群资料/联系人/收藏 | 产品MLS未集成；服务端无明文替代API、资料字段或自造解密协议，客户端不展示未验证内容；任意字节不能仅凭ciphertext字段证明加密 | BLOCKED |
| 设备与key接收/恢复           | 只有公开目录；没有后台key接收器、SAS/QR假成功或旧State自动导入                                                             | BLOCKED |
| HTTPS投递/离线分页           | 服务检查当前账号/设备/路由、joined_seq和单调游标；不能证明历史密码学授权、有效MLS或完整删除状态                            | PARTIAL |
| WSS                          | 仅固定connected/sync-required通知；不接受消息写入；本轮挂载与服务撤销串行化，无正文/密钥                                   | PARTIAL |
| 媒体                         | 本地AEAD；服务端无上传/下载通道，Caddy不公开媒体目录                                                                       | PARTIAL |
| 搜索/转发/导出/缓存          | 聊天相关操作关闭；元数据归档是独立有限文件；不导入活跃状态或覆盖删除记录                                                   | PARTIAL |
| 日志/前端交付                | 禁正文/token原始诊断、无远程字体或脚本、CSP/本地资源；同源恶意发布/XSS仍可触及客户端秘密                                   | PARTIAL |

协议元数据包括账号/公开设备目录、IP、成员与路由、时间、长度、顺序、删除目标及附件引用。MLS不能隐藏这些信息。外部副本、截图、已解密内容和成员串通泄露无法远程追回。

## 目录、差异与交付

保留原模块化单体和PC布局；未引入依赖、服务、Matrix接口、Mock、密码学适配空壳或新测试。仅将新组件样式命名为`copy-button.css`，更新唯一导入，没有重排成熟模块。11-12前序新增 `008-device-revocation.sql` 和一份机器可读[本地审查证据](evidence/local-security-review.json)。历史001–007及独立基线SQL、package/Cargo声明与锁文件保持原字节；manifest只追加008。未删除源码或截图，没有无依据文件移动。两份报告合并过时重复叙述；主题技术规格继续各自为权威来源。旧echo-v2只读保留。

静态检查实际结果见[工程报告](static-verification-report.md)。本轮有三个Terra只读复核任务，主智能体在实施后做完整Diff及调用链复核；不构成独立第三方审计。本轮构建、运行、迁移、测试、真实数据及生产VPS均NOT_RUN；f54fc345客户端构建保留为历史PASS。需要运行解除的结论保持BLOCKED，未把“代码已编写”当产品安全通过。

提交到独立分支、推送后以GitHub真实head/PR记录为准；不自动合并main或部署。历史证据：[PC审查](evidence/pc-review.json)、[前次复核](evidence/final-review.json)、[Cloud验证](evidence/verification.json)。本阶段结束等待审查，不增加第四阶段。
