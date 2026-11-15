import { lazy, Suspense } from "react";
import { Button } from "@heroui/react";
import { Brand } from "../components/Brand";
import { Icon } from "../components/Icon";
import { PublicUserId } from "../components/PublicUserId";
import { ServiceState } from "../components/ServiceState";
import { AuthPage } from "../features/account/AuthPage";
import { userNavigation } from "./navigation";
import { useSession } from "./use-session";
const Workspace = lazy(() =>
  import("./Workspace").then((module) => ({ default: module.Workspace })),
);
export function UserApp({ page }: { page: string }) {
  const realm = useSession("user");
  const session = realm.query.data;
  const active = page === "login" ? "conversations" : page;
  if (realm.anonymous)
    return (
      <main id="main" className="auth-entry" tabIndex={-1}>
        <Brand />
        <AuthPage audience="user" onAuthenticated={realm.changed} />
      </main>
    );
  if (!session)
    return (
      <main id="main" tabIndex={-1}>
        <ServiceState {...realm.query} />
      </main>
    );
  return (
    <div className="user-shell">
      <aside className="user-sidebar">
        <Brand />
        <nav aria-label="用户导航">
          {userNavigation.map((item) => (
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
        <small>Private by Design · PC</small>
      </aside>
      <main id="main" tabIndex={-1}>
        <header className="session-bar">
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
        <Suspense fallback={<p role="status">正在加载页面…</p>}>
          <Workspace
            key={`${session.sessionId}:${realm.revision}:${active}`}
            session={session}
            page={active}
            onChanged={realm.changed}
          />
        </Suspense>
        <p role="status">{realm.message}</p>
      </main>
    </div>
  );
}
