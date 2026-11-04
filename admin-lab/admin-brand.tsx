// Vite bundles the official artwork locally; no extra domain or API request.
const logoUrl = new URL("../public/smp-symbol-white.svg", import.meta.url).href;

export function AdminBrand() {
  return (
    <div className="admin-brand">
      <img className="admin-brand-logo" src={logoUrl} width={98} height={46} alt="부산대학교 금융투자학회 SMP" />
      <span>사이트 관리</span>
    </div>
  );
}
