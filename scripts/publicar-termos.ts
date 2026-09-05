/**
 * Publica uma NOVA versão dos Termos de Uso a partir de um arquivo de texto.
 *
 * Rodar com:
 *   npm run termos:publicar -- --arquivo <caminho.txt> --email <email> --senha <credencial>
 *
 * ---
 *
 * POR QUE ISTO EXISTE
 *
 * D-04: não há, e nesta fase não deve haver, tela de superadmin. `POST
 * /api/termos` é a superfície INTEIRA de publicação, e quem publica usa `curl`,
 * Postman ou script — o mesmo padrão operacional já aceito para
 * `acessoVitalicio` e para a criação do próprio SUPERADMIN
 * (`scripts/seed-superadmin.ts`). Este arquivo é a versão auditável e repetível
 * daquele `curl`: sem SQL escrito à mão, sem corpo montado de memória, e com as
 * guardas que uma linha de `curl` não tem.
 *
 * ---
 *
 * POR QUE INSERT E NUNCA UPDATE
 *
 * TERM-03 / D-07: uma versão publicada é um documento legal que pessoas
 * aceitaram. O texto da v1 é a PROVA de qual documento quem aceitou realmente
 * viu — reescrevê-lo por UPDATE apagaria essa prova e deixaria no banco um
 * consentimento sem objeto verificável. Corrigir o texto significa, sempre,
 * publicar a versão seguinte.
 *
 * A consequência prática para quem lê este arquivo procurando o método que
 * "conserta" a versão anterior: ele não existe aqui, não existe em
 * `app/services/termo.service.ts`, e a ausência nos dois lugares é o contrato,
 * verificada por `npm run gates:fase-06`.
 *
 * ---
 *
 * REGRA ESTRUTURAL: ESTE SCRIPT FALA HTTP, E SÓ HTTP
 *
 * Ele NÃO importa `@/lib/prisma` nem service nenhum, e a proibição é o ponto do
 * arquivo. A autorização de `POST /api/termos` é feita pela role REVALIDADA no
 * banco (D-06), e não pelo papel gravado no token — um script que escrevesse
 * direto na tabela contornaria essa verificação inteira e reabriria justamente
 * o caminho que a rota e o service fecham. Publicar tem que atravessar a
 * superfície real, que é a única auditável e a única que o resto do sistema
 * conhece. É a mesma decisão que `e2e/helpers.ts` registra ao publicar pelo
 * endpoint em vez de inserir a linha por conta própria.
 *
 * ---
 *
 * POR QUE ELE RODA PELO RESOLVEDOR DO PROJETO
 *
 * `scripts/resolvedor-ts.mjs` carrega o `.env` com `@next/env`, o MESMO leitor
 * da aplicação, nunca o `--env-file` do Node. Os dois discordam no tratamento
 * de `$` (o `@next/env` passa o arquivo por `dotenv-expand`), e essa divergência
 * já custou horas de diagnóstico na homologação do plano 03-07. Este script não
 * lê nenhuma variável de ambiente hoje, mas roda pelo mesmo caminho das outras
 * ferramentas do projeto para que o dia em que ele precisar ler uma não seja o
 * dia em que se descobre que o leitor era outro.
 *
 * ---
 *
 * SEGREDOS (T-Q-01)
 *
 * As credenciais vêm SEMPRE da linha de comando — nunca de variável de ambiente,
 * nunca com valor embutido no código —, pelo mesmo motivo registrado em
 * `scripts/seed-superadmin.ts` (T-06-25): publicar termos é uma operação rara,
 * e um segredo permanente no `.env` para ela seria dívida à toa. Nada aqui
 * imprime a senha, o token (nem truncado) ou o corpo do texto, e nada é gravado
 * em arquivo.
 */
import { readFile } from "node:fs/promises";

const PREFIXO = "[termos:publicar]";

/**
 * Destino padrão deliberadamente LOCAL.
 *
 * Não há fallback para `APP_BASE_URL` e a ausência é intencional (T-Q-03):
 * aquela variável aponta para a origem pública da aplicação, e usá-la como
 * default faria do comando mais curto o mais perigoso — quem esquecesse `--url`
 * publicaria em produção achando que estava testando.
 */
const URL_PADRAO = "http://localhost:3000";

/**
 * Teto de tamanho do conteúdo, duplicado de propósito.
 *
 * A fonte da verdade é o schema de `app/api/termos/route.ts`
 * (`z.string().trim().min(1).max(200_000)`). A duplicação é consciente: este
 * script não importa código de produção (ver a regra estrutural no cabeçalho),
 * então o número é repetido aqui para que a recusa aconteça ANTES de a
 * credencial viajar pela rede, e não como um 400 depois do login.
 */
const MAXIMO_DE_CARACTERES = 200_000;

/** Marcador do texto provisório semeado pela migration da v1. */
const MARCADOR_PROVISORIO = "[TEXTO PROVISORIO";

/** Hosts considerados locais para efeito da guarda de destino. */
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

function falhar(mensagem: string): never {
  console.error(`${PREFIXO} ${mensagem}`);
  process.exit(1);
}

/** Leitura de `--chave valor` sobre `process.argv`, sem parser instalado. */
function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);

  if (posicao === -1) return undefined;

  return process.argv[posicao + 1];
}

function bandeira(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

function imprimirUso(): void {
  console.error(
    `${PREFIXO} uso: npm run termos:publicar -- --arquivo <caminho.txt> ` +
      "--email <email> --senha <credencial> [--url <base>] [--confirmar] [--dry-run]"
  );
  console.error(`${PREFIXO}   --url     default ${URL_PADRAO}`);
  console.error(
    `${PREFIXO}   fora de localhost, --confirmar e https:// são obrigatórios`
  );
}

/**
 * Lê e valida o conteúdo. O `.trim()` é o MESMO que o zod da rota aplica, de
 * modo que o número medido aqui é exatamente o que será gravado lá — é isso que
 * torna a comparação por sha256 da verificação pós-publicação significativa.
 */
async function lerConteudo(caminho: string): Promise<string> {
  let cru: string;

  try {
    cru = await readFile(caminho, "utf8");
  } catch {
    return falhar(`não foi possível ler o arquivo: ${caminho}`);
  }

  const conteudo = cru.trim();

  if (conteudo.length === 0) {
    return falhar(`o arquivo está vazio depois do trim: ${caminho}`);
  }

  if (conteudo.length > MAXIMO_DE_CARACTERES) {
    return falhar(
      `o conteúdo tem ${conteudo.length} caracteres e o limite da rota é ${MAXIMO_DE_CARACTERES}.`
    );
  }

  // T-Q-04. Republicar o placeholder como versão NOVA é o pior desfecho
  // possível desta ferramenta: obrigaria todos os usuários a aceitar de novo um
  // texto que não diz nada, e ainda daria a aparência de que o problema foi
  // resolvido.
  if (conteudo.includes(MARCADOR_PROVISORIO)) {
    return falhar(
      "o arquivo ainda contém o marcador de texto provisório — publicar isso " +
        "como versão nova obrigaria todos os usuários a aceitar um placeholder."
    );
  }

  return conteudo;
}

/**
 * Guarda de destino (T-Q-02 / T-Q-03). Roda ANTES de qualquer I/O de rede.
 *
 * A exigência de `https:` fora de localhost não é formalidade: as credenciais do
 * SUPERADMIN viajam no CORPO do login, então mandá-las para um host remoto em
 * HTTP simples seria vazá-las na rede. Mesmo raciocínio do check de https em
 * `scripts/registrar-webhook-asaas.ts`.
 */
function validarDestino(base: string): URL {
  let alvo: URL;

  try {
    alvo = new URL(base);
  } catch {
    return falhar(`--url não é uma URL válida: ${base}`);
  }

  if (HOSTS_LOCAIS.has(alvo.hostname)) {
    return alvo;
  }

  // A mensagem nomeia o host de propósito: o operador precisa ver contra o que
  // quase publicou, e não apenas que "faltou uma flag".
  if (!bandeira("confirmar")) {
    return falhar(
      `destino remoto (${alvo.hostname}) exige --confirmar. Publicar cria uma ` +
        "versão nova e leva TODOS os usuários à tela de aceite."
    );
  }

  if (alvo.protocol !== "https:") {
    return falhar(
      `destino remoto (${alvo.hostname}) exige https:// — as credenciais do ` +
        "SUPERADMIN viajam no corpo do login e não podem trafegar em texto claro."
    );
  }

  return alvo;
}

async function autenticar(base: URL, email: string, credencial: string): Promise<string> {
  const resposta = await fetch(new URL("/api/auth/login", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, senha: credencial }),
  });

  if (resposta.status === 401) {
    return falhar(
      "login recusado (401). Confira o email e a credencial, ou crie o " +
        "SUPERADMIN com: npm run seed:superadmin -- --email <email> --senha <credencial>"
    );
  }

  if (resposta.status !== 200) {
    return falhar(`login falhou com status ${resposta.status}.`);
  }

  const corpo = (await resposta.json()) as { token?: string };

  if (!corpo.token) {
    return falhar("login respondeu 200 sem token — resposta inesperada.");
  }

  return corpo.token;
}

interface TermoPublicado {
  id: string;
  versao: number;
  publicadoEm: string;
}

/** Traduz os status conhecidos de `app/api/termos/route.ts` em ação concreta. */
function explicarRecusa(status: number): never {
  if (status === 400) {
    return falhar("a rota recusou o corpo (400) — conteúdo vazio ou acima do limite.");
  }

  if (status === 401) {
    return falhar("sessão inválida (401) — o token não foi aceito. Rode o comando de novo.");
  }

  if (status === 403) {
    return falhar(
      "a conta autenticada não é SUPERADMIN (403). A autorização usa o papel " +
        "lido do BANCO a cada request, não o gravado no token: rebaixar a conta " +
        "invalida a publicação na hora, sem esperar o token expirar."
    );
  }

  if (status === 409) {
    return falhar(
      "outra publicação ocorreu em paralelo (409) — a numeração é arbitrada pelo " +
        "banco. Basta rodar o comando novamente."
    );
  }

  return falhar(`a rota respondeu ${status} — publicação não realizada.`);
}

async function publicar(base: URL, token: string, conteudo: string): Promise<TermoPublicado> {
  const resposta = await fetch(new URL("/api/termos", base), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ conteudo }),
  });

  if (resposta.status !== 201) {
    explicarRecusa(resposta.status);
  }

  return (await resposta.json()) as TermoPublicado;
}

async function principal(): Promise<void> {
  const caminho = argumento("arquivo");
  const email = argumento("email");
  const credencial = argumento("senha");
  const simulacao = bandeira("dry-run");

  if (!caminho) {
    imprimirUso();
    falhar("--arquivo é obrigatório.");
  }

  // As guardas de conteúdo e de destino vêm ANTES de qualquer chamada de rede.
  const conteudo = await lerConteudo(caminho);
  const base = validarDestino(argumento("url") ?? URL_PADRAO);
  const linhas = conteudo.split("\n").length;

  if (simulacao) {
    // Nunca o corpo do texto: só a sua forma.
    console.log(`${PREFIXO} dry-run — nada foi publicado.`);
    console.log(`  arquivo      ${caminho}`);
    console.log(`  caracteres   ${conteudo.length}`);
    console.log(`  linhas       ${linhas}`);
    console.log(`  alvo         ${base.origin}`);
    return;
  }

  if (!email || !credencial) {
    imprimirUso();
    falhar("--email e --senha são obrigatórios fora de --dry-run.");
  }

  const token = await autenticar(base, email, credencial);
  const termo = await publicar(base, token, conteudo);

  console.log(`${PREFIXO} publicado.`);
  console.log(`  id           ${termo.id}`);
  console.log(`  versao       ${termo.versao}`);
  console.log(`  publicadoEm  ${termo.publicadoEm}`);
  console.log(`  alvo         ${base.origin}`);
  console.log(`  caracteres   ${conteudo.length}`);
}

principal().catch((erro: unknown) => {
  falhar(erro instanceof Error ? erro.message : "falha desconhecida");
});
