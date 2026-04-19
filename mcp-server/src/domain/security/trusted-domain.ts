export function isTrustedDomain(url: string, trustedDomains: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return trustedDomains.some((domain) => {
      const d = domain.toLowerCase();
      return hostname === d || hostname.endsWith(`.${d}`);
    });
  } catch {
    return false;
  }
}

