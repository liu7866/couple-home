import { AsyncLocalStorage } from 'node:async_hooks';

export const requests = new AsyncLocalStorage();
export function currentRequest() {
  const context = requests.getStore();
  if (!context) throw new Error('请求上下文不可用');
  return context;
}
export async function headers() { return currentRequest().request.headers; }
export const env = new Proxy({}, { get: (_target, name) => currentRequest().env[name] });
