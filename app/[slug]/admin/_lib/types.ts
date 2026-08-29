import type { produtoService } from "@/app/services/produto.service";
import type { comboService } from "@/app/services/combo.service";
import type { promocaoService } from "@/app/services/promocao.service";
import type { movimentacaoEstoqueService } from "@/app/services/movimentacao-estoque.service";

export type ProdutoAdmin = Awaited<ReturnType<typeof produtoService.list>>[number];
export type ProdutoAdminDetalhe = NonNullable<Awaited<ReturnType<typeof produtoService.findById>>>;

export type ComboAdmin = Awaited<ReturnType<typeof comboService.list>>[number];
export type ComboAdminDetalhe = NonNullable<Awaited<ReturnType<typeof comboService.findById>>>;

export type PromocaoAdmin = Awaited<ReturnType<typeof promocaoService.list>>[number];
export type PromocaoAdminDetalhe = NonNullable<Awaited<ReturnType<typeof promocaoService.findById>>>;

export type MovimentacaoAdmin = Awaited<ReturnType<typeof movimentacaoEstoqueService.list>>[number];
