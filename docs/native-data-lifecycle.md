# 数据模型与生命周期

Cloud 兼容实现更新：历史 001–005 保持原字节。新库独立 echo-native-v1 基线和旧库 006 最终都使用 authorization_proof bytea NOT NULL、1–16384 字节及统一 CHECK 名称；Cloud 两条路径的 echo Schema dump/目录完全一致、合成字节保留。echo_meta 仅存迁移收据，API 无访问权，不存 MLS 私钥。操作规范唯一来源为 [迁移说明](../migrations/README.md)，本次证据见 [Cloud 验证](cloud-bootstrap-verification.md)。以下历史记录不代表该实现仍停留于提案。

## 原数据规格记录（历史快照）

2026-11-11。初始DDL位于[001](../migrations/001-initial.sql)，运行权限位于[002](../migrations/002-runtime-permissions.sql)，增量变更为[003](../migrations/003-route-version-and-delivery.sql)与[004](../migrations/004-invitation-idempotency.sql)，**全部未执行，001/002保持历史原样**。表名以SQL为准：研究中的group_messages落为`messages`；没有MLS私有Group State表。设计依据包括[PostgreSQL约束](https://www.postgresql.org/docs/18/ddl-constraints.html)与[行锁](https://www.postgresql.org/docs/18/explicit-locking.html)，数据库能力不证明应用授权正确。

## 表职责、键与保留

所有表在echo schema，应用连接固定echo_native数据库/echo_native_api角色。UUID来自随机生成器；序号bigint用十进制字符串出JSON，时间timestamptz。无聊天正文、附件key、恢复key、MLS私钥或Epoch Secret字段。没有通用json“任意密钥仓库”。

| 表                    | 主键/重要约束、索引和用途                                                                                                              | 生命周期                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| users                 | UUID；规范化ASCII小写用户名唯一；registration_id唯一；Argon2id哈希、status、version                                                    | UUID不重分配；注销按关闭流程，不级联抹掉审计/墓碑                                      |
| site_settings         | true单例；唯一superadmin UUID外键；注册模式/version                                                                                    | 后端配置；API无改superadmin列权限                                                      |
| invitations           | UUID、token_hash唯一、可空operation_id唯一及request_hash配对（004）、uses≤max_uses、有效期、issuer外键                                 | 原始token仅创建时返回；消费与注册同事务                                                |
| devices               | UUID及(user,id)唯一、用户外键、状态/撤销时间一致、用户时间索引                                                                         | API只能插入pending、转换到revoked；根授权尚未开放                                      |
| sessions              | UUID、token_hash唯一、user/device复合外键、audience、expiry索引                                                                        | 12小时；用户/admin分离；撤销删除服务token记录                                          |
| account_identity_keys | (user,version)、单用户当前根部分唯一、公钥/授权材料                                                                                    | 仅公开根和授权链，旧版本审计保留；运行时无签发写权限                                   |
| device_credentials    | UUID、device/credential复合键、根版本/设备复合外键、公钥/凭证/expiry                                                                   | 公开材料；撤销与KeyPackage准入关联，未开放签发                                         |
| key_packages          | 原生reference bytea主键、device/credential复合外键、可用包部分索引                                                                     | 单次领用、过期；私有对应材料只在客户端                                                 |
| conversations         | UUID、原生Group ID唯一、kind、status、authorization_version                                                                            | 默认frozen；无名称/描述明文字段；无HTTP创建接口                                        |
| conversation_members  | (conversation,user)、角色、active、唯一活跃owner部分索引                                                                               | 应用路由/ACL投影，不是MLS权威树；“至少一Owner”由事务另验                               |
| group_heads           | conversation外键主键、route_version/last_seq非负，pending_commit_id会话/消息复合外键（003）                                            | 逐组行锁；候选只置pending并冻结，不自动推进版本，route_version不是已验证MLS epoch      |
| conversation_devices  | (conversation,device)、用户/设备/成员复合外键、joined/left seq                                                                         | 路由授权跨度；不凭当前active授权全部历史                                               |
| messages              | UUID、(conversation,seq)/(device,operation)唯一；每base route version一个Commit候选部分唯一；expiry部分索引、单向deletion_requested_at | ciphertext与deleted_at成对约束；仅application能到期/清正文；Commit控制日志不能任意删   |
| delivery_cursors      | (device,conversation)、acknowledged_seq非负                                                                                            | 单调greatest更新，不能超持久head；不是已读回执                                         |
| device_inbox          | 自增ID、(device,commit)唯一、Commit外键、Welcome密文                                                                                   | 未来须关联同事务Commit投递；当前无生产者/读写API；Commit/Welcome绑定仍BLOCKED          |
| attachments           | UUID、object_name唯一、密文大小/状态/删除时间约束、user外键                                                                            | staging→active→delete-pending→deleted；当前尚无上传/清理执行器                         |
| message_attachments   | (message,attachment)、会话/消息复合外键、附件引用索引                                                                                  | 文件名/MIME/key不入表；去重/转发建议新对象新key，避免共享引用复活                      |
| deletion_records      | 单调ID、operation/message唯一、消息复合外键、待处理部分索引                                                                            | pending-anchor→anchored→purging→complete；完整状态需外部收据；当前只产生pending-anchor |
| message_receipts      | (message,device)、消息会话复合外键                                                                                                     | 仅服务投递观测；当前无生产者，不宣称已读                                               |
| admin_audit_logs      | 单调ID、actor外键、有限action枚举                                                                                                      | API只有INSERT/SELECT；默认180天是待实施策略                                            |
| security_events       | 单调ID、可空user、有限kind、IP、时间索引                                                                                               | 已写登录成败/撤设备；建议原始IP7天、事件30天；尚无保留执行器                           |
| analytics_daily       | UTC日主键、可空计数及source/observed_at                                                                                                | 无来源为null；当前无聚合生产者，后台不读取为假统计                                     |
| backup_records        | UUID、状态及验证清单/独立删除锚/验证时间约束                                                                                           | 无执行器时不创建假记录；verified不等于生产切换许可                                     |

保留天数为拟议默认，涉及法规/用户政策仍OPEN；未写后台自动清历史功能，不把策略当已清理。UUID外键默认RESTRICT，不用广泛CASCADE破坏删除证明。账号闭合需逐项匿名化/到期清理设计，当前不开放注销接口。

## 事务与并发

- 注册：先有界计算Argon2id，再锁注册配置、重检模式和邀请码，插用户/扣次数同事务。registration_id在配置锁内再次查询，重试在锁外验证既有密码及首次用户名/邀请码摘要，不生成第二用户；并发唯一冲突回滚，不重复扣邀请码。
- 会话：token只存SHA-256摘要（高熵token的查找，不是密码哈希），Cookie仅登录响应；新近重认证5分钟。账号/设备不可用时统一拒绝；登记设备按user→session顺序锁定，限10个未撤设备。管理员操作同时写审计。
- 投递：授权设备/用户/会话路由后锁group head；请求规范字段摘要绑定幂等键；seq与密文插入同事务，route_version不因声明类型自动推进。Commit候选指针与冻结同事务。原生有效性仍只由客户端验证，Commit+Welcome及成员投影未闭环，所以通过参数/CSRF/会话/可信设备验证后仍以503拒绝写入。
- 锁顺序：设备登记/撤销、删除请求和投递先显式锁活跃users，管理员暂停先更新目标users，再处理会话/设备/群组；避免此前session↔device/user顺序反转。SQL死锁/序列化/锁不可用返回503 TRANSACTION_RETRY_REQUIRED，不自动重放未知结果；须核实状态并使用原操作ID重试。单用户操作因此串行化，实际并发/延迟仍未验证。
- 撤设备/封禁：撤service session并冻结相关活跃组，WSS关闭；不得自动恢复frozen组。HTTP已在处理的授权请求仍有竞态范围，后续必须做完整撤权并发验收。
- 到期：Fastify现有进程每30秒调度，数据库now()选已到期application、每批50条、SKIP LOCKED、唯一消息去重；重启可重扫。**当前仅登记删除意图/读取隐藏，不物理删或造MLS通知。**

运行角色对messages仅可插入指定外层字段、更新deletion_requested_at；后者只能由NULL设置为数据库事务时间，不能清除或改写。该列与删除记录同事务写入，用于读取拒绝及到期扫描，也提供PostgreSQL行锁必需的受限UPDATE权限。API无更新ciphertext/deleted_at、删除记录state/anchor_receipt的权限，不可能经现有接口宣布完成擦除。设备只能撤销，组只能冻结；触发器禁止运行角色激活或重新开放。角色授权仍须真实PostgreSQL核查。

## 附件：本地AEAD基础，端到端投递BLOCKED

每对象随机AES-256-GCM 256-bit内容key、96-bit IV、128-bit tag，单次WebCrypto AEAD；每个对象新key/IV，重试只复用原密文，不用同key/IV加密变更内容。首版明文上限10MiB，密文上限10MiB+16byte；文件名/MIME/缩略图/内容说明/key/IV在MLS业务密文里。已核对[WebCrypto规范](https://www.w3.org/TR/webcrypto/)，算法存在不等于实际设备正确使用。

上传采用随机对象ID、私有目录、无链接穿越、总账号/磁盘配额。staging文件先写/flush、原子落定，再提交消息引用；事务失败产生孤儿，恢复扫描验证归属后清理，不猜测文件是否被其它消息引用。数据库和文件系统不是共同事务。下载只对有效会话/设备、授权跨度、未删且未到期引用开放，Caddy不得公开serve媒体目录；客户端解密/校验后预览，及时revoke Object URL，不做服务器转码/URL Preview/明文杀毒代理。

大文件、分块和流式加密另选成熟格式/实现，首版不自创。恶意发送者仍可上传伪装密文，服务端不能证明语义为密文，攻击面需配额/类型隔离/下载Content-Disposition与客户端验证限制。

## 删除语义与传播

| 能力                | 目标方案                                                                                                             | 当前实现/未覆盖                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Delete for me       | 只在本人单账号MLS组同步加密hide/tombstone；默认软隐藏回收期7天，永久阶段单调，不影响别人                             | 未实现；没有假按钮。离线旧设备先处理删除checkpoint再展示；新设备不能读加入前私人组历史，需可信现设备发当前快照 |
| Delete for everyone | 原作者账户新近认证；外层请求验证原消息/会话/类型/权限，客户端发MLS retract；服务器持久删除日志并清原密文、无引用媒体 | 仅真实请求→pending-anchor；查询隐藏待删/到期密文；无独立锚/媒体执行器，202不等于删除完成                       |
| 定时销毁            | 服务端可见expires_at绑定MLS AAD；服务器时间和数据库任务完成离线清理                                                  | 已有持久意图调度和读取门控；MLS内字段绑定、媒体擦除及离线设备同步BLOCKED                                       |
| 本地永久清理        | 清除展示/搜索索引/预览/草稿/归档引用和适用key；同步墓碑                                                              | 未实现；不能承诺GC/SSD/外部导出物理擦除                                                                        |

当前删除授权在同一事务重新锁定并验证活跃账号、未过期且五分钟内重新认证的user会话、活跃设备和未过期凭证，且限定原发送账号的application记录。原作者退出群后仍可请求删除自己的旧消息，这是独立的隐私策略，不重新授予读取群历史的权利。操作ID若绑定另一消息则409；同一目标只接受已绑定的原操作ID，其他ID返回DELETION_ALREADY_REQUESTED，不伪称绑定成功。跨账号并发撞同一全局operation_id由统一23505处理器返回409 CONFLICT。本人列表按原作者关联消息，包含自动到期记录，不返回其他作者的操作。

服务器明确看见原发送账号/设备、删除目标、到期时间和附件关联；只能验证外层登录主体/记录，不能证明密文内retract相同。客户端验证内层sender与原始作者一致，不因服务器通知就写“对方撤回”；服务器可拒服务/删密文，不能伪造作者身份。

独立删除日志严格模式流程：锁目标→同事务持久pending意图和单向读取隐藏标记→提交后新读取快照拒绝返回原密文→向独立目标幂等追加并获得durable收据→落库anchored→事务置ciphertext空及媒体待清→幂等unlink/关系核对→complete。读取已取得的旧快照、已序列化响应及外部副本仍可能包含密文，此流程不能追回在途字节。跨目标未知时保留pending，不能回到active，也不能显示完成；外部证据和数据库不原子，恢复须按操作ID重放。当前尚未选择/接入独立目标，anchored之后的转换没有接口、没有自动执行。

读取与离线重连必须先核验删除高水位/完整性，再接控制事件及密文，展示前再次补删除增量；截断/缺口要求reset。现有messages页只做服务器待删/到期门控，**尚无完整多设备墓碑增量协议或客户端门控**，不能提前上线。删除日志/墓碑不能因所有当前设备ACK就清除，旧设备和旧备份可能回归；离线超过保留窗口的设备应重新入群且先载当前删除状态，不回放不可信旧cache。

## 归档、恢复与注销

历史归档默认成熟标准加密封装，显式可读导出须提醒含明文；分页到固定边界、客户端解密、媒体逐项校验，包含账号/域、版本、来源、删除checkpoint、页覆盖范围和完整性清单。导入仅本地只读历史，不重新发送、不给旧设备身份授权、不导入旧Group State；旧删除记录永远优先于可读历史。

独立删除证据不在旧数据库/同一备份/可回滚磁盘里，签名与本机时间单独不能证明最新。没有新鲜锚就停止自动恢复。系统备份/隔离验证的唯一规格见[运维](native-deployment-operations.md)。Megolm/MLS key都可能覆盖多条消息或被复制，不能为删一条盲删整个活跃群密钥，也不能承诺精确密码学擦除。

注销拟采用active→closing→closed：重新认证和导出确认、拒新消息/撤session、逐组密码学移除待确认、本人发送密文/附件删除和审计去标识、备份删除传播完成后报告分项状态。拥有群组须先转让/明确解散；所有者离线时不能服务器伪造Commit。当前没有注销API，避免仅删users行就声称完成遗忘。

## 第二阶段增量与保留边界

003只允许无投递历史、无inbox且head计数为零的旧基础升级；存在旧候选/历史即RAISE并回滚，须另行人工审核数据迁移，不清空数据。重命名保留旧列权限/约束绑定，仅给新增pending指针UPDATE；无身份/组激活/删除完成权限扩张。004为邀请码操作ID/请求摘要配对，旧邀请保留NULL，原token仍只存摘要。

附件已有[本地AEAD](../src/client/crypto/attachment-crypto.ts)及数据页临时操作：每次新256-bit不可导出CryptoKey、96-bit随机IV、128-bit tag；有界单文件加密/用户主动解密，处理完成释放ArrayBuffer引用/尽力覆盖，Object URL离开或替换时撤销。key/IV/名称/MIME只在内存。此key不可导出，**当前不适合作为MLS密钥分发接口**；正式上传须另经审查的封装/持久化设计，不能直接把临时对象JSON上传。原始File、Blob、CryptoKey及系统副本无法保证擦除。无浏览器/密码学运行验证。

删除状态的外部语义：requested（收到请求但未授权）、authorized（已验证本人/到期规则）、anchored、purging、complete。当前数据库pending-anchor仅对应authorized+等待独立证据；未授权请求直接拒绝，不制造持久requested成功状态。数据库锚后状态和物理清理尚未实现，不开放迁移使API自行升级完成状态。Delete for me、七天回收恢复、多设备加密墓碑、独立锚、防回滚、媒体授权上传/引用清理及注销仍BLOCKED。

## 第三阶段：有限服务元数据归档

唯一实际导出范围为本账号当前username/UUID/version、全部设备目录、本人发送消息对应删除请求；不含session/token/password hash、根私钥/credential私密材料、聊天、附件内容或全站数据。后端在REPEATABLE READ事务复核账号/session，从同一快照读取；UTC ISO时间只标捕获时点，不证明删除状态新鲜。每集合最多5000条，序列化JSON最多1 MiB，任一超限返回413，不静默截断。更大集合的分页一致快照尚未实现。

客户端 metadata-archive 使用标准WebCrypto PBKDF2-HMAC-SHA256（600000次，随机16byte salt）派生不可导出AES-256-GCM key，随机12byte IV、128bit tag。二进制格式为8byte ASCII `ECHOMD01` + salt + IV（36byte头）+ AEAD密文/tag，完整头作为AAD。固定算法/参数与版本，无攻击者可配置KDF成本；最多1 MiB明文/1 MiB+52byte文件。口令12–256字符，两次确认，不上传，不以普通SHA冒充加密。它是范围受限的本地文件封装，未经浏览器运行/互操作审验，不能作为生产密钥备份格式。

导入只认证解密、严格结构/范围/重复ID、同账号UUID/同origin/版本核对并显示计数；口令错误/篡改/未知格式失败，未修改任何服务器或浏览器持久状态。不重发历史、不恢复设备、不覆盖墓碑、不导入Group State；无“恢复确认”按钮。AEAD认证不证明服务器真实、文件最新或独立删除证据。任何实际历史/系统恢复仍须G6新鲜证据，否则停止。

归档/附件/CSV下载URL替换或组件卸载时撤销，预览可主动关闭；字节数组尽力覆盖，字符串、CryptoKey、Blob、GC与OS副本不承诺物理擦除。CSV仅当前页、有个人信息确认、全字段引号/转义及公式前缀中和，不包括邀请码token/哈希。

005仅扩展服务认证事件、人工审阅与结构化审计外键及最小UPDATE/索引；001–004不改。人工审阅不删除事件，不声称安全问题解决；没有新增审计/安全记录自动清除器。删除传播、媒体清理、完整历史/媒体归档、七天回收、注销与系统备份仍BLOCKED。
