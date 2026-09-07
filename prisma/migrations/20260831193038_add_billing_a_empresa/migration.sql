-- CreateEnum
CREATE TYPE "StatusAcesso" AS ENUM ('TRIAL', 'EM_DIA', 'CARENCIA', 'BLOQUEADO', 'CANCELADO', 'VITALICIO');

-- CreateEnum
CREATE TYPE "CausaTransicaoAcesso" AS ENUM ('REGISTRO', 'BACKFILL', 'AVALIACAO_SESSAO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "acessoAte" TIMESTAMP(3),
ADD COLUMN     "acessoVitalicio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "trialFim" TIMESTAMP(3),
ADD COLUMN     "ultimoStatusAuditado" "StatusAcesso";

-- CreateTable
CREATE TABLE "AuditoriaAcesso" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "statusAnterior" "StatusAcesso",
    "statusNovo" "StatusAcesso" NOT NULL,
    "causa" "CausaTransicaoAcesso" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaAcesso_empresaId_createdAt_idx" ON "AuditoriaAcesso"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditoriaAcesso" ADD CONSTRAINT "AuditoriaAcesso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== Backfill (D-11, D-12, D-13) — DML ADICIONADO A MAO apos --create-only =====
-- Duplo AT TIME ZONE (Pitfall 4): parede local -> instante -> parede UTC,
-- para nao depender do parametro TimeZone da sessao do Postgres.
-- O intervalo abaixo e de 15 dias e nao de 14: D-18 fixa o dia do cadastro como
-- dia 0, garantindo que a promessa de 14 dias nunca entregue menos que 14 dias
-- completos.
UPDATE "Empresa"
SET "trialFim" = (
      (
        date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo') + interval '15 days')
        AT TIME ZONE 'America/Sao_Paulo'
      ) AT TIME ZONE 'UTC'
    ),
    "ultimoStatusAuditado" = 'TRIAL'
WHERE "deletedAt" IS NULL
  AND "trialFim" IS NULL;

-- O gerador de UUID abaixo e core do PostgreSQL desde a 13 (sem pgcrypto);
-- @default(uuid()) do Prisma e gerado no CLIENTE e nao vale para INSERT cru.
INSERT INTO "AuditoriaAcesso" ("id", "empresaId", "statusAnterior", "statusNovo", "causa", "createdAt")
SELECT gen_random_uuid(), e."id", NULL, 'TRIAL', 'BACKFILL', now()
FROM "Empresa" e
WHERE e."deletedAt" IS NULL
  AND e."trialFim" IS NOT NULL;
