import { produtoVarianteService } from "@/app/services/produto-variante.service";
import { deleteImage } from "@/lib/storage/r2";

/**
 * Sincroniza o conjunto de fotos de um produto com suas variantes
 * "automáticas" (uma foto = uma variante, sem atributos — ver
 * `produtoVarianteService.sincronizarAutomaticas`) e limpa do R2 tanto essas
 * imagens quanto a fotoCapa antiga, quando saem do conjunto atual.
 *
 * Compartilhado pelos dois modos de interface (SIMPLES e COMPLETO): os dois
 * deixam o lojista escolher várias fotos de uma vez pro mesmo produto, e o
 * resultado (uma variante por foto, mais a limpeza do bucket) precisa ser
 * idêntico nos dois — só muda de onde as fotos já vêm (uploads imediatos via
 * `uploadImagemProduto`/`uploadImagemVariante`).
 *
 * `fotoCapaAntiga` fica de fora (undefined) na criação — não existe "antiga"
 * ainda — e recebe o valor atual do produto na atualização.
 */
export async function sincronizarFotosDoProduto(
  produtoId: string,
  fotos: string[],
  empresaId: string,
  fotoCapaAntiga?: string | null
): Promise<void> {
  if (fotos.length < 2 && !fotoCapaAntiga) {
    // Criação com 0 ou 1 foto: não existiam variantes automáticas antes (o
    // produto é novo), então não há nada pra sincronizar nem limpar — evita
    // uma transação à toa no caminho mais comum (produto sem variantes).
    return;
  }

  const fotoCapaNova = fotos[0]?.trim() || undefined;
  const { imagensRemovidas } = await produtoVarianteService.sincronizarAutomaticas(produtoId, fotos);

  // A fotoCapa antiga só é removida do bucket se não sobreviveu no novo
  // conjunto — pode ser a mesma imagem que virou a variante 1 agora, ou pode
  // já estar em `imagensRemovidas` (produto que já tinha variantes-foto); o
  // Set deduplica os dois casos.
  const paraRemover = new Set(imagensRemovidas);

  if (fotoCapaAntiga && fotoCapaAntiga !== fotoCapaNova && !fotos.includes(fotoCapaAntiga)) {
    paraRemover.add(fotoCapaAntiga);
  }

  await Promise.all([...paraRemover].map((url) => deleteImage(url, empresaId)));
}
