export const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL ?? "https://remote.c3protect.com.br";

export async function fetchGateway(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(`${GATEWAY_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
