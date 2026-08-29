-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT '#f59e0b',
ADD COLUMN     "primaryColor" TEXT NOT NULL DEFAULT '#18181b';

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "categoria" TEXT NOT NULL DEFAULT 'Geral';
