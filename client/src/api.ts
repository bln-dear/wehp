export interface ApiUser {
  id: string;
  name: string;
  hp: number;
  isWorking: boolean;
  updatedAt?: string;
  potionReadyAt: string | null;
}

export interface ApiBoardEntry {
  id: string;
  type: "tired" | "potion" | "message";
  text: string;
  time: string; // ISO string
  submitterId: string;
  claimedBy: string[];
}

export interface DashboardResponse {
  me: ApiUser | null;
  users: ApiUser[];
  board: ApiBoardEntry[];
  stats: {
    avgHp: number;
    activeCount: number;
    totalCount: number;
    potionCooldownMs: number;
  };
}

class ApiRequestError extends Error {}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(data?.error || "Request failed.");
  }
  return data as T;
}

export const api = {
  checkAccountExists: (name: string) =>
    request<{ exists: boolean }>(`/api/account/exists?name=${encodeURIComponent(name)}`),

  signIn: (name: string, password: string) =>
    request<{ userId: string; user: ApiUser }>("/api/session", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    }),

  getDashboard: (userId: string) =>
    request<DashboardResponse>(`/api/dashboard?userId=${encodeURIComponent(userId)}`),

  toggleBreak: (userId: string) =>
    request<ApiUser>("/api/break/toggle", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  drainHp: (userId: string, text: string) =>
    request<{ user: ApiUser; entry: ApiBoardEntry }>("/api/drain", {
      method: "POST",
      body: JSON.stringify({ userId, text }),
    }),

  sendPotion: (userId: string, text: string) =>
    request<{ user: ApiUser; entry: ApiBoardEntry }>("/api/potion", {
      method: "POST",
      body: JSON.stringify({ userId, text }),
    }),

  sendMessage: (userId: string, text: string) =>
    request<ApiBoardEntry>("/api/message", {
      method: "POST",
      body: JSON.stringify({ userId, text }),
    }),

  claimPotion: (userId: string, entryId: string) =>
    request<{ user: ApiUser; entry: ApiBoardEntry }>(`/api/potion/${entryId}/claim`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
};

export function getWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export { ApiRequestError };
