import type { produtoService } from "@/app/services/produto.service";
import type { comboService } from "@/app/services/combo.service";

export type ProdutoCatalogo = Awaited<ReturnType<typeof produtoService.listCatalogo>>[number];
export type ComboCatalogo = Awaited<ReturnType<typeof comboService.listCatalogo>>[number];

// Client Components não aceitam `Decimal` do Prisma como prop (só objetos
// planos) — essas variantes trocam os campos monetários por `number` para
// cruzar a fronteira Server -> Client no catálogo público.
export type ProdutoCatalogoSerializado = Omit<ProdutoCatalogo, "precoVarejo"> & {
  precoVarejo: number;
};

export type ComboCatalogoSerializado = Omit<ComboCatalogo, "preco" | "itens"> & {
  preco: number;
  itens: Array<
    Omit<ComboCatalogo["itens"][number], "produto"> & {
      produto: ProdutoCatalogoSerializado;
    }
  >;
};
