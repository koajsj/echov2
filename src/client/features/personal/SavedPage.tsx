import { EmptyState } from "../../components/EmptyState";
export function SavedPage() {
  return (
    <section>
      <header className="page-heading">
        <h1>私人收藏</h1>
        <p>只属于你的加密空间。</p>
      </header>
      <div className="panel">
        <EmptyState
          icon="bookmark"
          title="先建立私人加密组"
          description="BLOCKED · 私人收藏、草稿和联系人备注依赖本人设备的 MLS 组及删除状态。当前不会把这些内容写入明文服务器或 localStorage。"
        >
          <a href="#recovery">查看可信设备与密钥条件</a>
        </EmptyState>
      </div>
    </section>
  );
}
