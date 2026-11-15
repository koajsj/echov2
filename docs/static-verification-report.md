# 本地静态验证报告

> 最新结果见[CI/MLS 续进报告](ci-mls-continuation-report.md)；上一轮 [Cloud 报告](cloud-review-report.md)与以下记录保留为历史。本机工具缺失、旧 main/PR 状态不描述当前。

## 当前续进 — 基线 06f37b9

**FIXED**：工作流在 check:source 前增加真实 build:server，没有排除脚本或放宽检查；[修复提交的完整 GitHub Actions](https://github.com/koajsj/echov2/actions/runs/43714563417)成功，包括原先跳过的 JS、Shell、固定 Rust 格式。后续原生测试纳入同一工作流；[工程提交 392c002 的完整运行](https://github.com/koajsj/echov2/actions/runs/43716261924) 也已全部成功，原始步骤证据见[工程运行](evidence/ci-mls-continuation/implementation-run.json)。最终仅记录证据的提交另行核对。

**PASS**：本轮类型、零 warning ESLint、Prettier、AST/源码引用、JS/Shell 语法、两 crate Rust 格式、前后端构建；新增 Rust 原生实验 Clippy 零 warning。固定 native/WASM 构建与真实浏览器/原生测试结果、工具版本及退出码记录在[本轮证据](evidence/ci-mls-continuation/results.json)。

**PARTIAL**：人工安全源码审查；同一库多实例通过不能替代跨实现互操作。**BLOCKED**：既有 Rust 锁仍三项漏洞与一项维护警告，新 SQLite 候选锁四项漏洞与一项维护警告（另有0459），cargo audit 均实际退出1且无 ignore；产品密码学准入未通过。**NOT_RUN**：专用 SAST、第三方审计、产品设备授权/离线墓碑/恢复与生产验证；未改的 SQL/账户端到端流程未重跑，不重复使用历史 PASS 冒充本轮运行。

## cb20341 后的本地核心复核

2026-11-15，整体 PARTIAL；代码、依赖锁、SQL及截图未改，前轮检查不冒充当前运行证据。本轮实际重新执行：typecheck、零 warning ESLint、AST（77份TS/TSX、256绑定）、source（161作者文件、400模块引用、127本地文档链接）均退出0；npm audit --package-lock-only --ignore-scripts 返回425依赖位置、零公告。Rust仅用现有 stable 执行 fmt --check，退出0。9份SQL摘要匹配，SBOM覆盖418个npm唯一组件与191个Rust注册表组件，许可字段齐全、Rust校验和匹配；有限私钥/token/密码URL模式扫描零命中。151个未改文件与cb20341逐字节一致，只有指定10份文档更新。全项目 Prettier 与 Git Diff 空白检查通过。没有新测试或服务。Rust 离线 WASM tree 再次退出101，默认 Cargo registry 无 index/cache/src，固定1.99.1与目标缺失；相关工程 BLOCKED。四项官方公告再次核实，未获得可离线兼容修复依据。三项 Terra 核心只读复核未确认新缺陷，不构成独立审计；范围与解除条件见[本轮台账](phase-three-report.md)。

## 前轮 cb20341 证据

2026-11-15，整体 **PARTIAL**；产品通信与生产准入 **BLOCKED**。本地main与GitHub main均为`c6068557a53ca5fd6b99fef07b88e00605c18578`。本次核心复核以`981948b9e8d201cab33762f57273ef9da13cd840`为干净起点，继续于`codex/native-hardening-review`，保留`d17b0d6`及全部有效历史，PR #4保持Draft。没有安装、下载或升级依赖，没有运行测试、构建、服务、SQL、迁移或生产操作；仅用现有项目依赖执行静态检查。前次客户端构建明确标为历史证据。

## 实际检查

本机Node24.17.0、npm11.13.0、项目TypeScript5.9.3、Prettier3.9.10、ESLint10.14.0及Vite8.3.6已存在。Rust已安装stable1.99.0，固定1.99.1及完整crate缓存缺失。最终集中修复结果见[本轮证据](evidence/final-convergence.json)，前次结果见[加固证据](evidence/native-hardening-review.json)，问题逐项见[修复台账](phase-three-report.md)。

本次CORE-01–04修改后重新执行类型、零warning Lint、AST与源码引用检查；AST为77份TS/TSX、256本地绑定，源码检查覆盖161作者文件、52 TS/JS、38 TSX、400字面模块引用。13份JS/MJS用node --check、1份Shell用bash -n均退出0；rustfmt仅格式检查退出0。npm锁审计当前425依赖位置/零公告；SBOM对应418个npm唯一组件、191个Rust组件，许可字段齐全、crate校验和匹配。9份SQL工件摘要及25份受保护工件原字节核对通过；有限私钥/token/密码URL模式扫描零命中，不宣称完整秘密检测。格式与本地链接在文档同步后复核；详细数值留在coreConvergence字段。

三项Terra只读复核及修复后复核未发现新增可确定回归；不构成第三方独立审计。缺getrandom索引导致本轮WASM活动树退出101；四项官方RustSec页面版本信息重核仍不能补齐活动feature/API兼容证明，未调整任何依赖。设备/邀请未知结果、数据库配置拒绝路径及IndexedDB阻塞的真实行为均未运行；分别标记NEEDS_RUNTIME_VERIFICATION或NOT_RUN，产品门禁仍BLOCKED。

| 检查                                                               | 状态                       | 结果与边界                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| main基线                                                           | PASS                       | `git ls-remote origin refs/heads/main`与本地main一致；不丢弃前序提交或未提交工作                                                                 |
| TypeScript                                                         | PASS                       | `npm run typecheck`，完整client/server/tools三份tsconfig，退出0                                                                                  |
| ESLint                                                             | PASS                       | `npm run lint`，原有规则、零warning上限，退出0                                                                                                   |
| Prettier                                                           | PASS                       | `npm run format:check`，全项目格式检查                                                                                                           |
| AST                                                                | PASS                       | `npm run check:ast`，真实解析TS/TSX及本地直接导出绑定；不是语义安全证明                                                                          |
| 源码/文件引用/文档链接                                             | PASS                       | `npm run check:source`，作者文件、TSX、字面引用和本地链接；动态/远程链接不属于该检查                                                             |
| 当前客户端构建                                                     | NOT_RUN                    | 最终集中修复不重新构建；复查f54fc345已有产物图，不将旧尺寸当最终提交尺寸                                                                         |
| Rust格式                                                           | PASS                       | `CARGO_NET_OFFLINE=true cargo +stable fmt --manifest-path crypto/mls-lab/Cargo.toml --all -- --check`退出0；仅格式                               |
| Cargo活动WASM树                                                    | NOT_AVAILABLE              | `在crypto/mls-lab运行cargo +stable tree --locked --offline --target wasm32-unknown-unknown`退出101，缺getrandom索引/缓存；未联网补依赖           |
| 依赖/许可证元数据                                                  | PASS                       | npm425个安装位置对应418个唯一name/version；Rust192个包包含根，对应SBOM191个组件；无缺失或多余组件、组件许可字段无缺失，声明与lock根一致          |
| SQL工件摘要                                                        | PASS                       | manifest源文件与001–008共9个SHA256匹配；SQL、manifest及依赖锁文件本轮未改                                                                        |
| SQL权限/外键/事务                                                  | PARTIAL                    | 人工追踪参数化查询、账号→session→device→conversation→group锁序、外键、索引、删除、008固定search_path/函数权限与幂等；不是SQL解析或数据库运行验收 |
| 安全源审查                                                         | PARTIAL                    | 逐模块追踪认证/CSRF/受众、授权锁、KeyPackage/身份边界、投递/删除、归档、脚本和配置；危险调用与敏感模式扫描、完整Diff复核。不能宣称零漏洞         |
| cargo-audit / Semgrep / PostgreSQL AST                             | NOT_AVAILABLE              | 本机缺可执行程序或SQL解析库；未安装、未替换或关闭安全规则                                                                                        |
| 当前npm公告扫描                                                    | PASS                       | npm audit --package-lock-only --ignore-scripts --json退出0，425依赖位置，0公告；仅查询安全元数据，没有安装                                       |
| 测试 / 服务 / HTTP / WSS / 浏览器 / 数据库 / 迁移 / Rust或WASM构建 | NOT_RUN                    | 无新测试、测试账号、临时库或应用进程，无部署                                                                                                     |
| 真实剪贴板 / 键盘读屏 / 懒加载交互 / 锁等待竞争                    | NEEDS_RUNTIME_VERIFICATION | 没有可用的已运行应用环境；未启动服务，未用模拟替代                                                                                               |
| MLS产品、可信设备、离线墓碑、密钥/灾备恢复、低配容量               | BLOCKED                    | 尚缺真实产品实现或准入证据，详见G1–G6；crypto-gate持续关闭                                                                                       |

历史verification.json里的npm锁摘要属于更早Cloud快照，与当前main的锁字节不同；当前package-lock SHA-256为`45bfa2fa9f668e62e6d301f36ec1e4813060cb55926e866591706f9a36ce8034`，Cargo.lock为`9ca0ca55441b04fc379e5f8e3bfacd20ec03d87464ab5d2d3efdbe2ec62760e6`。本轮与main/f54锁字节一致，npm/Rust SBOM组件集合仍匹配，保留旧证据不改历史摘要。

依赖许可证检查仅证明现有元数据覆盖，不构成法律或分发合规审计。没有用cargo fmt替代编译/安全审计；没有降低密码强度、放宽阈值、加入audit ignore或未经审查的fork。

## 前次实际构建分析（f54fc345）

以下为前次实际产物数据；本轮只复查已存在的图和文件，当前AuthPage/CSS等已有修改，因此不能作为最终提交的构建或体积PASS。

同一已有Vite配置前后构建，使用`generateBundle`读取module归属，再读取最终磁盘JS计数；gzip采用同一个`node:zlib gzipSync`默认配置，可能与Vite控制台估算不同。入口闭包沿静态imports求和，不把单个入口文件大小当全部初始加载成本。

| 指标                       |    拆分前 |    拆分后 |
| -------------------------- | --------: | --------: |
| 单独入口JS（字节）         | 1,014,265 |   224,364 |
| 用户入口静态JS闭包（字节） | 1,014,265 |   447,321 |
| 上述闭包gzip（字节）       |   301,796 |   143,345 |
| 全部JS合计（字节）         | 1,014,265 | 1,023,188 |
| JS分块数                   |         1 |        11 |
| 最大JS分块（字节）         | 1,014,265 |   395,857 |

初始JS减少55.9%，gzip减少52.5%；总JS因分块引用增加约0.9%，不是全量体积缩小。React/HeroUI共用基础保留共享分块；Recharts与BoardUI图表位于Dashboard动态路径，Remixicon已tree-shake，不属于用户静态闭包。用户工作区、管理工作区、Dashboard和归档是边界，较小管理页面保留组合；未配置逐依赖manualChunks。CSS仍约496.63kB（Vite估算gzip47.13kB），未为压缩体积删除主题/组件样式。真实网络预加载与路由切换仍需浏览器验证。

## 历史证据与交付

保留[11-12本地审查](evidence/local-security-review.json)、[PC审查](evidence/pc-review.json)、[最终Cloud复核](evidence/final-review.json)和[Cloud验证](evidence/verification.json)。八张PC截图未改，来自历史Cloud基线，不展示本轮Copy Button或懒加载运行结果。前序008未执行，不得假定数据库已具备其触发器。

用户明确允许后，三个gpt-6.1-terra子智能体只读复核Rust/MLS、服务端和前端；主智能体检查其证据并实施修复与最终Diff核验。无Computer Use或第三方独立审计；不把子智能体复核等同独立安全认证。全部写入限定echov2；旧echo-v2未修改。新分支包含前序未合并安全提交；提交/推送后以实际GitHub SHA和PR为准，不自动合并或部署。本报告不嵌入自引用提交SHA。
