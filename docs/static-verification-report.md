# 本地静态验证报告

2026-11-12，基线 `c6068557a53ca5fd6b99fef07b88e00605c18578`，独立分支 `codex/native-security-closure`。**整体PARTIAL，产品与生产安全准入BLOCKED。** 本轮不安装/下载依赖、不测试/构建/启动、不执行SQL或操作真实数据、不访问VPS。GitHub读取、官方公告读取和显式授权的锁文件audit仅查询元数据，没有安装包。

## 实际命令与状态

本机已有Node24.17.0、npm11.13.0、独立TypeScript5.9.3、Prettier3.9.10、ESLint10.14.0入口和Rust stable1.99.0。项目node_modules不存在；独立工具不等于已安装项目依赖。精确输出、退出码和限制见[本地证据](evidence/local-security-review.json)。

| 检查                                             | 实际结果                                                                                                                                                                      | 状态                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 基线/PR #2                                       | 本地main与GitHub main均c606855；PR #2 MERGED、合并commit一致，干净工作区上创建独立分支                                                                                        | PASS                                          |
| 全项目TS/TSX AST                                 | `node scripts/check-typescript-ast.mjs /Users/wyc/Desktop/vela/node_modules/typescript/lib/typescript.js`；76文件、258本地导入绑定，零错误                                    | PASS，仅语法/直接导出                         |
| 源码/引用/本地文档                               | `node --experimental-vm-modules scripts/check-source.mjs /Users/wyc/Desktop/vela/node_modules/typescript/lib/typescript.js`；覆盖全部作者文件、TSX和字面模块引用/本地文档路径 | PASS，仅该范围                                |
| 局部strict                                       | 既有编译器对shared三文件、client/crypto三文件和metadata-archive共7文件执行完整strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes/noUnused检查，noEmit                 | PASS，仅7文件                                 |
| 三份项目tsconfig                                 | 同一既有tsc分别执行client/server/tools；各退出2，缺vite/client或node类型入口                                                                                                  | NOT_AVAILABLE；没有用局部strict替代全项目类型 |
| ESLint                                           | 既有eslint入口实际退出2，项目配置缺typescript-eslint；未禁用规则、替换配置或恢复node_modules                                                                                  | NOT_AVAILABLE                                 |
| Prettier                                         | 使用既有3.9.10对全项目`--check .`，修改后再核验                                                                                                                               | PASS                                          |
| JS/Shell语法                                     | Node逐份`--check`全部js/mjs；`bash -n scripts/preflight.sh`                                                                                                                   | PASS，仅语法                                  |
| Rust格式                                         | `cargo +stable fmt --manifest-path crypto/mls-lab/Cargo.toml --all -- --check`退出0；不调用缺失的固定工具链                                                                   | PASS，仅格式                                  |
| npm audit                                        | `npm audit --package-lock-only --ignore-scripts --json`退出0，425个依赖条目，公告total=0                                                                                      | PASS，仅当前npm公告查询                       |
| Cargo活动树                                      | `cargo +stable tree --locked --offline --target wasm32-unknown-unknown -i crypto-bigint`退出101，缺getrandom索引/缓存                                                         | NOT_AVAILABLE；不能声称当前活动路径重验通过   |
| cargo audit / Semgrep / PostgreSQL AST           | 本机无cargo-audit、semgrep、pglast或SQL解析库，未安装                                                                                                                         | NOT_AVAILABLE                                 |
| SQL/Schema/最小权限                              | 人工检查008原子事务、owner限制、固定search_path、限定表名、函数权限、回填范围与manifest摘要；历史001–007/基线SQL保持字节一致                                                  | PARTIAL；不是SQL解析或执行PASS                |
| 定向安全源审查                                   | 追踪认证/CSRF/角色/事务锁、投递门禁、删除/恢复、key边界、SQL参数、日志/外链及脚本数据来源；另执行危险调用/秘密模式扫描                                                        | PARTIAL；未使用完整SAST工具，不宣称零漏洞     |
| 依赖/许可证静态核对                              | package声明与lock根相同；npm SBOM418个唯一name/version均覆盖lock425个安装位置（7个为重复位置）；Rust SBOM191个非根组件对应lock192包；既有组件许可元数据无缺失                 | PASS，仅元数据；非法律/分发合规审计           |
| 目录/命名/引用/敏感信息/Diff                     | 作者文件路径、空目录、忽略内容、相对链接及完整Diff复核；无私钥/token模式命中、无Matrix运行依赖、历史SQL/lock未改                                                              | PASS，仅静态范围                              |
| 旧echo-v2                                        | 只读核对保留基线指纹；所有写入限定新项目                                                                                                                                      | PASS，见证据范围                              |
| 测试/构建/HTTP/WSS/浏览器/数据库/迁移            | 未执行，没有测试账号、临时数据库、服务或新截图                                                                                                                                | NOT_RUN                                       |
| MLS/可信设备/产品离线删除/密钥恢复/灾备/低配容量 | 无本轮运行证据，部分仍缺产品实现和必要依赖/外部证据                                                                                                                           | BLOCKED                                       |

部分既有Node解析API会发ExperimentalWarning；它不是类型检查或产品运行结果。全项目类型与Lint无法执行时不得给工程检查整体PASS。cargo fmt只用本机stable，不证明固定1.99.1及WASM兼容。

## 修复与复核方法

问题编号、根因、代码位置、修复和解除条件统一见[第三阶段报告](phase-three-report.md)。本轮修改WSS挂载/撤销锁序、期限/背压/断连清理、管理员账号状态版本，以及008设备公开材料撤销。旧SQL、npm/Cargo锁和密码学算法不改；未生成MLS适配空壳。

主智能体完成源码审查后另行阅读完整Diff，复核所有调用方、参数/响应、锁顺序及SQL权限。未派子智能体，没有独立审计机构或另一审查者；不能把分轮复核描述成第三方安全审计。008未执行，运行权限、触发器回滚、旧数据补偿、并发领包、WSS撤销竞态及状态409行为均NOT_RUN。

## 历史证据的范围

[PC审查](evidence/pc-review.json)、[最终Cloud复核](evidence/final-review.json)、[Cloud验证](evidence/verification.json)保留历史真实构建、临时PostgreSQL、浏览器、MLS和SAST记录。八张README截图仍来自该Cloud基线，本轮未重拍。历史PASS只适用于其提交与覆盖范围，不能验收本轮新增008和并发修复。

历史Cargo audit有三项未解决公告和proc-macro-error2维护警告；本轮逐项核对官方修复版本和锁闭反向路径，未忽略公告。详情及原生API/完整Provider解除条件唯一见[密码学](native-cryptography.md)。历史Semgrep有发现，未把人工分类结果改写成零告警。历史2GB/1核请求未实际生效，不能用旧短时Cloud负载推导目标VPS容量。

GitHub交付在独立分支，提交/推送后以实际远端SHA/PR和完整树比对为准；不自动合并main，不部署。执行证据文件不写自引用提交SHA，最终SHA由交付回复和PR head给出。
