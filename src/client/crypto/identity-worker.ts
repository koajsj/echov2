import { identityCommand } from "./identity-engine";
import type { IdentityCommand } from "./identity-engine";
const scope = globalThis as unknown as {
  onmessage:
    | ((event: MessageEvent<{ id: string; command: IdentityCommand }>) => void)
    | null;
  postMessage: (value: unknown) => void;
};
scope.onmessage = (event) => {
  const { id, command } = event.data;
  void identityCommand(command)
    .then((result) => scope.postMessage({ id, result }))
    .catch(() =>
      scope.postMessage({
        id,
        error:
          "身份操作未完成。请核实本机密钥、指纹、挑战期限及服务器记录后重试；不要重建密钥覆盖未知结果。",
      }),
    );
};
