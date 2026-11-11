# 研究来源与证据边界

访问日期2026-11-11。使用官方网页/源码浏览/官方GitHub元数据，只读在线资料，没有克隆、保存第三方源码/包/PDF文件或安装依赖。三个Terra分别研究MLS实现、身份/投递、生命周期/运维；主智能体复核关键版本/公告并作条件决策。研究结论不当运行证据，以下未列项目不声称已审查。

## 标准

| 来源                                                                                                                                                                                       | 实际用于确认的事实/边界                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [RFC9420](https://www.rfc-editor.org/rfc/rfc9420.html)，尤其§11/17.1                                                                                                                       | MLS消息/设备/epoch与套件1基准；没有完整产品认证/删除能力                  |
| [RFC9750](https://www.rfc-editor.org/rfc/rfc9750.html)，§3.7/4/5.2.1/5.3/8                                                                                                                 | AS/DS、强一致投递、加密无效Commit与信任边界；Informational                |
| [RFC9180 HPKE](https://www.rfc-editor.org/rfc/rfc9180.html)、[RFC5869 HKDF](https://www.rfc-editor.org/rfc/rfc5869.html)                                                                   | 采用标准原语，经成熟MLS实现调用，不自写                                   |
| [RFC9106 Argon2](https://www.rfc-editor.org/rfc/rfc9106.html)、[OWASP密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)                           | 哈希参数事实与本项目预算选择分开                                          |
| [RFC7515 JWS](https://www.rfc-editor.org/rfc/rfc7515.html)、[RFC8037 JOSE](https://www.rfc-editor.org/rfc/rfc8037.html)、[RFC7638 thumbprint](https://www.rfc-editor.org/rfc/rfc7638.html) | 身份签发/完整指纹的标准候选，未形成已审计Echo profile                     |
| [WebCrypto](https://www.w3.org/TR/webcrypto/)、[Safari17 WebKit说明](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-beta/)                                    | 标准算法/浏览器能力资料；Level2是草案，Ed25519支持不证明完整套件或iOS通过 |

## 五个项目与版本快照

GitHub API读取default branch、license、最新head、tags、前4个release；对下列版本再次读取commit日期。日期为提交UTC，不伪称crate发布日期。表内ref用于复核，实施前仍需再查安全更新。主线文档可能超前于tag/API。

| 项目                                                                | 版本ref / commit                                                                                                  | 当前主线commit日期 / 版本渠道                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [ts-mls](https://github.com/LukaJCB/ts-mls)                         | [v1.6.4](https://github.com/LukaJCB/ts-mls/tree/v1.6.4) / `ddff62aa15d3064fff5d77dda35b3cdf2970870d`，2026-08-28  | 2026-11-04；稳定release1.6.4，另有2.0 RC                                                                     |
| [mls-rs](https://github.com/awslabs/mls-rs)                         | [0.57.0](https://github.com/awslabs/mls-rs/tree/0.57.0) / `a1436f4a5433214ed62349e77835b57a0accdc42`，2026-10-28  | 2026-11-02；tag及[0.57 API](https://docs.rs/mls-rs/0.57.0/mls_rs/group/struct.Group.html)，GitHub releases空 |
| [OpenMLS](https://github.com/openmls/openmls)                       | [v0.9.2](https://github.com/openmls/openmls/tree/v0.9.2) / `8a8f83b4b61fc45f28facec25e914992b3465de6`，2026-10-22 | 2026-11-10；[docs.rs发布0.9.2](https://docs.rs/openmls/0.9.2/openmls/)，GitHub Latest仍0.9.0                 |
| [mlspp](https://github.com/cisco/mlspp)                             | [v0.1.0](https://github.com/cisco/mlspp/tree/v0.1.0) / `21c9a937ac24a2e0bd9b2d062e598fd9161119d9`，2021-05-26     | 2026-09-21；没有GitHub release，不把旧tag称最新生产稳定版                                                    |
| [mls-implementations](https://github.com/mlswg/mls-implementations) | main `2034fe72e0c805a683ba76165660c834f2a8142a`                                                                   | 2026-10-07；无tag/release，互操作协调材料非库                                                                |

**许可证核查：** ts-mls/OpenMLS为MIT；mls-rs仓库明确Apache-2.0 OR MIT（API license字段只给Apache不代表只能选一个）；mlspp为BSD-2-Clause。mlswg API license=null，未取得统一根license，不复制该仓库文件。仅阅读许可字段/项目声明不是全部传递依赖法律审查。

### 源码、API与安全记录

- ts-mls：[v1.6.4 README](https://github.com/LukaJCB/ts-mls/blob/v1.6.4/README.md)、[package](https://github.com/LukaJCB/ts-mls/blob/v1.6.4/package.json)、[GHSA成员移除漏洞](https://github.com/LukaJCB/ts-mls/security/advisories/GHSA-gwp3-968w-m7gv)。对比main示例与tag，未将unsafeTestingAuthenticationService用于产品。
- mls-rs：[Provider/审计声明](https://github.com/awslabs/mls-rs#crypto-providers)、[0.57 Cargo](https://github.com/awslabs/mls-rs/blob/0.57.0/mls-rs/Cargo.toml)、[Group API](https://docs.rs/mls-rs/0.57.0/mls_rs/group/struct.Group.html)、[issue312](https://github.com/awslabs/mls-rs/issues/312)。issue评论不是官方保证，WebCrypto未列套件1。
- OpenMLS：[0.9.2 Cargo](https://github.com/openmls/openmls/blob/v0.9.2/openmls/Cargo.toml)、[发布API/平台](https://docs.rs/openmls/0.9.2/openmls/)、[SRLabs公开报告](https://blog.openmls.tech/SRL-OpenMLS_security_assurance_assessment.pdf)、[维护者审计说明](https://blog.phnx.im/openmls-independent-security-audit/)、[解析漏洞公告](https://github.com/openmls/openmls/security/advisories/GHSA-gc79-23g3-8g52)。PDF由网页工具只读解析，未保存文件。报告v1.2/2026-03-11，范围不含provider/storage/DS/app。
- OpenMLS book：[Identity](https://book.openmls.tech/user_manual/identity.html)、[Credential validation](https://book.openmls.tech/user_manual/credential_validation.html)、[Add](https://book.openmls.tech/user_manual/add_members.html)、[Processing](https://book.openmls.tech/user_manual/processing.html)、[Welcome](https://book.openmls.tech/user_manual/join_from_welcome.html)、[Application messages](https://book.openmls.tech/user_manual/application_messages.html)、[Persistence](https://book.openmls.tech/user_manual/persistence.html)、[Migration](https://book.openmls.tech/user_manual/migration.html)。部分由Terra只读核对，主智能体复核关键页面；未编译验证具体绑定。
- mlspp：[README及前提](https://github.com/cisco/mlspp)、[tag CMake](https://github.com/cisco/mlspp/blob/v0.1.0/CMakeLists.txt)、[Releases](https://github.com/cisco/mlspp/releases)。依赖/interop工具出现不代表浏览器发行或安全审计通过。

## 单体、存储与工具

[PostgreSQL18约束](https://www.postgresql.org/docs/18/ddl-constraints.html)、[锁](https://www.postgresql.org/docs/18/explicit-locking.html)、[SELECT/SKIP LOCKED](https://www.postgresql.org/docs/18/sql-select.html)、[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)用于逻辑设计；未运行SQL。[node-postgres事务](https://node-postgres.com/features/transactions)确认同一client使用，不以pool.query跨连接模拟事务。

[Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)、[@fastify/websocket](https://github.com/fastify/fastify-websocket)、[node-argon2](https://github.com/ranisalt/node-argon2)用于真实API基础。新增依赖版本取本轮官方release：[argon2 0.45.2](https://github.com/ranisalt/node-argon2/releases/tag/v0.45.2)、[websocket11.3.7](https://github.com/fastify/fastify-websocket/releases/tag/v11.3.7)、[cookie11.1.5](https://github.com/fastify/fastify-cookie/releases/tag/v11.1.5)、[rate-limit11.2.1](https://github.com/fastify/fastify-rate-limit/releases/tag/v11.2.1)；其余依赖版本来自旧项目本地manifest/lock记录，不声称本轮重新安装或逐包上游审计。完整清单以[package.json](../package.json)为准，缺少全部本地安装依赖。

[HeroUI Button](https://heroui.com/docs/react/components/button.mdx)和[theming](https://heroui.com/docs/react/getting-started/theming.mdx)用于v3 Button/主题继承；text-field网页读取失败，当前用有标签的原生表单输入，不编造API。没有下载UI包、源码或远程字体。

[Caddy log](https://caddyserver.com/docs/caddyfile/directives/log)、[age](https://github.com/FiloSottile/age)、[minisign](https://jedisct1.github.io/minisign/)仅作运维来源，备份工具未集成/未运行。Apple官方Safari17 release页读取失败；使用上列WebKit公开说明，不把失败记作已检查。

## 研究限制

没有本地候选库、完整依赖树、WASM产物、IndexedDB adapter、安全恢复器或浏览器向量；没有执行库测试、构建、原生provider实验、许可证扫描或运行互操作。最新稳定版本、维护活跃度与安全状态会变化；本轮核对不是未来免审凭证。主智能体选择OpenMLS做**可行性研究首选**，Terra A偏向ts-mls的集成便利，最终采用更重视公开核心审计的条件排序，不将意见差异隐去或强行定生产库。
