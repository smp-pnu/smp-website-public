import { api } from "../server-storage";
export async function request<T = unknown>(
  path: string,
  method = "GET",
  value?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return (
    await api("/cms" + path, {
      method,
      signal,
      ...(value !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(value),
          }
        : {}),
    })
  ).json();
}
