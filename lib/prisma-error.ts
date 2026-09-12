import type { Prisma } from "@prisma/client";

/**
 * Módulo NEUTRO de propósito, no mesmo espírito de `lib/empresa-publicavel.ts`.
 *
 * Ele existe fora de `app/services/empresa.service.ts` porque
 * `app/services/usuario.service.ts` e `scripts/seed-superadmin.ts` precisam da
 * MESMA extração — e nenhum dos dois deveria importar um service inteiro para
 * obter uma função pura.
 *
 * ESTE É O ÚNICO ARQUIVO DE PRODUÇÃO AUTORIZADO A CONHECER O CAMINHO INTERNO
 * `meta.driverAdapterError` (D-E). Esse identificador não é API pública do
 * Prisma: ele foi lido do bundle instalado. Confinar o conhecimento aqui é o
 * que torna uma futura mudança de formato um patch de uma linha em vez de uma
 * caçada por três arquivos. Existe um gate de grep provando o confinamento —
 * se ele acusar um segundo arquivo, a correção é mover a leitura para cá, nunca
 * relaxar o gate.
 */

/** Estreita `unknown` para um objeto indexável, antes de cada acesso a propriedade. */
function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

/**
 * Valida que `valor` é um array NÃO VAZIO de strings e o devolve tipado.
 * Devolve `null` (ausência) para qualquer outra coisa — inclusive para o array
 * vazio, porque vazio não é resposta.
 */
function listaDeCampos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.length === 0) {
    return null;
  }

  const campos: string[] = [];

  for (const item of valor) {
    if (typeof item !== "string") {
      return null;
    }

    campos.push(item);
  }

  return campos;
}

/**
 * Extrai os nomes dos campos que colidiram num erro `P2002` (violação de
 * unicidade), cobrindo os DOIS formatos de `meta` que o Prisma produz.
 *
 * ## Por que o fallback existe — não "simplificar" removendo um dos ramos
 *
 * No Prisma 7 com driver adapter (que é o caso deste projeto: `@prisma/adapter-pg`),
 * `rethrowAsUserFacing` — `node_modules/@prisma/query-plan-executor/dist/index.js:106172-106181`
 * — faz `throw new UserFacingError(message, code, { driverAdapterError: error })`.
 * O `meta` resultante carrega APENAS `driverAdapterError` (mais `modelName`,
 * acrescentado por uma camada acima). **`meta.target` não existe nesse caminho.**
 *
 * Os nomes dos campos ficam mais fundo: `mapDriverError` em
 * `node_modules/@prisma/adapter-pg/dist/index.js:472-478`, no caso `"23505"`
 * (unique violation do Postgres), extrai `fields` do `detail` com a regex
 * `/Key \(([^)]+)\)/`, faz `.split(", ")` e devolve
 * `{ kind: "UniqueConstraintViolation", constraint: fields !== undefined ? { fields } : undefined }`.
 * Esse objeto vira o `.cause` do `DriverAdapterError`. Somando os dois, o
 * caminho completo em runtime é
 * `erro.meta.driverAdapterError.cause.constraint.fields`.
 *
 * ## Por que `meta.target` tem precedência, mesmo sendo o ramo morto hoje (D-C)
 *
 * Não porque seja o que o runtime atual produz — não é. Mas porque é o contrato
 * PÚBLICO e documentado do Prisma: no dia em que uma versão futura o restaurar,
 * ou num contexto sem driver adapter, o projeto volta sozinho ao caminho
 * suportado, sem edição. Um `target` presente-porém-vazio cai para o fallback.
 *
 * ## Por que o retorno vazio não é defensive coding
 *
 * `constraint` pode ser `undefined` DE VERDADE: a linha 476 do adaptador é
 * explícita — quando a regex não casa no `detail` do Postgres, não há lista de
 * campos. "P2002 sem lista de campos" é um estado real de runtime.
 *
 * Daí D-D: esta função devolve sempre `string[]`, NUNCA lança e nunca devolve
 * `null`/`undefined`. Os chamadores fazem `.includes(...)` sobre o resultado e
 * já têm um caminho de escape (repropagar o erro / mensagem genérica); `[]`
 * preserva exatamente esse comportamento. Um helper que lançasse dentro do
 * `catch` do cadastro converteria um 409 tratado em um 500 não tratado
 * (T-Q09-03).
 *
 * ## Os nomes devolvidos são COLUNAS DO POSTGRES, não campos do Prisma
 *
 * O adaptador lê o `detail` do banco. Hoje os dois coincidem porque o schema
 * não tem um único `@map` (`grep '@map' prisma/schema.prisma` não retorna nada).
 * **Se alguém acrescentar um `@map`, as comparações `.includes("empresaId")` /
 * `.includes("email")` / `.includes("slug")` dos chamadores quebram em
 * silêncio** — e o desfecho é exatamente o bug que este módulo corrigiu: a
 * mensagem genérica de falha no lugar da mensagem certa. Este aviso é o que
 * evita a próxima ocorrência.
 *
 * ## Privacidade
 *
 * Devolve APENAS `constraint.fields`. Nunca `detail`, nunca `cause`, nunca
 * `message`: o `detail` do Postgres carrega o VALOR colidido
 * (`Key (email)=(vitima@exemplo.com) already exists`), e ecoá-lo numa mensagem
 * ao usuário seria divulgação (T-Q09-01).
 *
 * @param erro Um `P2002` JÁ estreitado pelo chamador. A guarda
 *   `error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"`
 *   permanece em cada call site (D-B): esta função faz UMA coisa, extrair a lista.
 */
export function camposDaColisaoUnica(erro: Prisma.PrismaClientKnownRequestError): string[] {
  const meta: unknown = erro.meta;

  if (!ehObjeto(meta)) {
    return [];
  }

  // 1. Contrato público primeiro (D-C).
  const doTarget = listaDeCampos(meta.target);

  if (doTarget !== null) {
    return doTarget;
  }

  // 2. Caminho interno do driver adapter, um salto de cada vez — cada um chega
  //    como `unknown` porque `meta` é `Record<string, unknown>`
  //    (`@prisma/client-runtime-utils/dist/index.d.ts:386`).
  const driverAdapterError = meta.driverAdapterError;

  if (!ehObjeto(driverAdapterError)) {
    return [];
  }

  const causa = driverAdapterError.cause;

  if (!ehObjeto(causa)) {
    return [];
  }

  const constraint = causa.constraint;

  if (!ehObjeto(constraint)) {
    return [];
  }

  // 3. Desconhecido ou malformado converge no vazio.
  const campos = listaDeCampos(constraint.fields);

  if (campos === null) {
    return [];
  }

  // O `detail` do Postgres sempre aspeia os nomes de coluna — `Key ("cpfCnpj")=(...)
  // already exists` —, e a regex do adaptador (`adapter-pg/dist/index.js:473`)
  // captura o conteúdo do parêntese literal, aspas inclusas. Sem esta remoção,
  // `campos` chega como `['"cpfCnpj"']`, e todo `.includes("cpfCnpj")` dos
  // chamadores falha silenciosamente para a mensagem genérica — o bug real que
  // esta linha corrige. `meta.target` (ramo 1, acima) nunca aspeia, então a
  // remoção fica confinada a este ramo.
  return campos.map((campo) => campo.replace(/^"(.*)"$/, "$1"));
}
