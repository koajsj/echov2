# 静态验证报告

2026-11-11，第二阶段。只记录实际执行检查。源码修改/FIXED、静态PASS、运行NOT_RUN分别对待；整体PARTIAL。没有测试、构建、服务、SQL、数据库、VPS或部署行为。

## 工具与命令

- Node 24.17.0、Git 2.50.1、Python 3.15.2（现有工具）。
- 扩大本地只读工具盘点后发现`/Users/wyc/Desktop/vela/node_modules/typescript/lib/typescript.js`，版本5.9.3；只加载工具，没有复制/安装依赖或导入Vela/Echo应用。
- 本机既有npm缓存中还发现Prettier 3.9.10与ESLint 10.14.0；直接用node调用其文件，未执行npx或安装。Prettier整理本轮改动及22个原有格式问题；ESLint缺配置插件而阻塞。
- 同一现有工具目录的Babel parser 7.29.9 / generator 7.29.8用于本轮改动TS/TSX解析与整理；不是Prettier或完整类型检查。
- 项目依赖仍未安装，无node_modules和锁文件；未通过shim/假声明/替代版本模块制造全项目检查成功。

实际执行：

```sh
node scripts/check-typescript-ast.mjs /Users/wyc/Desktop/vela/node_modules/typescript/lib/typescript.js
node --experimental-vm-modules scripts/check-source.mjs
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js --noEmit --strict --noUnusedLocals --noUnusedParameters --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM src/shared/contracts.ts src/shared/capabilities.ts src/shared/validation.ts src/client/crypto/attachment-crypto.ts src/client/crypto/readiness.ts
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.client.json
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.server.json
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.tools.json
node /Users/wyc/.npm/_npx/360157ef5dc9b5fb/node_modules/prettier/bin/prettier.cjs --check .
node /Users/wyc/.npm/_npx/360157ef5dc9b5fb/node_modules/eslint/bin/eslint.js . --max-warnings 0
bash -n scripts/preflight.sh
git diff --check
```

另外执行所有JS/MJS的`node --check`，Python文本/JSON/资源/命名/敏感规则检查，以及源码调用链、Schema/权限和完整Diff审阅。静态工具只解析，不链接、导入或求值应用。

## 结果

| 状态                       | 实际范围/结果                                                                  | 限制                                                     |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| PASS                       | TypeScript5.9.3 AST：57个TS/TSX，180个直接本地命名导入，0错误，退出0           | 不检查第三方导出/完整类型                                |
| PASS                       | 共享契约/能力/校验、附件AEAD、readiness共5文件局部strict，退出0                | 完整应用依赖未解析                                       |
| PARTIAL                    | check-source：99文件、34普通模块、245字面量引用、53本地文档链接，0失败；退出2  | 此脚本跳过26个TSX语法，已由独立AST补充；保留Node实验警告 |
| PASS                       | 5个JSON解析，3个JS/MJS逐个node --check，bash -n退出0                           | 没有执行运维脚本                                         |
| PASS                       | 34个echo CSS Token，0悬空；3个本地资源引用存在                                 | 不证明渲染、CSP/主题/手机视觉效果                        |
| PASS                       | 旧185文件路径/内容SHA-256不变；001/002、Logo、tokens与HEAD逐字节一致           | 文件指纹不是用户数据备份或运行验收                       |
| PARTIAL                    | 定向私钥/GitHub/AWS token/带口令DB URL/危险DOM规则0命中，源码旧SDK模式0命中    | 不等于完整SAST、秘密无遗漏或供应链无漏洞                 |
| PARTIAL                    | 23表与003/004约束/权限/事务/锁序/API/未知结果调用链及Terra复核                 | SQL未解析/执行；动态权限、并发、未知提交待验证           |
| PASS                       | Git Diff空白、命名/本地引用、目录与忽略边界审阅                                | 最终暂存集合/远端核对见交付回复                          |
| PASS                       | Prettier3.9.10全项目check退出0                                                 | 支持的格式文件，不是语义/SQL验证                         |
| BLOCKED                    | ESLint10.14.0实际退出2，缺typescript-eslint配置插件                            | 没有Lint通过声明或安装绕过                               |
| BLOCKED                    | 三组完整tsc实际退出2，各一个TS2688（vite/client或node入口缺失）                | 不伪装完整类型PASS，不安装补齐                           |
| NOT_AVAILABLE              | Semgrep、SQL解析器、完整锁依赖/SBOM/许可证闭包                                 | 无锁依赖闭包，不能完整核查                               |
| FALSE_POSITIVE             | main.tsx为Vite入口；001–004数字为迁移顺序；features/data为源码；文档旧协议比较 | 不能因此删源码、改历史迁移或把文档当运行依赖             |
| NOT_RUN                    | 测试、构建、启动、SQL/迁移/DB、浏览器、真实加密/跨设备/删除/备份/性能、VPS部署 | 本轮明确禁止                                             |
| NEEDS_RUNTIME_VERIFICATION | 新旧成员隔离、session/撤销并发、媒体生命周期、原生恢复、视觉与资源预算         | 相应未编写核心能力仍BLOCKED                              |

全项目三组tsc均实际退出2：client缺`vite/client`，server/tools缺`node`类型入口（各1个TS2688），语义检查不能继续。状态BLOCKED；不是工具不存在，也不是类型检查PASS。局部5文件在严格项目相关选项下退出0，只证明相应共享类型/附件基础，不涵盖React/HeroUI/Fastify/pg兼容性。

Prettier全项目check退出0（源码/样式/文档/支持的配置文件；SQL无格式插件不在其覆盖内）。ESLint实际退出2，ERR_MODULE_NOT_FOUND：typescript-eslint；引擎存在但所需typescript-eslint/eslint-plugin-react-hooks/globals配置依赖在项目不可用，状态BLOCKED。Semgrep/PostgreSQL语法解析器不可得，记NOT_AVAILABLE；没有npx或安装补齐。SQL仅文本/权限调用链审查，未执行任何SQL、迁移或真实DB查询。供应链许可证仅沿第一阶段来源事实和本轮无新增依赖核对；无lock闭包不能声称完整许可证/SBOM/漏洞扫描通过。

## 独立只读复核

Terra A：本地无MLS/provider/WASM，不存在假SDK；Service门禁、Commit不推进及附件边界检查。Terra B：字段/权限/锁序/幂等；发现003旧历史风险，修正后核对排他锁/中止/列权限和会话复验，未再确认确定性回归。Terra C：删除操作未绑定及到期状态不可查已修，附件异步释放/URL及身份隔离静态复核。主智能体复查修改与Diff，没有并发修改同一文件。

上述结论只针对所查静态范围；没有运行安全PASS，不等于不存在其他漏洞。

## 证据边界与后续

PASS=列明静态检查通过；FIXED=源码修改；PARTIAL=只覆盖部分能力；BLOCKED=已知必要条件不满足；NOT_AVAILABLE=工具/材料缺失；NOT_RUN=未执行；NEEDS_RUNTIME_VERIFICATION=必须在后续获授权环境验证；FALSE_POSITIVE=规则命中已解释，不证明整个项目安全。

真实MLS、跨浏览器/设备、Provider/IndexedDB故障、撤权、新旧成员隔离、离线墓碑、媒体投递、物理purge、备份隔离恢复、权限/并发与低配容量均NOT_RUN/NEEDS_RUNTIME_VERIFICATION。相应缺少源码的功能仍BLOCKED，不能只说“代码完成待测”。完整差距与解除条件见[阶段报告](phase-two-report.md)及[计划](native-implementation-plan.md)。
