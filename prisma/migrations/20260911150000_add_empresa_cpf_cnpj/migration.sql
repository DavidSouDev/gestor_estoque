-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cpfCnpj" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cpfCnpj_key" ON "Empresa"("cpfCnpj");
