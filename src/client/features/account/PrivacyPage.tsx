export function PrivacyPage() {
  return (
    <section>
      <header className="page-heading">
        <h1>隐私</h1>
        <p>默认最少披露。未接通的协议能力不显示虚假开关。</p>
      </header>
      <div className="operation-list">
        <article className="operation-row">
          <div>
            <h2>通知与状态</h2>
            <p>
              当前客户端不创建聊天正文通知，也不发送正在输入、已读或在线状态；服务端仍可观察连接、IP
              与时间。
            </p>
          </div>
          <span>当前行为</span>
        </article>
        <article className="operation-row">
          <div>
            <h2>资料、联系人与备注</h2>
            <p>
              没有公开头像、个人简介或明文备注上传。加密私人组尚未建立，相关同步保持关闭。
            </p>
          </div>
          <span>BLOCKED</span>
        </article>
        <article className="operation-row">
          <div>
            <h2>邀请与黑名单</h2>
            <p>
              群邀请、联系人授权和加密黑名单依赖可信设备与 MLS
              组，不提供只在本机界面生效的伪限制。
            </p>
          </div>
          <span>BLOCKED</span>
        </article>
      </div>
      <p className="muted">
        设备和服务端仍可能保留必要元数据。TLS、前端策略与真实端到端加密是不同保护层。
      </p>
    </section>
  );
}
