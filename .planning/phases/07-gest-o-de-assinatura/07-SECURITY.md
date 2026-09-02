# Phase 07 — Gestão de Assinatura — Security Audit

**Audit date:** 2026-09-02
**ASVS level:** 1
**Block on:** high
**Threats in register:** 52 + T-07-SC (×8)
**Closed:** 60/60 | **Open:** 0
**Verdict:** SECURED

Audit stance: every mitigation assumed absent until located in implemented code or in a runtime-executing test. Documentation and plan intent were never accepted as evidence. Implementation files were not modified.

---

## Verification Evidence

### Mitigated threats

| Threat | Category | Evidence |
|--------|----------|----------|
| T-07-01 | Information Disclosure | `lib/billing/asaas/tipos.ts:62-65` — `AsaasAssinaturaRemovida` declara exatamente 2 campos (`deleted: boolean`, `id: string`). A regra GTW-01/T-03-08 está escrita como comentário normativo em `:4-8` ("sem tipo não existe caminho acidental para persistência ou para um log"). Nenhum campo de pagador tem caminho de tipo. |
| T-07-02 | Information Disclosure | `lib/billing/asaas/client.ts:186-188` — `removerAssinatura` delega a `chamar()` e não monta `fetch` próprio. A truncagem vive em `:96-101` (`detalhe.slice(0, MAX_CARACTERES_DE_LOG)`, `MAX_CARACTERES_DE_LOG = 500` em `:30`); a chave só entra no header em `:78` e nunca em log. Teste `lib/billing/asaas/client.test.ts:146-158` planta corpo > 500 chars e afirma `detalhe.length ≤ 500` com `corpoEnorme.length > 500` (não-vacuidade explícita). |
| T-07-03 | Denial of Service | `client.ts:82` — `signal: AbortSignal.timeout(TIMEOUT_MS)` dentro de `chamar()`, com `TIMEOUT_MS = 15_000` em `:24` e a justificativa normativa em `:20-23`. Teste dedicado `client.test.ts:289-294` "herda o AbortSignal de timeout de chamar(), sem montar requisição própria" → `expect(chamada().init.signal).toBeInstanceOf(AbortSignal)` depois de `removerAssinatura("sub_1")`. |
| T-07-04 | Tampering | `lib/avaliar-acesso.ts:255-263` — `ultimoDiaDeAcessoEmSaoPaulo` é o único produtor da string; subtrai 1 ms do limite superior exclusivo (`:262`) e formata por `formatarDiaEmSaoPaulo` (`lib/fuso-sao-paulo.ts:41-43`, com `timeZone: "America/Sao_Paulo"` em `:21`). Testes `lib/avaliar-acesso.test.ts:621-629` afirmam `"14/10/2026"` para o limite `2026-10-15T03:00:00.000Z` — que é **também** o caso em que o dia em São Paulo difere do dia em UTC — e `:669-673` cobre a virada de mês. |
| T-07-05 | Tampering | `git diff f205a3c..HEAD -- lib/avaliar-acesso.ts` re-executado nesta auditoria: **71 inserções, 1 deleção**. A única deleção é a linha 1 (import ampliado); o resto é um hunk puramente aditivo depois do fim de `diasRestantesDeCarencia`. `avaliarAcesso`, `acessoBloqueado` e `diasRestantesDeCarencia` não tiveram nenhuma linha alterada. |
| T-07-06 | Elevation of Privilege | `app/[slug]/admin/_lib/assinatura-actions.ts:87` — `consultarStatusAcesso(slug: string)`, sem parâmetro de id; `getVerifiedSession()` em `:88` e a guarda `!session \|\| session.empresaSlug !== slug` em `:94-96`, antes de qualquer I/O. Teste `assinatura-actions.test.ts:207` prova a saída antes da leitura. |
| T-07-07 | Information Disclosure | Assinatura de retorno `Promise<{ liberado: boolean }>` (`:87`) e `return { liberado: !acessoBloqueado(conta.statusAcesso) }` em `:107`. Os 7 casos de `assinatura-actions.test.ts:162-220` usam igualdade exata, não `objectContaining`. |
| T-07-08 | Denial of Service | `poller-de-status.tsx:15` — `INTERVALOS_MS` com 7 posições e a guarda `esgotou` em `:64`, `if (esgotou) return;` em `:67-69`. Teste `:94` confirma a parada após a 7ª tentativa. |
| T-07-09 | Denial of Service | `poller-de-status.tsx:86` — `return () => clearTimeout(timer);` no cleanup, comentário "Obrigatório, e não defensivo" em `:84-85`. Teste `:113` confirma ausência de ações pós-unmount. |
| T-07-10 | Denial of Service | Gate 4 re-executado: **OK**. Grep independente confirma 1 única ocorrência de `asaasClient` em `assinatura-actions.ts`, na linha 66, dentro do JSDoc; contagem em código é 0. |
| T-07-11 | Spoofing | `assinatura-actions.ts:103-105` — `if (!conta) { return { liberado: false }; }`, fail-closed justificado em `:100-102`. Teste `:215` cobre `revalidarConta` devolvendo null. |
| T-07-12 | Tampering | `git diff` sobre `bloqueado-card.tsx`/`.test.tsx` re-executado: **zero linhas removidas em ambos** — montagem aditiva do `PollerDeStatus`. Os 8 casos existentes passam sem alteração. |
| T-07-14 | Tampering | `pagar-button.tsx:56-57` — defaults byte-idênticos às strings originais. `git diff` mostra 2 linhas removidas, substituídas por defaults equivalentes. Testes afirmam os rótulos default e a não-interferência com as variantes existentes. |
| T-07-15 | Denial of Service | `simples-top-bar.tsx:53-66` — `<Link href={`/${slug}/admin/assinatura`}>`. Teste afirma o `href` exato. |
| T-07-16 | Information Disclosure | `simples-top-bar.tsx:55` — `title="Assinatura"`, único nome acessível do controle só-de-ícone. Teste usa `getByTitle("Assinatura")`. |
| T-07-17 | Tampering | Bloco `─── FRONTEIRA D-04 ───` em `assinatura.service.ts:328-335`. Gate 3 re-executado: **OK — gateway na linha 306, banco na 343**. Asserção de AUSÊNCIA em `:510-527` com o gateway rejeitando. |
| T-07-18 | Elevation of Privilege | `assinatura.service.ts:343-346` — `prisma.empresa.update` dedicado. Grep re-executado: `empresaService` aparece 1× em comentário, zero em código. Gate 2 re-executado: **OK**. |
| T-07-19 | Information Disclosure | `assinatura.service.ts:319-322` — log com prefixo `[asaas]`, nunca o corpo. Teste `:559-576` planta corpo sensível e afirma `not.toContain`. Mesmo padrão em `:175-191` e `:445-458`. |
| T-07-20 | Information Disclosure | `EMPRESA_ASSINATURA_SELECT` (`:48-55`), proibição de `include` em `:44-47`. Grep re-executado: `include:` = 0 ocorrências. |
| T-07-21 | Information Disclosure | `StatusAssinatura` (`:86-91`) sem `status`. Teste BILL-01 `:425-442` afirma `not.toHaveProperty("status")` nos dois retornos. |
| T-07-22 | Denial of Service | No-op idempotente (`:297-299`) e ramo 404 (`:317-325`) verificados. Testes `:530-545` e `:547-556`. |
| T-07-23 | Repudiation | Ordem gateway→banco provada pelo Gate 3; 502 emitido antes da fronteira sem escrita (`:324`). Teste `:510-527`. |
| T-07-24 | Tampering | `assinatura.service.ts:280-286` — `findFirst` com `deletedAt: null`. Grep re-executado: `findUnique` 1× em JSDoc, zero em código. |
| T-07-25 | Repudiation | `assinatura.service.ts:186-191` — limpeza de `canceladoEm` após a fronteira D-07. Par de testes `:296-310`, `:311-317`, `:319-331`. |
| T-07-26 | Elevation of Privilege | `actions.ts:57` — `cancelarAssinatura(slug: string)`, `empresaId` de `session.empresaId` (`:66`). Gate 1 re-executado: **OK**. e2e `:190-191` prova a navegação cruzada. |
| T-07-27 | Tampering | Gate 1 varre `formData.get(` nas duas actions → 0 ocorrências. Teste `:163`. Superfície de DOM provada por e2e `:203-205` (`toHaveCount(0)`). |
| T-07-28 | Spoofing | `actions.ts:60-63` — guarda de tenant antes de qualquer I/O. Teste `:97`. |
| T-07-29 | Information Disclosure | Duas strings genéricas literais (E2/E4); detalhe só em `console.error`. Testes `:105`, `:114`, `:130`. |
| T-07-30 | Repudiation | `cancelar-assinatura.tsx:175-183` — sem estado otimista; erro mantém a view aberta. Teste `:105`. |
| T-07-31 | Tampering | `:164` e `:203` — `disabled={pending}` nos dois botões. Teste `:129`. Reentrada fechada pelo no-op de `cancelar` (T-07-22). |
| T-07-32 | Denial of Service | `:88-98` — gestão de foco na abertura/fechamento, com guarda contra roubo na montagem. Três casos: `:151`, `:160`, `:170`. |
| T-07-33 | Elevation of Privilege | `page.tsx:43` — `requireAdminSession(slug)` na própria page; rota fisicamente em `(protected)`. e2e `:190-191`. |
| T-07-34 | Information Disclosure | `page.tsx:60` — `fatosDeAssinatura(session.empresaId)` via `findFirst`. `params`/`searchParams` não produzem id. |
| T-07-35 | Information Disclosure | `EMPRESA_ASSINATURA_SELECT` sem `senhaHash`/`include`. Grep re-executado: `prisma` = 0 ocorrências em `assinatura/page.tsx`. |
| T-07-36 | Denial of Service | `consultarAssinatura` nunca relança (`:249-268`). Teste `:409`. Tela renderiza Zona 1 completa incondicionalmente. |
| T-07-37 | Tampering | Ordem normativa em `page.tsx:91-109` — os três ramos saem antes do único `await consultarAssinatura`. Prova indireta em e2e `:123-131`. |
| T-07-38 | Spoofing | `page.tsx:111-133` — rótulo/tom derivam de `conta.statusAcesso`, nunca do gateway. Grep re-executado: 0 ocorrências do enum Asaas na rota não-teste. |
| T-07-39 | Denial of Service | Layouts intocados (`git diff` vazio). e2e `:161-165` prova ausência de loop de redirect. |
| T-07-40 | Elevation of Privilege | Gate 1 (`gates-fase-07.mjs:282-356`) re-executado: **OK — 47 fontes de fronteira, 2 actions da fase**. Falha se um arquivo de action sumir. |
| T-07-41 | Elevation of Privilege | Gate 2 (`:379-434`) varre o allowlist e o DTO pelos 4 fatos de billing. Re-executado: **OK**. |
| T-07-42 | Repudiation | Gate 3 (`:453-497`) compara índices de linha dentro de `cancelar`. Re-executado: **OK**. |
| T-07-43 | Denial of Service | Gate 4 (`:516-540`) proíbe `asaasClient`/`buscarAssinatura` na action de polling. Re-executado: **OK**. |
| T-07-44 | Elevation of Privilege | e2e `:172-206` — Caso 5, contexto de browser separado para a empresa B, navegação cruzada redireciona ao login correto. |
| T-07-45 | Denial of Service | e2e `:134-170` — Caso 4, empresa cancelada-expirada bloqueada e catálogo despublicado, sem enforcement novo. |
| T-07-46 | Tampering | Gate 5 (`:562-623`) — marcadores de overlay e construtores de data restritos aos componentes. Re-executado: **OK**. Reforço em `cancelar-assinatura.test.tsx:176`. |
| T-07-47 | Repudiation | Cabeçalho do e2e (`:9-33`) declara o que não é coberto e remete ao checkpoint 07-08. Mesma lacuna em `07-VALIDATION.md`. |
| T-07-49 | Tampering | `07-VALIDATION.md:83,109` — A3 registrada como "ainda suposição, não confirmada nem refutada". Código correto nos dois desfechos: o ramo 404 (`:317-325`) engole o 404 e o teste `:530-545` prova a gravação. |
| T-07-51 | Repudiation | `07-08-SUMMARY.md` — nenhum número transcrito, nenhum passo executado, aprovação não fabricada. `07-VALIDATION.md` frontmatter re-lido: `status: blocked`, `nyquist_compliant: false`. |
| T-07-SC (×8) | Tampering | `git diff f205a3c..HEAD -- package.json package-lock.json` re-executado: **`package.json` +1 linha (script npm), `package-lock.json` intocado**. Gate 6 re-executado: **OK — 11 deps / 20 devDeps**. |

### Accepted risks log

| Threat | Category | Risco aceito | Justificativa verificada |
|--------|----------|--------------|--------------------------|
| T-07-13 | Elevation of Privilege | Item de navegação novo apontando para `/assinatura` em ambos os modos de interface. | Link não é autorização. Rota fisicamente em `(protected)`, `page.tsx:43` chama `requireAdminSession(slug)` na própria page — layout não é boundary (T-04-06). Empresa bloqueada redireciona a `/bloqueado`, comportamento correto (e2e `:161-162`). |
| T-07-50 | Information Disclosure | Depender da resposta do `GET /subscriptions/{id}` pós-remoção (A2, não confirmada). | Mitigado por design no código: `page.tsx:91-95` ramifica antes do único `await consultarAssinatura` (`:100`). Uma empresa cancelada nunca alcança aquela chamada — prova indireta em e2e `:123-131`. |
| T-07-48 | Repudiation | O período pago pode ser apagado pelo cancelamento no gateway (A3) — a verificação real contra o Asaas Sandbox NÃO foi executada. | O mecanismo funcionou como projetado: checkpoint bloqueante e não auto-aprovável, apresentado com os 9 passos, adiado pelo operador por conflito de porta 5432. Consequência registrada, não mascarada: `status: blocked`, `nyquist_compliant: false`. Alcance limitado: `acessoAte` no nosso banco não é tocado por `cancelar` (`:343-346` só grava `canceladoEm`) — o motor de acesso concede o período pago independentemente do desfecho no Asaas. A3 é risco de cobrança/negócio junto ao fornecedor, não de controle de acesso. Aceito como pendência conhecida, explicitamente decidida e datada. |
| T-07-52 | Elevation of Privilege | Revisão de segurança da fase (e a pendência herdada da Fase 6) não executada antes deste momento. | O risco residual para a Fase 7 está fechado por este próprio documento — 6 gates e 12 suítes re-executados nesta auditoria. Permanece aceito apenas o item herdado da Fase 6, decisão do usuário, fora do escopo desta fase. |
| T-07-SC (07-01/02/03/04/08) | Tampering | Instalação de pacote npm durante a fase (disposição `accept`). | `git diff` da janela inteira confirma zero dependências novas, `package-lock.json` sem commits. Package Legitimacy Audit vazia por construção. Gate 6 congela 11/20 e falha em install futuro. |

---

## Unregistered flags

Os 8 SUMMARY.md foram lidos. Sete declaram "nenhuma superfície de segurança nova" ou trazem tabela de rastreio casando 1:1 com o registro; 07-03 declara a ausência de forma afirmativa; 07-08 não produziu código.

- **UF-07-01 (Medium → contido, informacional)** — `07-07-SUMMARY.md` § Threat Flags registra que `scripts/seed-fatos-billing.ts` grava fatos de billing direto no banco, contornando por construção o allowlist do Gate 2. Sem ID de registro correspondente. **Verificado nesta auditoria:** a guarda `NODE_ENV=production` (`:164-166`) existe e não foi afrouxada; `e2e/helpers.ts:33` documenta a dependência. Mesma dívida deliberada da Fase 4, contida pela mesma defesa. Não-bloqueante.
- **UF-07-02 (Low, hardening)** — o Gate 1 exclui `page.tsx` do escopo por nome, com justificativa correta hoje (server component lendo fato local). Se uma `page.tsx` do projeto virar client component no futuro, ficaria fora da varredura. Mitigação sugerida (sem urgência): condicionar a exclusão à ausência de `"use client"` em vez de excluir por nome.

---

## Audit method

- **Gates estáticos re-executados nesta auditoria:** `npm run gates:fase-07` → **6/6 OK**.
- **Greps independentes re-executados:** `asaasClient` em `assinatura-actions.ts` (1 em JSDoc, 0 em código); `findUnique` em `assinatura.service.ts` (1 em JSDoc, 0 em código); `empresaService` no mesmo arquivo (1 em comentário, 0 em código); `include:` (0); `prisma` em `assinatura/page.tsx` (0); enum de status Asaas na rota não-teste (0).
- **Suítes da fase executadas:** `npx vitest run` sobre os 12 arquivos da fase → **225/225 verdes**.
- **Diffs da janela da fase (`f205a3c..HEAD`) re-executados:** `package.json` +1 linha; `lib/avaliar-acesso.ts` 71 inserções / 1 deleção (append-only); `bloqueado-card.tsx`/`.test.tsx` zero remoções; `pagar-button.tsx` 2 remoções substituídas por defaults idênticos; layouts intocados.
- **e2e:** não re-executado dentro desta auditoria (mesmo Postgres compartilhado do 07-08), mas o commit `d7e9fe0` (mesma sessão, anterior a esta auditoria) já registra 32/32 passando contra Postgres real, incluindo os Casos 4 e 5 citados acima — evidência de execução real, não de intenção de plano.
- Nenhum arquivo de implementação foi modificado por esta auditoria.
