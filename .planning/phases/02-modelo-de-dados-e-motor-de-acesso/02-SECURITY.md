# Phase 02 — Modelo de Dados e Motor de Acesso — Security Audit

**Audit date:** 2026-08-31
**ASVS level:** 1
**Block on:** high
**Threats in register:** 32 + T-02-SC (×6)
**Closed:** 33/33 | **Open:** 0
**Verdict:** SECURED

Audit stance: every mitigation assumed absent until located in implemented code or in a
runtime-executing test. Documentation and plan intent were never accepted as evidence.
Implementation files were not modified.

---

## Verification Evidence

### Mitigated threats

| Threat | Category | Evidence |
|--------|----------|----------|
| T-02-01 | Tampering | `prisma/migrations/20260831193038_add_billing_a_empresa/migration.sql:38-47` — duplo `AT TIME ZONE` (`America/Sao_Paulo` → `UTC`) na expressão de `trialFim`. Gate INV-2 em `prisma/checks/backfill-billing.sql:33-46` reconstrói o instante e exige `TIME '00:00:00'` local; INV-5 (`:83-101`) reavalia a expressão sob dois `TimeZone` de sessão e exige resultado idêntico. Não-vacuidade comprovada em 02-01-SUMMARY.md:68 (injeção de falha produziu `INV-2 falhou ... 21:00:00`). |
| T-02-03 | Elevation of Privilege | Comentário normativo em `prisma/schema.prisma:65-68` ("NAO e fonte da verdade e NENHUMA decisao de acesso pode le-lo"). Gate de grep re-executado nesta auditoria: em `app/` + `lib/` (não-teste) `ultimoStatusAuditado` aparece só em escrita/bookkeeping — `app/services/empresa.service.ts:78,284`, `app/services/acesso.service.ts:46,47`, `lib/auth-guard.ts:74,103,107`. Nenhuma ocorrência alimenta decisão de acesso; em `auth-guard.ts:103` ele é usado exclusivamente como comparador de transição de auditoria. |
| T-02-05 | Repudiation | `migration.sql:51-55` — `INSERT INTO "AuditoriaAcesso" ... SELECT gen_random_uuid(), e."id", NULL, 'TRIAL', 'BACKFILL', now()` na mesma migration. INV-4 em `backfill-billing.sql:59-81` exige paridade 1:1 com empresas ativas backfilladas e `statusAnterior IS NULL` / `statusNovo = 'TRIAL'`. |
| T-02-06 | Elevation of Privilege | Allowlist positivo de 10 campos em `app/services/empresa.service.ts:311-335` (`permitido: Prisma.EmpresaUpdateInput` montado campo a campo). `acessoVitalicio` não é atribuível. Teste: `app/services/empresa.service.test.ts:584` "não aceita campos de billing no payload" — `toHaveBeenCalledWith({ where, data: { nome: "Loja" } })` exato + `expect(dataRecebido).not.toHaveProperty("acessoVitalicio")` (`:610`). |
| T-02-07 | Elevation of Privilege | Mesmo allowlist. Asserções `not.toHaveProperty` para `acessoAte`, `trialFim`, `canceladoEm` e `ultimoStatusAuditado` em `app/services/empresa.service.test.ts:606-611`. |
| T-02-08 | Tampering | Comentário normativo em `app/services/empresa.service.ts:303-310` ("Allowlist explícito — NÃO simplificar para `data` cru"; explica por que `UpdateEmpresaDTO` não é defesa e por que `id !== auth.empresaId` não protege). Teste de regressão positivo `app/services/empresa.service.test.ts:613` "repassa os 10 campos legítimos" fixa a superfície permitida. |
| T-02-10 | Elevation of Privilege | `lib/avaliar-acesso.ts:83-91` — `candidatos.length === 0` retorna `BLOQUEADO` (fail-closed). Teste: `lib/avaliar-acesso.test.ts:232` "sem nenhum fato de billing, fail-closed em BLOQUEADO (Pitfall 6)". |
| T-02-11 | Elevation of Privilege | `lib/avaliar-acesso.ts:93` — `expiraEm = new Date(Math.max(...candidatos.map(d => d.getTime())))`, carência derivada dele em `:94`. Testes `lib/avaliar-acesso.test.ts:238,253,268` cobrem só-trial, só-pagamento e "trial antigo + pagamento recente" (este último devolveria BLOQUEADO se a carência contasse só de `trialFim`). |
| T-02-12 | Tampering | `lib/fuso-sao-paulo.ts:49-63` — ponto-fixo medindo o desvio sempre contra `alvo`, com o aviso normativo em `:1-5`. Testes de DST histórico em `lib/fuso-sao-paulo.test.ts:70-113`: meia-noite inexistente (2017-10-15), ambígua (2018-02-18) e alvo +15d cruzando a mudança de offset. |
| T-02-13 | Tampering | `agora` é parâmetro em `avaliarAcesso(fatos, agora)` (`lib/avaliar-acesso.ts:52`). Gate de grep re-executado: nenhum `new Date()` sem argumento em `lib/avaliar-acesso.ts` nem em `lib/fuso-sao-paulo.ts` (as três ocorrências de `new Date(` são construções a partir de valor: `avaliar-acesso.ts:93`, `fuso-sao-paulo.ts:38,62`). O relógio é lido no chamador impuro e injetado — `lib/auth-guard.ts:86`. Suíte de `avaliar-acesso` roda sem fake timers. |
| T-02-15 | Repudiation | `app/services/acesso.service.ts:44-60` — compare-and-swap: `tx.empresa.updateMany({ where: { id, ultimoStatusAuditado: anterior } })` e escrita da linha condicionada a `count !== 0`. Testes: `app/services/acesso.service.test.ts:86` "concorrência: vira no-op sem exceção" (count 0 → `create` não chamado) e `:101` (primeira transição casa `ultimoStatusAuditado: null`). |
| T-02-16 | Repudiation | `lib/agendar-pos-resposta.ts:35-40` — `.catch(erro => console.error("[acesso] efeito pós-resposta falhou:", erro))` obrigatório no wrapper `seguro()`, aplicado tanto no caminho `after()` quanto no fallback inline. Teste `lib/agendar-pos-resposta.test.ts:37` verifica o log com prefixo `[acesso]` e ausência de unhandled rejection. |
| T-02-17 | Denial of Service | `lib/agendar-pos-resposta.ts:1,43` — `after` de `next/server`; `lib/auth-guard.ts:104-112` agenda a escrita de auditoria por `agendarPosResposta`, fora do caminho do response. Teste `lib/agendar-pos-resposta.test.ts:64` "delega a after() sem executar a tarefa quando há escopo de request". |
| T-02-18 | Denial of Service | Guarda dupla: `lib/auth-guard.ts:103` (`if (acesso.status !== usuario.empresa.ultimoStatusAuditado)`) e `app/services/acesso.service.ts:42` (`if (params.anterior === params.novo) return null`), com `revalidarConta` embrulhada em `cache()` (`lib/auth-guard.ts:48`). Testes: `lib/auth-guard.test.ts:138` "não agenda auditoria quando o status não mudou" e `app/services/acesso.service.test.ts:27` "não toca o banco quando o status avaliado é igual ao último auditado". |
| T-02-19 | Information Disclosure | Gate de grep re-executado: `auditoriaAcesso` só aparece em caminhos de ESCRITA — `app/services/acesso.service.ts:52`, `app/services/empresa.service.ts:102,290`. Zero `findMany`/`findFirst`/`findUnique` sobre o modelo, zero rota sob `app/api/**` que o exponha. |
| T-02-20 | Denial of Service | `lib/agendar-pos-resposta.ts:42-66` — `try { after(seguro) } catch { ... void seguro() }`, com o caso esperado (`outside a request scope`) silencioso e qualquer outra causa logada (WR-02, `:57-63`). Testes `lib/agendar-pos-resposta.test.ts:23` e `:96`. |
| T-02-21 | Elevation of Privilege | `app/services/empresa.service.ts:61-62` — `const agora = new Date(); const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1)`, derivado do relógio do servidor. `RegisterComUsuarioDTO` (`:12-18`) não tem nenhum campo de data ou de billing. |
| T-02-22 | Elevation of Privilege | `app/services/empresa.service.ts:72-80` — `tx.empresa.create` com exatamente 5 chaves (`nome`, `slug`, `modoInterface`, `trialFim`, `ultimoStatusAuditado`); `acessoAte`, `canceladoEm` e `acessoVitalicio` ficam nos defaults do schema. Teste `app/services/empresa.service.test.ts:131` faz asserção EXATA (`toHaveBeenCalledWith`, não `objectContaining`) do payload. |
| T-02-23 | Repudiation | `app/services/empresa.service.ts:102-109` — `tx.auditoriaAcesso.create` dentro do mesmo `prisma.$transaction`. Testes: `empresa.service.test.ts:131` (asserção exata das 4 chaves + `$transaction` chamado 1×) e `:254` "não deixa linha de auditoria órfã quando a transação de registro aborta". |
| T-02-24 | Tampering | `DIAS_DE_TRIAL + 1` em `app/services/empresa.service.ts:62` e `:265`, com a justificativa D-18 documentada em `lib/avaliar-acesso.ts:10-20`. Teste de borda `app/services/empresa.service.test.ts:180` "dá 14 dias completos para quem se cadastra às 23:59" (23:59 SP → `trialFim = 2026-09-15T03:00:00Z`; com `+14` o valor seria 14/09 e o teste falharia). Mesma regra no backfill: `interval '15 days'` em `migration.sql:41`. |
| T-02-26 | Information Disclosure | `lib/auth-guard.ts:60-78` — projeção `select` explícita, com o comentário proibitivo em `:61-62`. Gate de grep re-executado: zero `include:` em qualquer arquivo de `lib/`; `senhaHash` não aparece em nenhum caminho de leitura (só em `bcrypt.hash`/`compare` de `empresa.service.ts` e `usuario.service.ts`). Teste `lib/auth-guard.test.ts:89` "nunca seleciona senhaHash". |
| T-02-27 | Elevation of Privilege | `FatosDeAcesso` (`lib/avaliar-acesso.ts:26-31`) tem exatamente 4 campos; a chamada em `lib/auth-guard.ts:88-96` monta o objeto campo a campo sem `ultimoStatusAuditado`. Teste `lib/auth-guard.test.ts:120` "deriva o status dos fatos, nunca do status já auditado" (`ultimoStatusAuditado: "BLOQUEADO"` vs fatos válidos). Gate de grep: 0 violações. |
| T-02-28 | Denial of Service | `lib/auth-guard.ts:48` (`cache(...)`) + `:104` (`agendarPosResposta`). Teste `lib/auth-guard.test.ts:147` prova exatamente uma chamada a `registrarTransicao` por avaliação. Confirmação empírica de `after()` sob `cache()` em render real: coberta pelo `<human-check>` do plano 02-06, colhido em `02-UAT.md` (1 item passou, 0 problemas). |
| T-02-29 | Repudiation | `.catch` de `lib/agendar-pos-resposta.ts:38-40` mais o teste `lib/auth-guard.test.ts:174` "não derruba o request quando a auditoria falha": com `registrarTransicao` rejeitando, `conta` continua não-nula, `statusAcesso` correto, e o log casa `/^\[acesso\]/`. |
| T-02-31 | Denial of Service | Fallback inline (`lib/agendar-pos-resposta.ts:65`) + stub default do mock estendido (commit `e24b75c`). **Verificado nesta auditoria:** `npx vitest run` → 71 arquivos / 525 testes passando, `grep -c E468` = 0 ocorrências. |
| T-02-SC (×6) | Tampering | `git log -- package.json package-lock.json` sobre a janela da fase: zero commits. Nenhum pacote novo instalado. |

### Accepted risks log

| Threat | Category | Risco aceito | Justificativa verificada |
|--------|----------|--------------|--------------------------|
| T-02-02 | Denial of Service | O `UPDATE` do backfill trava a tabela `Empresa` durante a migration. | Volume real medido em 311 linhas (02-01-SUMMARY.md:132). Lock de duração desprezível; batching seria complexidade sem retorno. Migration já aplicada com sucesso contra PG 16.15. |
| T-02-04 | Tampering | SQL injection no bloco de backfill. | `migration.sql:38-55` é SQL 100% estático: nenhuma interpolação, nenhum parâmetro, nenhuma entrada externa. Verificado por leitura integral do arquivo. |
| T-02-09 | Spoofing | Request sem token válido chegando ao `PATCH /api/empresas/[id]`. | Já mitigado na Fase 1: `requireAuth(request)` é a primeira instrução do handler (`app/api/empresas/[id]/route.ts:68`), com `AuthError` → status próprio (`:89-91`). Teste `route.test.ts:24` cobre o 401. |
| T-02-14 | Information Disclosure | `ResultadoAcesso` atravessando camadas com dado sensível. | `lib/avaliar-acesso.ts:37-41`: exatamente `status` (enum), `expiraEm` e `carenciaAte`. Nenhum PII, nenhum dado de pagamento — coerente com a constraint PCI do projeto. |
| T-02-25 | Denial of Service | Falha na escrita da auditoria aborta o registro inteiro. | Aceito **por design**: a auditoria está na mesma transação de propósito (BILL-05). Criar empresa sem trilha seria pior que falhar o registro. Caminho de erro coberto por `empresa.service.test.ts:254`. |
| T-02-30 | Spoofing | Sessão de conta revogada continuar valendo. | Já mitigado na Fase 1 (INFRA-02): o `where` de `revalidarConta` (`lib/auth-guard.ts:52-59`) exige `ativo: true` e `empresa.deletedAt: null`, e o `catch` (`:124-128`) é fail-closed. Inalterado nesta fase; e2e `sessao-revogada.spec.ts` verde. |
| T-02-32 | Repudiation | Empresas cujo usuário nunca faz login nunca produzem linha de auditoria de transição. | Limitação conhecida e documentada (OQ-4): a avaliação só roda em request autenticado. Fechada por WRK-01 (worker diário) na Fase 5. Sem impacto de segurança agora — o motor é fail-closed, então a ausência de auditoria nunca concede acesso. |

---

## Post-planning fix review — `empresaService.create()` (CR-01)

Verificação explicitamente requisitada: o fix aplicado em `9b45987` / `4ec273e` **não reabre**
T-02-06 / T-02-07 / T-02-08.

`POST /api/empresas` (`app/api/empresas/route.ts:34-36`) repassa o body cru de `request.json()` para
`empresaService.create(body)` — o mesmo padrão de exposição que motivou o allowlist do `update()`.
O `create()` corrigido (`app/services/empresa.service.ts:263-301`) enumera **campo a campo** os 9
campos de `CreateEmpresaDTO` no `tx.empresa.create` e não faz spread do input. Os dois campos de
billing que ele grava — `trialFim` (`:265`, derivado de `new Date()` do servidor via
`meiaNoiteEmSaoPaulo`) e `ultimoStatusAuditado: StatusAcesso.TRIAL` (`:284`) — são **constantes de
servidor**, nunca lidos de `data`. `acessoAte`, `canceladoEm` e `acessoVitalicio` continuam
inatingíveis por HTTP nesse caminho, exatamente como no `registerComUsuario` (T-02-22).
O fix também estende a mitigação de T-02-23 a esse caminho: `tx.auditoriaAcesso.create` na mesma
transação (`:290-297`), com asserção exata em `empresa.service.test.ts:511`.

**Conclusão:** consistente com o padrão de T-02-06/07/08. Nenhuma reabertura.

---

## Unregistered flags

Nenhum `## Threat Flags` dos 6 SUMMARY.md declarou superfície nova sem mapeamento — 02-05 e 02-06
trazem tabelas de rastreio que casam 1:1 com o registro, 02-03 e 02-04 declaram "nenhuma superfície
nova", 02-01 e 02-02 usam a seção `## Threat Model Follow-up` (T-02-02/T-02-04 confirmados aceitos,
volume real 311 linhas).

Uma observação de defesa em profundidade levantada durante esta auditoria, **abaixo do limiar de
bloqueio** e portanto não-bloqueante:

- **UF-02-01 (Low, hardening)** — `empresaService.create()` é hoje um allowlist de fato, mas não
  carrega o comentário normativo "NÃO simplificar para `data` cru" que protege o `update()`
  (`empresa.service.ts:303-310`), e não tem um caso negativo espelhando
  "não aceita campos de billing no payload". A asserção exata de
  `empresa.service.test.ts:490-508` cobre o payload atual, porém a semântica `toEqual` do Vitest
  ignora propriedades `undefined`: um refactor futuro para `data: { ...data, trialFim, ... }`
  passaria nos dois casos existentes e reabriria mass assignment em `POST /api/empresas`.
  Mitigação sugerida (custo baixo, sem urgência): replicar em `create()` o comentário normativo e
  um caso com `not.toHaveProperty` para os 4 fatos de billing.

---

## Audit method

- Gates de grep do plano re-executados nesta auditoria, não herdados dos SUMMARY: `ultimoStatusAuditado`
  fora de bookkeeping (0), `new Date()` sem argumento nos módulos puros (0), leitura de
  `auditoriaAcesso` (0), `include:` em `lib/` (0), `senhaHash` em caminho de leitura (0).
- Suíte completa executada: `npx vitest run` → **71 arquivos / 525 testes, 100% verdes, 0 `E468`**.
- Subconjunto da fase executado isoladamente: 7 arquivos / 92 testes verdes.
- Nenhum arquivo de implementação foi modificado por esta auditoria.
