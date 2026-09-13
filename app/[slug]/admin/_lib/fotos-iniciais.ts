interface ProdutoComVariantesFoto {
  fotoCapa: string | null;
  variantes: Array<{
    ordem: number;
    atributos: unknown[];
    imagens: Array<{ url: string }>;
  }>;
}

/**
 * Reidrata as fotos já escolhidas de um produto pro campo de fotos
 * (`MultiImageUploadField`): se ele já tem variantes "automáticas" (uma
 * foto, zero atributos — ver `produtoVarianteService.sincronizarAutomaticas`),
 * usa a foto de cada uma, na ordem; senão cai pra `fotoCapa` isolada
 * (produto de antes desta feature existir, ou com só uma foto mesmo).
 *
 * Compartilhado pelos dois modos de interface: o wizard do modo SIMPLES
 * (`ProdutoAdmin`) e o formulário do modo COMPLETO (`ProdutoAdminDetalhe`)
 * têm o mesmo formato relevante aqui, só com campos extras que este helper
 * ignora.
 */
export function fotosIniciaisDoProduto(produto?: ProdutoComVariantesFoto): string[] {
  if (!produto) {
    return [];
  }

  const automaticas = (produto.variantes ?? [])
    .filter((variante) => variante.atributos.length === 0)
    .sort((a, b) => a.ordem - b.ordem)
    .map((variante) => variante.imagens[0]?.url)
    .filter((url): url is string => Boolean(url));

  if (automaticas.length > 0) {
    return automaticas;
  }

  return produto.fotoCapa ? [produto.fotoCapa] : [];
}
