/*
  Warnings:

  - A unique constraint covering the columns `[empresaId]` on the table `Usuario` will be added. If there are existing duplicate values, this will fail. Each empresa may have at most one usuário (administrador).

*/
-- DropIndex
DROP INDEX "Usuario_empresaId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_empresaId_key" ON "Usuario"("empresaId");
