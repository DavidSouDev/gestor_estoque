/*
  Warnings:

  - You are about to drop the `Produtos` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Produtos";

-- CreateTable
CREATE TABLE "Produto" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "quantidade" INTEGER NOT NULL,
    "preco_atacado" DECIMAL(10,2) NOT NULL,
    "preco_varejo" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);
