-- Fase 3 (GTW-01..GTW-04): ledger de eventos de webhook do Asaas, mapa de
-- checkout -> empresa e identificadores externos do Asaas na Empresa.
--
-- Pitfall 7: esta migration APENAS adiciona o valor 'WEBHOOK_PAGAMENTO' ao enum.
-- Nao ha (e nao pode haver) nenhum INSERT/UPDATE que USE esse valor aqui: o
-- prisma migrate roda cada migration em transacao, e o Postgres recusa usar um
-- valor de enum adicionado dentro da mesma transacao. Um backfill que precise da
-- nova causa vai em uma SEGUNDA migration.
--
-- Nenhuma coluna de status/carencia e criada: status de acesso e derivado por
-- avaliarAcesso() sobre os fatos de billing, nunca armazenado (BILL-01 / D-16).

-- AlterEnum
ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WEBHOOK_PAGAMENTO';

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "CheckoutAsaas" (
    "id" TEXT NOT NULL,
    "asaasCheckoutId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutAsaas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoWebhookAsaas" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "empresaId" TEXT,
    "processadoEm" TIMESTAMP(3),
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoWebhookAsaas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutAsaas_asaasCheckoutId_key" ON "CheckoutAsaas"("asaasCheckoutId");

-- CreateIndex
CREATE INDEX "CheckoutAsaas_empresaId_createdAt_idx" ON "CheckoutAsaas"("empresaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventoWebhookAsaas_eventoId_key" ON "EventoWebhookAsaas"("eventoId");

-- CreateIndex
CREATE INDEX "EventoWebhookAsaas_processadoEm_idx" ON "EventoWebhookAsaas"("processadoEm");

-- CreateIndex
CREATE INDEX "EventoWebhookAsaas_evento_createdAt_idx" ON "EventoWebhookAsaas"("evento", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_asaasSubscriptionId_key" ON "Empresa"("asaasSubscriptionId");

-- AddForeignKey
ALTER TABLE "CheckoutAsaas" ADD CONSTRAINT "CheckoutAsaas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
