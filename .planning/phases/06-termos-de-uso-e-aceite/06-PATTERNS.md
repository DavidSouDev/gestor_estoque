# Phase 6: Termos de Uso e Aceite - Pattern Map

**Mapped:** 2026-09-02
**Files analyzed:** 24 new/modified files
**Analogs found:** 22 / 24 (2 sem análogo direto)

> Toda a fase é repetição de padrões já provados neste repositório. Nenhum arquivo aqui exige invenção — cada um tem um irmão mais velho no código, e este documento diz qual é e quais linhas copiar.

---

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|---|
| `prisma/schema.prisma` | mod | model | — | `AuditoriaAcesso` + `EventoWebhookAsaas` (mesmo arquivo) | exact |
| `prisma/migrations/*_add_superadmin_role/migration.sql` | new | migration | batch | `prisma/migrations/20260901195303_add_worker_diario_causa/migration.sql` | exact |
| `prisma/migrations/*_seed_termo_v1/migration.sql` | new | migration | batch | idem (segunda migration, Pitfall 1) | role-match |
| `app/services/termo.service.ts` | new | service | CRUD (append-only) | `app/services/acesso.service.ts` | exact |
| `app/services/termo.service.test.ts` | new | test | — | `app/services/acesso.service.test.ts` | exact |
| `app/api/termos/route.ts` | new | route | request-response | `app/api/usuarios/route.ts` (handler) + `app/api/cron/reconciliacao-diaria/route.ts` (autorização) | role-match |
| `app/api/termos/route.test.ts` | new | test | — | `tests/helpers/request.ts` + `tests/helpers/auth.ts` | partial (**primeiro teste role-gated do projeto**) |
| `lib/auth-guard.ts` | mod | middleware/DAL | request-response | ele mesmo — campo `carenciaAte` (linhas 17-21) é o precedente de campo derivado em `ContaAtiva` | exact |
| `lib/session.ts` | mod | middleware | request-response | ele mesmo — gate `acessoBloqueado` (linhas 137-141) | exact |
| `lib/api-auth.ts` | mod | middleware | request-response | ele mesmo — gate `acessoBloqueado` (linhas 121-129) | exact |
| `app/[slug]/admin/aceitar-termos/page.tsx` | new | page (RSC) | request-response | `app/[slug]/admin/bloqueado/page.tsx` | exact |
| `app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx` | new | component (server) | — | `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx` | exact |
| `app/[slug]/admin/aceitar-termos/_components/aceitar-button.tsx` | new | component (client) | — | `app/[slug]/admin/_components/pagar-button.tsx` | exact |
| `app/[slug]/admin/aceitar-termos/actions.ts` | new | server action | request-response | `app/[slug]/admin/_lib/assinatura-actions.ts` (`iniciarPagamento`) | exact |
| `app/[slug]/admin/aceitar-termos/page.test.ts` | new | test | — | `app/[slug]/admin/bloqueado/page.test.ts` | exact |
| `app/registro/actions.ts` | mod | server action | request-response | ele mesmo (linhas 26-48, cadeia de validações) | exact |
| `app/registro/actions.test.ts` | new | test | — | `app/services/acesso.service.test.ts` (shape `// @vitest-environment node`) | partial (não existe teste de Server Action hoje) |
| `app/registro/page.tsx` | mod | page (RSC) | request-response | ele mesmo + `bloqueado/page.tsx` (fallback de props) | exact |
| `app/registro/_components/register-form.tsx` | mod | component (client) | — | ele mesmo + `(protected)/_components/collapsible-section.tsx` (padrão `<details>`) | exact |
| `app/services/empresa.service.ts` | mod | service | CRUD | ele mesmo — `registerComUsuario` (linhas 78-156) | exact |
| `scripts/seed-superadmin.ts` | new | script/config | batch | `scripts/seed-fatos-billing.ts` | exact |
| `scripts/gates-fase-06.mjs` | new | script/config | batch | `scripts/gates-fase-05.mjs` | exact |
| `tests/setup/prisma-mock.ts` | mod | test setup | — | ele mesmo (linhas 31-44) | exact |
| `e2e/aceite-de-termos.spec.ts` + 9 specs | new/mod | test (e2e) | — | `e2e/cadastro-e-login.spec.ts` + `e2e/helpers.ts` (`seedFatosBilling`) | exact |

---

## Pattern Assignments

### `app/services/termo.service.ts` (service, CRUD append-only)

**Analog:** `app/services/acesso.service.ts` (arquivo inteiro, 64 linhas)

**Imports + module shape** (`acesso.service.ts:1-4, 62-64`):
```ts
import { prisma } from "@/lib/prisma";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";

class AcessoService { /* ... */ }

export const acessoService = new AcessoService();
```
→ `class TermoService { ... }` + `export const termoService = new TermoService();`. Sem `default export`, sem barrel.

**Transação interativa** (`acesso.service.ts:44-60`) — copiar a forma para `registrarAceite`:
```ts
return prisma.$transaction(async (tx) => {
  const { count } = await tx.empresa.updateMany({ ... });
  if (count === 0) return null;
  return tx.auditoriaAcesso.create({ data: { ... } });
});
```

**Tratamento de P2002** — copiar de `app/services/empresa.service.ts:138-155`:
```ts
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
    if (target.includes("email")) {
      throw new HttpError("Este email já está em uso.", 409);
    }
  }
  throw error;
}
```
→ `publicar`: P2002 em `versao` → `HttpError("Outra publicação ocorreu em paralelo. Tente novamente.", 409)`.
→ `registrarAceite`: P2002 em `[usuarioId, termoId]` → **`return` silencioso** (idempotência, não erro).

**JSDoc normativo** — `acesso.service.ts:5-35` é o modelo de densidade: numera as invariantes ("1. **D-16 — só transição real gera linha.**"), nomeia a decisão do CONTEXT e diz o que a alternativa descartada quebraria. Reproduzir para: "não existe `update`/`delete` aqui, e isso é o contrato de TERM-03".

---

### `app/api/termos/route.ts` (route, request-response)

**Analog (shape do handler):** `app/api/usuarios/route.ts:31-56`

**Estrutura de handler + erro** (linhas 6-29):
```ts
export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    const usuarios = await usuarioService.list(auth.empresaId);
    return NextResponse.json(usuarios);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ message: "Erro ao listar usuários." }, { status: 500 });
  }
}
```
→ Adicionar os branches `HttpError` (padrão de `usuarios/route.ts:41-43`) e `z.ZodError` → 400.

**Imports** (`app/api/usuarios/route.ts:1-4`):
```ts
import { requireAuth, AuthError } from "@/lib/api-auth";
import { HttpError } from "@/lib/http-error";
import { NextResponse } from "next/server";
```
⚠️ A linha 1 daquele arquivo usa caminho relativo (`"../../services/usuario.service"`) — **é a exceção, não o padrão**. CLAUDE.md §Import Organization exige `@/`; usar `@/app/services/termo.service`.

**Autorização por role FRESCA** (Achado Crítico 1 / Pitfall 2) — a `role` do payload de `requireAuth` tem até 7 dias. O JSDoc de `lib/api-auth.ts:61-64` autoriza a segunda leitura:
```ts
const auth = await requireAuth(request);
const conta = await revalidarConta(auth.sub, auth.empresaId); // grátis: React.cache já tem
if (conta?.role !== UserRole.SUPERADMIN) {
  throw new AuthError("Ação não permitida.", 403);
}
```
**Proibido:** `auth.role ===` / `session.role ===` em código de produção (gate de grep).

---

### `app/[slug]/admin/aceitar-termos/page.tsx` (page RSC, request-response)

**Analog:** `app/[slug]/admin/bloqueado/page.tsx` (arquivo inteiro, 66 linhas) — **espelho 1:1**

**Docblock de posição na árvore** (linhas 1-16) — adaptar palavra por palavra:
```ts
/**
 * Rota de suspensão de acesso — deliberadamente FORA do grupo `(protected)`.
 *
 * O layout daquele grupo chama a DAL de sessão do admin, e é ela que (...) manda
 * a empresa bloqueada para cá. Se esta página morasse dentro do grupo, entrar
 * nela dispararia o mesmo guard que acabou de mandar o usuário para ela:
 * `ERR_TOO_MANY_REDIRECTS`. (...) A posição deste arquivo na árvore é a
 * mitigação (T-04-14); mover a pasta para dentro de `(protected)` reintroduz o
 * bug sem alterar uma linha de código.
 *
 * `proxy.ts` já exige cookie válido para qualquer `/:slug/admin/:path*` que não
 * seja o login, então esta rota herda o pré-filtro de graça. Ele é otimista
 * (não toca no banco) e NÃO substitui a guarda simétrica abaixo.
 */
```

**Guarda simétrica** (linhas 36-55) — copiar literalmente, trocando o predicado:
```ts
const session = await getVerifiedSession();
if (!session || session.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}

const conta = await revalidarConta(session.sub, session.empresaId);
if (!conta || !acessoBloqueado(conta.statusAcesso)) {
  redirect(`/${slug}/admin`);
}

const empresa = await empresaService.findHeaderData(session.empresaId);
```
→ Para `aceitar-termos`, a máquina de estados exige **três** condições nesta ordem: `!conta` → `/admin`; `acessoBloqueado(conta.statusAcesso)` → `/admin/bloqueado`; `!conta.termosPendentes` → `/admin`.
⚠️ E `bloqueado/page.tsx` **não pode** ganhar checagem de termos — seria o loop (sim, sim).

**Fallback de branding + bind das actions** (linhas 55-65):
```tsx
const empresa = await empresaService.findHeaderData(session.empresaId);

return (
  <BloqueadoCard
    primaryColor={empresa?.primaryColor ?? "#18181b"}
    accentColor={empresa?.accentColor ?? "#3f3f46"}
    erroCheckout={erro === "checkout"}
    pagarAction={iniciarPagamento.bind(null, slug)}
    logoutAction={logout.bind(null, slug)}
  />
);
```
→ `logoutAction={logout.bind(null, slug)}` é **reuso direto** de `app/[slug]/admin/_lib/auth-actions.ts:50-53` — não escrever logout novo.

---

### `app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx` (component, server)

**Analog:** `bloqueado/_components/bloqueado-card.tsx` (117 linhas) — shell idêntico

**Props como decisões já tomadas** (linhas 3-9 + JSDoc 11-28):
```ts
export interface BloqueadoCardProps {
  primaryColor: string;
  accentColor: string;
  erroCheckout: boolean;
  pagarAction: () => Promise<void>;
  logoutAction: () => Promise<void>;
}
```
JSDoc (linhas 20-23): *"Este componente não recebe — e não pode receber — o rótulo de acesso da empresa: um branch de texto aqui é a violação exata que o contrato proíbe. Por isso a prop que chega é a decisão já tomada, não o estado bruto."* → mesma regra: `erro: boolean`, nunca "já aceitou antes?".

**Shell + gradiente** (linhas 37-47) — copiar literalmente:
```tsx
<div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
  <div className="w-full max-w-md">
    <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
      <div className="h-2" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})` }} />
      <div className="p-8">
```

**Tile de status** (linhas 48-62) — **trocar** `bg-amber-50` → `bg-slate-100`, `text-amber-600` → `text-slate-600`, e o `d` do cadeado pelo glifo de documento (UI-SPEC §Iconography). Âmbar é proibido nesta fase.

**Bloco de erro inline** (linhas 76-93) — o único padrão de erro do projeto, copiar caractere a caractere:
```tsx
<div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
  <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
  <span className="text-xs text-red-600">{...}</span>
</div>
```

**Botão de logout** (linhas 100-110) — copiar verbatim, **inclusive o comentário**:
```tsx
{/* Sair não é ação destrutiva: encerra a sessão e é desfeito por um
    novo login. Sem confirmação e sem tinta vermelha — os controles
    de saída que já existem no painel também não têm nenhuma. */}
<form action={logoutAction}>
  <button type="submit"
    className="mt-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">
    Sair da conta
  </button>
</form>
```

---

### `app/[slug]/admin/aceitar-termos/_components/aceitar-button.tsx` (component, client)

**Analog:** `app/[slug]/admin/_components/pagar-button.tsx` (65 linhas)

**Hook + JSDoc do porquê** (linhas 1-15):
```tsx
"use client";
import { useFormStatus } from "react-dom";
/**
 * (...) O hook usado é `useFormStatus`, e não o hook de estado de action: a
 * action devolve `void` e termina em `redirect()`, então não existe estado
 * nenhum para renderizar de volta — só o "estou enviando" do form (...)
 */
```

**Classe + style do tenant** (linhas 30-31, 43-62) — a variante `bloqueado` é a classe exata que a UI-SPEC pede:
```tsx
"w-full rounded-xl py-3 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-60 focus:ring-2"

<button type="submit" disabled={pending} className={...}
  style={{ backgroundColor: primaryColor, "--tw-ring-color": primaryColor } as React.CSSProperties}>
  {pending ? "Registrando aceite..." : "Aceitar e continuar"}
</button>
```

---

### `app/[slug]/admin/aceitar-termos/actions.ts` (server action, request-response)

**Analog:** `app/[slug]/admin/_lib/assinatura-actions.ts` (`iniciarPagamento`, linhas 1-55)

**Auto-autorização + tenant da sessão** (linhas 29-37):
```ts
"use server";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";

const session = await getVerifiedSession();

// C-08 / T-04-17: o tenant sai da sessão e de mais lugar nenhum. O `FormData`
// que o React entrega junto nunca é lido, e o `slug` da URL só serve para
// confirmar que a sessão pertence a ESTA empresa antes de qualquer I/O.
if (!session || session.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}
```
→ Pitfall 8: `usuarioId` vem de `session.sub`, **nunca** do `FormData`. Nenhum input `usuarioId` no form.

**`redirect` fora do `try`** (linhas 50-54):
```ts
// FORA do `try` de propósito: `redirect()` sinaliza lançando `NEXT_REDIRECT`,
// e o `catch` acima o engoliria — a navegação simplesmente não aconteceria.
redirect(url ?? `/${slug}/admin/bloqueado?erro=checkout`);
```
→ Aceite: `redirect(`/${slug}/admin`)` no sucesso; `?erro=termos-atualizados` no TOCTOU (E1).

---

### `lib/auth-guard.ts` (DAL, modificação)

**Analog:** ele mesmo. `carenciaAte` (linhas 17-21) é o precedente exato de campo derivado exposto em `ContaAtiva`:
```ts
/**
 * Devolvido aqui (e não re-derivado pelo chamador) porque o banner de
 * "dias restantes" de ACC-01, na Fase 4, precisa exatamente deste valor.
 */
carenciaAte: Date | null;
```
→ `termosPendentes: boolean` com JSDoc do mesmo formato + "SUPERADMIN é sempre `false` (D-03), mitigação do impasse do Pitfall 9".

**`select` explícito, nunca `include`** (linhas 60-78) — adicionar `termoAceitoId: true` a este bloco:
```ts
select: {
  // select explícito: nunca traz senhaHash (C-06). `include` é proibido
  // no modelo Usuario justamente porque arrastaria o hash da senha.
  id: true, email: true, role: true, empresaId: true,
  empresa: { select: { slug: true, acessoAte: true, /* ... */ } },
},
```

**`React.cache` + fail-closed** (linhas 48-50, 124-129) — `termoVigente()` segue a mesma forma e cai no mesmo `catch`:
```ts
export const revalidarConta = cache(async (usuarioId, empresaId) => {
  try { /* ... */ } catch (error) {
    // Fail-closed: erro de banco NÃO autoriza (D-01).
    console.error("[auth-guard] falha ao revalidar conta:", error);
    return null;
  }
});
```
⚠️ `unstable_cache` / `'use cache'` **proibidos** (decisão `[01-02]`, Pitfall 7).

---

### `lib/session.ts` e `lib/api-auth.ts` (middleware, modificação)

**Analog:** os próprios gates de `acessoBloqueado` da Fase 4 — o novo gate fica **imediatamente depois**, com a mesma forma.

`lib/session.ts:132-141`:
```ts
// redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch.
if (!session || !conta || conta.empresaSlug !== slug) {
  redirect(`/${slug}/admin/login`);
}

// ACC-02 / D-04 / D-06. Fica DEPOIS do redirect de login de propósito: uma
// sessão inválida nunca chega a ver a tela de bloqueio.
if (acessoBloqueado(conta.statusAcesso)) {
  redirect(`/${slug}/admin/bloqueado`);
}
// ← TERM-04 entra AQUI: if (conta.termosPendentes) redirect(`/${slug}/admin/aceitar-termos`);
```

`lib/api-auth.ts:121-129`:
```ts
// ACC-02 / D-06: os dois rótulos de suspensão são tratados igual (...)
if (!opcoes.permitirEmpresaBloqueada && acessoBloqueado(conta.statusAcesso)) {
  throw new AuthError("Assinatura suspensa por falta de pagamento.", STATUS_ASSINATURA_SUSPENSA);
}
// ← TERM-04 entra AQUI: if (conta.termosPendentes) throw new AuthError("Termos de uso pendentes de aceite.", 403);
```
O JSDoc de `requireAuth` (linhas 68-71) explica por que uma linha cobre 43 call sites sem editar os 29 handlers — reproduzir o raciocínio para o novo gate.

---

### `app/registro/actions.ts` (server action, modificação)

**Analog:** ele mesmo, linhas 19-48 — cadeia de `if (!x) return { error: "..." }`:
```ts
const modoInterfaceRaw = String(formData.get("modoInterface") ?? "");

if (!nomeEmpresa) {
  return { error: "Informe o nome da empresa." };
}
// ...
if (modoInterfaceRaw !== "SIMPLES" && modoInterfaceRaw !== "COMPLETO") {
  return { error: "Selecione um modo de uso." };
}
```
→ Adicionar, no mesmo estilo: `formData.get("aceiteTermos") === "on"` (E3) e `termoId` presente (E2).

**Tratamento de erro do service** (linhas 70-78) — inalterado, já cobre `HttpError`:
```ts
} catch (error) {
  if (error instanceof HttpError) { return { error: error.message }; }
  console.error(error);
  return { error: "Não foi possível concluir o cadastro. Tente novamente." };
}
redirect(redirectTo);   // fora do try
```

---

### `app/services/empresa.service.ts` — `registerComUsuario` (modificação)

**Analog:** ele mesmo, linhas 78-137. As duas escritas novas entram **dentro da mesma `$transaction`**:
```ts
const slug = await generateUniqueSlug(data.nomeEmpresa);
const senhaHash = await bcrypt.hash(data.senha, 10);
// ← ler termoVigente() AQUI, fora da transação (mesma disciplina de pool)

return await prisma.$transaction(async (tx) => {
  const empresa = await tx.empresa.create({ data: { ... } });
  const usuario = await tx.usuario.create({
    data: { nome, email, senhaHash, empresaId: empresa.id /* , termoAceitoId */ },
  });
  // BILL-05: primeira entrada da trilha, na MESMA transação — se o registro
  // fizer rollback (ex.: P2002 de email duplicado), a linha de auditoria some
  // junto e a trilha não fica com fantasmas.
  await tx.auditoriaAcesso.create({ data: { ... } });
  // ← tx.aceiteTermo.create({ data: { usuarioId: usuario.id, termoId: termo.id } });
  return { empresa, usuario };
});
```

---

### `scripts/seed-superadmin.ts` (script, batch)

**Analog:** `scripts/seed-fatos-billing.ts` (cabeçalho, linhas 1-35)

**Cabeçalho normativo** — reproduzir os quatro blocos: *POR QUE ISTO EXISTE* / *POR QUE ELE RODA PELO RESOLVEDOR DO PROJETO* (incidente do `$` na chave do Asaas, decisão `[03-07]`) / guarda de ambiente (⚠️ **aqui NÃO se aplica** — o superadmin é necessário em produção; documentar a divergência) / limitação de A3 (`@@unique([empresaId])` ⇒ um superadmin por empresa interna).

**Entrada em `package.json`** (linha 20, formato exato):
```json
"seed:billing": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/resolvedor-ts.mjs scripts/seed-fatos-billing.ts"
```
→ `"seed:superadmin": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/resolvedor-ts.mjs scripts/seed-superadmin.ts"`

**Mapa exaustivo `Record<...>`** (linhas 47-62) — o padrão que transforma valor novo de enum em erro de compilação. Se o script mapear roles, usar a mesma técnica.

---

### `scripts/gates-fase-06.mjs` (script, batch)

**Analog:** `scripts/gates-fase-05.mjs` (cabeçalho, linhas 1-52)

Três regras de higiene já codificadas ali e **obrigatórias** aqui:
1. *"antes de contar ocorrências dentro de um arquivo de código, as linhas de comentário são descartadas"* — senão os JSDoc que citam `session.role ===` para proibi-lo tornariam o gate vermelho (decisão `[04-09]`).
2. Agulhas montadas por concatenação (`"auth" + ".role ==="`).
3. `ehFonte` descarta `*.test.ts` — os testes citam os identificadores proibidos de propósito.
```js
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const RAIZ = path.resolve(import.meta.dirname, "..");
```
Saída: código 1 na primeira violação, **mas todos os gates rodam** ("quem acabou de quebrar o build quer ver a lista inteira").

**Gates desta fase:** (a) nenhum `auth.role ===` / `session.role ===` em fonte; (b) `termo.service.ts` não contém `update`/`delete` de `termoDeUso`; (c) nenhum utilitário `amber-*` nos arquivos novos; (d) nenhum caminho HTTP escreve `role`.

---

### `tests/setup/prisma-mock.ts` (test setup, modificação) — **Wave 0, primeiro item**

**Analog:** ele mesmo, linhas 13-45. O comentário já documenta esta exata classe de regressão em massa:
```ts
beforeEach(() => {
  mockReset(prismaMock);
  // (...) A conta default também precisa carregar fatos de billing consistentes,
  // porque `revalidarConta` agora avalia acesso a cada chamada (...)
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1", email: "admin@teste.com", role: "ADMIN", empresaId: "empresa-1",
    empresa: { slug: "empresa-teste", trialFim: new Date("2099-01-01T03:00:00.000Z"), /* ... */ },
  } as never);
});
```
→ Adicionar `termoAceitoId` **e** o stub de `prismaMock.termoDeUso.findFirst`, na combinação NEUTRA (`termosPendentes === false`). Sem isso, toda a suíte autenticada fica vermelha de uma vez.

---

### `e2e/*.spec.ts` (test e2e) — blast radius de 9 arquivos

**Analog:** `e2e/cadastro-e-login.spec.ts:5-16` — cada spec tem seu **próprio** helper de registro (não há um compartilhado):
```ts
await page.goto("/registro");
await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
await page.getByLabel("Seu nome").fill(empresa.nomeResponsavel);
await page.getByLabel("E-mail").fill(empresa.email);
await page.getByLabel("Senha", { exact: true }).fill(empresa.senha);
await page.getByLabel("Confirmar senha").fill(empresa.senha);
// ← await page.getByLabel(/Li e aceito os Termos de Uso/).check();
await page.getByRole("button", { name: "Criar minha loja" }).click();
```
Arquivos a atualizar **no mesmo commit** do checkbox: `cadastro-e-login`, `bloqueio-por-inadimplencia`, `worker-reconciliacao`, `movimentacao-estoque`, `combo-crud`, `promocao-crud`, `modo-simples`, `produto-crud-e-catalogo`, `sessao-revogada`.

**Seed a partir do e2e** — `e2e/helpers.ts:40-58` (`seedFatosBilling`), `execFileSync` síncrono, argumentos opcionais no fim do array. Copiar para invocar `seed-superadmin.ts` se um spec precisar de SUPERADMIN autenticado.

---

### `app/[slug]/admin/aceitar-termos/page.test.ts` (test)

**Analog:** `app/[slug]/admin/bloqueado/page.test.ts` (165 linhas) — copiar literalmente

**Setup de mocks** (linhas 1-31):
```ts
// @vitest-environment node
const { redirectMock, getVerifiedSessionMock, revalidarContaMock, findHeaderDataMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  getVerifiedSessionMock: vi.fn(),
  revalidarContaMock: vi.fn(),
  findHeaderDataMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/session", () => ({ getVerifiedSession: getVerifiedSessionMock }));
vi.mock("@/lib/auth-guard", () => ({ revalidarConta: revalidarContaMock }));
```

**Asserção de redirect** (linhas 82-87) + **extração só dos props visuais** (linhas 62-66, porque as actions são funções ligadas sempre distintas):
```ts
await expect(renderizar()).rejects.toThrow(`REDIRECT:/${SLUG}/admin/login`);
expect(revalidarContaMock).not.toHaveBeenCalled();
```
→ Cobrir os 4 estados da máquina + o caso SUPERADMIN.

---

## Shared Patterns

### Erros com `.status`
**Source:** `lib/api-auth.ts:5-12` (`AuthError`), `lib/http-error.ts` (`HttpError`)
**Apply to:** `termo.service.ts`, `app/api/termos/route.ts`, `registro/actions.ts`
```ts
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) { super(message); this.status = status; }
}
```
Handlers propagam `error.status` genericamente — nenhum hardcoda código. Um `throw` novo em `requireAuth` cobre 43 call sites sem editar handler nenhum.

### `select` explícito, nunca `include`, em `Usuario`
**Source:** `lib/auth-guard.ts:60-63`
**Apply to:** toda query nova que toque `Usuario`
```ts
// select explícito: nunca traz senhaHash (C-06). `include` é proibido
// no modelo Usuario justamente porque arrastaria o hash da senha.
```
Exceção pré-existente e **não replicável**: `usuarioService.validatePassword` usa `include` de propósito.

### `React.cache` e só ele
**Source:** `lib/auth-guard.ts:48` + JSDoc de `lib/api-auth.ts:79-86`
**Apply to:** `termoVigente()`
```ts
export const revalidarConta = cache(async (usuarioId, empresaId) => { ... });
```
`unstable_cache` / `'use cache'` congelariam a autorização — decisão `[01-02]`, T-04-08, Pitfall 7.

### `redirect()` sempre fora de `try/catch`
**Source:** `lib/session.ts:132`, `assinatura-actions.ts:50-52`, `registro/actions.ts:50/80`
**Apply to:** todas as pages e Server Actions novas
```ts
// FORA do `try` de propósito: `redirect()` sinaliza lançando `NEXT_REDIRECT`,
// e o `catch` acima o engoliria — a navegação simplesmente não aconteceria.
```

### Bloco de erro inline (único padrão do projeto)
**Source:** `bloqueado-card.tsx:76-93` ≡ `register-form.tsx:104-121` ≡ `login-form.tsx:50-66`
**Apply to:** `aceite-card.tsx`, `register-form.tsx` (E1–E4)
Classe e SVG idênticos nos três — copiar, não reinventar.

### Classe + singleton no service
**Source:** `acesso.service.ts:4/64`
**Apply to:** `termo.service.ts`
```ts
class AcessoService { /* ... */ }
export const acessoService = new AcessoService();
```

### JSDoc que registra a decisão, não o óbvio
**Source:** `lib/session.ts:91-123`, `lib/api-auth.ts:31-51`, `acesso.service.ts:5-35`
**Apply to:** todo arquivo novo desta fase
A forma é: nomear a decisão (`D-03`, `T-04-14`), dizer o que a alternativa descartada quebraria, e — no caso de D-02/D-03 — dizer explicitamente **"isto é mitigação de impasse, não conveniência"** (Pitfall 9).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `app/api/termos/route.test.ts` | test | — | **Não existe teste de rota role-gated no projeto** (nenhum `if (role === ...)` em produção hoje). Base: `tests/helpers/request.ts` (`buildRequest({ token })`) + `tests/helpers/auth.ts` (`buildAuthToken`). ⚠️ `buildAuthToken` muda o **token**; o que autoriza é a role **do banco** — o que precisa mudar é `prismaMock.usuario.findFirst`. Escrever os dois casos (token SUPERADMIN + banco ADMIN → 403; ambos SUPERADMIN → 201) para provar não-vacuidade |
| `app/registro/actions.test.ts` | test | — | Não existe teste de Server Action de registro hoje. Aproximação mais próxima: `app/services/acesso.service.test.ts` (`// @vitest-environment node`, `prismaMock`, helper `mockTransaction`) — mas o mock de `createAdminSession`/`redirect` é novo, e o shape de `vi.hoisted` vem de `bloqueado/page.test.ts` |

---

## Metadata

**Analog search scope:** `lib/`, `app/services/`, `app/api/`, `app/[slug]/admin/`, `app/registro/`, `scripts/`, `tests/`, `e2e/`, `prisma/`
**Files read this session:** 17 (auth-guard, session, api-auth, bloqueado page/card/test, api/usuarios/route, registro actions/page/form, acesso.service + test, empresa.service §registerComUsuario, prisma-mock, pagar-button, auth-actions, assinatura-actions, seed-fatos-billing, gates-fase-05, e2e/cadastro-e-login, e2e/helpers)
**Pattern extraction date:** 2026-09-02
