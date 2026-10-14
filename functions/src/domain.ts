export function emailMatchesDomain(email: string, domain: string): boolean {
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain) return false;
  const host = email.trim().toLowerCase().split("@")[1];
  return host === normalizedDomain;
}

export function parseEmailList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
