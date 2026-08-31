---
phase: 01-pr-requisitos-de-produ-o
plan: 04
subsystem: auth
tags: [session, login, redirect-loop, multi-tenant, playwright, e2e, tdd, typescript]

# Dependency graph
requires:
  - phase: 01-pr-requisitos-de-produ-o (plano 01-02)
    provides: revalidarConta + ContaAtiva em lib/auth-guard.ts
  - phase: 01-pr-requisitos-de-produ-o (plano 01-03)
    provides: getVerifiedSession em lib/session.ts e revalidação em requireAdminSession/requireAuth
provides:
  - "Guardas 'já estou logado' de login e registro usando getVerifiedSession — loop de redirect (§ Pitfall 1) eliminado"
  - "Login (POST /api/auth/login e Server Action login) rejeita usuário de empresa com deletedAt preenchido, alinhado com o DAL"
  - "e2e/sessao-revogada.spec.ts — prova contra Postgres real de revogação imediata na API e no admin, e de ausência de loop"
affects:
  - "01-05 (VERIFICATION da fase — o spec e2e novo é evidência dos critérios de sucesso #2 e #3)"
  - "fase 04 (enforcement/bloqueio por pagamento herda as duas guardas públicas já alinhadas)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarda pública 'já estou logado' usa exatamente a mesma verdade da guarda protegida 'te expulso' — a condição do loop deixa de existir por construção"
    - "Condição de entrada do login espelha a condição de revalidação do DAL — nunca emitir token que a próxima revalidação rejeitaria"
    - "Spec e2e que revoga pela própria API do produto, sem tocar no banco nem conhecer DATABASE_URL"
    - "Loop de redirect virado em falha determinística: assertar que o formulário de login RENDERIZA, não apenas que a URL bateu"

key-files:
  created:
    - e2e/sessao-revogada.spec.ts
  modified:
    - app/[slug]/admin/login/page.tsx
    - app/registro/page.tsx
    - app/api/auth/login/route.ts
    - app/api/auth/login/route.test.ts
    - app/[slug]/admin/_lib/auth-actions.ts

key-decisions:
  - "Checagem por veracidade (usuario.empresa.deletedAt) em vez de comparação estrita com null — trata fixture/caminho sem o campo como 'não removida'"
  - "Mensagem única 'Email ou senha inválidos.' também para empresa removida — sem distinguir o motivo da rejeição (T-01-06)"
  - "Warning pré-existente de 'Link' não usado em app/registro/page.tsx mantido: removê-lo estouraria o teto de 4 linhas de diff do acceptance criteria"
  - "Server Action login sem teste unitário próprio (fora do escopo da fase) — coberta por asserção de fonte e indiretamente pelo spec e2e"

patterns-established:
  - "Pattern: passo e2e 'anti-loop' — depois do redirect esperado, assertar visibilidade do controle da página de destino; se houvesse loop o goto teria estourado ERR_TOO_MANY_REDIRECTS/navigationTimeout"
  - "Pattern: revogação e2e self-service — a conta usa o próprio token para se desativar, exercitando requireAuth sem contornar nenhum guard"

requirements-completed: [INFRA-02]

# Metrics
duration: 9min
completed: 2026-08-31
---

# Phase 01 Plan 04: Guardas públicas alinhadas ao DAL e prova e2e de revogação Summary

**O bloqueador da fase está fechado: `login/page.tsx` e `registro/page.tsx` passaram a usar `getVerifiedSession`, então a conta revogada que o layout do admin expulsa não é mais devolvida para dentro — e um spec Playwright contra Postgres real prova que a revogação derruba a conta no request seguinte (200 → 401 com o MESMO token) sem que a tela de login vire um loop.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-31T16:11:30Z
- **Completed:** 2026-08-31T16:20:30Z
- **Tasks:** 3 (uma delas TDD, com ciclo RED/GREEN)
- **Files created:** 1 — **Files modified:** 5

## Accomplishments

- **O loop de redirect deixou de ser alcançável.** Desde o plano 01-03, `requireAdminSession` mandava a conta revogada para `/{slug}/admin/login`, e a página de login — que só olhava a assinatura do JWT — mandava de volta para `/{slug}/admin`. Com a troca de `getSession` por `getVerifiedSession` nas duas guardas públicas, a tela pública passou a usar exatamente a mesma verdade da tela protegida. A regressão que o plano 01-03 sinalizou como "o item mais urgente da fase" está resolvida.
- **Nenhum token é mais emitido para quem o DAL rejeitaria.** As duas portas de entrada (rota API e Server Action) ganharam `usuario.empresa.deletedAt` na condição de rejeição — o caminho "login com sucesso seguido de bounce imediato" (§ Pitfall 8 / T-01-01) não existe mais.
- **Critérios de sucesso #2 e #3 do roadmap agora têm prova end-to-end contra Postgres real**, não apenas cobertura de unidade com mock: o mesmo Bearer token passa de `200` para `401` em `/api/produtos` logo após a revogação, sem novo login e sem esperar os 7 dias do JWT.
- **Critério de sucesso #4 preservado:** suíte unitária de 67 arquivos verde com 463 testes (eram 462), e os 6 specs e2e pré-existentes continuam passando — `npx playwright test` sai com código 0 com 20 testes.
- **A suíte e2e rodou LOCALMENTE**, não só no CI: `pg_isready` confirmou Postgres em `/var/run/postgresql:5432` e o `webServer` do Playwright subiu o `next dev` na porta 3100. Nenhum ajuste de seletor foi necessário — todos os labels e nomes de botão do plano bateram com a UI real na primeira execução.
- **`app/[slug]/admin/(protected)/layout.tsx` intocado** (confirmado por `git diff --name-only` vazio) — ele herda tudo via `requireAdminSession`.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | Guardas públicas usando `getVerifiedSession` | `9ace5a0` | fix |
| 2 | Login rejeita empresa removida — RED | `61b6a2f` | test |
| 2 | Login rejeita empresa removida — GREEN | `1ba67cd` | feat |
| 3 | `e2e/sessao-revogada.spec.ts` | `0d1751b` | test |

REFACTOR não foi necessário na Task 2: a mudança é um terceiro termo numa disjunção já existente, sem forma intermediária a limpar.

### Saída do gate RED (Task 2)

`npx vitest run app/api/auth/login/route.test.ts` antes de editar `route.ts`:

```
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)

AssertionError: expected 200 to be 401
 ❯ app/api/auth/login/route.test.ts:77:29
```

O RED falhou pelo motivo certo — a rota autenticava um usuário de empresa removida e devolvia `200` com token.

## Respostas às perguntas registradas no `<output>` do plano

**1. A suíte e2e rodou localmente ou apenas no CI?**
**Rodou localmente, completa.** A pesquisa não tinha conseguido confirmar Postgres local; a verificação em tempo de execução (`pg_isready`) mostrou `/var/run/postgresql:5432 - accepting connections`. Resultados:

- `npx playwright test e2e/sessao-revogada.spec.ts --reporter=line` → **1 passed (20.1s)**, exit 0, **de primeira**, sem retry.
- `npx playwright test --reporter=line` (suíte completa, 20 testes) → exit 0, **19 passed + 1 flaky**.

**2. Foi preciso ajustar algum seletor do spec?**
**Nenhum.** Os labels do formulário de registro ("Nome da empresa", "Seu nome", "E-mail", "Senha" com `exact: true`, "Confirmar senha"), o botão "Criar minha loja" e o botão "Entrar no painel" bateram exatamente com o previsto em `e2e/cadastro-e-login.spec.ts`. O shape da resposta do `POST /api/auth/login` (`token` e `usuario.id`) e o `PATCH /api/usuarios/[id]` aceitando `{ ativo: false }` também bateram sem adaptação.

**3. Sobre o teste marcado como flaky**
`combo-crud.spec.ts:88` ("combo sem nenhum produto selecionado é rejeitado com mensagem de erro") falhou na primeira tentativa dentro da suíte completa e passou no retry. A falha é no **helper de setup** (`criarEmpresaLogada`, linha 14): a URL ainda era `/registro` quando o `toHaveURL(/\/admin$/)` estourou os 10 s. **Não é regressão deste plano** — o arquivo não foi tocado e não usa nenhuma das superfícies alteradas. Confirmado empiricamente: `npx playwright test e2e/combo-crud.spec.ts --retries=0` → **4 passed (12.5s)**, exit 0. É lentidão de `next dev` sob a carga sequencial de 20 testes com compilação sob demanda. Vale registrar em `01-05` como ruído conhecido da suíte e2e local.

## Files Created/Modified

- `app/[slug]/admin/login/page.tsx` (+2/−2) — import e chamada trocados para `getVerifiedSession`. A condição da guarda, o `redirect`, a posição acima do `getEmpresaCatalogo(slug)` e o JSX ficaram idênticos. O import relativo `../../_lib/empresa` (violação preexistente de C-02) **não** foi tocado, por instrução explícita do plano.
- `app/registro/page.tsx` (+2/−2) — mesma troca cirúrgica.
- `app/api/auth/login/route.ts` (+5/−1) — condição de rejeição ampliada + comentário explicando o alinhamento com o DAL.
- `app/[slug]/admin/_lib/auth-actions.ts` (+5/−1) — mesma ampliação na Server Action `login`; a checagem seguinte de vínculo de tenant (`usuario.empresa.slug !== slug`) permanece intacta com a mensagem própria.
- `app/api/auth/login/route.test.ts` (+21) — `deletedAt: null` na fixture `usuarioAtivo` e um caso novo (401 + asserção da mensagem genérica).
- `e2e/sessao-revogada.spec.ts` (novo, 76 linhas) — o ciclo completo em 8 passos.

### Forma final da condição do login

```typescript
if (!usuario || !usuario.ativo || usuario.empresa.deletedAt) {
  return NextResponse.json({ message: "Email ou senha inválidos." }, { status: 401 });
}
```

## Decisions Made

- **Checagem por veracidade sobre `usuario.empresa.deletedAt`**, não `!== null`. Um campo ausente (`undefined`) é tratado como "não removida", mantendo compatível qualquer fixture ou caminho que não traga a coluna — enquanto `!== null` transformaria `undefined` em "removida" e quebraria login legítimo.
- **A fixture `usuarioAtivo` ganhou `deletedAt: null` explícito.** Sem isso ela passaria a representar um estado impossível (empresa sem a coluna), e o teste de sucesso ficaria verde por acidente da checagem de veracidade em vez de por representar o caso real.
- **Mensagem única para os três motivos de rejeição** (credencial errada, usuário inativo, empresa removida): `"Email ou senha inválidos."`, `401`. Nenhuma mensagem nova foi criada — travado por asserção de fonte (`grep -c` = 1) e por asserção de comportamento no teste novo.
- **O warning de lint `'Link' is defined but never used` em `app/registro/page.tsx` foi mantido.** O SUMMARY de 01-03 previa que ele "tende a ser resolvido" aqui, mas o acceptance criteria da Task 1 exige no máximo 4 linhas de diff no arquivo — remover o import gastaria a quinta. O gate do plano venceu a expectativa. `npm run lint` continua saindo com **código 0** (0 errors, 1 warning). Item para o `01-05` ou um `/gsd-quick`.
- **O spec e2e revoga pela API do produto**, com o próprio token da conta, e não escreve no banco. Isso mantém o processo do Playwright sem `DATABASE_URL` e sem import de Prisma (T-01-15), e ainda exercita `requireAuth` de verdade: no instante do `PATCH` a conta ainda está ativa, então a autorização é legítima.
- **Os dois contextos ficaram separados no spec**: o fixture `request` (Bearer explícito no header) para a camada de API e o fixture `page` (cookie `admin_session`) para a camada de UI. Usar `page.request` misturaria cookie e header e enfraqueceria a asserção de 401.

## Deviations from Plan

**None** — o plano foi executado exatamente como escrito. Zero desvios das Rules 1-4, zero decisões arquiteturais, zero checkpoints atingidos.

Zero instalações npm (T-01-SC respeitado), zero alterações em `prisma/schema.prisma`, zero migrations, zero variáveis de ambiente novas, zero mudanças de assinatura pública.

## Issues Encountered

Um único ponto de atenção, e ele **não** é bloqueio nem regressão: o teste `combo-crud.spec.ts:88` ficou flaky na execução da suíte completa e passou no retry (detalhado na resposta 3 acima). Isolado e sem retry, o arquivo passa limpo.

Nota de tooling (não afeta código do produto): `gsd-tools query state.update-progress` atualizou o `progress` do frontmatter de `STATE.md` (para `completed_plans: 4`, 80%) mas deixou a linha `Progress:` do corpo em `0%` — o mesmo desencontro já existia após os planos 01-01..01-03. A linha do corpo foi corrigida à mão para `[████████░░] 80%`, casando com o frontmatter. Vale reportar o bug do handler.

## Verification

| Verificação | Resultado |
|-------------|-----------|
| `npx vitest run` (suíte completa) | **67 arquivos, 463 testes, todos verdes** (eram 462) |
| `npx vitest run app/api/auth/login/route.test.ts` | **6 passed** (5 existentes + 1 novo), exit 0 |
| `npx playwright test e2e/sessao-revogada.spec.ts --reporter=line` | **1 passed (20.1s)**, exit 0, sem retry |
| `npx playwright test --reporter=line` (suíte e2e completa) | exit 0 — **19 passed, 1 flaky** (pré-existente, ver acima) |
| `npx playwright test e2e/combo-crud.spec.ts --retries=0` | 4 passed, exit 0 (flake não reproduz isolado) |
| `npm run lint` | exit 0 (0 errors; 1 warning pré-existente) |
| `npx tsc --noEmit` | exit 0, nenhum erro |
| `grep -c "getVerifiedSession"` em login/page.tsx e registro/page.tsx | 2 / 2 ✅ |
| `grep -oE '\bgetSession\b'` em login/page.tsx e registro/page.tsx | 0 / 0 ✅ |
| `git diff --stat` das duas pages | 4 linhas em cada (2 ins + 2 del) — dentro do teto ✅ |
| `git diff --name-only "app/[slug]/admin/(protected)/layout.tsx"` | vazio ✅ |
| `grep -c "empresa.deletedAt"` em route.ts / auth-actions.ts | 1 / 1 ✅ |
| `grep -c "Email ou senha inválidos."` em route.ts | 1 ✅ |
| `grep -c "Este usuário não pertence a esta empresa."` em auth-actions.ts | 1 ✅ (checagem de tenant intacta) |
| `grep -c "deletedAt: null"` em route.test.ts | 2 (gate exigia ≥1) ✅ |
| `grep -c "api/usuarios"` no spec e2e | 2 (gate exigia ≥1) ✅ |
| `grep -c "ativo: false"` no spec e2e | 1 ✅ |
| `grep -c "401"` no spec e2e | 2 (gate exigia ≥1) ✅ |
| `grep -c "Entrar no painel"` / `"Criar minha loja"` no spec | 1 / 2 (gate exigia ≥1) ✅ |
| `grep -cE "@/lib/prisma\|PrismaClient\|DATABASE_URL"` no spec | 0 ✅ (T-01-15) |
| `grep -cE "test\.setTimeout\|test\.slow"` no spec | 0 ✅ |
| Linhas do spec e2e | 76 (min_lines exigia 40) ✅ |

## Threat Model Coverage

| Threat ID | Estado |
|-----------|--------|
| T-01-14 (loop de redirect admin ↔ login para conta revogada) | **mitigado** — as duas guardas públicas usam `getVerifiedSession`; o passo 7 do spec e2e assere que o botão "Entrar no painel" fica visível, transformando o loop em falha determinística. Verde localmente |
| T-01-01 (token emitido para conta que o DAL rejeitaria) | **mitigado** — `usuario.empresa.deletedAt` na condição das duas portas de login; teste unitário novo trava o 401 |
| T-01-06 (mensagem do login distinguindo o motivo) | **mitigado** — `"Email ou senha inválidos."` idêntica para os três motivos; asserção de fonte (`grep -c` = 1) e de comportamento (`expect(body.message)`) |
| T-01-04 (`PATCH /api/usuarios/[id]` usado pelo spec) | **mitigado** — nenhum guard contornado: a conta revoga a si mesma com o próprio token, e a rota mantém a verificação de posse por `empresaId` e o `requireAuth` revalidado do 01-03 |
| T-01-15 (segredos de banco no processo de teste) | **mitigado** — o spec só fala com a API do produto; asserção de fonte confirma 0 ocorrências de Prisma/`DATABASE_URL` |
| T-01-SC (instalações npm) | **aceito** — zero instalações neste plano |

## Threat Flags

Nenhuma superfície de segurança nova fora do `<threat_model>` do plano. Nenhum endpoint, caminho de auth, acesso a arquivo ou alteração de schema foi introduzido — as mudanças **estreitam** duas superfícies existentes (guardas públicas e condição de login) e adicionam um arquivo de teste.

## Known Stubs

Nenhum. Não há valor hardcoded, placeholder ou componente sem fonte de dados introduzido por este plano.

## User Setup Required

None — nenhuma configuração de serviço externo, variável de ambiente ou migration. Para rodar a suíte e2e localmente basta Postgres ativo e `DATABASE_URL` no `.env` do dev server (já era pré-requisito dos 6 specs existentes).

## Next Phase Readiness

- **A fase 01 está funcionalmente completa quanto ao INFRA-02.** Resta o plano `01-05` (VERIFICATION), que deve consolidar: (a) a nota operacional do T-01-10 herdada do 01-03 — pico de 401/redirects pode significar Postgres fora do ar, e o sinal que distingue é o `console.error("[auth-guard] ...")`; (b) o flake conhecido de `combo-crud.spec.ts:88` na suíte e2e local; (c) o warning de lint do `Link` não usado em `app/registro/page.tsx`, único item cosmético em aberto na fase.
- **Fase 02 (D-04) desbloqueada do lado de auth.** Quando `avaliarAcesso` entrar dentro de `revalidarConta`, o bloqueio por pagamento propaga sozinho para o admin, para a API **e** para as duas guardas públicas — nenhuma delas precisará de nova edição, porque todas já consomem a mesma verdade.
- Nenhum blocker novo. Os blockers da fase (preço mensal, confirmação do Asaas, hosting/scheduler) seguem inalterados e não bloqueiam `01-05`.

## Self-Check: PASSED

Arquivos:
- `app/[slug]/admin/login/page.tsx` — FOUND
- `app/registro/page.tsx` — FOUND
- `app/api/auth/login/route.ts` — FOUND
- `app/api/auth/login/route.test.ts` — FOUND
- `app/[slug]/admin/_lib/auth-actions.ts` — FOUND
- `e2e/sessao-revogada.spec.ts` — FOUND

Commits:
- `9ace5a0` — FOUND
- `61b6a2f` — FOUND
- `1ba67cd` — FOUND
- `0d1751b` — FOUND

---
*Phase: 01-pr-requisitos-de-produ-o*
*Completed: 2026-08-31*
