# 应用协议与一致性投递

2026-11-11，目标契约及第一阶段投递基础。已有外层密文事务/分页/cursor/WSS源码，消息写入口在参数/CSRF/会话/可信设备验证后仍被503门禁拒绝；无MLS客户端/可信群组创建。库原生API依据见[密码学研究](native-cryptography.md)，业务表见[数据生命周期](native-data-lifecycle.md)。MLS wire类型由原生库处理，本文只定义外层业务投递和加密ApplicationData。

## 三种权威

- 客户端原生MLS：真实group/epoch、密码学sender、成员、签名、密钥和消息有效性。
- 客户端应用：已验证账号设备绑定、Owner/Admin/Member权限、业务编辑/删除及Schema。
- DS/PostgreSQL：服务访问权限、顺序日志、持久投递收据、生命周期字段、重试与路由投影。

外层`route_epoch`是DS声明/比较用的版本，不是MLS验证结果；`seq`是服务端顺序，不是epoch或MLS generation。服务器无法仅凭HTTPS会话或密文哈希证明内层sender/Commit/删除语义，恶意服务器仍能拒绝/丢弃/分叉投递。普通诚实服务的一致性与恶意DS防护分开。

## 外层与加密业务结构

HTTPS写入采用版本化JSON envelope：`transport_version=1`、`operation_id`、`conversation_id`、`message_id`、`base_epoch`十进制字符串、`wire_kind`枚举、`mls_bytes`标准wire编码的base64、`expires_at`或null、`attachment_ids`有界列表。删除请求另有明确`target_message_id`，不把正文类型放入路由字段。身份来自受限设备session，禁止请求体冒认sender。HTTPS使用JSON便于首版审查，不能修改MLS TLS序列化；不要求服务器自写MLS解码器。

`wire_kind`仅调度声明；MLS库确认后的内容类型必须与请求用途一致。服务器持久生成`seq`、`received_at`与收据；客户不能指定全局顺序。epoch/seq通过十进制字符串避免JS精度丢失，数据库用bigint非负范围作首版有界映射，超出时明确拒绝/升级，不截断uint64。

内层ApplicationData为UTF-8 JSON，固定：`schema_version=1`、`message_id`、`conversation_id`、`type`、`payload`。所有必填字段严格校验；拒绝重复JSON键、越界数字、未知主版本、超限嵌套/长度和非法替换目标；未知类型不渲染、不导出、不解释为普通文本。真实sender由MLS处理结果映射到受验证Credential，不信任payload中的姓名。

| type | payload核心字段/授权 |
| --- | --- |
| `text` | text，有界纯文本，不执行HTML |
| `edit` | target ID、replacement正文、前序edit ID；仅同一原发送账号，客户端按已验证顺序应用；删除优先 |
| `retract` | target ID、原操作ID；只允许原发送账号，不以当前Owner权限冒充历史作者 |
| `attachment` | 对象ID、文件名、MIME、大小、AEAD算法/key/IV、密文摘要，全部在MLS密文内 |
| `receipt` | 已读/已处理范围，用户可关闭；服务投递ACK不等于已读 |
| `group-profile` | 名称、描述、加密头像引用、profile version；Owner/Admin按前一已确认状态授权 |
| `member-action` | 业务角色/转让/解散、expected authorization version；不代替Add/Remove Commit |
| `personal-settings` | 隐私设置、备注、收藏、草稿、删除checkpoint；限本账号私人组 |
| `delete-for-me` | target集合、单调私人版本、不可恢复标记；限本人设备组 |

以上为建议Schema，具体字段上限和一致编码需门槛G1/G4定稿。外层必要字段（消息/会话ID、到期值、附件关联、删除目标）必须用库支持的authenticated_data绑定，接收端还核对内层值；如何固定编码只允许标准序列化，不能自写MLS认证格式。服务端不拥有验证AAD所需的群组秘密，不能把该绑定宣传为服务器验过正文。

当前基础envelope的原始MLS字节上限256KiB，base64上限349528字符；建议正文上限16KiB UTF-8。Commit/Welcome最大64设备的实际尺寸须原型测量后设独立上限，不能把普通消息小上限套到所有handshake。附件走独立10MiB二进制接口，不塞进base64消息。

## Commit、Proposal、Welcome

推荐强一致DS，参考[MLS架构§5.2.1/5.3](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.2.1)。**本方案能给一个base epoch排序/裁决一个不透明候选，不声称选出了一个有效MLS转换。** 这是G2未解除的核心原因。

1. 客户端逐组冻结应用发送，确认本地已处理顺序与授权版本；原生库校验Proposal/凭证/业务权限后产生pending Commit及Welcome。本地原子持久pending材料、精确wire bytes、operation ID和密文outbox，不能提前merge或先投Welcome。
2. DS事务先查幂等操作，锁group_heads，重检活跃设备、组状态、base route epoch、授权投影、KeyPackage领用和所有目标；在同一事务保存候选、对应Welcome inbox、路由变更意图并CAS head。每个组/base epoch只占用一个候选槽；同epoch其它候选409，禁止覆盖或丢弃旧槽。
3. 持久入库才返回`accepted`与seq/原样内容摘要；不是`cryptographically-valid`。回传须与本地pending的精确Commit匹配。Welcome只在对应候选accepted后可读；若当前候选无法证明有效，新设备仍不能发消息。
4. 原生库校验回传及应用授权成功才merge本地pending/staged并持久化新state；随后开放新epoch发送。所有其它设备独立校验，不接受服务端“已更新”的声明跳过消息。重复回传只查操作结果，不再次创建Commit。
5. **无效/矛盾候选：** 客户端进入`quarantined`、停止发送，不merge、不自动清槽/rollback、不沿服务端计数“前进”；保留最小错误码和原样密文证据。服务端可冻结组。没有可靠库方案时不自动从旧base选择另一条分支。

私有Commit使DS无法验证其内部Proposal和合法性；公开Commit同样需要受信公开树/凭证和完整原生验证，不因公开就自动安全。首版偏向private handshake保护成员操作细节；具体wire policy在G2定稿，服务器不成为秘密群成员。**不提供未经审查的“客户端签名ACK=全群有效”或多数投票共识替代协议。** 验证失败后最小替代是已核验存活设备经用户确认创建全新Group ID、逐一邀请可信成员，旧组只读/隐藏，不导入旧发送状态；仍可能被恶意DS持续DoS。

要解除G2，必须用选定原生库及固定wire policy证明：竞争Commit、伪造base epoch、无效密文、Proposal缺失、拒收、误投Welcome、客户端分歧时的失败关闭与安全重新入群。若原生first-valid流程无法在该DS约束中安全成立，核心建设继续BLOCKED；唯一槽约束不是对这一问题的密码学解答。

## 客户端崩溃与幂等

| 中断位置 | 恢复规则 |
| --- | --- |
| 加密后outbox未持久化 | 不发送；不得继续使用已前进但未记录的ratchet，按原生事务丢弃未提交实例 |
| pending/outbox已落盘，HTTP未知 | 用原operation ID查询；仅重传完全相同密文，不重新加密/重新生成Commit |
| DS接受，客户端尚未merge | 重取原收据/顺序日志并按native pending流程恢复；未知保持冻结 |
| 自己候选409被拒 | 用库审查后的discard处理本地pending，消费赢家；未验证discard语义不能继续发送 |
| 收消息途中中断 | provider变更、去重、业务效果及cursor同一事务，避免跳过消息或二次ratchet处理 |
| Welcome消费包后中断 | 包私钥与新Group State/收件状态原子切换；不能恢复已消费包给另一组使用 |
| 本地旧快照/跨标签并发 | 原生状态新鲜度不可信即停发并重新入组；时间戳和服务器路由head不够 |

G3需要原生库可隔离/暂存变更的持久化实现。IndexedDB事务不能跨任意await长期存活，不能凭“最后保存一次JSON”承诺原子性；须将整个原生变更集与outbox一次提交，并有跨标签单写者。没有该能力便不集成虚假适配层。

服务器幂等键为`(device_id, operation_id)`，绑定完整请求摘要与结果；相同键不同内容409。摘要仅作一致性比较，不是加密/身份认证。组seq通过事务head分配，不使用全局数据库sequence来宣称提交连续；数据库记录accepted/retired/删除等明确状态，cursor不凭最大seq跳过缺口。

## HTTPS/WSS契约

下表为**目标接口**，不能把全表当已实现。现有源码实际路径使用camelCase请求字段，新增`POST /v1/messages`而非嵌套写路径；只实现账号、session/reauthenticate、username、pending设备/revoke、本人identity读取、admin、消息分页/cursor和本人删除请求。组创建/KeyPackage/inbox/媒体/注销/完整删除增量未开放。客户端与服务端共用[当前契约](../src/shared/contracts.ts)及route schema，未实现目标后续按审核版本增量落地。

同源HTTPS、认证、资源归属/会话角色检查和严格请求schema为公共要求。当前`GET /v1/session`返回非秘密会话UUID；受保护写请求除Origin/CSRF/Cookie外还必须发送`X-Echo-Session`匹配该UUID，避免同一浏览器其它标签切换账号后旧表单误作用于新账号。客户端受保护读取也发送该头；它不是认证token，不能单独授权。错误采用稳定code/requestId，不返回栈、SQL、密钥或内层内容。当前消息写入不支持attachment关联、Welcome和成员变更，保持关闭；schema为其留表不代表完成。

| 接口 | 主要契约 |
| --- | --- |
| `POST /v1/accounts` | 注册、邀请码、模式和唯一用户名同事务；幂等不重复扣次数 |
| `POST /v1/sessions`、`DELETE /v1/sessions/current` | 密码登录/登出；服务端哈希token、有限TTL；不自动授权设备 |
| `PATCH /v1/account/username` | 新近认证、expected account version；稳定UUID不变 |
| `GET/POST /v1/devices`、`POST /v1/devices/{id}/revoke` | 授权凭证/状态、幂等撤销；不得接受任意账号目标 |
| `POST /v1/key-packages`、`POST /v1/key-packages/claim` | 原生包/凭证验证，单次领用；领出即不再发给其它操作 |
| `POST /v1/conversations`、`POST /v1/conversations/{id}/messages` | 创建上下文/投递；不透明MLS对象，保留pending与冲突语义 |
| `GET /v1/operations/{id}` | 限原操作者，accepted/rejected/unknown；404不证明操作从未提交 |
| `GET /v1/conversations/{id}/messages?after=…&limit=…` | keyset分页、边界高水位、授权跨度及删除水位；不OFFSET扫大表 |
| `GET /v1/inbox?after=…`、`POST /v1/cursors` | 设备Welcome/生命周期通知，单调确认；ACK不代表消息已读/密钥恢复 |
| `POST /v1/messages/{id}/delete` | 原发送账号、新近认证、幂等；202待确认与完整删除状态分开 |
| `POST /v1/attachments`、`GET /v1/attachments/{id}` | 二进制密文、限额/归属、私有下载；过期/删除/未知拒绝 |
| `GET /v1/deletions?after=…` | 仅授权可见范围，完整水位及gap/reset；不是公开ID枚举器 |
| `POST /v1/account/close` | 新近重认证与数据导出确认；撤服务session、逐组待移除、异步清理状态 |
| `/v1/admin/*` | 唯一超级管理员audience、重新认证/审计；普通账号不能复用管理权限 |

当前HTTPS分页最多100条、原始密文累计1MiB（二者任一到限即续页，JSON/base64另有开销），cursor与账号/设备/查询范围绑定。初次或离线重连先取得删除/撤销高水位，再同步控制事件和密文，应用展示前重新核对删除增量。历史接收epoch密钥保留窗口有界，过久离线需重新入群，不能无限保留旧key换取方便。

WebSocket只承载有界通知/已持久化密文提示，断线/背压可丢提示而不能丢数据库记录；重连必须HTTPS补齐。当前WSS只在连接及账号/设备变更后提示补齐，尚无聊天通知生产者或前端WSS订阅；每60秒到期关闭促使重新认证，不声称有已实现的ping/pong心跳。限额/撤销关闭连接由单进程管理，事务提交后才发通知；进程重启后不依赖内存队列恢复消息。

## 群组角色与设备

每台设备是leaf；两个用户的私聊允许各自多个已授权设备，新设备经Add/Welcome入现有组，不能创建第二套私聊加密协议。私人收藏/备注/设置为单账号MLS组，初始单leaf；新设备加入后由存活可信设备发送当前私人快照和删除checkpoint，不能自动读入组前历史。

Owner唯一；Owner可任免Admin/转让/解散，Admin可邀请/移除普通成员，Member可请求退出。移除Owner必须先有效转让；Owner转让在单一业务authorization version下包含旧Owner降级和新Owner接受，目标须是已验证有效成员。角色变化通过经MLS认证的业务控制记录按序应用，服务器保存同版路由/ACL投影，二者不一致即冻结；原生库检查MLS语法，应用另外检查业务角色。成员Action不能取代Proposal/Commit或让未经邀请的leaf进组。

退出/移除/撤设备时，诚实服务立即暂停相关组普通写入，授权在线客户端生成Remove及必需新密钥更新，所有存活设备处理后进入新epoch；失败不继续发旧epoch消息。新成员不默认获得加入前key，旧成员不收到移除后Welcome/新密钥。保留旧发送密文outbox不得在新epoch自动重发正文给新成员；需用户确认重新发送。所有成员离线时服务可以冻结，**不能无客户端私钥代做Commit**，没有“全员离线也立即密码学轮换”的承诺。

密码学成员变化、Owner转让、解散的客户端/服务端投影和恢复断点尚未实现；在G2/G4/G5通过前这些流程只是规格。已获旧密钥的成员、恶意现成员主动共享或恶意DS对未获通知客户端分叉，无法靠一次服务端路由更新追回或绝对阻断。
