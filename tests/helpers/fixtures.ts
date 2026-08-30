import type {
  ComboCatalogoSerializado,
  ProdutoCatalogoSerializado,
} from "../../app/[slug]/_lib/types";

export function buildProdutoCatalogo(
  overrides: Partial<ProdutoCatalogoSerializado> = {}
): ProdutoCatalogoSerializado {
  return {
    id: "produto-1",
    empresaId: "empresa-1",
    codigo: "PROD-1",
    nome: "Produto Teste",
    descricao: "Descrição do produto",
    categoria: "Geral",
    precoVarejo: 20,
    estoque: 10,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    imagens: [],
    ...overrides,
  } as ProdutoCatalogoSerializado;
}

export function buildComboCatalogo(
  overrides: Partial<ComboCatalogoSerializado> = {}
): ComboCatalogoSerializado {
  return {
    id: "combo-1",
    empresaId: "empresa-1",
    nome: "Combo Teste",
    descricao: "Descrição do combo",
    preco: 30,
    fotoCapa: null,
    ordemCatalogo: 0,
    destaque: false,
    itens: [
      {
        id: "item-1",
        comboId: "combo-1",
        produtoId: "produto-1",
        quantidade: 2,
        produto: buildProdutoCatalogo(),
      },
    ],
    ...overrides,
  } as ComboCatalogoSerializado;
}
