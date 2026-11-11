# 最终静态验证报告

2026-11-11，第三阶段。基线1473395，整体PARTIAL。本报告覆盖当前源码；第二阶段记录由Git历史及阶段报告保留。本轮没有测试、构建、服务、SQL/迁移、数据库、浏览器、VPS或部署操作。

## 实际工具

Node24.17.0、Git2.50.1、Python3.15.2、gh2.95.0；使用本机既有TypeScript5.9.3：`/Users/wyc/Desktop/vela/node_modules/typescript/lib/`，既有npm缓存Prettier3.9.10及ESLint10.14.0：`/Users/wyc/.npm/_npx/360157ef5dc9b5fb/node_modules/`。直接node调用工具文件，没有npx、安装、复制依赖、导入其他项目应用或启动服务。项目没有node_modules/锁文件。

## 实际检查及结果

| 状态                       | 范围/结果                                                                                                      | 不能证明                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| PASS                       | TS AST：66个TS/TSX、234个本地直接命名导入，0错误、退出0                                                        | 不是完整类型或第三方导出/API检查                               |
| PASS                       | 6个无外部依赖文件局部严格tsc，退出0：共享契约/能力/校验、attachment-crypto/readiness、metadata-archive         | 不涵盖React/HeroUI/Fastify/pg/Node类型兼容性                   |
| PARTIAL                    | check-source：110作者文件、39普通模块、30TSX由此脚本跳过、309字面量模块引用，文档链接全存在，0失败；退出2      | 此脚本本身不解析TSX，独立AST补充；实验警告保留；非运行/SQL验证 |
| PASS                       | 5个JSON解析；3个JS/MJS逐一node --check；bash -n preflight                                                      | 未执行运维或应用代码                                           |
| PASS                       | 全项目Prettier3.9.10格式检查退出0                                                                              | SQL没有格式插件，不表示语义正确                                |
| PASS                       | 34个echo CSS Token无悬空；本地SVG/入口引用存在；目录/文件命名、无空目录、资源/模块/文档引用核对                | 没有浏览器/主题/手机视觉验证；未变布局不是已验收               |
| PASS                       | 旧185文件路径/SHA-256不变；001–004、Logo、tokens、package与基线字节一致                                        | 不是用户数据备份或密码学证明                                   |
| PARTIAL                    | 全部源码/配置与权限调用链、23表及005文本、锁序/幂等/未知结果/内外层版本复核                                    | SQL未解析/执行，事务权限/并发运行待验证                        |
| PARTIAL                    | 定向私钥/GitHub/AWS/密码DB URL/危险DOM规则零命中，src/deploy旧Matrix运行模式零命中                             | 不等于完整SAST、秘密扫描无遗漏或供应链安全                     |
| PASS                       | 完整文件/忽略边界、分轮Diff审阅及git diff --check                                                              | 最终暂存与远端发布结果以交付回复为准                           |
| BLOCKED                    | 三组完整tsc实际各退出2：client缺vite/client；server/tools缺node类型入口，均TS2688                              | 不使用假声明、外部替代版本或删检查配置制造PASS                 |
| BLOCKED                    | ESLint实际退出2 ERR_MODULE_NOT_FOUND，缺typescript-eslint；配置插件依赖不可用                                  | 引擎存在但检查未能执行，不称Lint PASS                          |
| NOT_AVAILABLE              | Semgrep、ShellCheck、PostgreSQL语法解析器pglast/pg_query、Caddy/systemd-analyze、依赖锁闭包/完整SBOM许可证核对 | psql程序存在但依约未运行；不拿SQL文本检查代替解析或执行        |
| NOT_RUN                    | 测试、构建、应用/服务、SQL/迁移/DB、浏览器/设备/真实MLS/归档加解密/删除/恢复/性能/VPS/部署                     | 本轮明确禁止，没有隐藏运行或临时安装                           |
| NEEDS_RUNTIME_VERIFICATION | Cookie/CSRF/角色并发、撤销与WSS竞态、SQL/权限/迁移、AEAD文件/CSV工具行为、视觉与低配资源                       | 相应未实现MLS/群组/墓碑/系统备份仍BLOCKED，不是只缺运行验收    |
| FALSE_POSITIVE             | main.tsx工具入口；001–005有意义迁移序号；features/data为源码；文档旧Matrix比较；已批准备用Typography Token     | 不因此删有效源码/历史，文档比较不是运行依赖                    |

## 可复核命令

```sh
node scripts/check-typescript-ast.mjs /Users/wyc/Desktop/vela/node_modules/typescript/lib/typescript.js
node --experimental-vm-modules scripts/check-source.mjs
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js --noEmit --strict --noUnusedLocals --noUnusedParameters --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM src/shared/contracts.ts src/shared/capabilities.ts src/shared/validation.ts src/client/crypto/attachment-crypto.ts src/client/crypto/readiness.ts src/client/features/data/metadata-archive.ts
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.client.json
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.server.json
node /Users/wyc/Desktop/vela/node_modules/typescript/lib/tsc.js -p tsconfig.tools.json
node /Users/wyc/.npm/_npx/360157ef5dc9b5fb/node_modules/prettier/bin/prettier.cjs --check .
node /Users/wyc/.npm/_npx/360157ef5dc9b5fb/node_modules/eslint/bin/eslint.js . --max-warnings 0
node --check scripts/check-source.mjs
node --check scripts/check-typescript-ast.mjs
node --check eslint.config.js
bash -n scripts/preflight.sh
git diff --check
```

还执行Python只读文件/JSON/命名/CSS Token/本地资源/指纹/敏感模式核对；SQL仅人工文本和API→事务→grant/constraint调用链。没有执行SQL，包括校验查询、迁移或provision。完整tsc/ESLint错误原样保存在本机临时日志，退出2未降级为警告或PASS。

## 复核发现与处理

- 改名/用户名重用与重新认证身份错配：改为session UUID密码查询，再事务内重验。
- 设备目录LIMIT100截断：改为50+1完整keyset页，调用方同步。
- 管理员操作缺少真实执行：服务会话/设备/邀请码撤销和事件人工审阅已接API，当前角色/new-auth/CSRF/session及锁内审计；服务撤销不宣称MLS Remove。
- 元数据导出：同一REPEATABLE READ快照、总量/集合上限、无静默截断；本地归档固定AEAD/KDF/版本/账号/origin/结构校验，只读预览。无旧state或墓碑导入。
- 事件审阅外键/枚举/最小权限、过期会话有界清理、数据库等待和系统日志/core边界已审阅。历史迁移不改；005实际权限仍待隔离数据库验证。
- 删除重复DataPage首屏列表，转现有TrashPage；CSV/文件下载复用、URL释放。未删不明文件或创建空模块。

本轮由主智能体分轮源码与完整Diff复核，无本轮子智能体/独立外部审计。第一/二阶段研究或Terra结论不是当前实际provider、真实通信、撤权或恢复证据。

## 剩余结论

G1–G6全部仍BLOCKED，原因、残余风险和最小替代见[最终报告](phase-three-report.md)及各主题规格。不能宣称完整产品、安全通信或生产部署准备完成。静态PASS只指上表明确范围，所有真实安全与资源效果未验证；本阶段交付后停止，不进入新阶段。
