import Constants from "expo-constants";

const explicitApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
const expoHost = Constants.expoConfig?.hostUri?.split(":")[0];
export const apiUrl = explicitApiUrl || `http://${expoHost || "127.0.0.1"}:5173/api`;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = unknown>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!(options?.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiUrl}${endpoint}`, { ...options, headers, credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `API Error: ${response.status}` })) as Record<string, unknown>;
    throw new ApiError(response.status, typeof payload.error === "string" ? payload.error : `API Error: ${response.status}`, typeof payload.code === "string" ? payload.code : undefined, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
