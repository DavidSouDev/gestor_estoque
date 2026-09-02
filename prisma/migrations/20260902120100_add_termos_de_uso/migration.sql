-- Fase 6 (TERM-01/TERM-03): tabelas de termos de uso e de aceite, mais a coluna
-- denormalizada Usuario.termoAceitoId que serve de bookkeeping ao gate.
--
-- Duas clausulas geradas pelo Prisma sao NORMATIVAS e nao podem ser afrouxadas
-- por uma migration futura sem uma decisao explicita:
--   * AceiteTermo_termoId_fkey ... ON DELETE RESTRICT — o Postgres RECUSA apagar
--     uma versao de termo que alguem aceitou. E a imutabilidade de TERM-03
--     imposta pelo banco, nao pela disciplina de quem le o codigo.
--   * Usuario_termoAceitoId_fkey ... ON DELETE SET NULL — apagar a versao
--     apontada nunca pode apagar o usuario (na pratica a versao nunca e apagada,
--     justamente por causa do RESTRICT acima).
--
-- Nenhum INSERT aqui: a v1 dos termos e semeada na migration seguinte
-- (20260902120200_seed_termo_v1), separada por higiene de DDL/DML.

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "termoAceitoId" TEXT;

-- CreateTable
CREATE TABLE "TermoDeUso" (
    "id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "conteudo" TEXT NOT NULL,
    "publicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoPorId" TEXT,

    CONSTRAINT "TermoDeUso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceiteTermo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "termoId" TEXT NOT NULL,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AceiteTermo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TermoDeUso_versao_key" ON "TermoDeUso"("versao");

-- CreateIndex
CREATE INDEX "TermoDeUso_publicadoEm_idx" ON "TermoDeUso"("publicadoEm");

-- CreateIndex
CREATE INDEX "AceiteTermo_usuarioId_aceitoEm_idx" ON "AceiteTermo"("usuarioId", "aceitoEm");

-- CreateIndex
CREATE UNIQUE INDEX "AceiteTermo_usuarioId_termoId_key" ON "AceiteTermo"("usuarioId", "termoId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_termoAceitoId_fkey" FOREIGN KEY ("termoAceitoId") REFERENCES "TermoDeUso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermoDeUso" ADD CONSTRAINT "TermoDeUso_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceiteTermo" ADD CONSTRAINT "AceiteTermo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceiteTermo" ADD CONSTRAINT "AceiteTermo_termoId_fkey" FOREIGN KEY ("termoId") REFERENCES "TermoDeUso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
