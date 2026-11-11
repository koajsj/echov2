# 应用协议与一致性投递

2026-11-11。实际契约以[src/shared/contracts.ts](../src/shared/contracts.ts)和路由schema为准。源码存在不等于通信可用；消息写入在参数/CSRF/会话/设备检查后进入Service，Service内恒定503门禁。原生MLS、身份绑定、持久化与删除准入未通过。

## 三种权威与版本

| 字段/主体                        | 权威与用途                                                  | 不能证明                               |
| -------------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| seq                              | DS按会话持久化顺序，bigint十进制字符串                      | MLS有效性、已读、客户端处理成功        |
| route_version / baseRouteVersion | 服务端路由CAS基础版本，独立于消息顺序                       | MLS epoch、成员变更有效或允许合并      |
| mls_epoch                        | 客户端原生MLS库验证后的密码学状态；当前未接入，服务端不推算 | 不得用wireKind、SQL计数或目录状态代替  |
| 原生MLS                          | group、epoch、sender、tree、Proposal/Commit/Welcome/秘密    | 账号密码认证、业务角色、删除完整性     |
| 客户端业务层                     | 经核验Credential映射、原作者、角色、严格payload、删除优先   | 不能以当前joined/Owner身份冒充历史作者 |
| PostgreSQL/DS                    | 服务权限、排序、存储、路由、生命周期元数据                  | 密文内部是MLS或其业务语义正确          |

001/002中的历史route_epoch/messages.epoch通过003增量重命名，历史文件不改。003遇旧消息/inbox或非零head直接中止，不能静默解释旧计数；须另行审核数据迁移，不清空或覆盖。数据库存储版本不能回滚客户端Group State。

## 当前外层契约

`DeliveryEnvelope`：operationId、messageId、conversationId、baseRouteVersion（非负有界十进制字符串）、wireKind（application/proposal/commit）、ciphertext（规范base64）、expiresAt（RFC3339或null）。sender来自会话/设备，不能由请求体指定。没有attachment_ids/Welcome/角色变更生产接口，不把目标字段说成已实现。

密文原始上限256KiB，base64上限349528字符；普通页最多100条且原始payload累计1MiB。seq、routeVersion受PostgreSQL有符号bigint范围限制；不是截断原生uint64 MLS epoch。只有application可声明到期；当前内层到期/AAD绑定未验证，故不能启用写入。

收据为messageId、seq、routeVersion、`status: persisted-unverified`。只证明本服务观察到持久记录，不证明原生有效、解密成功或成员已撤权。原操作查询还返回原密文SHA-256供原样一致性比对；摘要不提供身份/加密证明，不返回正文或其他设备的操作。

## 当前服务事务

1. append首先执行总crypto gate，恒定拒写503。以下SQL基础只供后续审查，不能绕过gate调用Service开放写入。
2. 账号→session→设备依次锁定，复核账号active、当前user会话/期限/绑定设备、active设备和关联未退休公开根的有效凭证；这只是服务目录条件，不是密码学Credential验证。
3. 锁会话并核对当前成员/设备路由，随后锁head。读可访问frozen组元数据/不透明日志，普通写只能active且无pending候选；没有历史授权扩张。
4. 查(device,operation)既有记录，完整请求摘要相同返回原收据，不重插；不同409。不存在才检查baseRouteVersion、分配seq并持久化原密文。
5. 若声明commit，仅写pending_commit_id并冻结组；**不递增route_version、不设置mls_epoch、不解除普通发送**。同一基础路由版本最多一个候选。没有解冻或“确认有效”API。

服务只有总门禁和冻结，无Commit+Welcome生产者/原生确认/成员投影闭环，不能用于真实聊天。wireKind本身不可信，恶意候选可能DoS；不为它提供服务端伪造的解密、valid ACK或多数票共识。

## 目标原生Commit/Welcome流程（BLOCKED）

客户端冻结应用发送→原生验证Proposal/身份/权限→产生pending Commit和Welcome→原生变更集+精确wire+operation/outbox同一持久事务→DS原子候选/Welcome/KeyPackage关联→核对原回传→每设备独立native staged验证→merge并原子落盘。只有经审查的相应路由投影转换才可研究推进route_version，仍不由服务器宣称mls_epoch。

未知HTTP结果保持原pending和原样wire；只能查询/原样重传，不重新加密。409赢家须原生discard/消费赢家，语义未核实前不实现。无效/矛盾候选quarantine、停发、不自动清槽/跳过/回滚；Welcome不能先于对应候选被接受消费，且必须核对Commit关联。没有安全恢复能力则用户确认新建Group ID、重新核验并邀请，不导入旧发送快照。

需要固定库对竞争、无效密文、缺失Proposal、误投Welcome、崩溃/包消费、staged/merge/discard及native存储事务的实际证据。SQL CAS和pending指针不能解除G2/G3/G4。

## 当前API

所有受保护写请求使用同源Cookie、Origin、CSRF及X-Echo-Session非秘密UUID上下文；受保护前端读也带上下文。稳定错误code/requestId，无SQL/秘密日志。404原操作未观察到不证明未知提交不会稍后完成。

| API                                                                                                              | 实际实现与限制                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| POST /v1/accounts                                                                                                | 开放/邀请/关闭，用户名唯一，operation、邀请码消费同事务                |
| POST /v1/sessions；GET /v1/session；DELETE /v1/sessions/current                                                  | 同认证内核、独立user/admin audience；密码登录不授设备信任              |
| POST /v1/sessions/reauthenticate；PATCH /v1/account/username                                                     | 新近认证、稳定UUID、改名CAS；改名事务内重验会话                        |
| GET /v1/accounts/lookup?username=                                                                                | 已登录精确查找，UUID/用户名，unverified-directory，不自动信任          |
| GET/POST /v1/devices；POST /v1/devices/:id/revoke                                                                | pending登记/幂等服务撤销；撤session/WSS、冻结；不等于MLS Remove        |
| GET /v1/identity                                                                                                 | 本人当前公开根目录；不证明本机有私钥/可信                              |
| GET /v1/conversations?after=                                                                                     | 当前有效设备/成员路由元数据，最多50+1 UUID分页，无私密组名             |
| POST /v1/messages                                                                                                | Service内503关闭；外层契约不是MLS集成                                  |
| GET /v1/operations/:id                                                                                           | 限原发送账号和原设备，收据/原密文摘要/删除和到期标记                   |
| GET /v1/conversations/:id/messages?after=&limit=                                                                 | 新快照隐藏待删/到期密文，按joined_seq下界，超前cursor拒绝自动回滚      |
| POST /v1/cursors                                                                                                 | 单调服务投递确认、不超head；不是已读或原生处理证明，当前前端不自动调用 |
| GET /v1/events?context=                                                                                          | 仅通知；Origin、Cookie、匹配session UUID；握手与attach两次核对上下文   |
| POST /v1/messages/:id/delete；GET /v1/deletions/own                                                              | 原作者/new-auth/有效设备；202待锚、本人含expiry记录；非物理完成        |
| GET /v1/admin/{overview,users,devices,logins,security,audit,invitations,backups,growth}；GET /v1/admin/users/:id | 独立超管、真实元数据分页；无正文、密码哈希、私钥或原邀请码返回         |
| PATCH /v1/admin/registration；POST /v1/admin/invitations；POST /v1/admin/users/:id/status                        | 新近认证、事务内session重验、审计；邀请operation幂等，token仅初次返回  |

KeyPackage、群创建/角色治理、Commit+Welcome投递、设备inbox、媒体、完整删除增量和注销接口**未实现**。不添加返回固定成功的路由。SQL、权限、删除状态详见[数据规格](native-data-lifecycle.md)。

## HTTPS与WSS恢复边界

通知无消息正文/用户列表，断线可丢。新客户端订阅connected/sync-required只刷新会话目录；短暂断线指数退避，60秒服务端重认证关闭，1008拒绝继续自动重试。上下文不是token，不可单独授权。真实聊天通知生产者、收件箱、原生解密/本地持久游标未实现；不能声称已完成离线通信。

客户端在G1–G5通过前不请求/展示聊天密文，不确认消费游标。未来重连须先拿完整删除checkpoint，再消费控制事件/消息，展示前再补删；当前没有这种多设备墓碑管线。服务端消息页隐藏不等于删除证据完整，也不能远程撤回在途响应/外部副本。

## 加密业务与群组（目标，未编写）

text/edit/retract/attachment/receipt/group-profile/member-action/personal-settings/delete-for-me统一版本化ApplicationData，严格类型/长度/未知字段拒绝；仅对原生验证出的sender/group/epoch映射后处理。原作者编辑/撤回校验历史身份、删除优先于编辑/转发/导出；未知类型拒绝展示和导出。具体AAD与编码须先审查固定原生API，不造通用JSON签名或MLS解析器。

一对一仍是MLS group，设备独立leaf，私人收藏/备注是本人组。Owner唯一、转让须双方/同一授权版本，Admin仅按前一确认状态操作；当前角色表不是MLS授权证据。移除/撤设备立即停服务/冻结，再由存活可信客户端Remove并原生确认，才开放未来密钥；全员离线保持冻结。新设备不自动获旧历史，旧快照不恢复发送。群资料全在MLS密文内；历史key、恶意现成员串通和已解密副本无法追回。
