# 身份、设备与恢复

2026-11-11。密码登录、会话、用户名、pending设备/服务撤销已编写；本章的根信任、密码学设备授权与恢复仍是未实现的设计。MLS标准和库证据见[密码学研究](native-cryptography.md)；所有密码学身份绑定与恢复开关受G2/G3/G4约束，不因存在表或接口就启用。

## 标识与唯一认证

| 标识 | 约定 | 信任用途 |
| --- | --- | --- |
| User ID | 随机UUID，永不因改名变化或重新分配 | 账号所有权/根身份绑定 |
| Username | 展示值与ASCII小写规范值；建议3–32字符`a-z0-9_` | 唯一查找/登录，不能作密码学身份 |
| Device ID | 随机UUID，每次新设备注册独立生成；不由UA/指纹派生 | 服务会话与MLS客户端映射 |
| Credential | 库原生MLS Credential + 经验证的账户/设备授权材料 | 验证实际leaf签名key归属 |
| Group ID | MLS库生成的不透明标识；服务器单独Conversation UUID与其一对一映射 | 密码学上下文，不能复用旧组ID重置epoch |
| Epoch | 库校验的uint64；JSON运输用十进制字符串 | 与DS顺序/route epoch分开 |
| Message ID | 客户端随机UUID；与发送设备/原样密文幂等绑定 | 编辑、删除、去重；不是MLS generation |

用户名大小写规则必须前后端一致，数据库在规范值上唯一；中文昵称可作为加密资料，避免任意Unicode casefold造成身份混淆。允许无限次数改名，不设终身次数限额；短期限流只防滥用，旧用户名释放/立即重用必须提示冒充风险，通信信任始终绑定UUID/根公钥。当前源码固定ASCII；是否扩展字符的产品选择OPEN，改变时必须重审规范值迁移，不悄悄改比较规则。

accounts是唯一密码认证。Argon2id、每密码独立随机salt、参数与版本随哈希保存；不存明文密码，不从密码/密码哈希导出MLS私钥。初始预算参数、限流见[运维](native-deployment-operations.md)。注册开放/邀请/关闭配置与邀请码行锁同事务，失败回滚；密码哈希在有界并发计算后，再于事务内重检模式/容量，禁止算哈希时长期持有数据库锁。

使用高熵不透明服务session，服务端仅存token哈希；浏览器同源Secure/HttpOnly/SameSite Cookie，写请求校验Origin和CSRF，WSS握手校验Origin及session，URL不带凭据。登录失败统一外部响应，日志不收密码/请求体；当前实现认证IP限速和全局有界算力预算，未知用户使用dummy哈希保持同等密码验证成本；逐用户名限速尚未实现，需后续补齐分布式来源的针对性攻击防护。不能用账号锁定制造无限外部DoS。

密码登录创建的未授权设备只能执行设备授权/恢复流程，不能领其他用户KeyPackage、读取会话历史或发送消息。密码修改/登录恢复撤销服务session，不自动替换根身份。管理员使用同一认证内核、独立audience和新近重新认证；超级管理员初始化用后端一次性设置程序和事务唯一绑定，不能“第一个访问网站的人就是管理员”。

## 账户根与BasicCredential

**事实。** [OpenMLS身份说明](https://book.openmls.tech/user_manual/identity.html)及[Credential validation](https://book.openmls.tech/user_manual/credential_validation.html)要求应用验证入群与Add/Update中的身份。BasicCredential的identity字节不自行证明账号、服务器用户名或真实人；AS本身是信任主体。

**推荐规格，尚待专项审查（G4）。** 客户端生成与MLS叶签名key分离的账户根签名key，首次固定User ID、根公钥、根版本及服务域。每个设备使用独立MLS签名key、HPKE/KeyPackage私钥。目录发布公钥和授权链；私钥不上传。所有Add/Update/Welcome都验证Credential identity、实际签名key、授权链、吊销及已pin根版本一致，不能只验证BasicCredential字符串。

根到设备的签发优先研究标准[JWS（RFC7515）](https://www.rfc-editor.org/rfc/rfc7515.html)与[JOSE Ed25519（RFC8037）](https://www.rfc-editor.org/rfc/rfc8037.html)，只调用成熟实现；设备授权payload建议包含schema/version、service audience、user/device UUID、root version、MLS签名公钥、授权能力、授权ID与前序版本、有效期。固定算法白名单，禁止`none`/任意外部key URL/由待验证目录自选信任根。签原始JWS受保护字节，不自行设计JSON签名算法。

AS对根授权再核验/登记，可用独立服务签名key出具注册收据；服务签名仅证明AS记录，不替代账户根授权。BasicCredential承载紧凑身份引用，授权材料外部附带，具体编码/大小/撤销规则须选定库后审查；**本轮未定稿可执行Credential profile，也未实现新密码学协议。** 标准X.509链是替代研究路线，若库/浏览器无成熟验证路径仍BLOCKED，不自写证书解析。

首次根公钥依然可能被恶意AS替换。客户端应保存联系人根pin、完整公钥指纹，变化立即停发并提示；[JWK thumbprint（RFC7638）](https://www.rfc-editor.org/rfc/rfc7638.html)是候选标准指纹格式，不把短验证码当强认证。独立可信通道核对完整指纹可作最小人工替代，TOFU必须标“尚未核验”，无外部透明度/交叉核验不能保证AS不对首次接触者分叉。

## 授权、验证与撤销状态

| 状态转换 | 先决证据 | 失败/未知结果 |
| --- | --- | --- |
| new → pending | 本地新key已安全持久化，服务器分配设备UUID | 重用原操作ID查询；不能另造一台同身份设备 |
| pending → authorized | 可信根/合格授权设备链，绑定当前新设备实际key与挑战上下文 | 仅密码/目录记录不够；未知保持pending |
| authorized → joining → active | 每个组分别Add/Commit/Welcome及本地验证完成 | 某组失败只阻塞该组，不显示全局已恢复 |
| active → suspended | 服务端风险暂停/账号封禁 | 立即撤HTTP/WSS，仍不等于MLS移除 |
| active/suspended → revocation-pending → revoked | 所有相关组有效Remove Commit及当前设备状态确认 | 展示逐组待撤权；没有在线授权客户端则冻结发送 |
| 任意 → identity-reset-required | 根/本地状态丢失或无法验证新鲜度 | 不回滚私有state、不自动继承旧信任 |

可信设备授权采用成熟、经过审查的跨设备认证/引导协议，必须绑定根、公钥、双向上下文、防重放、用户明确确认和取消。**原生SAS/经验证QR方案未选定，BLOCKED。** 不截断指纹伪造SAS、不把二维码扫描成功视为对端身份可信；第一版最小替代是独立通道完整指纹核对及用户持有根恢复材料授权。不能借用Matrix的crypto/SAS实现。

设备私钥和其他设备的私钥不复制。已有可信设备是否可签发新设备，必须由根的明确委托范围约束；推荐先限定根控制设备/恢复根签发，不接受无限授权链。全体设备“都能恢复根”的便利会扩大泄漏面，默认关闭，不能以服务器会话替代委托。设备列表/根版本有条件更新和唯一授权ID，看到两个互相冲突的根或授权版本时停止自动合并。

撤销后删除公开未消费KeyPackage、撤服务session、关闭WSS、拒绝历史/媒体请求；授权客户端从每个群移除所有对应leaf，处理其它设备的pending/outbox，成功后新epoch发送。其他成员串通转发/泄露旧key以及尚未观察撤销的分叉客户端不受服务器名单绝对控制。详细Commit边界见[投递](native-protocol-delivery.md)。

## 五类恢复与本地状态

| 恢复对象 | 推荐路径 | 明确不恢复 |
| --- | --- | --- |
| 密码登录 | 预先登记并经审查的登录恢复凭据/已登录新近重认证流程；具体方式OPEN | 根私钥、MLS状态；无凭据时管理员只能停用/重建账号，不能冒充身份 |
| 账户根身份 | 独立客户端生成的恢复包+离线恢复key，或明确受权的根控制设备 | 所有组/历史；新根必须通知并重新核验 |
| 设备迁移 | 生成新设备key，授权新Credential，逐组Add/Welcome；旧设备随后Remove | 复制旧设备ID、ratchet或Epoch Secret |
| 活跃MLS Group State | 正常本地持久化中断恢复；不可信旧备份必须重新入组 | 将过期snapshot作为可发送状态导入 |
| 历史聊天归档 | 独立加密导出，版本/身份/完整性/删除证据检查后只读导入 | 重新发历史消息、恢复活跃群密钥或设备授权 |

根恢复包推荐评估标准JWE成熟实现、随机256-bit外部恢复key、标准AEAD封装，包内含根私钥及账号/域/版本核对材料；恢复key不上传，恢复文件本身也不放服务端。人类密码不是该随机key，不自造KDF/分词助记协议。JWE格式及实现未选定：G4 BLOCKED；只记录候选，不先写加密恢复代码。

所有设备丢失时，用独立凭据恢复根并生成新设备；由仍在群内的授权成员重新邀请。单人私人组无存活成员时只能创建新的私人组，旧记录仅来自独立历史归档。新组/新设备不导入旧epoch；根恢复不等于历史恢复。根材料也丢失则显式身份重置，UUID账号可以保留，旧联系人必须重新核验新根。

本地provider须加密且验证完整性；加密key优先平台/非导出WebCrypto能力，但实际MLS库需要字节私钥时不伪称全程硬件保护。逐群单写者与跨标签锁、native存储变更+outbox/收件去重事务是硬门槛；IndexedDB被系统逐出/磁盘满/清站点数据即可能丢密钥。备份不重新装载发送状态，数据库新鲜度不能只用本机时间。用户主动清除本机应先确认独立归档和恢复凭据；浏览器删除不证明SSD物理擦除。

**残余风险。** 根授权profile、SAS/QR、JWE恢复包及平台key保护尚未通过集成审查；恶意服务器的初次根替换/分叉、恶意前端和已解密副本仍有风险。最小安全替代是保持初始化/自动恢复关闭、人工核验后重新入群，不创建假成功流程。
