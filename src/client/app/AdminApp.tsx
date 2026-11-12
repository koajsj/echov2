import { Button } from "@heroui/react";
import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { PublicUserId } from "../components/PublicUserId";
import { ServiceState } from "../components/ServiceState";
import { AuthPage } from "../features/account/AuthPage";
import { adminNavigation } from "./navigation";
import { useSession } from "./use-session";
import { AdminWorkspace } from "./AdminWorkspace";
export function AdminApp({ page }: { page: string }) {
  const realm = useSession("admin");
  const session = realm.query.data;
  const active = page === "login" ? "admin" : page;
  if (realm.anonymous)
    return (
      <main id="main" className="admin-auth-entry" tabIndex={-1}>
        <Brand />
        <p className="eyebrow">ECHO CONTROL · 独立管理入口</p>
        <AuthPage audience="admin" onAuthenticated={realm.changed} />
        <a href="/">返回用户登录</a>
      </main>
    );
  if (!session)
    return (
      <main id="main" tabIndex={-1}>
        <ServiceState {...realm.query} />
      </main>
    );
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Brand />
        <span>CONTROL CENTER</span>
        <span>{session.account.username}</span>
        <PublicUserId value={session.account.publicId} />
        <Button
          variant="ghost"
          isPending={realm.pending}
          onPress={() => {
            void realm.logout();
          }}
        >
          登出
        </Button>
      </header>
      <aside className="admin-sidebar">
        <nav aria-label="管理员导航">
          {adminNavigation.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active === item.id ? "page" : undefined}
            >
              <Icon name={item.symbol} />
              {item.label}
            </a>
          ))}
        </nav>
        <small>权限独立 · 操作留痕</small>
      </aside>
      <main id="main" tabIndex={-1}>
        <AdminWorkspace
          key={`${session.account.id}:${realm.revision}:${active}`}
          session={session}
          page={active}
        />
        <p role="status">{realm.message}</p>
      </main>
    </div>
  );
}
