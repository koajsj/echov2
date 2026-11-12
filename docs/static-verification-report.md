# Cloud 工程验证报告

## 当前验证：PC 双入口与公共 ID

基线 `32f09d8faf24a5a731f4aa86f899905030e90518`，2026-11-12。当前机器可读依据为 [pc-review.json](evidence/pc-review.json)；以下历史证据分别绑定其原提交。状态 **PARTIAL**，不代表产品或生产安全通过。

### 本轮实际运行

- 工程：独立执行typecheck、lint、format:check、check:ast、check:source、build:client、build:server，最终七项退出码均为0，逐项记录在PC证据；未关闭规则或增加扫描排除。
- 数据库：临时PostgreSQL17.11，新/合成旧路径001–007逐份退出0、schema/catalog一致；23表、33外键、17唯一约束、56索引、3业务触发器、4函数。原001预期语法失败保留，修正版独立基线与002–007通过pglast。
- 权限：owner/API均非超级用户、无BYPASSRLS；API不能DDL、访问迁移台账或修改public_id等受限列。**RLS启用表数为0**，当前依赖服务事务授权和列ACL，不宣称数据库行级租户隔离。
- 公共ID：真实旧账户及设备FK保留、5,000个随机样本格式/唯一、强制首次碰撞成功、持续碰撞503且零行、并发operationId幂等、API UPDATE拒绝。
- 认证/授权：34项HTTP检查覆盖邀请、注册摘要冲突、唯一、会话、重新认证、改名、退出、关闭注册，普通用户拒绝12个管理读取入口；CSRF/Origin/旧标签页拒绝。
- 竞态：设备/邀请在观察到锁等待后过期拒绝；跨账号删除operationId仅一胜者，冲突409且不隐藏另一目标。
- 浏览器：PC视口、两套入口、短ID复制与查询、3张官方BoardUI图表和时间筛选、真实元数据归档及3次CSV，4次Blob创建/释放；0 pageerror，控制台/HTTP预期401及门禁403已逐项分类，无意外错误。8张真实PC截图；1024 CSS px无页面溢出。
- 密码学实验：Rust格式、native release、wasm32 release、wasm-bindgen退出0；双BrowserContext真实OpenMLS库测试通过。本地CAS、刷新恢复、重复拒绝、注入配额错误回滚及附件AEAD通过，合成opaque状态不证明完整Provider持久化。

### 审计与许可证

npm audit退出0，零公告；本轮仅新增精确锁定Recharts3.9.2与Remixicon React4.9.0供官方BoardUI内部使用。npm CycloneDX以package-lock-only生成，包含418组件（含其他平台可选包），npm导出器原遗漏Remixicon的非SPDX许可，已核对实际包声明与v4.9.0原文并补充具名Remix Icon License 1.0；当前无缺失许可条目；Rust SBOM191组件无缺失。许可证义务仍需发布前履行，不把清单等同法律审核。本项目没有整体LICENSE。

BoardUI CLI0.5.9真实stdio MCP调用get_started/list_components/get_skill/get_component；免费KPI/revenue/orders源码附MIT版权，来源仓库固定提交及原始源码哈希在PC证据。未获取未授权Pro源码，未采用Pro模板或安装第二套基础UI。

Cargo audit退出1，3项公告：RUSTSEC-2026-0387（crypto-bigint0.5.5）、RUSTSEC-2026-0331及0330（libcrux-kem0.0.9），另有proc-macro-error2停止维护警告。活动WASM树的crypto-bigint未获安全兼容升级；gate继续BLOCKED。

Semgrep官方规则固定 `a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2`，213条运行规则，扫描作者源码及工具，69项发现（55 INFO、13 WARNING、1 ERROR），0扫描错误。ERROR在认证回归的loopback HTTP合成夹具，不发送真实凭据或生产流量；保留发现及解释，不禁规则。其他SQL常量拼接、部署/库代码启发式发现需结合输入边界审查，不将SAST结果称为零告警或正式安全审计。发现文件、位置和规则保存在PC证据。

客户端构建退出0，但Vite报告约1,013kB压缩前主JS块（gzip约304kB）超过500kB建议值；未修改阈值隐藏提示，后续仍有拆包优化空间。源码检查首次遇到未暂存的已删除手机图片而报ENOENT，记录Git删除后复跑通过；未修改检查规则。

### 资源与未覆盖项

实际memory.max=34359738368、cpu.max=400000 100000；Docker请求限制未生效，memory.swap.max=max。限额检查退出1/BLOCKED。无20GB磁盘配额；受限持续负载NOT_RUN。

独立30秒功能负载：60次真实注册模式GET，p50=3.843ms、p95=23.974ms、max=153.204ms；两个观测Node进程CPU共1.11秒，生命周期VmHWM之和207810560字节。后者不是并发全栈内存峰值，未包含PostgreSQL/Caddy；不推导低配容量。浏览器、Rust、SQL及扫描范围之外的完整产品多设备、恢复、物理故障和生产部署仍未通过。

---

## 历史验证记录（以下对应先前提交）

2026-11-12。本报告替代旧的本机只读静态快照；旧快照由 Git 历史保存。所有安装、构建、数据库与浏览器操作均在 Codex Cloud；没有在用户本机下载/安装，没有生产访问。**整体 PARTIAL；检查通过不代表完整产品、安全门禁或生产容量通过。**

## 可复核证据

命令、实际退出码、测试摘要、历史 SQL 指纹、工具与清理状态见 [verification.json](evidence/verification.json)。npm 与 Rust 的 CycloneDX 锁闭清单分别为 [npm SBOM](evidence/npm-sbom.json) 与 [Rust SBOM](evidence/rust-sbom.json)。功能缺口与安全结论见[第三阶段报告](phase-three-report.md)。

实际工具：Node 24.22.1、npm 11.9.0、TypeScript 5.9.3、ESLint 10.14.0、Prettier 3.9.10、PostgreSQL 17.11、Chromium 156.0.8078.79、Playwright 1.65.0、Rust/Cargo 1.99.1、wasm-bindgen-cli 0.2.105、Semgrep 1.185.0、cargo-audit 0.22.0、pglast 8.7。Cloud HTTPS 实验使用已有 Caddy 2.6.2；它不是生产组件版本或安全维护验收。

## 工程命令

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm run check:ast
npm run check:source
npm run build:client
npm run build:server
```

| 命令                 | 最终退出码 | 状态                                 |
| -------------------- | ---------- | ------------------------------------ |
| npm run typecheck    | 0          | PASS                                 |
| npm run lint         | 0          | PASS                                 |
| npm run format:check | 0          | PASS；先修正浏览器脚本格式告警后重跑 |
| npm run check:ast    | 0          | PASS                                 |
| npm run check:source | 0          | PASS                                 |
| npm run build:client | 0          | PASS                                 |
| npm run build:server | 0          | PASS                                 |

各命令独立记录退出码，不通过 shell 最后一条成功掩盖前序失败。源码检查实际解析 TS/JS 和 TSX，并核对作者文件引用/文档链接；其 PASS 仅表示该范围。完整类型、第三方 API、SQL 与运行仍由各自检查承担。TSX 不再跳过；没有用空类型声明、禁用规则或新增作者文件排除来制造 PASS。

WASM 验证使用 Cargo.lock、固定工具链，分别执行 `cargo fmt --all -- --check`、native release、wasm32 release、wasm-bindgen。浏览器实际加载生成的 WASM。生成 pkg 含上游 lint 指令，测试后作为生成物清理；不编辑生成文件、不改变 ESLint 配置来吞掉告警。Cargo target/pkg、node_modules、数据库或凭据不进入 Git。

## 数据库与 SQL

`check-migrations.mjs` 在两个独立临时数据库上验证 001–006、最终 dump/目录一致、旧字节保留与最小权限。所有迁移 DDL 用普通 owner，应用用普通 API；test admin 只建立隔离数据库/观测负例。每份失败立即停止，不跳过。另有初始化回滚、pending 非空、零行/丢失回执、003 旧消息保护及 006 异常等负例。

pglast 8.7 静态解析 002–006 与独立基线通过；原始 001 在 authorization 处预期语法失败并保留原字节。这不是修正版失败。静态语法解析不替代 PostgreSQL 中执行函数、约束或权限测试。

`check-auth-workflow.mjs` 验证真实 HTTP 注册/邀请/幂等/唯一/登录/会话/重新认证/改名/受众隔离/退出/关闭注册，以及数据库实际记录。

`check-deletion-race.mjs` 让两个不同合成账号在读后同时争用全局 operationId，确认一条请求记录、一个隐藏目标、另一请求冲突，原操作重试 pending-anchor。Owner 写入的结构凭证只用于 SQL 并发，不是可信 MLS 身份证据。

## 浏览器与密码学范围

- `check-app-browser.mjs`：真实 HTTPS 注册、登录、重新认证、元数据导出/下载/只读预览、真实管理员用户查询与 CSV 三次下载、正确文件名/内容、全部 4 个 Blob URL 释放、两种 audience 退出后 Session 行消失、导航、390px 无横向溢出、reduced-motion 偏好与键盘退出，无 pageerror。
- `check-mls-browser.mjs`：两个独立 BrowserContext，真实 OpenMLS WASM / 套件 1 的 KeyPackage、Welcome、Commit、Application、重放/无效 Commit 拒绝、pending/staged discard、Merge、Remove、Epoch 1→2。不是两台独立物理设备，也不是产品 MLS E2E。
- `check-local-crypto-browser.mjs`：Web Locks/IndexedDB 两标签 CAS 单胜者、刷新恢复、重复操作拒绝、注入配额错误后的原子回滚；附件 AES-GCM 往返、不同 key/IV、篡改拒绝和大小边界。opaque sealedState 是合成字节，未证明完整 provider 状态安全恢复。

pageerror 通过只证明没有捕获到页面未处理异常；本轮未完整分类所有 console 消息，不宣称浏览器控制台零错误。

Firefox 和 WebKit 官方 Playwright 下载域名分别实际被 Cloud 网络策略 403 拒绝；未绕过策略，状态 NOT_AVAILABLE。iOS 无实机。真实 OS 崩溃、物理磁盘满、完整可访问性/跨浏览器视觉、产品 Commit 冲突/离线墓碑/系统恢复均未通过，不用实验结果代替。

## 供应链、SAST 与许可证

npm audit 当前零公告。原 minimatch 10.2.6 公告通过固定 override 11.0.8 修复，并实际安装、类型/Lint/构建验证；不使用 audit ignore。package-lock.json 固定解析闭包。

Cargo audit 实际退出 1，锁闭 3 项公告与 1 项停止维护警告；未忽略任何公告。实际 WASM 依赖树含 crypto-bigint 0.5.5 的 RUSTSEC-2026-0387，现有曲线依赖不能无损升级至 patched >=0.7.6。suite 1 不选择 P-256 不是完整可达性证明。libcrux-kem 0.0.9 两项公告在锁闭中，但 `cargo tree --locked --target wasm32-unknown-unknown -i libcrux-kem` 未找到活动路径。停止维护的 proc-macro-error2 也保留记录。详见[密码学](native-cryptography.md)及 evidence 中公告编号与版本。生产门禁继续 BLOCKED。

Semgrep registry 网络访问遭 403，改用允许的 Git HTTPS 获取官方规则库 `semgrep/semgrep-rules` 固定提交 `a5ad1714f00c9f7fde980cab0ea1d6dc6d414fd2`，本地运行 JavaScript/TypeScript/Rust 规则，metrics/version check 关闭以避免遥测/额外访问。没有关闭扫描规则；213 条实际执行规则扫描 83 份作者源码，61 项发现（48 INFO、13 WARNING）、0 扫描错误；分类和范围见 evidence。

自动告警需按实际语义复核：中文 JSX 未国际化、已显式类型化组件的 props 传播、用户确认对话框、现代 Node/浏览器支持的 replaceAll、SQL/正则字符串中的模板标记，以及对固定显式字段数组/测试诊断使用 JSON.stringify。它们不构成已确认可利用漏洞，但不把带告警的扫描伪称零发现或完整安全审计。参数化 SQL、输入验证、认证与库风险仍需人工复核；扫描覆盖有限。

npm SBOM 381 组件、Rust 锁闭 SBOM 191 组件均有第三方 license 元数据；Rust 含可选与非活动平台依赖，非最终 WASM 可达性清单。主要为 MIT/Apache-2.0/BSD/ISC，另有 MPL-2.0、Unicode、BlueOak 等；分发时须保留相应声明并履行各自义务。SBOM 元数据核对不是许可证文本/法律合规审计。仓库自身没有 LICENSE，本轮未擅自选择全项目授权。

## 资源与运维

Cloud Docker 官方 Node 镜像 `node:24.22.1-trixie-slim` digest `sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a`，以非 root、network=none、pids-limit=128、memory=2g、memory-swap=2g、cpus=1 请求限制；只读挂载代码/既有运行库，临时 PostgreSQL、Node/Fastify 和 Caddy HTTPS 位于同一隔离容器。

但 Docker CgroupDriver=none，实际 memory.max=34359738368、memory.swap.max=max、cpu.max=400000 100000，未施加所需限制。短时 25 个真实 HTTPS 请求（含两路并发注册与登录）功能通过，P50 36 ms、P95 256 ms、最大 272 ms；这些数字不是受限 VPS 的容量结果，主机整体 memory.peak 不作为应用峰值。原始功能脚本输出 PASS 仅指请求断言；本报告与 evidence 将低配准入明确标为 BLOCKED。

新增只读 `check-resource-limits.mjs` 检查真实 cgroup，当前退出 1；不得仅凭 Docker 接受参数宣布模拟 PASS。20 GB 磁盘配额、持久容量、持续压力与灾备演练 NOT_RUN。未创建收费资源、接触生产或改变全局 cgroup。

## 审阅与清理

完整 Diff、历史 SQL 指纹、锁文件、源代码/文档链接、敏感信息与 Git 状态分别复核。保留历史提交、必要迁移/安全证据，不改旧项目，不 force push、不自动合并部署。临时数据库、测试凭据、TLS 测试根、生成物、下载缓存和测试文件在验证后清理；最终实际状态写入 evidence，未执行项目不得预先标 PASS。

## 本轮最终复核 — 基线55a742f之后

最新可复核数据见 [final-review.json](evidence/final-review.json)；此前verification.json为前一轮基线。所有命令仍在Cloud。七项工程检查最终独立执行，源码链接检查包含本轮截图引用。Rust fmt/native release/wasm release/wasm-bindgen均退出0，真实MLS和本地存储/附件浏览器检查退出0；实验与产品集成严格区分。

新增 `CONFIRM_CLOUD_AUTH=echo_native PGHOST=<临时Cloud socket> PGPORT=55432 node --import tsx scripts/check-expiry-races.mjs`，运行前必须有明确隔离数据库。观察到真实账户/设置锁等待后制造过期，断言拒绝且设备/注册零写入、邀请码零消费。观察者是临时集群测试管理员，业务Pool用非超级API角色。`check-auth-workflow.mjs`新增普通用户对11个管理读取入口的401及Origin/CSRF/过期标签页会话负例。

`check-app-browser.mjs`现在收集全部console error与HTTP错误。匿名session401、缺可信设备的conversations403是预期拒绝；二者分别保留明细，其他console或HTTP错误令脚本失败。原React保留key属性错误已实际复现并修复。pageerror=[]、unexpectedConsole=[]、unexpectedHttp=[]；不再沿用前文console未运行结论。手机安全记录表新增局部滚动、键盘右方向键和页面不溢出断言。七张截图位于[截图示例](screenshots/user-auth-desktop.png)，桌面1440×1000/1280×900、手机390×844，使用fullPage，不含测试密码或会话凭据。

Mermaid 11.4.1真实解析README图表、github-slugger 2.0.0校验目录锚点、所有相对链接和截图路径存在性；验证工具仅安装在Cloud临时目录，未改项目依赖。截图均来自真实Chromium，不是生成图。

本轮Semgrep重新运行同一官方固定规则提交，62发现（48 INFO、13 WARNING、1 ERROR）、0扫描错误，未关闭规则或把非零发现写成零发现。npm audit退出0、零公告；Cargo audit退出1、三项公告，活动WASM树仍含crypto-bigint 0.5.5，不采用不兼容的强制patch。npm/Cargo锁闭SBOM组件及许可证元数据复核，锁文件与依赖声明未变。SQL用pglast重新解析：旧001保留预期authorization语法错误，独立基线与002–006通过；真实双路径迁移/权限回归通过。未修改历史迁移来制造通过。

低配Docker重新请求memory=2g、memory-swap=2g、cpus=1，Debian trixie-slim实际读取memory.max=34359738368、cpu.max=400000 100000、memory.swap.max=max，Docker CgroupDriver=none；宿主cgroup未被委派。低配BLOCKED，持续负载、20GB配额、隔离应用峰值NOT_RUN。镜像digest与观测在最新证据中。

逐问题编号、原因、修复、位置和验证见[第三阶段最新台账](phase-three-report.md#最终深度复核与截图交付--2026-11-12)。最终审查覆盖Diff、锁文件、历史SQL、截图、秘密模式与工作区；远端SHA/完整文件树和blob哈希在推送后实际核对，结果以最终交付为准。

本轮最终SAST新增1项ERROR级工具发现位于 `scripts/check-auth-workflow.mjs` 的隔离测试HTTP请求：目标固定为127.0.0.1:3001，用于向真实API发送不同合成来源、CSRF和Origin负例；不发送真实凭据到外部网络，生产入口仍强制HTTPS。该项记录为经复核的测试传输告警，不忽略规则、不把扫描结果称为零发现；安全扫描整体仍PARTIAL。
