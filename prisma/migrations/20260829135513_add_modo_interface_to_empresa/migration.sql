-- CreateEnum
CREATE TYPE "ModoInterface" AS ENUM ('COMPLETO', 'SIMPLES');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "modoInterface" "ModoInterface" NOT NULL DEFAULT 'COMPLETO';
