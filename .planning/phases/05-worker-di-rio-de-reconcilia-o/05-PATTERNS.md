# Phase 05: Worker Diário de Reconciliação - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 8 (5 novos, 3 modificados)
**Analogs found:** 8 / 8 (todos com análogo direto no repositório)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/cron/reconciliacao-diaria/route.ts` (novo) | route handler | batch / request-response | `app/api/webhooks/asaas/route.ts` (gate + config de rota) + `scripts/contagem-status-acesso.ts` (findMany + agora único + laço) | exact (gate) / role-match (batch) |
| `app/api/cron/reconciliacao-diaria/route.test.ts` (novo) | test (route) | request-response | `app/api/webhooks/asaas/route.test.ts` | exact |
| `app/services/reconciliacao.service.ts` (novo) — parte **pura** `planejarReconciliacao` | pure domain / service | transform | `lib/avaliar-acesso.ts` (função pura, zero I/O) | role-match |
| `app/services/reconciliacao.service.test.ts` (novo) | test (pure) | transform | `lib/avaliar-acesso.test.ts` / `app/services/acesso.service.test.ts` | role-match |
| `lib/billing/cron-config.ts` (novo, ou estender `lib/billing/asaas/config.ts`) | config | — | `lib/billing/asaas/config.ts` (`obrigatorio`) | exact |
| `prisma/migrations/<ts>_add_worker_diario_causa/migration.sql` (novo) | migration | — | `prisma/migrations/20260831230000_add_asaas_webhook_ledger/migration.sql:1-14` | exact |
| `prisma/schema.prisma` (modificado — enum + comentário órfão de `EventoWebhookAsaas`) | model/schema | — | ele mesmo (`enum CausaTransicaoAcesso`, linhas 37-42) | exact |
| `scripts/seed-fatos-billing.ts` (modificado — flag para NÃO alinhar `ultimoStatusAuditado`, Achado 4) | script / fixture | file-I/O + CRUD | ele mesmo (`argumento()` linhas 54-61) | exact |

Também modificados por D-10 (apenas comentários/prosa, sem lógica): `.planning/STATE.md` (linhas 164 e 131), `app/services/webhook-asaas.service.test.ts` (linhas 240, 662, 1139, 1159), `prisma/schema.prisma:355`.

---

## Pattern Assignments

### `app/api/cron/reconciliacao-diaria/route.ts` (route handler, batch)

**Analog primário (gate + config de rota):** `app/api/webhooks/asaas/route.ts`
**Analog secundário (findMany + laço + `agora` único):** `scripts/contagem-status-acesso.ts`

**Imports pattern** (`app/api/webhooks/asaas/route.ts:1-5` — sempre alias `@/`, `node:crypto` primeiro):
```typescript
import { createHash, timingSafeEqual } from "node:crypto";
import { asaasWebhookToken } from "@/lib/billing/asaas/config";
import { webhookAsaasService } from "@/app/services/webhook-asaas.service";
```

**Route segment config** (`app/api/webhooks/asaas/route.ts:38-43` — copiar as duas primeiras linhas literalmente; `maxDuration` é adição desta fase):
```typescript
// `node:crypto` e o Prisma (via service) exigem runtime Node; o Edge não serve.
export const runtime = "nodejs";
// Nenhuma resposta deste endpoint pode ser reaproveitada de cache.
export const dynamic = "force-dynamic";

const PREFIXO = "[webhook-asaas]";
```
> Para o worker: `const PREFIXO = "[cron-reconciliacao]";` e `export const maxDuration = 300;` (hint inerte fora da Vercel — RESEARCH §Duração).

**Gate time-safe de segredo estático** (`app/api/webhooks/asaas/route.ts:89-96` — este é O padrão a copiar, adaptando só a fonte do segredo para `Bearer `):
```typescript
function tokenValido(recebido: string | null): boolean {
  if (!recebido) return false;

  const doHeader = createHash("sha256").update(recebido).digest();
  const esperado = createHash("sha256").update(asaasWebhookToken()).digest();

  return timingSafeEqual(doHeader, esperado);
}
```
Adaptação obrigatória (D-08): ler `request.headers.get("authorization")`, exigir prefixo `"Bearer "` e hashear `authorization.slice(7)`. O `throw` do accessor de config **não** é capturado — mesma decisão documentada em `route.ts:83-87`.

**401 sem corpo** (`app/api/webhooks/asaas/route.ts:106-111` — copiar comentário e forma):
```typescript
export async function POST(request: Request) {
  // (1) Autenticidade. Falha genérica, sem corpo: não revela se o header estava
  // ausente, errado ou com tamanho inesperado (espelha `lib/api-auth.ts`).
  if (!tokenValido(request.headers.get("asaas-access-token"))) {
    return new Response(null, { status: 401 });
  }
```
> No worker o export é `GET` (Pitfall 3), não `POST`.

**`agora` único + `findMany` + laço em memória** (`scripts/contagem-status-acesso.ts:85-118` — copiar inclusive o comentário justificativo e o `where: { deletedAt: null }` de Pitfall 8):
```typescript
  // Um único instante para TODAS as avaliações. Se cada empresa lesse o relógio
  // de novo, uma virada de meia-noite no meio do laço colocaria duas empresas
  // com fatos idênticos em status diferentes — e o número perderia o sentido
  // justamente na fronteira que interessa.
  const agora = new Date();

  const empresas = await prisma.empresa.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      acessoAte: true,
      trialFim: true,
      canceladoEm: true,
      acessoVitalicio: true,
    },
  });

  for (const empresa of empresas) {
    const { status } = avaliarAcesso(empresa, agora);
    ...
  }
```
> Adicionar `ultimoStatusAuditado: true` ao `select` (o script não precisa dele; o worker precisa). O worker é o primeiro arquivo em `app/` autorizado a ler esse campo — atualizar a lista do gate de grep da Fase 2.

**Sanitização de mensagem de erro** (`scripts/contagem-status-acesso.ts:163-167` — idioma exato para D-04/Pitfall 9, nunca o objeto inteiro):
```typescript
  .catch((falha: unknown) => {
    console.error(
      `[acesso:contagem] ${falha instanceof Error ? falha.message : "falha desconhecida"}`
    );
```

**Anti-pattern explícito neste arquivo:** NÃO usar `agendarPosResposta` (Pitfall 4) — é o único ponto onde o análogo do webhook (`route.ts:151-154`) **não** deve ser copiado.

---

### `app/services/reconciliacao.service.ts` — `planejarReconciliacao` (pure domain, transform)

**Analog:** `lib/avaliar-acesso.ts` (função pura, relógio injetado, constantes exportadas e nomeadas) + `app/services/acesso.service.ts` (o consumidor).

**Constantes nomeadas e exportadas** (`lib/avaliar-acesso.ts:8,20`):
```typescript
export const DIAS_DE_CARENCIA = 10;
export const DIAS_DE_TRIAL = 14;
```
> Espelhar com `LIMIAR_DE_BLOQUEIO_EM_MASSA = 0.2` e `PISO_DE_BLOQUEIO_EM_MASSA = 5` (D-01), no mesmo arquivo do cálculo, exportadas para o teste e para o corpo da resposta.

**Predicados nomeados em vez de negação inline** (`lib/avaliar-acesso.ts:143-156` — o comentário do projeto exige nome próprio):
```typescript
export function acessoBloqueado(status: StatusAcesso): boolean { ... }

/**
 * Existe como nome próprio, e não como `!acessoBloqueado(...)` inline no
 * ...
 */
export function podePublicarCatalogo(status: StatusAcesso): boolean {
  return !acessoBloqueado(status);
}
```
> Aplicar a `perdeAcesso(t)` (Pitfall 6 / D-02): `!acessoBloqueado(anterior) && acessoBloqueado(novo)`, com `anterior === null` tratado como "tinha acesso".

**Contrato de retorno que o consumidor já espera** (`app/services/acesso.service.ts:36-42` — o shape de `Transicao` deve ser exatamente o `params` de `registrarTransicao` menos `causa`, para permitir spread `{ ...t, causa: WORKER_DIARIO }`):
```typescript
  async registrarTransicao(params: {
    empresaId: string;
    anterior: StatusAcesso | null;
    novo: StatusAcesso;
    causa: CausaTransicaoAcesso;
  }) {
    if (params.anterior === params.novo) return null;
```
> A guarda D-16 da linha 42 é replicada em memória na passada 1 (`if (status !== empresa.ultimoStatusAuditado)`) — não é duplicação acidental, é o que evita I/O.

**Export de singleton — NÃO aplicar aqui:** o idioma do projeto é `export const xService = new XService()` (`app/services/acesso.service.ts:64`), mas `planejarReconciliacao` é pura e deve ser export de **função nomeada**, como `lib/avaliar-acesso.ts`. Se o planner mantiver o arquivo em `app/services/`, exportar função solta (precedente `[02-03]`: puro em `lib/`, efeito colateral em `app/services/`).

---

### `app/api/cron/reconciliacao-diaria/route.test.ts` (test, request-response)

**Analog:** `app/api/webhooks/asaas/route.test.ts`

**Cabeçalho + mock do service + import dinâmico pós-mock** (linhas 1-36 — ordem obrigatória: `vi.mock` antes do `await import("./route")`):
```typescript
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/tests/helpers/request";

vi.mock("@/app/services/webhook-asaas.service", () => ({
  webhookAsaasService: {
    registrarEvento: vi.fn(),
    processar: vi.fn(),
  },
}));

const { POST } = await import("./route");
const { webhookAsaasService } = await import("@/app/services/webhook-asaas.service");
const registrarEvento = vi.mocked(webhookAsaasService.registrarEvento);
```

**Fixtures de segredo que provam não-vacuidade do timing-safe** (linhas 38-43 — copiar os três casos):
```typescript
const TOKEN = "a".repeat(64);
/** Mesmo comprimento do correto: prova que a comparação não vaza por tamanho. */
const TOKEN_ERRADO_MESMO_TAMANHO = "b".repeat(64);
const TOKEN_ERRADO_OUTRO_TAMANHO = "curto";
```

**Setup/teardown de env e console** (linhas 66-76 — `stubEnv` + `unstubAllEnvs` são obrigatórios porque o segredo é lido por accessor):
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", TOKEN);
  erroLogado = vi.spyOn(console, "error").mockImplementation(() => {});
  registrarEvento.mockResolvedValue("NOVO");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
```

**Construção do request** — usar `token` (não `headers`) do helper, que já monta `Authorization: Bearer` (`tests/helpers/request.ts:29-32`):
```typescript
  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
```
> Diferente do webhook (que precisou de `headers` custom por não usar Bearer), o worker usa `buildRequest({ method: "GET", url: "...", token: SEGREDO })` direto.

**Prisma mock:** `prismaMock` já é global e resetado por teste (`tests/setup/prisma-mock.ts`) — `prismaMock.empresa.findMany.mockResolvedValue([...] as never)`.

---

### `lib/billing/cron-config.ts` (config)

**Analog:** `lib/billing/asaas/config.ts:1-48`

**Accessor obrigatório, nunca `const` de módulo** (linhas 20-30 + o cabeçalho 10-17 que explica POR QUE — replicar a justificativa):
```typescript
function obrigatorio(nome: string): string {
  const valor = process.env[nome];

  // String vazia é tratada como ausente de propósito: `ASAAS_API_KEY=` num
  // `.env` mal preenchido é indistinguível, na prática, de não ter a chave.
  if (valor === undefined || valor === "") {
    throw new Error(`[asaas] variável de ambiente ausente: ${nome}`);
  }

  return valor;
}

/** Token que NÓS geramos e registramos no Asaas ... */
export function asaasWebhookToken(): string {
  return obrigatorio("ASAAS_WEBHOOK_TOKEN");
}
```
> Para o worker: `export function cronSecret(): string { return obrigatorio("CRON_SECRET"); }`, prefixo de mensagem `[cron]`. Se o planner preferir estender `lib/billing/asaas/config.ts`, reusar `obrigatorio` como está — mas `CRON_SECRET` não é credencial do Asaas, e um arquivo próprio evita acoplar o worker às env vars do gateway.

---

### `prisma/migrations/<ts>_add_worker_diario_causa/migration.sql` (migration)

**Analog:** `prisma/migrations/20260831230000_add_asaas_webhook_ledger/migration.sql:1-14`

**Forma exata a replicar** (incluindo o comentário de Pitfall 7, que é a defesa contra o erro `ALTER TYPE ... cannot run inside a transaction block`):
```sql
-- Pitfall 7: esta migration APENAS adiciona o valor 'WEBHOOK_PAGAMENTO' ao enum.
-- Nao ha (e nao pode haver) nenhum INSERT/UPDATE que USE esse valor aqui: o
-- prisma migrate roda cada migration em transacao, e o Postgres recusa usar um
-- valor de enum adicionado dentro da mesma transacao. Um backfill que precise da
-- nova causa vai em uma SEGUNDA migration.

-- AlterEnum
ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WEBHOOK_PAGAMENTO';
```
> Convenções observadas: comentários das migrations são **sem acento** (ASCII), header explicando a fase/requisito, marcadores `-- AlterEnum` no estilo gerado pelo Prisma. Migration só de enum, sem nenhuma outra alteração.

**Schema** (`prisma/schema.prisma:37-42` — acrescentar `WORKER_DIARIO` ao fim, preservando a ordem histórica):
```prisma
enum CausaTransicaoAcesso {
  REGISTRO
  BACKFILL
  AVALIACAO_SESSAO
  WEBHOOK_PAGAMENTO
}
```

---

### `scripts/seed-fatos-billing.ts` (script, modificado — desbloqueio do e2e, Achado 4)

**Analog:** ele mesmo.

**Parser de flag** (linhas 54-61 — adicionar a nova flag por este mesmo mecanismo, sem instalar parser):
```typescript
/** Leitura de `--chave valor` sobre `process.argv`, sem parser instalado. */
function argumento(nome: string): string | undefined {
  const posicao = process.argv.indexOf(`--${nome}`);

  if (posicao === -1) return undefined;

  return process.argv[posicao + 1];
}
```

**Ponto exato da mudança** (linhas 145-158 — o `ultimoStatusAuditado` alinhado é o que torna o e2e do worker vácuo; a nova flag deve desviar SÓ este campo, mantendo o default atual para não quebrar `e2e/bloqueio-por-inadimplencia.spec.ts`):
```typescript
    // `ultimoStatusAuditado` entra na MESMA escrita, alinhado ao status que
    // `avaliarAcesso` acabou de derivar. É bookkeeping do compare-and-swap da
    // auditoria (D-16): se ele ficasse com o valor antigo, o primeiro request
    // depois do seed veria uma transição que nunca aconteceu de verdade ...
    const empresa = await prisma.empresa.update({
      where: { slug },
      data: {
        ...
        ultimoStatusAuditado: derivado.status,
      },
```

**Fixtures derivadas de `agora`, nunca literais** (linhas 63-70 — a regra vale também para os testes novos desta fase):
```typescript
/**
 * Os fatos são SEMPRE derivados de `agora`, nunca literais fixos: uma fixture
 * com data escrita à mão passa hoje e vira "bloqueado" sozinha daqui a um mês.
 */
```

**Guarda de produção** (linhas 119-124) — permanece intocada.

---

## Shared Patterns

### Segredo estático time-safe
**Source:** `app/api/webhooks/asaas/route.ts:89-96`
**Apply to:** `app/api/cron/reconciliacao-diaria/route.ts`
Hash SHA-256 dos dois lados antes de `timingSafeEqual`. Proibido `===`. 401 com corpo vazio, sem distinguir causa.

### Env var obrigatória por accessor
**Source:** `lib/billing/asaas/config.ts:20-30`
**Apply to:** `lib/billing/cron-config.ts`
Sem default, sem coalescência para `""`, lido em chamada (não no import) para que o teste de 401 não precise do ambiente inteiro.

### Um único `agora` injetado
**Source:** `scripts/contagem-status-acesso.ts:85-89`; motor em `lib/avaliar-acesso.ts:52`
**Apply to:** route handler + `planejarReconciliacao`
`new Date()` uma vez, logo após o gate, propagado a todas as avaliações.

### `where: { deletedAt: null }` em varredura de Empresa
**Source:** `scripts/contagem-status-acesso.ts:92`
**Apply to:** o `findMany` do worker (Pitfall 8).

### Mensagem de erro sanitizada
**Source:** `scripts/contagem-status-acesso.ts:163-167`
**Apply to:** a lista `erros[]` de D-04 — `erro instanceof Error ? erro.message : "falha desconhecida"`, nunca o objeto.

### Prefixo de log por módulo
**Source:** `app/api/webhooks/asaas/route.ts:43` (`const PREFIXO = "[webhook-asaas]"`)
**Apply to:** route handler (`[cron-reconciliacao]`) e config (`[cron]`).

### Teste de route handler
**Source:** `app/api/webhooks/asaas/route.test.ts:1-76`
**Apply to:** `route.test.ts` do worker — `// @vitest-environment node`, `vi.mock` do service antes do `await import("./route")`, `stubEnv`/`unstubAllEnvs`, trio de segredos (ausente / errado mesmo tamanho / errado outro tamanho).

---

## No Analog Found

| File / Pattern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Laço com `Promise.allSettled` em lotes de ≤5 (dentro de `route.ts`) | orquestração | batch | Confirmado em CONTEXT §"Ausências confirmadas": não existe `Promise.allSettled` nem qualquer "iterar linhas isolando falha por linha" no projeto. Usar o shape de 05-RESEARCH §Pattern 3, ou o `for...of` + `try/catch` sequencial (alternativa aceitável). |
| Corpo de resposta JSON de sucesso-com-detalhes (D-04) | contrato de API | request-response | Todos os handlers atuais devolvem entidade, `null` ou erro `HttpError`. Não forçar no formato de erro existente (CONTEXT §Established Patterns). Usar `Response.json({...})` conforme 05-RESEARCH §"Shape completo do handler". |
| Paginação por cursor no `findMany` | database | batch | Não existe paginação em nenhum service (confirmado). Discrição do planner; o precedente é `findMany` único sem paginação. |

## Metadata

**Analog search scope:** `app/api/**`, `app/services/**`, `lib/**`, `scripts/**`, `prisma/migrations/**`, `tests/**`
**Files scanned:** 12 (8 lidos integralmente ou em faixas dirigidas)
**Pattern extraction date:** 2026-09-01
