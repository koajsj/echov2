# 自主通信架构

2026-11-11。本文是整体目标设计；当前已有第一阶段源码基础，实际范围见[实施计划](native-implementation-plan.md)。标准事实与候选证据集中在[密码学研究](native-cryptography.md)及[来源](research-sources.md)。条件决策见[决策表](decisions.md)，不把设计中的未接通流程记作实现。

## 系统边界

```text
用户浏览器
  React / HeroUI / 本地搜索与预览
  独立 crypto Worker：原生 MLS 库、身份校验、本地状态
  IndexedDB：加密本地记录、持久 outbox、删除状态
          │ HTTPS / WSS（仅密文及必要元数据）
        Caddy
          │ loopback / Unix socket
  Fastify 单进程、模块化单体
  accounts / identity / delivery / media / lifecycle / admin
          │                     │
  PostgreSQL：echo_native       本地密文媒体目录
          │
  获授权的离线运维：独立删除日志目标 + 加密灾备介质
```

Worker 是职责隔离和串行化工具，同源 XSS 仍能调用它；不是硬件安全隔离。浏览器是否可持久化、可清理、可抗回滚，见[身份与恢复](native-identity-devices-recovery.md)。外部备份介质不提供在线聊天服务，不引入常驻日志微服务；没有该介质时明确削减灾备保证。

## 单体模块

| 模块 | 职责 | 禁止承担 |
| --- | --- | --- |
| accounts | 唯一密码认证、注册模式/邀请码、稳定用户 ID、可变用户名、HTTP 会话 | 从密码推导 MLS 身份或自动信任新设备 |
| identity（AS） | 发布账户公钥/设备授权凭证、验证链和撤销、公钥目录、KeyPackage 发布准入 | 持有账户根私钥、替用户签发根授权、解密 MLS |
| delivery（DS） | 顺序日志、Commit 候选裁决、幂等、Welcome/Proposal 投递、游标/确认、路由索引 | 宣称密文内部有效或将路由成员表当 MLS 真相 |
| media | 有界上传、密文文件持久化、授权下载、附件引用 | 预览/转码、解密、嗅探正文、公开静态文件目录 |
| lifecycle | 删除记录、到期任务、文件清理、重试、注销状态 | 伪造客户端 MLS 删除事件或远程擦除保证 |
| admin | 唯一超级管理员、元数据查询、封禁、配置、审计、真实运营聚合 | 正文检索、恢复用户私钥、伪造 Commit |

认证服务只有 accounts 一套。AS 是 MLS 的身份信任职责，不是第二套密码认证。路由、业务角色和密码学成员各有用途，客户端必须校验其一致性，不能凭服务器列表增加信任。

## 主要数据流

1. 注册事务创建用户、密码哈希及邀请码消费；客户端生成根/设备身份，完成可信绑定后才启用设备通信权限。密码登录仅建立服务会话，不授予新设备旧 MLS 状态。
2. 设备本地生成 KeyPackage 和私有材料；服务器只收公开包与身份绑定。邀请方领用一次性包，由 MLS 原生库产生 Add/Commit/Welcome。服务端原子保存关联投递；客户端根据经核验的回传处理 pending。
3. 普通消息：输入 → 本地版本化业务结构 → 库加密 → 本地状态和原样 outbox 原子落盘 → DS 持久化/去重 → 收件方按序补齐、原生验签解密、业务校验、墓碑门控 → 展示。
4. 附件：客户端单次 AEAD → HTTPS 密文暂存 → 消息引用事务 → 授权下载 → 本地解密预览。私密名称、MIME、预览和内容密钥不进入外层字段。
5. 删除/注销：认证授权 → 持久删除意图 → 独立删除证据（严格恢复保证的条件）→ 隐藏/清理/重试 → 游标通知。在线和离线设备优先消费删除状态；MLS 内层通知仍需客户端发送，服务器不能代发。

精确接口与错误语义只在[协议](native-protocol-delivery.md)定义；表、事务和保留只在[数据模型](native-data-lifecycle.md)定义；不复写第二份规范。

## 前端与管理端

保留 React、Vite、HeroUI v3、Echo 原创图标及 Achromatic Ledger 方向。后续迁移先审查依赖，保留系统无衬线正文/16px 聊天、衬线展示标题、五档字号及150–250ms动效/reduced-motion；不迁移 Matrix hook、事件模型或伪装适配器。

用户端按认证、会话、联系人、设备、安全/恢复、数据中心拆分。所有请求按用户/设备隔离，登出销毁内存授权，不自动删除用户未导出的唯一密钥；本地缓存导出/清除由用户明确确认。聊天搜索、转发、导出均经同一解密与删除门控。

管理端使用 accounts 的同一认证内核，独立管理 session audience、路由和重新认证；单超级管理员以数据库唯一约束绑定用户，不给普通管理员读原始密文权限。面板包括用户/设备/注册/邀请/审计/安全/访问/流量/增长/密文计数/配置/备份记录。账号封禁即撤 HTTP/WSS 权限，群组密码学移除另外追踪，不能显示成已完成。

运营来源固定：登录结果来自认证处理器、消息数来自已接受业务投递元数据、流量来自经核验的 Caddy 记录、设备/浏览器/OS 来自可伪造 UA 的标注解析。路径只记录路由模板，IP 本地 GeoIP 未提供合法数据库时显示未知；零、未知、缺失、失败分开。无正文、密钥或原始请求体追踪。图表、分页、CSV、异步任务均须有真实后端状态，备份执行器未启用前不出现成功按钮。

## 当前目录约定

源码采用 `src/client/{app,components,features,crypto,styles}`、`src/server/{accounts,identity,devices,delivery,messaging,lifecycle,admin,storage,api}`、`src/shared`，部署配置和运维脚本分放 `deploy`、`scripts`。media处理器未实现，不预建空目录。仅确有复用才进入shared；普通TS/目录kebab-case、React PascalCase、Hook use前缀，遵循工具标准配置名。

当前实际目录包含README、11份研究docs、源码、package声明、未执行SQL和部署基础；无node_modules/锁文件/构建产物。架构还不是可上线实现，尤其身份信任、持久化和DS无效Commit仍受[门槛 G1–G6](native-implementation-plan.md)约束。
