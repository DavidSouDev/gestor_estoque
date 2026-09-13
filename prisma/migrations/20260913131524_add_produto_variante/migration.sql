-- AlterTable
ALTER TABLE "MovimentacaoEstoque" ADD COLUMN     "produtoVarianteId" TEXT;

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "controlaEstoquePorVariante" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProdutoVariante" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "precoVarejo" DECIMAL(10,2),
    "precoAtacado" DECIMAL(10,2),
    "estoque" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProdutoVariante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoVarianteAtributo" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProdutoVarianteAtributo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoVarianteImagem" (
    "id" TEXT NOT NULL,
    "varianteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoVarianteImagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoVariante_produtoId_ordem_idx" ON "ProdutoVariante"("produtoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoVarianteAtributo_varianteId_nome_key" ON "ProdutoVarianteAtributo"("varianteId", "nome");

-- CreateIndex
CREATE INDEX "ProdutoVarianteImagem_varianteId_idx" ON "ProdutoVarianteImagem"("varianteId");

-- CreateIndex
CREATE INDEX "MovimentacaoEstoque_produtoVarianteId_idx" ON "MovimentacaoEstoque"("produtoVarianteId");

-- AddForeignKey
ALTER TABLE "ProdutoVariante" ADD CONSTRAINT "ProdutoVariante_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVarianteAtributo" ADD CONSTRAINT "ProdutoVarianteAtributo_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "ProdutoVariante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVarianteImagem" ADD CONSTRAINT "ProdutoVarianteImagem_varianteId_fkey" FOREIGN KEY ("varianteId") REFERENCES "ProdutoVariante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoEstoque" ADD CONSTRAINT "MovimentacaoEstoque_produtoVarianteId_fkey" FOREIGN KEY ("produtoVarianteId") REFERENCES "ProdutoVariante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
