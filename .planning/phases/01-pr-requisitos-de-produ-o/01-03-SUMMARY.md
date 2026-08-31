---
phase: 01-pr-requisitos-de-produ-o
plan: 03
subsystem: auth
tags: [session, api-auth, dal, fail-closed, multi-tenant, vitest, tdd, typescript]

# Dependency graph
requires:
  - phase: 01-pr-requisitos-de-produ-o (plano 01-01)
    provides: singleton do Prisma em lib/prisma.ts (uma conexão por processo)
  - phase: 01-pr-requisitos-de-produ-o (plano 01-02)
    provides: revalidarConta + ContaAtiva em lib/auth-guard.ts
provides:
  - "requireAdminSession revalida a conta no banco antes de autorizar qualquer page/layout/Server Action do admin"
  - "requireAuth revalida a conta no banco antes de autorizar qualquer rota app/api/* — AuthError 401 'Sessão inválida.'"
  - "getVerifiedSession() em lib/session.ts — versão verificada no banco do getSession, para as telas públicas de login/registro (anti-loop de redirect)"
  - "Stub default de conta ativa em tests/setup/prisma-mock.ts — fixture única para os 14 arquivos de teste autenticados"
  - "14 gates automatizados novos (9 em session.test.ts, 5 em api-auth.test.ts)"
affects:
  - "01-04 (login/page.tsx e registro/page.tsx passam a consumir getVerifiedSession)"
  - "01-05 (VERIFICATION da fase — nota operacional T-01-10)"
  - "fase 02 (avaliarAcesso pluga dentro de revalidarConta e herda estas duas camadas sem nova edição)"
  - "fase 04 (enforcement/bloqueio por pagamento)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Revalidação no banco só APÓS a checagem barata (assinatura do JWT; no admin, também o slug) — auth não vira vetor de carga no Postgres"
    - "Comparação do dado fresco do banco contra o token/URL (slug) além do filtro da query — fecha a janela do slug obsoleto"
    - "redirect() como statement puro, nunca dentro de try/catch — o único try da fase mora no DAL"
    - "Stub default de fixture no beforeEach do setup global (após o mockReset) em vez de repetir o stub em 14 arquivos"

key-files:
  created: []
  modified:
    - tests/setup/prisma-mock.ts
    - lib/session.ts
    - lib/session.test.ts
    - lib/api-auth.ts
    - lib/api-auth.test.ts

key-decisions:
  - "Retorno das duas funções continua AuthTokenPayload (não ContaAtiva): trocar o tipo quebraria ~40 call sites e violaria o critério de sucesso #4"
  - "Mensagem única 'Sessão inválida.' para conta inativa, empresa removida e erro de banco — sem enumeração de estado da conta (T-01-06)"
  - "Comentários dos arquivos-fonte reescritos para não repetir literais usados como asserção de fonte (usuario.findFirst, destroySession, conta.empresaSlug) — o gate do plano conta ocorrências no arquivo inteiro, comentário incluído"
  - "Stub global no setup bastou: nenhum dos 12 arquivos de rota autenticada precisou de stub local"

patterns-established:
  - "Pattern: teste de ausência de query — expect(prismaMock.usuario.findFirst).not.toHaveBeenCalled() nos caminhos de rejeição barata (T-01-08)"
  - "Pattern: teste de invalidação entre requests — primeira chamada resolve com o stub default, troca-se o stub, segunda chamada com o MESMO token rejeita"

requirements-completed: [INFRA-02]

# Metrics
duration: 6min
completed: 2026-08-31
---

# Phase 01 Plan 03: Revalidação nas duas camadas de auth Summary

**`revalidarConta` ligado em `requireAdminSession` (cookie/Server Components) e `requireAuth` (Bearer/rotas `app/api/*`): a partir daqui uma conta revogada no banco é rejeitada no request seguinte — redirect no admin, 401 na API — sem novo login e sem esperar o JWT de 7 dias expirar.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-31T13:03:00Z
- **Completed:** 2026-08-31T13:09:00Z
- **Tasks:** 3
- **Files modified:** 5 (todos pré-existentes; nenhum arquivo criado)

## Accomplishments

- **INFRA-02 passa a ter efeito real.** As duas camadas de auth do lado servidor consultam o banco antes de autorizar. Como `app/[slug]/admin/(protected)/layout.tsx` já chamava `requireAdminSession(slug)` e todas as rotas `app/api/*/route.ts` já chamavam `requireAuth(request)`, a mudança propagou para toda a superfície protegida **sem editar nenhum desses arquivos**.
- **Critério de sucesso #2 comprovado por teste**, nas duas camadas: um teste faz a primeira chamada com a conta ativa, troca o stub para `null` e faz a segunda chamada com o **mesmo** cookie/token — ela é rejeitada.
- **Critério de sucesso #4 preservado sem nenhuma concessão:** suíte completa de 67 arquivos verde, agora com 462 testes (eram 448). Nenhuma asserção de status existente foi alterada, o fail-closed não foi relaxado.
- **`getVerifiedSession()` criado**, pronto para o plano 01-04 desarmar o loop de redirect do § Pitfall 1 em `login/page.tsx` e `registro/page.tsx`.
- **`proxy.ts` e `prisma/schema.prisma` intocados** (D-06) — confirmado por `git diff --name-only`.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | Stub default de conta ativa em `tests/setup/prisma-mock.ts` | `b948ddf` | test |
| 2 | Revalidação em `lib/session.ts` — RED | `8b5c3f8` | test |
| 2 | Revalidação em `lib/session.ts` — GREEN | `5f49ed8` | feat |
| 3 | Revalidação em `lib/api-auth.ts` — RED | `87c4b77` | test |
| 3 | Revalidação em `lib/api-auth.ts` — GREEN | `6edbfc6` | feat |

REFACTOR não foi necessário em nenhum dos dois ciclos: as implementações saíram no formato final do padrão de referência (RESEARCH § Pattern 3).

### Saída dos gates RED

Task 2, `npx vitest run lib/session.test.ts` antes de editar `lib/session.ts`:

```
Test Files  1 failed (1)
     Tests  8 failed | 10 passed (18)
```

(as 8 falhas: 4 de `getVerifiedSession is not a function` + 4 de `requireAdminSession` que ainda autorizava a conta revogada)

Task 3, `npx vitest run lib/api-auth.test.ts` antes de editar `lib/api-auth.ts`:

```
Test Files  1 failed (1)
     Tests  3 failed | 5 passed (8)
```

Os testes de "não consulta o banco" (T-01-08) passam já no RED, por construção — são guardas de regressão, não gates de implementação.

## Respostas às perguntas registradas no `<output>` do plano

**1. Algum dos 12 arquivos de rota autenticada precisou de stub local?**
Não. **Nenhum.** O stub default no `beforeEach` de `tests/setup/prisma-mock.ts` bastou para os 12 arquivos (`combos`, `combos/[id]`, `empresas`, `empresas/[id]`, `movimentacoes`, `movimentacoes/[id]`, `produtos`, `produtos/[id]`, `promocoes`, `promocoes/[id]`, `usuarios`, `usuarios/[id]`). Nenhum deles foi editado — `git diff --name-only` da fase lista apenas os 5 arquivos de `lib/` e `tests/setup/`. Confirmado o que o planejamento previu: nenhum teste existente usava `prismaMock.usuario.findFirst`, então o stub não colidiu com asserção alguma.

**2. O `vi.clearAllMocks()` de `lib/session.test.ts` preservou o stub global?**
**Sim, preservou** — não foi preciso re-aplicar o stub no arquivo. Mecanismo: o `beforeEach` do setup global (escopo de arquivo) roda **antes** do `beforeEach` de dentro do `describe("session")`; `vi.clearAllMocks()` chama `mockClear()`, que zera `mock.calls`/`mock.results` mas **preserva a implementação** instalada por `mockResolvedValue` (quem apagaria seria `resetAllMocks`). Os 3 casos de sucesso pré-existentes de `requireAdminSession` continuaram verdes sem edição de asserção.

**3. O stub global interferiu em `lib/prisma.test.ts` sob `vi.unmock`?**
**Não.** `npx vitest run lib/prisma.test.ts` sai com código 0 (2 testes) logo após a Task 1 e continua verde na suíte completa. Não foi preciso guardar o stub atrás de nenhuma checagem defensiva. Motivo: os `setupFiles` são executados **antes** do módulo de teste, de modo que o `await import("@/lib/prisma")` do setup ainda resolve para o `mockDeep` — o `vi.unmock` hoistado só afeta os imports do próprio arquivo de teste. `prismaMock` continua sendo um mock legítimo com `mockResolvedValue` disponível, e o gate do INFRA-01 segue exercitando o módulo real.

**4. Nota operacional (T-01-10 / § Pitfall 7)**
A partir deste commit, **um pico de 401 na API ou de redirects para o login NÃO significa necessariamente sessões revogadas — pode significar Postgres indisponível.** É a consequência aceita do fail-closed (D-01): `revalidarConta` devolve `null` tanto para "conta revogada" quanto para "erro de banco", e as duas camadas tratam `null` como "não autorize". O sinal que distingue os dois casos está no log do servidor: erro de infraestrutura emite `console.error("[auth-guard] falha ao revalidar conta:", ...)`; conta revogada não emite nada. Esta nota precisa entrar no VERIFICATION da fase (plano 01-05) e em qualquer runbook de produção.

## Files Created/Modified

- `tests/setup/prisma-mock.ts` (+16 linhas) — stub default de conta ativa dentro do `beforeEach` existente, imediatamente após `mockReset(prismaMock)`. Valores casados com `testAuthPayload`; shape casado com a projeção de `revalidarConta`. `vi.mock` do topo, export de `prismaMock` e `tests/setup/vitest.setup.ts` intocados.
- `lib/session.ts` (+49/−4) — importa `revalidarConta` de `@/lib/auth-guard`; `getVerifiedSession()` novo; `requireAdminSession` revalida.
- `lib/session.test.ts` (+119/−1) — 9 casos novos (18 no total, eram 9).
- `lib/api-auth.ts` (+27/−1) — importa `revalidarConta`; `requireAuth` revalida após o `try/catch` do `verifyAuthToken`.
- `lib/api-auth.test.ts` (+52/−1) — 5 casos novos (9 no total, eram 4).

### Forma final de `requireAdminSession`

```typescript
export async function requireAdminSession(slug: string): Promise<AuthTokenPayload> {
  const session = await getSession();

  const conta =
    session && session.empresaSlug === slug
      ? await revalidarConta(session.sub, session.empresaId)
      : null;

  // redirect() lança NEXT_REDIRECT — mantenha-o FORA de qualquer try/catch.
  if (!session || !conta || conta.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  return session;
}
```

Três invariantes travados por teste: (a) o banco só é consultado após token válido **e** slug batendo; (b) o slug fresco do banco é comparado contra a URL; (c) `redirect()` fora de qualquer `try`.

## Decisions Made

- **Retorno continua `AuthTokenPayload` nas duas funções** — devolver `ContaAtiva` mudaria a assinatura consumida por ~40 call sites (todo `app/api/*/route.ts` e as pages do admin) e violaria o critério de sucesso #4. Quem quiser o dado fresco chama `revalidarConta` diretamente: no mesmo request sai de graça, porque o `React.cache` já tem o resultado.
- **Mensagem única `"Sessão inválida."`** em `requireAuth` para conta inativa, empresa removida e erro de banco (C-04, ASVS V7, T-01-06). O cliente não consegue enumerar estado de conta a partir da resposta.
- **Nenhum `try/catch` novo em `lib/session.ts` nem em `lib/api-auth.ts`.** Cada arquivo mantém exatamente o `try` que já tinha (em volta de `verifyAuthToken`). O `try` do fail-closed vive inteiramente dentro de `revalidarConta`.
- **`destroySession()` não é chamada de `requireAdminSession`** (§ Pitfall 2) — `cookies().delete()` só é legal em Server Function ou Route Handler; de um layout, lança. O cookie stale é inofensivo enquanto toda superfície que o consome revalidar, o que o plano 01-04 completa.
- **Comentários reescritos para não colidir com as asserções de fonte do plano.** Os gates do plano contam ocorrências no arquivo inteiro (`grep -c "usuario.findFirst"`, `grep -c "destroySession"`, `grep -c "conta.empresaSlug"`), sem excluir comentários. As primeiras versões dos JSDoc/comentários citavam esses símbolos e faziam a contagem dar 2. O texto foi parafraseado preservando a intenção explicativa — nenhuma lógica mudou.

## Deviations from Plan

Nenhum desvio de comportamento. Um ajuste de redação, registrado por transparência:

**1. [Rule 3 - Blocking] Paráfrase de comentários que quebravam as asserções de fonte do próprio plano**
- **Found during:** Tasks 1 e 2
- **Issue:** `grep -c "usuario.findFirst" tests/setup/prisma-mock.ts` retornava `2` e `grep -c "destroySession" lib/session.ts` / `grep -c "conta.empresaSlug" lib/session.ts` retornavam `2` — porque os comentários explicativos citavam os mesmos símbolos que os gates contam. Os gates exigem exatamente `1`.
- **Fix:** os comentários foram parafraseados ("a query de revalidação", "a limpeza do cookie fica só na Server Action de logout", "o slug FRESCO vindo do banco") mantendo integralmente o conteúdo explicativo. Nenhuma linha de código alterada.
- **Files modified:** `tests/setup/prisma-mock.ts`, `lib/session.ts`
- **Commits:** `b948ddf`, `5f49ed8`

**Total deviations:** 1 (cosmética). Zero instalações npm (T-01-SC respeitado), zero alterações em `prisma/schema.prisma`, zero variáveis de ambiente novas, zero mudanças de assinatura pública.

## Issues Encountered

Nenhum bloqueio. Os dois riscos que o plano mandava checar nesta execução **não se materializaram**:

- `lib/prisma.test.ts` sob `vi.unmock` continua verde com o stub global (ver resposta 3 acima).
- O `vi.clearAllMocks()` de `lib/session.test.ts` preservou o stub (ver resposta 2 acima).

Persiste um warning de lint pré-existente e fora de escopo (`'Link' is defined but never used` em `app/registro/page.tsx`), já registrado no SUMMARY do plano 01-02. `npm run lint` sai com código 0 (0 errors, 1 warning). Esse arquivo é editado no plano 01-04 — o warning tende a ser resolvido lá.

## Verification

| Verificação | Resultado |
|-------------|-----------|
| `npx vitest run` (suíte completa) | **67 arquivos, 462 testes, todos verdes** (eram 448) |
| `npx vitest run lib/session.test.ts` | 18 passed (eram 9 — +9 `it`, gate exigia ≥6) |
| `npx vitest run lib/api-auth.test.ts` | 9 passed (eram 4 — +5 `it`, gate exigia ≥4) |
| `npx vitest run lib/prisma.test.ts` | 2 passed (gate do INFRA-01 intacto sob o novo stub) |
| `npx vitest run lib/auth-guard.test.ts` | 5 passed |
| `npm run lint` | exit 0 (0 errors; 1 warning pré-existente) |
| `npx tsc --noEmit` | exit 0, nenhum erro |
| `grep -c "usuario.findFirst" tests/setup/prisma-mock.ts` | 1 |
| stub depois do `mockReset` no mesmo `beforeEach` | linha 24 > linha 14 ✅ |
| `grep -c "export async function getVerifiedSession" lib/session.ts` | 1 |
| `grep -c 'from "@/lib/auth-guard"' lib/session.ts` / `lib/api-auth.ts` | 1 / 1 |
| `try {` fora de comentário em `lib/session.ts` / `lib/api-auth.ts` | 1 / 1 (nenhum novo) |
| `grep -c "destroySession" lib/session.ts` | 1 (só a definição) |
| `grep -c "conta.empresaSlug" lib/session.ts` | 1 |
| `redirect(` fora de comentário em `lib/session.ts` | 1, não indentado dentro de `try` |
| `grep -c '"Sessão inválida."' lib/api-auth.ts` | 1 |
| `grep -c "class AuthError" lib/api-auth.ts` | 1 (classe existente reutilizada) |
| Assinaturas públicas inalteradas | `requireAdminSession(slug: string): Promise<AuthTokenPayload>` ✅ / `requireAuth(request: Request): Promise<AuthTokenPayload>` ✅ |
| `grep -cE "prisma\|auth-guard\|revalidarConta" proxy.ts` | 0 (D-06) |
| `git diff --name-only` inclui `proxy.ts` ou `prisma/schema.prisma`? | Não |

## Threat Model Coverage

| Threat ID | Estado |
|-----------|--------|
| T-01-01 (janela de 7 dias do JWT) | **mitigado** — revalidação nas duas camadas; testes de conta revogada em `session.test.ts` e `api-auth.test.ts` |
| T-01-02 (erro de banco autorizando) | **mitigado** — `mockRejectedValue` produz redirect no admin e 401 na API; nenhum `try/catch` novo que pudesse engolir o `NEXT_REDIRECT` |
| T-01-03 (confiar só na borda) | **mitigado** — `proxy.ts` sem `prisma`/`auth-guard` e sem diff; a decisão autoritativa está nas camadas server |
| T-01-04 (token de um tenant em outro) | **mitigado** — filtro `id`+`empresaId` no DAL **mais** a comparação do slug fresco contra a URL; teste do slug obsoleto verde |
| T-01-06 (vazamento pela mensagem de erro) | **mitigado** — `"Sessão inválida."` idêntica para revogação e erro de banco; teste asserta a mensagem nos dois casos |
| T-01-08 (auth como vetor de carga no banco) | **mitigado** — dois testes assertam `not.toHaveBeenCalled()` (sem sessão / token de outro tenant) |
| T-01-10 (Postgres fora do ar derruba sessões) | **aceito** (D-01) — nota operacional registrada acima para o plano 01-05 |
| T-01-13 (`cookies().delete()` em Server Component) | **mitigado** — `destroySession` não é referenciada por `requireAdminSession`; asserção de fonte verde |
| T-01-SC (instalações npm) | **aceito** — zero instalações neste plano |

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. As duas funções alteradas **estreitam** a superfície existente; nenhum endpoint, caminho de auth, acesso a arquivo ou schema novo foi introduzido.

## Known Stubs

Nenhum stub de produção. O único stub introduzido (`tests/setup/prisma-mock.ts`) é fixture de teste, por design, e vive sob `tests/`.

## User Setup Required

None — nenhuma configuração de serviço externo, variável de ambiente ou migration.

## Next Phase Readiness

- **Plano 01-04 pode começar.** `getVerifiedSession()` está exportada de `@/lib/session` com assinatura `(): Promise<AuthTokenPayload | null>`. Os dois call sites a trocar são `app/[slug]/admin/login/page.tsx:13` e `app/registro/page.tsx:8` — hoje ambos usam `getSession()`, o que fecha o loop de redirect do § Pitfall 1 assim que uma conta revogada aparecer. **Até essa troca acontecer, o loop de redirect é uma condição alcançável em produção** (o layout já rejeita, o login ainda não). Esse é o item mais urgente da fase.
- **Fase 2 (D-04):** as duas camadas já estão ligadas ao DAL. Quando `avaliarAcesso` entrar dentro de `revalidarConta`, o bloqueio por pagamento propaga para todo o admin e toda a API sem nova edição em `lib/session.ts` ou `lib/api-auth.ts`.
- **Para o plano 01-05 (VERIFICATION):** incluir a nota operacional do T-01-10 e o `e2e/sessao-revogada.spec.ts` previsto na tabela de artefatos da fase.
- Nenhum blocker novo. Os blockers da fase (preço mensal, confirmação do Asaas, hosting/scheduler) seguem inalterados e não bloqueiam 01-04.

## Self-Check: PASSED

Arquivos:
- `tests/setup/prisma-mock.ts` — FOUND
- `lib/session.ts` — FOUND
- `lib/session.test.ts` — FOUND
- `lib/api-auth.ts` — FOUND
- `lib/api-auth.test.ts` — FOUND

Commits:
- `b948ddf` — FOUND
- `8b5c3f8` — FOUND
- `5f49ed8` — FOUND
- `87c4b77` — FOUND
- `6edbfc6` — FOUND

---
*Phase: 01-pr-requisitos-de-produ-o*
*Completed: 2026-08-31*
