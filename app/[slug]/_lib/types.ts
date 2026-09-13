import type { produtoService } from "@/app/services/produto.service";
import type { comboService } from "@/app/services/combo.service";

export type ProdutoCatalogo = Awaited<ReturnType<typeof produtoService.listCatalogo>>[number];
export type ComboCatalogo = Awaited<ReturnType<typeof comboService.listCatalogo>>[number];

// Client Components não aceitam `Decimal` do Prisma como prop (só objetos
// planos) — essas variantes trocam os campos monetários por `number` para
// cruzar a fronteira Server -> Client no catálogo público. `variantes` tem
// os mesmos dois campos (`precoVarejo`/`precoAtacado`), só que opcionais
// (`null` = herda o preço do produto).
export type ProdutoCatalogoSerializado = Omit<ProdutoCatalogo, "precoVarejo" | "variantes"> & {
  precoVarejo: number;
  variantes: Array<
    Omit<ProdutoCatalogo["variantes"][number], "precoVarejo" | "precoAtacado"> & {
      precoVarejo: number | null;
      precoAtacado: number | null;
    }
  >;
};

export type ComboCatalogoSerializado = Omit<ComboCatalogo, "preco" | "itens"> & {
  preco: number;
  itens: Array<
    Omit<ComboCatalogo["itens"][number], "produto"> & {
      produto: ProdutoCatalogoSerializado;
    }
  >;
};
