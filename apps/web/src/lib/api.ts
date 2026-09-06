const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const language = document.documentElement.dataset.language || document.documentElement.lang || "en";
  headers.set("X-App-Language", language);
  const response = await fetch(`${apiUrl}${endpoint}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `API Error: ${response.status}` })) as Record<string, unknown>;
    throw new ApiError(response.status, typeof payload.error === "string" ? payload.error : `API Error: ${response.status}`, typeof payload.code === "string" ? payload.code : undefined, payload);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export { apiUrl };
