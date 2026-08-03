/**
 * Django `EmailValidator` の移植（DRF EmailField が使う）。エラーは "Enter a valid email address."。
 * user_regex / domain_regex / literal(IP) / domain_allowlist=["localhost"] を再現。
 * IDN(punycode) 変換は稀なため未対応（ASCII ドメインは一致）。
 */
const USER_RE =
  /^(?:[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(?:\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f!#-[\]-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")$/i;
const DOMAIN_RE =
  /^(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z0-9-]{2,63}$/i;
const LITERAL_RE = /^\[([A-F0-9:.]+)\]$/i;
const DOMAIN_ALLOWLIST = new Set(["localhost"]);

function isIpv46(addr: string): boolean {
  // IPv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr)) {
    return addr.split(".").every((o) => Number(o) <= 255);
  }
  // IPv6（簡易: hex グループと :: を許容）
  return /^[0-9A-Fa-f:]+$/.test(addr) && addr.includes(":");
}

function validateDomainPart(domain: string): boolean {
  if (DOMAIN_RE.test(domain) && !/-\./.test(domain) && !/\.$/.test(domain)) {
    // domain_regex は各ラベル末尾が非ハイフン。TLD も (?<!-)。上の RE で概ね担保。
    return true;
  }
  const m = LITERAL_RE.exec(domain);
  if (m) return isIpv46(m[1]);
  return false;
}

/** Django EmailValidator 相当。妥当なら true。 */
export function isValidEmail(value: string): boolean {
  if (!value || !value.includes("@")) return false;
  const at = value.lastIndexOf("@"); // rsplit("@", 1)
  const userPart = value.slice(0, at);
  const domainPart = value.slice(at + 1);
  if (!USER_RE.test(userPart)) return false;
  if (DOMAIN_ALLOWLIST.has(domainPart)) return true;
  return validateDomainPart(domainPart);
}

/** SignupPolicy.normalized_email: strip + lower。 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
