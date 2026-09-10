# syntax=docker/dockerfile:1

# Node 22 (mesma versão do CI, ver .github/workflows/tests.yml) sobre Debian
# slim (glibc) em vez de Alpine: evita divergência de libc com os binários que
# o Prisma eventualmente baixa para o schema/migration engine.
FROM node:22-bookworm-slim AS base
WORKDIR /app

# openssl: sem isto o Prisma não detecta a versão de libssl do sistema (avisa
# no build e no `migrate deploy`) e cai num default às cegas para o engine de
# schema/migration — instalar aqui remove a adivinhação.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# --- deps: só instala dependências, cacheia entre builds enquanto o código muda ---
# `prisma/` e `prisma.config.ts` entram aqui, apesar do estágio ser só de
# dependências: `npm ci` roda o `postinstall` (`prisma generate`), que precisa
# do schema presente NESTE estágio — sem isto, `prisma generate` falha com
# "Could not find Prisma Schema" sempre que o cache de `RUN npm ci` não puder
# ser reaproveitado (build limpo, cache podado, imagem base atualizada). Cópia
# ANTES de `package.json`/`package-lock.json` seria pior: invalidaria este
# cache a cada mudança em `prisma/schema.prisma` mesmo sem nenhuma dependência
# nova — por isso vem depois, na mesma ordem que já funciona no estágio
# `migrator` abaixo.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci

# --- builder: gera o client do Prisma e o build de produção do Next ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- migrator: imagem enxuta usada só para rodar `prisma migrate deploy` ---
# Precisa do CLI do Prisma e da pasta prisma/ completas, que o output
# `standalone` do Next (usado no runner abaixo) não inclui.
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
CMD ["npx", "prisma", "migrate", "deploy"]

# --- runner: imagem final de produção, só com o output standalone ---
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# `next start`/server.js do standalone escuta em `localhost` por padrão — sem
# isto o container não aceita conexão vinda de fora dele.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
