const DEV_PRINCIPAL_KEY = "forge-dev-principal";
const BEARER_TOKEN_KEY = "forge-bearer-token";

export type DevPrincipal = {
  userId: string;
  tenantId: string;
};

export function getDevPrincipal(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEV_PRINCIPAL_KEY);
}

export function setDevPrincipal(value: DevPrincipal): void {
  localStorage.setItem(DEV_PRINCIPAL_KEY, JSON.stringify(value));
}

export function clearDevPrincipal(): void {
  localStorage.removeItem(DEV_PRINCIPAL_KEY);
}

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BEARER_TOKEN_KEY);
}

export function setBearerToken(token: string): void {
  localStorage.setItem(BEARER_TOKEN_KEY, token);
}

export function clearBearerToken(): void {
  localStorage.removeItem(BEARER_TOKEN_KEY);
}

export function clearAuthStorage(): void {
  clearDevPrincipal();
  clearBearerToken();
}

export function parseDevPrincipal(raw: string): DevPrincipal | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DevPrincipal>;
    if (parsed.userId && parsed.tenantId) {
      return { userId: parsed.userId, tenantId: parsed.tenantId };
    }
    return null;
  } catch {
    return null;
  }
}
