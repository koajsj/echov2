# 决策与第一阶段交付记录

2026-11-11。原纯研究阶段按用户后续明确指令升级为研究、架构、代码基础、静态审查和首次Git交付。所有代码由主智能体修改；三个Terra只读研究，没有并发代码修改。旧echo-v2只读，原限制中“不写新代码/package/SQL文件”已由最新指令明确替换；不执行SQL/安装/测试/构建/服务/VPS/部署限制仍有效。

## 决策

| ID | 决策/依据 | 替代、风险与未决状态 |
| --- | --- | --- |
| D1 已决 | 独立echov2；模块化单体Fastify/PostgreSQL/HTTPS/WSS/Caddy/systemd；React/HeroUI/Taste | 不复制Matrix架构，不拆微服务/第二套认证或队列 |
| D2 条件推荐 | MLS suite1；OpenMLS0.9.2先做浏览器可行性，原因是有公开核心审计和原生staged API | ts-mls1.6.4备选；均未生产批准。mls-rs WebCrypto实验路线缺套件1，RustCrypto待单独评估，mlspp首版浏览器成本不合适；互操作repo非库 |
| D3 已决 | 密码唯一认证与根/设备密码学身份分开；设备pending不自动active | 标准JWS授权profile/可信引导/恢复尚待审查，不使用伪SAS/自造密码协议 |
| D4 已决 | DS排序不透明候选、客户端原生状态为权威；seq≠epoch | 无效候选freeze；不以SQL CAS/服务回执当MLS有效性，G2 BLOCKED |
| D5 已决 | 客户端变更与outbox原子持久化、原样重试；旧state不能直接恢复发送 | 未集成provider，不以一般IndexedDB存JSON冒充事务安全，G3 BLOCKED |
| D6 已决 | 删除意图与物理清除、离线墓碑、独立锚分别记录；没有锚不自动恢复 | 当前pending/读取隐藏，不能返回已擦除；外部独立目标G6 BLOCKED |
| D7 已决 | 管理员可暂停服务，不能代做MLS移除；真实未知统计显示null | 超管独立audience/同认证内核，离线provision实际写DB但未执行 |
| D8 已决 | 只迁移原创图标/tokens和独立配置；禁止旧私钥/密文/信任迁移 | 未来用户设备确认后只读归档或明确新分发，原历史不伪装原生消息 |

## 实际代码与安全收敛

第一阶段建立React/HeroUI用户端及管理端、Fastify模块化单体、23表PostgreSQL初始Schema及受限权限、共享契约、Caddy/systemd/低配配置。已有账号注册/密码认证、独立audience会话与CSRF/重新认证、用户名CAS、pending设备/撤销、后台查询/分页/注册配置/邀请/暂停审计、密文顺序/幂等/分页/cursor、WSS有限通知、删除意图/数据库到期扫描。具体实现与目标的差距以实施计划为准；不包含可用MLS聊天。

只读复核后实际修正：

- 修正撤设备/暂停账号冻结群组所需权限；API只能冻结组，不能自行激活/重新开放。
- 注册在配置行锁内重查operation ID，密码验证留在锁外；请求摘要绑定首次规范用户名/邀请码，失败不重复扣次数。
- 明确先锁活跃账号，再处理会话/设备/群组，修正删除与撤销、设备登记与暂停的锁反转；事务冲突返回明确503，不自动重放未知提交结果。
- 删除在事务内复验新近会话/活跃设备/凭证、原作者和消息类型；操作ID不能改绑其它目标。新增单向删除意图标记与受限列UPDATE权限，满足行锁要求而不开放密文擦除/删除完成状态写入。
- 消息页最多100条且原始密文累计1MiB，base64去掉PostgreSQL编码换行；新读取快照隐藏待删/到期密文，不能追回在途响应。
- 受保护请求携带非秘密X-Echo-Session上下文，避免旧标签表单误操作切换后的账号；用户与管理端均有真实重新认证表单。
- 管理员密码文件同一描述符O_NOFOLLOW打开、核查并读取；HOST/PORT与Caddy一致。媒体路径仅作语法检查，尚非媒体安全实现。
- 纠正mls-rs表中Experimental的范围：RustCrypto的X.509支持，不能泛指整个Provider；WebCrypto缺套件1仍BLOCKED。
- 将data/backups忽略规则锚定项目根，修复DataPage被误排除；原始Echo图标/tokens与独立工具配置是选择性复用，没有复制旧业务/Matrix适配层。

前三项Terra研究覆盖MLS、身份/投递、生命周期；最终独立只读复核重点检查Schema权限、事务锁、字节预算与接口。已处理可证明的问题，复核未再发现必须修正的确定性错误。只读审查不是数据库或密码学验收。

## 静态检查记录

环境：Node24.17.0、Git2.50.1、Python3.15.2。没有node_modules、锁文件、构建产物或真实数据目录；缺失依赖的名称/精确版本在package.json，均未安装。新增必要依赖为argon2 0.45.2（密码哈希）、@fastify/cookie 11.1.5（会话Cookie）、@fastify/websocket 11.3.7（原生WS插件）、@fastify/rate-limit 11.2.1（入口限流），没有MLS运行依赖或空加密适配器。

| 状态 | 实际执行/范围 | 结果与限制 |
| --- | --- | --- |
| PASS | 旧项目逐文件SHA-256比对 | 185个非.git文件内容及文件集合均不变；不依赖旧仓库无HEAD的diff |
| PASS | JSON解析、普通模块语法 | 5个JSON；28个普通TS/JS/MJS在内存去类型后仅用VM模块解析，无导入/链接/执行应用 |
| PASS | 字面量引用与本地资源 | 171个模块引用、43个本地Markdown链接、6个资源引用未见缺失；CSS的echo token引用均有声明 |
| PASS | Shell语法 | bash -n scripts/preflight.sh，退出0；没有执行脚本或检查服务 |
| PARTIAL | 源码扫描脚本 | node --experimental-vm-modules scripts/check-source.mjs退出2，73个文件、0失败；13个TSX不解析，只检查字面量引用，保留Node实验警告 |
| PARTIAL | Schema/权限/参数化SQL/调用链与独立复核 | 23表、约束/索引/事务/受限权限作文本审查；不等于SQL解析、查询执行或并发通过 |
| PASS | 命名、目录、暂存与忽略清单、Diff空白检查 | 组件PascalCase、普通TS/目录kebab-case；暂存清单与73个实际文件一致，无旧仓库/依赖/凭据遗漏混入 |
| FALSE_POSITIVE | 通用命名/产物目录筛选 | main.tsx是Vite入口而非组件；src/client/features/data是正式源码，不能当用户数据排除；001/002是有意义的迁移顺序 |
| PARTIAL | 定向敏感与DOM模式审查 | 未发现私钥头、GitHub/cloud token、含口令连接URL、危险HTML/eval命中；同时检查配置只含安全示例。不是完整SAST或无漏洞证明 |
| NOT_AVAILABLE | TypeScript完整类型/TSX解析、ESLint、Prettier、Semgrep | 本地可执行工具/依赖缺失；未用npx或其它安装绕过限制 |
| NOT_AVAILABLE | PostgreSQL语法分析、Caddy/ShellCheck、age/minisign及完整依赖许可证/SBOM | pglast/sqlparse/tree_sitter及所列CLI不可用，解析依赖树缺失；手动研究的直接许可证事实不替代完整审计 |
| NOT_RUN | 测试、构建、应用/数据库/SQL/迁移、浏览器、MLS/跨设备/撤权、删除/备份/恢复、VPS/部署 | 遵守本轮限制；没有真实通信、可用恢复或性能安全PASS |

源码扫描只是有限静态工具，不能证明导出类型、真实路由、原生API兼容性或密码学正确。不存在为了凑PASS生成的测试/Mock/假备份。

## Git交付与下一阶段

仅在新echov2创建独立main仓库；预检GitHub目标为空且没有分支提交。提交身份采用当前已登录GitHub账号的公开名称及noreply地址，只写本仓库配置。提交前审查完整暂存Diff、文件集合、忽略规则和敏感候选；不含.env、私钥、密码、node_modules、数据/备份、缓存或临时文件。

获明确授权创建首次提交及非强制push main。具体提交SHA与GitHub返回/ref核验结果由最终交付回复记录，本文不预写推送成功或将本地提交当远程证据；远端若出现非预期历史则停止，不覆盖、不强推。

本阶段已具备下一阶段的源码起点与准入清单，**未取得第二阶段生产密码学准入**。G1–G6保持BLOCKED，G7保持OPEN；当前最小安全替代是关闭聊天写入/设备激活/自动密钥恢复/旧快照恢复，不以服务端权限代替MLS。解除条件和实施顺序统一见[实施计划](native-implementation-plan.md)。第一阶段交付后停止，等待用户审查与后续授权。

## 完整项目文件树

以下73个实际文件，不包含.git、不存在的目录或生成产物。

```text
echov2/
  .env.example
  .gitignore
  .prettierignore
  README.md
  deploy/Caddyfile
  deploy/echo-native.service
  deploy/postgresql.conf
  docs/decisions.md
  docs/native-architecture.md
  docs/native-cryptography.md
  docs/native-data-lifecycle.md
  docs/native-deployment-operations.md
  docs/native-identity-devices-recovery.md
  docs/native-implementation-plan.md
  docs/native-migration.md
  docs/native-protocol-delivery.md
  docs/native-security-threat-model.md
  docs/research-sources.md
  eslint.config.js
  index.html
  migrations/001-initial.sql
  migrations/002-runtime-permissions.sql
  migrations/README.md
  package.json
  public/echo.svg
  scripts/check-source.mjs
  scripts/preflight.sh
  scripts/provision-admin.ts
  src/client/app/App.tsx
  src/client/app/ErrorBoundary.tsx
  src/client/app/Workspace.tsx
  src/client/app/api.ts
  src/client/app/use-api-query.ts
  src/client/components/Brand.tsx
  src/client/components/ReauthenticationForm.tsx
  src/client/components/ServiceState.tsx
  src/client/crypto/readiness.ts
  src/client/features/account/AccountPage.tsx
  src/client/features/account/AuthPage.tsx
  src/client/features/admin/AdminPage.tsx
  src/client/features/data/DataPage.tsx
  src/client/features/devices/DevicesPage.tsx
  src/client/features/messaging/ConversationsPage.tsx
  src/client/main.tsx
  src/client/styles/app.css
  src/client/styles/shell.css
  src/client/styles/tokens.css
  src/server/accounts/account-routes.ts
  src/server/accounts/account-service.ts
  src/server/accounts/passwords.ts
  src/server/accounts/sessions.ts
  src/server/admin/admin-routes.ts
  src/server/api/http-error.ts
  src/server/app.ts
  src/server/config.ts
  src/server/delivery/connection-hub.ts
  src/server/delivery/delivery-routes.ts
  src/server/delivery/delivery-service.ts
  src/server/devices/device-service.ts
  src/server/identity/identity-service.ts
  src/server/lifecycle/deletion-service.ts
  src/server/lifecycle/lifecycle-routes.ts
  src/server/main.ts
  src/server/messaging/crypto-gate.ts
  src/server/storage/database.ts
  src/shared/capabilities.ts
  src/shared/contracts.ts
  src/shared/validation.ts
  tsconfig.client.json
  tsconfig.json
  tsconfig.server.json
  tsconfig.tools.json
  vite.config.ts
```
