export function browserPrerequisites(): { secureContext: boolean; webCrypto: boolean; indexedDb: boolean; worker: boolean } {
  return { secureContext: window.isSecureContext,webCrypto: typeof window.crypto?.subtle !== "undefined",indexedDb: typeof window.indexedDB !== "undefined",worker: typeof Worker !== "undefined" };
}
