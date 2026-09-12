import { execFileSync } from "node:child_process";
import path from "node:path";

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const RAIZ = path.resolve(__dirname, "..");

/** Os sete status que `scripts/seed-fatos-billing.ts` aceita em `--status`. */
export type StatusSeed =
  | "trial"
  | "em-dia"
  | "carencia"
  | "bloqueado"
  | "cancelado"
  /**
   * Cancelou E o período pago ainda está vigente (D-06): `canceladoEm`
   * preenchido com `acessoAte` no FUTURO, derivando `EM_DIA`. É o outro lado do
   * `cancelado` acima, que cobre o cancelamento já expirado — e o único estado
   * em que a tela de assinatura renderiza "Cancelada" com data residual.
   */
  | "cancelado-vigente"
  | "vitalicio";

/**
 * Coloca a empresa do slug em um status de acesso escrevendo os 4 fatos de
 * billing DIRETO no banco, por `scripts/seed-fatos-billing.ts`.
 *
 * A escrita não pode passar pela API: o allowlist de `empresaService.update`
 * proíbe gravar `acessoAte`, `trialFim`, `canceladoEm` e `acessoVitalicio` por
 * HTTP, deliberadamente (BILL-04, decisão `[02-02]`). Abrir um endpoint de teste
 * só para este spec desfaria essa decisão de segurança em produção — o script,
 * que se recusa a rodar com `NODE_ENV=production`, não.
 *
 * `execFileSync` é síncrono de propósito: quando ele retorna, a linha já está
 * gravada, então nenhuma espera artificial é necessária entre bloquear e medir.
 * A guarda re-deriva o status a cada request (ACC-04), então o efeito aparece
 * já na próxima navegação.
 *
 * SOBRE `opcoes.auditado`: sem ele, o script alinha `ultimoStatusAuditado` ao
 * status que acabou de derivar dos fatos, e a empresa fica SEM transição
 * pendente. Esse é o estado certo para medir um GATE (Fase 4), que quer o estado
 * assentado, e inútil para medir o WORKER (Fase 5), que só age sobre transições
 * pendentes — um e2e de worker sobre uma empresa alinhada passaria verde contra
 * um worker quebrado. Passar `auditado` desalinha os dois de propósito.
 */
export function seedFatosBilling(
  slug: string,
  status: StatusSeed,
  opcoes?: { auditado?: StatusSeed }
): void {
  const argumentos = [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--import",
    "./scripts/resolvedor-ts.mjs",
    "scripts/seed-fatos-billing.ts",
    "--slug",
    slug,
    "--status",
    status,
  ];

  // No FINAL do array, nunca no meio: mantém o diff de qualquer mudança futura
  // legível e o comando reproduzível na mão a partir do log.
  if (opcoes?.auditado) {
    argumentos.push("--auditado", opcoes.auditado);
  }

  execFileSync(process.execPath, argumentos, { cwd: RAIZ, stdio: "inherit" });
}

/**
 * O catálogo público às vezes serve uma resposta obtida um instante antes da
 * revalidação do Server Action terminar (observado sob carga no `next dev`).
 * Uma simples espera no DOM não ajuda porque `toHaveCount` não refaz a
 * navegação — então aqui forçamos alguns `reload()` reais até o item sumir.
 */
export async function expectGoneFromCatalogo(page: Page, locator: Locator) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    if ((await locator.count()) === 0) {
      return;
    }
    await page.waitForTimeout(500);
    await page.reload();
  }

  await expect(locator).toHaveCount(0);
}

/**
 * Credenciais do SUPERADMIN que os specs de termos usam para publicar.
 *
 * Fixas de propósito: `scripts/seed-superadmin.ts` é idempotente por email, então
 * um valor estável faz a segunda execução (e a terceira, e a de amanhã) ser um
 * no-op em vez de acumular um tenant interno por rodada da suíte. O slug da
 * empresa interna é sorteado a cada criação e NÃO é reutilizável entre rodadas —
 * por isso nada aqui depende dele: a publicação acontece por REST, e a REST só
 * precisa do par email/senha.
 *
 * A senha é descartável e vive num arquivo de teste versionado porque o banco em
 * que ela vale é o de desenvolvimento/CI. Em produção o operador roda o mesmo
 * script com uma credencial forte, conforme registrado no SUMMARY do plano 06-03.
 */
export const SUPERADMIN_E2E = {
  email: "superadmin-e2e@teste.com",
  senha: "senha-e2e-descartavel",
} as const;

/**
 * Cria (ou reconhece como já existente) o SUPERADMIN da plataforma por
 * `scripts/seed-superadmin.ts`.
 *
 * Mesmo molde de `seedFatosBilling`, e pelo mesmo motivo: NÃO existe caminho de
 * API legítimo para criar um SUPERADMIN — `empresaService.registerComUsuario`
 * não aceita `role`, e por D-04 não deve passar a aceitar. O script é a única
 * superfície de criação, e roda pelo resolvedor do projeto para ler o `.env` com
 * o MESMO leitor que a aplicação usa.
 *
 * `execFileSync` é síncrono de propósito: quando ele retorna, a linha já está no
 * banco e a chamada seguinte pode autenticar sem espera artificial.
 */
export function seedSuperadmin(): void {
  execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "./scripts/resolvedor-ts.mjs",
      "scripts/seed-superadmin.ts",
      "--email",
      SUPERADMIN_E2E.email,
      "--senha",
      SUPERADMIN_E2E.senha,
    ],
    { cwd: RAIZ, stdio: "inherit" }
  );
}

/**
 * Publica uma NOVA versão dos Termos de Uso pela superfície real de TERM-02.
 *
 * Publicar é INSERT, sempre (D-07): cada chamada cria uma versão nova e nunca
 * edita a anterior. O efeito colateral é justamente o que os specs de TERM-04
 * querem — todo usuário registrado ANTES desta chamada passa a ter termos
 * pendentes no request seguinte, sem novo login e sem nenhuma escrita direta no
 * banco.
 *
 * Por REST e não por script: assim um único mecanismo fecha os dois requisitos
 * da fase — o SUPERADMIN publica de verdade (TERM-02, incluindo a autorização
 * pela role lida do banco) e o resto do spec observa o efeito (TERM-04). Um
 * script de INSERT direto provaria só a metade de baixo.
 *
 * O contexto é o `request` do Playwright, separado do browser: a `Authorization`
 * vai explícita no header, então nenhum cookie de `page` influencia a publicação.
 */
export async function publicarNovaVersaoDeTermos(
  request: APIRequestContext,
  conteudo: string
): Promise<{ id: string; versao: number }> {
  const login = await request.post("/api/auth/login", {
    data: { email: SUPERADMIN_E2E.email, senha: SUPERADMIN_E2E.senha },
  });

  expect(
    login.status(),
    `login do SUPERADMIN falhou — rode \`npm run seed:superadmin -- --email ${SUPERADMIN_E2E.email} --senha ${SUPERADMIN_E2E.senha}\`, ` +
      "ou apague o usuário que já ocupa esse email com outra credencial"
  ).toBe(200);

  const { token } = (await login.json()) as { token: string };

  const publicacao = await request.post("/api/termos", {
    headers: { authorization: `Bearer ${token}` },
    data: { conteudo },
  });

  expect(publicacao.status()).toBe(201);

  return (await publicacao.json()) as { id: string; versao: number };
}

/**
 * Gera um CPF com dígito verificador válido (mesmo algoritmo de
 * `lib/cpf-cnpj.ts`) e único a cada chamada: o registro exige `cpfCnpj`
 * desde `bloqueio de registro por cpf/cnpj`, e o campo é `@unique` no schema,
 * então cada empresa nova do e2e precisa do próprio número.
 */
let sequenciaCpf = 0;

function calcularDigitoVerificadorCpf(base: string, pesos: number[]): number {
  const soma = base
    .split("")
    .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);

  const resto = soma % 11;

  return resto < 2 ? 0 : 11 - resto;
}

function gerarCpfValidoUnico(): string {
  sequenciaCpf += 1;

  const nove = `${Date.now()}${sequenciaCpf}`.slice(-9).padStart(9, "0");
  const pesos1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

  const digito1 = calcularDigitoVerificadorCpf(nove, pesos1);
  const digito2 = calcularDigitoVerificadorCpf(nove + digito1, pesos2);

  return `${nove}${digito1}${digito2}`;
}

export function uniqueEmpresa() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;

  return {
    nomeEmpresa: `Loja E2E ${suffix}`,
    nomeResponsavel: "Admin E2E",
    email: `admin-e2e-${suffix}@teste.com`,
    senha: "senha123",
    cpfCnpj: gerarCpfValidoUnico(),
  };
}
