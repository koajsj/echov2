# PostgreSQL 迁移边界

本轮只编写，未执行SQL，也未连接数据库。`001-initial.sql`后接`002-runtime-permissions.sql`，必须先由运维创建独立数据库`echo_native`及`echo_native_owner`/`echo_native_api`；owner负责DDL，API不授超级用户、建库、建角色、BYPASSRLS或schema所有权。PUBLIC对数据库的CONNECT/TEMP及public schema CREATE也应由运维审查撤销，只允许本机访问。

迁移采用事务且不在应用启动自动运行。本轮没有迁移执行器、已执行迁移版本表或SQL解析/数据库验收；现有文件不可直接在旧Matrix数据库运行。初始Schema为空库设计，不清空/覆盖任何既有库；目标若有echo schema先停止，不能改写历史迁移使其看似已成功。

权限文件只开放现有基础API需要的DML，审计表仅INSERT、超级管理员列不可由API更新；身份授权/凭证/群组创建/KeyPackage写入暂不开放。设备状态另有受限转换触发器，登记pending不表示可信。完整数据职责/索引/保留见[数据规格](../docs/native-data-lifecycle.md)。

超级管理员通过独立离线`scripts/provision-admin.ts`和owner连接建立；保护输入密码文件，不通过URL/命令行传密码内容。该工具实际会写数据库，**本轮未运行，运行前须另行授权**；不提供公开HTTP bootstrap。设备根签发、群组创建和加密发送仍受MLS门槛约束。

第二阶段新增`003-route-version-and-delivery.sql`和`004-invitation-idempotency.sql`，严格顺序001→002→003→004；全部未执行。001/002保留已提交字节。003在事务内锁定有关表并检查没有旧消息/inbox或非零head；不满足即中止、不改数据，需要独立审核的历史迁移方案。新的应用源码依赖003/004，不能在只有001/002的Schema上启动。停写维护、角色/约束/权限及锁影响必须在授权隔离数据库核查，不能把文件静态审阅当迁移成功。
