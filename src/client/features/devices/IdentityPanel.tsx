import { useState } from "react";
import { Button, Input, Form } from "@heroui/react";
import type { SessionView } from "../../../shared/contracts";
import type {
  IdentityChallenge,
  IdentitySnapshot,
  SignedRoot,
  SignedAuthorization,
  AuthorizationRequest,
  IdentitySessionChallenge,
} from "../../../shared/crypto-identity";
import { IdentityClient } from "../../crypto/identity-client";
import { api } from "../../app/api";
import { useApiQuery } from "../../app/use-api-query";
import { ServiceState } from "../../components/ServiceState";
export function IdentityPanel({
  session,
  onChanged,
}: {
  session: SessionView;
  onChanged: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const query = useApiQuery<IdentitySnapshot>(
    "/v1/crypto-identity",
    revision,
    session.sessionId,
  );
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [request, setRequest] = useState(""),
    [fingerprint, setFingerprint] = useState("");
  const [verifiedRootKey, setVerifiedRootKey] = useState("");
  const [canSign, setCanSign] = useState(false);
  const [retry, setRetry] = useState<{
    root: SignedRoot;
    authorization: SignedAuthorization;
  } | null>(null);
  const options = { method: "POST", sessionId: session.sessionId };
  async function work(action: (client: IdentityClient) => Promise<void>) {
    if (pending) return;
    setPending(true);
    setMessage("");
    let client: IdentityClient | undefined;
    try {
      client = new IdentityClient();
      await action(client);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "身份操作未完成，请核实状态。",
      );
    } finally {
      client?.close();
      setPending(false);
      setRevision((v) => v + 1);
    }
  }
  function binding() {
    if (!session.deviceId) throw new Error("请先登记本机设备。");
    return {
      accountId: session.account.id,
      publicId: session.account.publicId,
      deviceId: session.deviceId,
      origin: location.origin,
    };
  }
  async function challenge(client: IdentityClient) {
    const local = await client.run<{ devicePublicKey: string }>({
      kind: "open",
      binding: binding(),
    });
    return api<IdentityChallenge>("/v1/crypto-identity/challenges", {
      ...options,
      body: {
        operationId: crypto.randomUUID(),
        devicePublicKey: local.devicePublicKey,
      },
    });
  }
  async function initialize(client: IdentityClient) {
    const local = await client.run<{
      pendingInitialization: {
        root: SignedRoot;
        authorization: SignedAuthorization;
      } | null;
    }>({ kind: "open", binding: binding() });
    const signed =
      retry ??
      local.pendingInitialization ??
      (await client.run<{
        root: SignedRoot;
        authorization: SignedAuthorization;
      }>({
        kind: "bootstrap",
        binding: binding(),
        challenge: await challenge(client),
      }));
    setRetry(signed);
    await api("/v1/crypto-identity/initialize", { ...options, body: signed });
    await client.run({
      kind: "accept",
      binding: binding(),
      snapshot: await api<IdentitySnapshot>("/v1/crypto-identity", {
        sessionId: session.sessionId,
      }),
    });
    setVerifiedRootKey(signed.root.statement.publicKey);
    setCanSign(true);
    setRetry(null);
    setMessage("根身份与本机授权链已验证。加密通信仍未开放。");
  }
  return (
    <section className="panel">
      <h2>账户根身份与设备签名授权</h2>
      <ServiceState {...query} />
      {!session.deviceId && (
        <>
          <p>
            新浏览器请先登记设备。曾在此浏览器完成授权的设备，请用本机密钥恢复会话绑定。
          </p>
          <Button
            isDisabled={pending}
            onPress={() =>
              void work(async (client) => {
                const account = {
                  accountId: session.account.id,
                  publicId: session.account.publicId,
                  origin: location.origin,
                };
                const local = await client.run<{ deviceId: string } | null>({
                  kind: "locate",
                  binding: account,
                });
                if (!local)
                  throw new Error(
                    "本浏览器没有该账户的本机密钥，请先登记新设备。",
                  );
                const c = await api<IdentitySessionChallenge>(
                  "/v1/crypto-identity/session-challenges",
                  {
                    ...options,
                    body: {
                      operationId: crypto.randomUUID(),
                      deviceId: local.deviceId,
                    },
                  },
                );
                const proof = await client.run({
                  kind: "bind-session",
                  binding: { ...account, deviceId: local.deviceId },
                  challenge: c,
                });
                await api("/v1/crypto-identity/bind-session", {
                  ...options,
                  body: proof,
                });
                onChanged();
              })
            }
          >
            用本机密钥恢复会话绑定
          </Button>
        </>
      )}
      {query.data?.root && (
        <>
          <p>
            服务器根版本 {query.data.root.statement.version} ·
            公开目录记录（需本机核实）：
          </p>
          <code style={{ overflowWrap: "anywhere" }}>
            {query.data.root.statement.publicKey}
          </code>
          <p>
            本机服务器记录：
            {query.data.authorizations.find(
              (a) =>
                a.authorization.credential.challenge.deviceId ===
                session.deviceId,
            )?.state ?? "pending"}
            。该记录需本机验证，且不代表通信已启用。
          </p>
          <Button
            isDisabled={pending || !session.deviceId}
            onPress={() =>
              void work(async (client) => {
                const verified = await client.run<{
                  rootPublicKey: string;
                  hasRootKey: boolean;
                }>({
                  kind: "accept",
                  binding: binding(),
                  snapshot: await api<IdentitySnapshot>("/v1/crypto-identity", {
                    sessionId: session.sessionId,
                  }),
                });
                setVerifiedRootKey(verified.rootPublicKey);
                setCanSign(verified.hasRootKey);
                setMessage(
                  "本机密钥、固定根公钥与授权签名已核实。通信仍为 BLOCKED。",
                );
              })
            }
          >
            验证本机授权链
          </Button>
        </>
      )}
      {query.data && !query.data.root && (
        <>
          <p>
            首次初始化将建立此账户的第一个根公钥。本机丢失后目前无法恢复根私钥；请仅在自己信任的浏览器配置中操作。
          </p>
          <Button
            isDisabled={pending || !session.deviceId}
            isPending={pending}
            onPress={() => {
              if (
                window.confirm(
                  "在此浏览器建立账户根身份？密钥恢复尚未开放；密码登录不能恢复此根私钥。",
                )
              )
                void work(initialize);
            }}
          >
            初始化根身份与本机授权
          </Button>
        </>
      )}
      {query.data?.root && (
        <>
          <Form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const expectedRootKey = String(data.get("rootKey"));
              void work(async (client) => {
                const result = await client.run<{
                  request: AuthorizationRequest;
                  fingerprint: string;
                }>({
                  kind: "request",
                  binding: binding(),
                  challenge: await challenge(client),
                  root: query.data!.root!,
                  expectedRootKey,
                });
                setRequest(JSON.stringify(result.request));
                setFingerprint(result.fingerprint);
                setMessage(
                  "请求已签名，尚未授权。在五分钟内传给持有根私钥的可信设备，并通过独立渠道核对下方完整指纹。",
                );
              });
            }}
          >
            <h3>在新设备创建授权请求</h3>
            <label>
              从可信设备独立核对的完整根公钥
              <Input
                name="rootKey"
                required
                pattern="[0-9a-f]{64}"
                maxLength={64}
              />
            </label>
            <Button type="submit" isDisabled={pending || !session.deviceId}>
              生成本机签名请求
            </Button>
          </Form>
          {verifiedRootKey && (
            <p>
              本机已核实根公钥（供独立核对）：
              <code style={{ overflowWrap: "anywhere" }}>
                {verifiedRootKey}
              </code>
            </p>
          )}
          {request && (
            <>
              <label>
                公开授权请求
                <textarea readOnly value={request} rows={5} />
              </label>
              <p>本机请求指纹：</p>
              <code style={{ overflowWrap: "anywhere" }}>{fingerprint}</code>
            </>
          )}
          {canSign ? (
            <Form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const raw = String(data.get("request"));
                const expectedFingerprint = String(data.get("fingerprint"));
                void work(async (client) => {
                  if (raw.length > 8192) throw new Error("授权请求过大。");
                  const authorization = await client.run<SignedAuthorization>({
                    kind: "authorize",
                    binding: binding(),
                    request: JSON.parse(raw) as AuthorizationRequest,
                    expectedFingerprint,
                  });
                  await api("/v1/crypto-identity/authorize", {
                    ...options,
                    body: { authorization },
                  });
                  setMessage(
                    "设备签名授权已登记。请在新设备点击验证本机授权链；加密通信仍未开放。",
                  );
                });
              }}
            >
              <h3>在持有根私钥的可信设备上签发</h3>
              <p>
                确认这是你正在添加的设备，通过独立渠道核对完整请求指纹。粘贴请求本身不建立信任。
              </p>
              <label>
                新设备的公开签名请求
                <textarea name="request" required maxLength={8192} rows={5} />
              </label>
              <label>
                从新设备独立核对的完整请求指纹
                <Input
                  name="fingerprint"
                  required
                  pattern="[0-9a-f]{64}"
                  maxLength={64}
                />
              </label>
              <Button type="submit" isDisabled={pending || !session.deviceId}>
                核对并签发设备授权
              </Button>
            </Form>
          ) : (
            <p>
              本机尚未确认持有可签发授权的根私钥。已有根设备须先验证本机授权链；其它设备不能转授。
            </p>
          )}
        </>
      )}
      <p role="status">{message}</p>
      <p className="muted">
        当前仅提供完整公钥与请求指纹的人工双向核对。SAS / QR、根轮换、恢复、产品
        MLS 与消息通信仍为 BLOCKED。Worker 不防御同源脚本入侵。
      </p>
    </section>
  );
}
