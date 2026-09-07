/**
 * Cria o usuário SUPERADMIN da plataforma e a empresa interna que o hospeda.
 *
 * Rodar com `npm run seed:superadmin -- --email <email> --senha <credencial>`.
 *
 * ---
 *
 * POR QUE ISTO EXISTE
 *
 * `empresaService.registerComUsuario` não aceita `role` nem `acessoVitalicio`, e
 * não pode passar a aceitar. Isso não é lacuna: é BILL-04, D-09 e D-10, e está
 * escrito como comentário normativo no próprio service (o bloco que explica por
 * que os três fatos restantes ficam nos defaults do schema). O allowlist
 * positivo de `empresaService.update` existe pelo mesmo motivo — sem ele,
 * qualquer ADMIN autenticado se daria acesso vitalício na própria empresa.
 *
 * Consequência direta: NÃO existe caminho de API legítimo para criar um
 * SUPERADMIN, e por D-04 não deve existir. A publicação de termos é a única
 * superfície de superadmin desta fase, e ela é um endpoint REST sem tela. Quem
 * cria o principal privilegiado é este script, fora do runtime da aplicação —
 * o mesmo padrão já aprovado em `scripts/seed-fatos-billing.ts` (decisão
 * `[04-08]`) e em `scripts/registrar-webhook-asaas.ts` (`[03-07]`).
 *
 * ---
 *
 * POR QUE SCRIPT E NÃO MIGRATION
 *
 * Duas razões independentes, e cada uma sozinha já bastaria.
 *
 * A primeira é o Pitfall 1: uma migration com `INSERT ... role = 'SUPERADMIN'`
 * usaria, dentro da transação da migration, um valor de enum adicionado por
 * `ALTER TYPE`. O PostgreSQL recusa isso, e a saída seria uma SEGUNDA migration
 * só para o insert. O repositório já viveu exatamente esse incidente na Fase 5.
 *
 * A segunda é pior e não tem conserto: uma migration com a credencial (ou o
 * hash dela) grava esse valor no histórico do repositório PARA SEMPRE. Um
 * script que roda em runtime não está na transação da migration, não sofre a
 * restrição do enum, e recebe a credencial por argumento — que não é
 * versionado.
 *
 * ---
 *
 * POR QUE ELE RODA PELO RESOLVEDOR DO PROJETO
 *
 * O `.env` tem que ser lido pelo MESMO leitor que a aplicação usa (`@next/env`,
 * via `scripts/resolvedor-ts.mjs`), nunca pelo `--env-file` do Node. Os dois
 * discordam: o `@next/env` passa o arquivo por `dotenv-expand` e trata `$` como
 * início de referência a outra variável. O incidente do `$` na chave do Asaas
 * (decisão `[03-07]`) custou horas de diagnóstico exatamente por isso. Um único
 * leitor garante que o banco que este script escreve é, por construção, o mesmo
 * que a aplicação lê.
 *
 * ---
 *
 * DIVERGÊNCIA DELIBERADA DA GUARDA DE AMBIENTE
 *
 * `scripts/seed-fatos-billing.ts` se recusa a rodar quando a variável de
 * ambiente `NODE_ENV` vale `production`, e essa recusa é a primeira coisa que
 * ele executa. Está certo: aquele script é um habilitador de TESTE, que grava
 * fatos de billing que a aplicação proíbe de gravar por HTTP.
 *
 * ESTE script NÃO tem essa guarda, e a ausência é intencional, não um
 * esquecimento a ser "padronizado" por quem comparar os dois arquivos: o
 * SUPERADMIN é necessário EM PRODUÇÃO. É lá que ele publica os termos reais.
 * Acrescentar a guarda aqui tornaria a plataforma impossível de operar no
 * único ambiente onde operá-la importa.
 *
 * ---
 *
 * D-02 É MITIGAÇÃO DE IMPASSE, NÃO CONVENIÊNCIA
 *
 * A empresa interna nasce com `acessoVitalicio: true`. Isso NÃO é um mimo para
 * a casa. Sem essa coluna, a empresa interna teria trial, carência e bloqueio
 * como qualquer outro tenant — e, passados os 14 dias mais os 10 de carência, o
 * próprio SUPERADMIN ficaria trancado do lado de fora por uma inadimplência
 * fictícia com ele mesmo (Pitfall 9). A cadeia gêmea desta é D-03, no gate de
 * termos: quem publica os termos não pode ser bloqueado por não tê-los aceito.
 *
 * `trialFim` fica deliberadamente NULO. `acessoVitalicio` tem precedência
 * absoluta em `avaliarAcesso` (Fase 2, D-03), então um trial gravado aqui não
 * mudaria decisão nenhuma — só deixaria no banco uma data enganosa para quem
 * for depurar isto daqui a um ano.
 *
 * ---
 *
 * SLUG NÃO-ADIVINHÁVEL, E POR QUÊ
 *
 * `acessoVitalicio: true` faz `empresaPodePublicar` devolver verdadeiro. Logo,
 * `/{slug-interno}` renderiza um catálogo público — VAZIO, mas existente — para
 * qualquer visitante anônimo que acerte o slug. Isso não vaza dado de cliente
 * nenhum, mas revela a existência do tenant interno; e o slug interno é
 * justamente a porta de login do SUPERADMIN.
 *
 * A mitigação escolhida é obscuridade barata: prefixo legível mais sufixo
 * aleatório de 8 dígitos hexadecimais, gerado aqui e nunca escrito no
 * repositório. As duas alternativas foram avaliadas e DESCARTADAS, e ficam
 * registradas para não serem redescobertas como ideias novas:
 *
 *   - marcar `deletedAt` na empresa interna QUEBRARIA O LOGIN do SUPERADMIN:
 *     `revalidarConta` filtra por `empresa: { deletedAt: null }`
 *     (`lib/auth-guard.ts`), então a sessão dele morreria no primeiro request;
 *   - um allowlist de slugs reservados no funil público reabriria o canal
 *     lateral de tempo que a Fase 4 fechou (T-04-01 / T-04-02) — a resposta
 *     passaria a demorar diferente para um slug reservado e um inexistente.
 *
 * ---
 *
 * LIMITAÇÃO CONHECIDA (A3 do RESEARCH)
 *
 * `Usuario` tem `@@unique([empresaId])`: UMA conta por empresa. A empresa
 * interna terá exatamente uma, o SUPERADMIN. Um SEGUNDO superadmin exige uma
 * SEGUNDA empresa interna — basta rodar este script de novo com outro email, e
 * ele criará outro par empresa+usuário. É feio e funciona. Está escrito aqui
 * para que quem precisar do segundo não descubra por tentativa e erro.
 */
import { randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import {
  CausaTransicaoAcesso,
  ModoInterface,
  Prisma,
  StatusAcesso,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { camposDaColisaoUnica } from "@/lib/prisma-error";

/**
 * Parte legível do slug. O que torna o slug não-adivinhável é o sufixo sorteado
 * em `gerarSlugInterno`, nunca este prefixo — ele existe só para que alguém
 * olhando a tabela `Empresa` reconheça a linha na hora.
 */
const PREFIXO_INTERNO = "plataforma-interna";

/**
 * `lib/unique-suffix.ts` NÃO serve aqui e a divergência é proposital: aquele
 * utilitário resolve colisão de slug com um contador determinístico (`-2`,
 * `-3`, …), que é o comportamento certo para o slug PÚBLICO de um cliente e o
 * exatamente errado aqui — um sufixo previsível não esconde nada. 8 dígitos
 * hexadecimais são 4 bytes de entropia do CSPRNG do sistema.
 */
function gerarSlugInterno(): string {
  return `${PREFIXO_INTERNO}-${randomBytes(4).toString("hex")}`;
}

function erro(mensagem: string): void {
  console.error(`[seed:superadmin] ${mensagem}`);
  process.exitCode = 1;
}

/** Leitura de `--chave valor` sobre `process.argv`, sem parser instalado. */
function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);

  if (posicao === -1) return undefined;

  return process.argv[posicao + 1];
}

/**
 * As duas credenciais vêm SEMPRE da linha de comando, e essa é a terceira
 * decisão de segurança deste arquivo (T-06-25).
 *
 * Não há valor literal no código, e não há leitura de variável de ambiente da
 * aplicação: um `SUPERADMIN_PASSWORD` no `.env` seria um segredo permanente
 * para uma operação que acontece UMA vez por ambiente. O inventário de runtime
 * do RESEARCH confirma que nada em execução precisa desse valor depois que a
 * linha existe no banco.
 */
function lerArgumentos() {
  return {
    email: argumento("email"),
    credencial: argumento("senha"),
  };
}

function imprimirUso(): void {
  console.error(
    "[seed:superadmin] uso: npm run seed:superadmin -- --email <email> --senha <credencial>"
  );
}

async function principal(): Promise<void> {
  const args = lerArgumentos();

  if (!args.email || !args.credencial) {
    imprimirUso();
    return erro("--email e --senha são obrigatórios.");
  }

  // Idempotência. Rodar este script duas vezes com o mesmo email é o caso
  // NORMAL (provisionar um ambiente é uma operação que se repete), e a segunda
  // execução não pode criar um segundo par empresa+usuário nem sobrescrever a
  // credencial de quem já está lá.
  const existente = await prisma.usuario.findUnique({
    where: { email: args.email },
    select: {
      id: true,
      role: true,
      empresa: { select: { slug: true, acessoVitalicio: true } },
    },
  });

  if (existente) {
    console.log("[seed:superadmin] já existe — nada foi criado.");
    console.log(`  usuario id       ${existente.id}`);
    console.log(`  role             ${existente.role}`);
    console.log(`  empresa slug     ${existente.empresa.slug}`);
    console.log(`  acessoVitalicio  ${existente.empresa.acessoVitalicio}`);
    console.log(`  login            /${existente.empresa.slug}/admin/login`);
    return;
  }

  const slug = gerarSlugInterno();
  // Custo 10, idêntico a `usuarioService.create` e a
  // `empresaService.registerComUsuario`. Divergir aqui criaria duas políticas de
  // hash no mesmo banco, e a mais fraca seria a que vale.
  const senhaHash = await bcrypt.hash(args.credencial, 10);

  try {
    const criado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nome: "Plataforma (tenant interno do SUPERADMIN)",
          slug,
          modoInterface: ModoInterface.COMPLETO,
          // D-02. Ver o bloco "D-02 É MITIGAÇÃO DE IMPASSE" no cabeçalho.
          // `trialFim`, `acessoAte` e `canceladoEm` ficam nos defaults nulos.
          acessoVitalicio: true,
          ultimoStatusAuditado: StatusAcesso.VITALICIO,
        },
        select: { id: true, slug: true },
      });

      const usuario = await tx.usuario.create({
        data: {
          nome: "Superadmin da plataforma",
          email: args.email as string,
          senhaHash,
          empresaId: empresa.id,
          // O único lugar do projeto inteiro onde esta coluna é escrita com
          // algo diferente do default `ADMIN`.
          role: UserRole.SUPERADMIN,
        },
        select: { id: true, role: true },
      });

      // BILL-05: primeira entrada da trilha, na MESMA transação — um rollback
      // não pode deixar auditoria de uma empresa que não existe.
      //
      // Escrita direta com `tx.` em vez de `acessoService.registrarTransicao`,
      // pelo mesmo motivo já registrado em `empresaService.registerComUsuario`:
      // aquele método opera sobre o `prisma` global, FORA desta transação, e o
      // compare-and-swap dele não faz sentido para uma empresa que acabou de
      // nascer — não há concorrência possível sobre ela.
      await tx.auditoriaAcesso.create({
        data: {
          empresaId: empresa.id,
          statusAnterior: null,
          statusNovo: StatusAcesso.VITALICIO,
          causa: CausaTransicaoAcesso.REGISTRO,
        },
      });

      return { empresa, usuario };
    });

    console.log("[seed:superadmin] criado.");
    console.log(`  usuario id       ${criado.usuario.id}`);
    console.log(`  role             ${criado.usuario.role}`);
    console.log(`  empresa slug     ${criado.empresa.slug}`);
    console.log(`  acessoVitalicio  true`);
    console.log(`  login            /${criado.empresa.slug}/admin/login`);
  } catch (falha) {
    if (falha instanceof Prisma.PrismaClientKnownRequestError && falha.code === "P2002") {
      // Sem o helper, esta mensagem imprimia `colisão de unicidade em []` em
      // TODA colisão real: o `meta` do P2002 com driver adapter não carrega
      // `target`. Ver o JSDoc de `lib/prisma-error.ts`.
      const alvo = camposDaColisaoUnica(falha);

      // Colisão de slug é astronomicamente improvável (4 bytes de CSPRNG) e o
      // desfecho certo é simplesmente rodar de novo — não relaxar o sufixo.
      return erro(
        `colisão de unicidade em [${alvo.join(", ")}] (P2002) — nada foi gravado. ` +
          "Rode o comando novamente."
      );
    }

    throw falha;
  }
}

principal()
  .catch((falha: unknown) => {
    erro(falha instanceof Error ? falha.message : "falha desconhecida");
  })
  .finally(() => prisma.$disconnect());
