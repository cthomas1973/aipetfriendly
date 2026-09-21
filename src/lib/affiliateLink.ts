// Arma el link de afiliado (matt_tool) para un producto de beneficios_productos
// cuando se lo referencia como "producto sugerido" desde una guia o un post del
// blog (ver RelatedLinksBlock.tsx). Reusa el mismo patron que
// SubscriptionComponents.tsx: el matt_tool se resuelve en el servidor
// (api/beneficios.js) y se agrega como query param al permalink.

let cachedMattTool: Promise<string> | null = null;

export function getMattTool(): Promise<string> {
  if (!cachedMattTool) {
    cachedMattTool = fetch('/api/beneficios?grupo=alimentos')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => String(data?.mattTool ?? ''))
      .catch(() => '');
  }
  return cachedMattTool;
}

export function buildProductAffiliateLink(permalink: string, mattTool: string): string {
  if (!permalink) return '';
  if (!mattTool) return permalink;
  return permalink + (permalink.includes('?') ? '&' : '?') + `matt_tool=${mattTool}`;
}
