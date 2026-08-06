/*
  Warnings:

  - You are about to drop the column `preco_atacado` on the `Produto` table. All the data in the column will be lost.
  - You are about to drop the column `preco_varejo` on the `Produto` table. All the data in the column will be lost.
  - Added the required column `precoAtacado` to the `Produto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `precoVarejo` to the `Produto` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Produto" DROP COLUMN "preco_atacado",
DROP COLUMN "preco_varejo",
ADD COLUMN     "precoAtacado" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "precoVarejo" DECIMAL(10,2) NOT NULL;
