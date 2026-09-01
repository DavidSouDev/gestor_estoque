import { cache } from "react";
import { notFound } from "next/navigation";
import { empresaService } from "@/app/services/empresa.service";

/**
 * ACC-03 / D-07. Caminho GATEADO por status de pagamento: o gate mora dentro de
 * `empresaService.findBySlug`, então uma empresa bloqueada chega aqui como
 * `null` e vira um 404 real — indistinguível de um slug que nunca existiu.
 *
 * NÃO usar em nenhuma superfície pré-autenticação. Quem precisa apenas do
 * visual da loja (a tela de login do admin) usa `getEmpresaBranding`: usar este
 * loader lá transformaria o login de uma empresa bloqueada em 404.
 */
export const getEmpresaCatalogo = cache(async (slug: string) => {
  const empresa = await empresaService.findBySlug(slug);

  if (!empresa) {
    notFound();
  }

  return empresa;
});

/**
 * D-09. Leitura de branding DELIBERADAMENTE sem gate de status.
 *
 * Existe para que a tela de login de uma empresa BLOQUEADA continue respondendo
 * 200. Se ela virasse 404, o cliente que quer pagar não conseguiria logar, não
 * alcançaria a tela de bloqueio e não teria caminho até o pagamento — o
 * objetivo da fase se inverteria (04-RESEARCH.md, Achado crítico 2).
 *
 * O objeto devolvido carrega `bloqueada: boolean`, e cabe ao CHAMADOR (a página
 * de login) decidir renderizar branding genérico (D-09 / T-04-12). NUNCA
 * acrescentar um gate de status aqui: a decisão é de apresentação, não de
 * acesso.
 *
 * Somente o cache de request do React. `unstable_cache` e `'use cache'` são
 * cross-request e reintroduziriam a janela de staleness que quebraria a
 * reativação automática de ACC-04 / D-08 (decisão `[01-02]` do STATE.md).
 */
export const getEmpresaBranding = cache(async (slug: string) => {
  const empresa = await empresaService.findBrandingBySlug(slug);

  if (!empresa) {
    notFound();
  }

  return empresa;
});
