import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, Input, Form } from "@heroui/react";
import type { Audience } from "../../../shared/contracts";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
import { api } from "../../app/api";
export function AuthPage({
  audience,
  onAuthenticated,
}: {
  audience: Audience;
  onAuthenticated: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const registration = useApiQuery<{ mode: string }>(
    "/v1/registration",
    revision,
  );
  const mode = registration.data?.mode;
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [retryingRegistration, setRetryingRegistration] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const registrationId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username"));
    const password = String(data.get("password"));
    setPending(true);
    setMessage("");
    try {
      if (register) {
        const invitation = String(data.get("invitation") ?? "");
        setRetryingRegistration(true);
        await api("/v1/accounts", {
          method: "POST",
          body: {
            operationId: registrationId.current,
            username,
            password,
            ...(invitation
              ? {
                  invitation,
                }
              : {}),
          },
        });
        setMessage("注册已完成，请登录。登录不会自动建立设备信任。");
        setRegister(false);
        setRetryingRegistration(false);
        registrationId.current = crypto.randomUUID();
        form.reset();
      } else {
        await api("/v1/sessions", {
          method: "POST",
          audience,
          body: {
            username,
            password,
            audience,
          },
        });
        onAuthenticated();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "操作未完成，请核实后重试。",
      );
    } finally {
      const passwordInput = form.elements.namedItem("password");
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
      if (!register && !retryingRegistration) form.reset();
      setPending(false);
    }
  }
  return (
    <section className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">ECHO NATIVE · 第三阶段</p>
        <h1>
          {audience === "admin" ? "看清系统，守住边界。" : "让交流，回到彼此。"}
        </h1>
        <p>独立通信架构。客户端密钥。清晰的信任边界。</p>
        <p className="muted">
          MLS 尚未集成。通信准入尚未通过，不提供未经验证的加密聊天。
        </p>
      </div>
      <div className="panel auth-form">
        <h2>
          {audience === "admin"
            ? "管理员登录"
            : register
              ? "创建账号"
              : "欢迎回来"}
        </h2>
        <Form
          ref={formRef}
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label>
            用户名
            <Input
              name="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]+"
              autoComplete="username"
              readOnly={pending || retryingRegistration}
            />
          </label>
          <label>
            密码
            <Input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          <div hidden={!register}>
            <label>
              邀请码（按注册模式）
              <Input
                name="invitation"
                autoComplete="off"
                maxLength={128}
                minLength={32}
                disabled={!register}
                required={mode === "invite" && !retryingRegistration}
                readOnly={pending || retryingRegistration}
              />
            </label>
          </div>
          <Button
            type="submit"
            isPending={pending}
            isDisabled={
              register &&
              !retryingRegistration &&
              mode !== "open" &&
              mode !== "invite"
            }
          >
            {register
              ? retryingRegistration
                ? "核实并重试原注册"
                : "注册"
              : "登录"}
          </Button>
        </Form>
        {retryingRegistration && (
          <>
            <p>
              请重新输入原密码重试原注册，或返回登录核实账号。用户名和邀请码保持原请求；不会自动发起另一注册。
            </p>
            <Button
              variant="ghost"
              isDisabled={pending}
              onPress={() => {
                if (!confirm("确认已核实原注册结果，开始另一注册操作？"))
                  return;
                registrationId.current = crypto.randomUUID();
                setRegister(true);
                setRetryingRegistration(false);
                formRef.current?.reset();
                setMessage("");
              }}
            >
              核实后开始另一注册
            </Button>
          </>
        )}
        {audience === "user" && (
          <Button
            variant="ghost"
            isDisabled={
              pending ||
              (!register && mode === "closed" && !retryingRegistration)
            }
            onPress={() => {
              setRegister(!register);
              setMessage("");
            }}
          >
            {register
              ? "已有账号，返回登录"
              : retryingRegistration
                ? "返回核实原注册"
                : "创建新账号"}
          </Button>
        )}
        {audience === "user" && (
          <>
            <ServiceState {...registration} />
            <p className="muted">
              {mode === "open"
                ? "当前开放注册"
                : mode === "invite"
                  ? "当前需要邀请码注册"
                  : mode === "closed"
                    ? "当前注册关闭"
                    : "注册模式未知，不能提交新注册"}
            </p>
            <Button
              variant="ghost"
              isDisabled={registration.loading || pending}
              onPress={() => setRevision((v) => v + 1)}
            >
              刷新注册模式
            </Button>
          </>
        )}
        {audience === "user" && (
          <Button
            variant="secondary"
            onPress={() => location.assign("/admin#login")}
          >
            管理员登录
          </Button>
        )}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
