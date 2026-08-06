-- CreateTable
CREATE TABLE "Produtos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "preco_atacado" DOUBLE PRECISION NOT NULL,
    "preco_varejo" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Produtos_pkey" PRIMARY KEY ("id")
);
