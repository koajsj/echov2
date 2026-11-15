# OpenMLS browser laboratory

2026-11-15 在 Codex Cloud 安装固定 Rust 1.99.1、wasm32 目标和 wasm-bindgen CLI 0.2.105，完整解析 Cargo.lock，native/WASM 构建及双上下文浏览器实验通过。cargo audit 仍退出 1（三项漏洞、一项维护警告），产品门禁保持 BLOCKED。当前证据与兼容性结论见[密码学规格](../../docs/native-cryptography.md)及[Cloud 报告](../../docs/cloud-review-report.md)。

**PARTIAL. Not an application adapter or production encryption feature.** The
application crypto gate remains closed. Credentials here are synthetic labels;
there is no trusted account binding, encrypted provider snapshot, durable outbox,
rollback protection or recovery protocol. Never use real identities or messages.

Pinned: Rust 1.99.1, OpenMLS 0.9.2, RustCrypto/basic credential/traits 0.6.0,
tls_codec 0.5.0, wasm-bindgen 0.2.105. Cargo.lock is checked in. Suite is fixed to
`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519` (1). Default MemoryStorage is
volatile. No new cryptographic algorithms or provider implementations are used.

Build in an authorized Cloud workspace with these official tools installed:

```sh
cd crypto/mls-lab
cargo fmt --all -- --check
cargo build --release --locked
cargo build --release --locked --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/echo_mls_lab.wasm --out-dir pkg --target web
cd ../..
npm run dev:client
# In another Cloud terminal, with Chromium available:
npm run check:mls:browser
npm run check:local-crypto
```

Generated `pkg` and Cargo `target` are temporary build artifacts. Delete generated
`pkg` after browser tests before author-file linting; generated bindings include
upstream lint directives and are not source to edit or commit. Production client
builds do not import this lab. Tests use two isolated browser contexts and real
WASM for KeyPackage validation, Welcome, Commit, application AEAD, replay and
invalid-input rejection, pending/staged discard and member removal (epoch 1→2).
They do not prove authenticated multi-device delivery or provider crash recovery.

`src/client/crypto/operation-store.ts` separately tests strict IndexedDB transactions
and Web Locks with opaque synthetic bytes. It cannot make MemoryStorage persistent
or establish that a caller supplied a complete, correctly sealed provider snapshot.
Sending remains forbidden until those boundaries and identity binding are reviewed.

The current Cloud `cargo audit` fails with no ignored advisories. `crypto-bigint 0.5.5` remains in the active WASM graph; `libcrux-kem 0.0.9` is locked but its optional backend is inactive; `proc-macro-error2` is locked under `cfg(hax)` and inactive by default. No compatible released provider fix was found. The complete tree, features and official advisory evidence are linked from the authoritative [cryptography review](../../docs/native-cryptography.md).
