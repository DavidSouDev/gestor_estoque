import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Origem do bucket público da R2 (produtos/combos/logos são `<img src>` cru,
 * sem `next/image` — ver `lib/storage/r2.ts`). Sem isto no `img-src`, o CSP
 * abaixo quebraria toda imagem do catálogo e do admin.
 *
 * Lida por ACESSOR e não por `const` de nível de módulo pelo mesmo motivo já
 * registrado em `lib/billing/asaas/config.ts`: `R2_PUBLIC_URL` pode estar
 * ausente em ambiente de teste/CI, e isto não pode derrubar o carregamento do
 * config inteiro — apenas os testes não teriam imagens (não é o caso: nenhum
 * teste carrega este arquivo).
 */
function origemDoBucketPublico(): string | null {
  const url = process.env.R2_PUBLIC_URL;

  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * CSP SEM nonces (ver `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
 * § "Without Nonces"): a app usa `style={{...}}` inline em vários componentes
 * (cores de marca por empresa, escolhidas pelo lojista), o que exige
 * `'unsafe-inline'` em `style-src` de qualquer jeito. Adotar nonces via
 * `proxy.ts` obrigaria TODA página a renderização dinâmica (perde ISR/cache
 * estático do catálogo público) só para a metade de `script-src` do CSP não
 * ganhar nada, já que `style-src` continuaria com `'unsafe-inline'` mesmo
 * assim.
 *
 * Isto NÃO é a defesa primária contra XSS — essa continua sendo o escape
 * automático do React (o projeto não usa `dangerouslySetInnerHTML` em lugar
 * nenhum). O que este CSP fecha, mesmo com scripts/estilos inline permitidos,
 * é: nenhum recurso de origem externa não listada carrega (`default-src`),
 * nenhum plugin/objeto embutido (`object-src`), nenhum <base> alheio
 * sequestrando URLs relativas (`base-uri`), nenhum form submetendo para fora
 * (`form-action`) e nenhum iframe alheio enquadrando o admin (`frame-ancestors`,
 * reforçado por `X-Frame-Options` para navegadores antigos).
 */
function cspHeader(): string {
  const origemImagens = origemDoBucketPublico();
  const imgSrc = ["'self'", "data:", "blob:", origemImagens].filter(Boolean).join(" ");

  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc}`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Build standalone (`.next/standalone`) para a imagem Docker: copia só o
  // subconjunto de `node_modules` rastreado pelas rotas, sem exigir
  // `npm install` na imagem final de runtime (ver `Dockerfile`). Só faz
  // sentido no self-host: na Vercel (`process.env.VERCEL` setado por ela)
  // esse modo quebra o build deles, que espera o próprio formato serverless
  // (gera `ENOENT .../.next/next-server.js.nft.json`).
  output: process.env.VERCEL ? undefined : "standalone",

  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Sem efeito fora de HTTPS (o navegador ignora o header em HTTP puro) —
          // inofensivo enviar sempre, e cobre o deploy que já serve com TLS sem
          // exigir configuração extra.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
