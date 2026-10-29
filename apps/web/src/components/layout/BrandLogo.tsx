/** Shared mark; adjacent brand text supplies the accessible name. */
export function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/logo192.png" width={32} height={32} alt="" className="shrink-0 rounded-lg" />
      <span>VideoQ</span>
    </span>
  );
}
