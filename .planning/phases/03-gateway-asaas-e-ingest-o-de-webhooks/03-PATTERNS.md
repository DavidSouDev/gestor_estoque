# Phase 3: Gateway Asaas e Ingestão de Webhooks - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 13 (11 novos, 2 modificados)
**Analogs found:** 11 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/billing/asaas/config.ts` | config | — | `lib/storage/r2.ts` (leitura de env) | partial (inverter o anti-padrão `?? ""`) |
| `lib/billing/asaas/client.ts` | utility (cliente externo) | request-response | `lib/storage/r2.ts` | role-match |
| `lib/billing/asaas/tipos.ts` | model (tipos) | — | `app/services/empresa.service.ts` (bloco de DTOs, linhas 12-50) | role-match |
| `lib/billing/asaas/eventos.ts` | utility (schemas zod) | transform | — | **no analog** (zod é dependência nova) |
| `lib/billing/asaas/datas.ts` | utility (função pura) | transform | `lib/fuso-sao-paulo.ts` / `lib/avaliar-acesso.ts` | exact |
| `lib/billing/asaas/datas.test.ts` | test | — | `lib/fuso-sao-paulo.test.ts` | exact |
| `app/services/assinatura.service.ts` | service | request-response | `app/services/empresa.service.ts` | role-match |
| `app/services/assinatura.service.test.ts` | test | — | `app/services/acesso.service.test.ts` | exact |
| `app/services/webhook-asaas.service.ts` | service | event-driven | `app/services/acesso.service.ts` | role-match |
| `app/services/webhook-asaas.service.test.ts` | test | — | `app/services/acesso.service.test.ts` | exact |
| `app/api/assinaturas/checkout/route.ts` | route (API) | request-response | `app/api/produtos/route.ts` (`POST`) | exact |
| `app/api/webhooks/asaas/route.ts` | route (API) | event-driven | `app/api/produtos/route.ts` (estrutura) + `lib/api-auth.ts` (guarda) | partial (**divergências obrigatórias** abaixo) |
| `prisma/schema.prisma` (MOD) + migration | migration | — | `model AuditoriaAcesso` (linhas 267-283) + enum `CausaTransicaoAcesso` (linhas 32-37) | exact |

---

## Pattern Assignments

### `lib/billing/asaas/config.ts` (config)

**Analog:** `lib/storage/r2.ts` — **copiar a estrutura, INVERTER a leitura de env.**

Anti-padrão vigente a NÃO copiar (`lib/storage/r2.ts:14-18`):

```ts
endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
credentials: {
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",     // ← segredo silenciosamente vazio
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
},
```

RESEARCH § Pattern 1 exige fail-fast no carregamento do módulo (`throw`), não `?? ""`.

**Padrão de lazy-init a copiar** (`lib/storage/r2.ts:8-23`) — útil se a validação precisar ser adiada para não quebrar testes que não configuram `ASAAS_*`:

```ts
let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ /* ... */ });
  }
  return client;
}
```

**Classe de erro dedicada** (`lib/storage/r2.ts:6`): `export class UploadError extends Error {}` — precedente para um `AsaasError` próprio, se o cliente precisar distinguir falha de gateway de `HttpError`.

---

### `lib/billing/asaas/client.ts` (utility, request-response)

**Analog:** `lib/storage/r2.ts` (único cliente de serviço externo do projeto).

**Padrão de tradução de erro externo → erro do domínio** (`lib/storage/r2.ts:38-49`):

```ts
try {
  await getClient().send(new PutObjectCommand({ /* ... */ }));
} catch {
  throw new UploadError("Erro ao enviar imagem. Tente novamente.");
}
```

**Erro HTTP com status** — `lib/http-error.ts` (arquivo inteiro, 8 linhas):

```ts
export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
```

O cliente lança `new HttpError("Não foi possível falar com o gateway de pagamento.", 502)` (RESEARCH Code Example #1). Log com prefixo `[asaas]`, nunca o corpo inteiro (Pitfall 9).

---

### `lib/billing/asaas/datas.ts` (utility, transform — função pura)

**Analog:** `lib/fuso-sao-paulo.ts` — **importar, nunca re-derivar.**

Aviso literal no topo do arquivo (`lib/fuso-sao-paulo.ts:1-5`):

```ts
// VERIFICADO: executado no Node deste ambiente contra 8 casos, incluindo as
// transições históricas de horário de verão do Brasil (2017-10-15 inexistente,
// 2018-02-18 ambígua). Não re-derive este algoritmo — o erro de medir o desvio
// contra o valor corrente em vez de contra o alvo produz resultados 1-2h errados
// que só falham em datas com mudança de offset.
```

**Assinatura a consumir** (`lib/fuso-sao-paulo.ts:44-63`):

```ts
export function meiaNoiteEmSaoPaulo(instante: Date, deslocamentoDias = 0): Date
```

Semântica documentada: **limite superior exclusivo** do dia local — casa com `agora < acessoAte` de `avaliarAcesso`.

**Precedente de uso com deslocamento e comentário justificando o off-by-one** (`app/services/empresa.service.ts:57-62`):

```ts
// D-18: o dia do cadastro é o dia 0, e `meiaNoiteEmSaoPaulo` devolve o limite
// SUPERIOR EXCLUSIVO do dia local. Por isso o deslocamento carrega um dia extra
// além de `DIAS_DE_TRIAL`: sem esse dia, quem se cadastrasse às 23:59 receberia 13
// dias e um minuto em vez dos 14 dias completos prometidos por BILL-03.
const agora = new Date();
const trialFim = meiaNoiteEmSaoPaulo(agora, DIAS_DE_TRIAL + 1);
```

`acessoAteAposPagamento(dueDate)` deve carregar um comentário do mesmo calibre explicando a âncora ao meio-dia UTC (Pitfall 6) e o clamp de fim de mês (Pitfall 5).

**Constantes de domínio exportadas do módulo puro** — `lib/avaliar-acesso.ts:8,20`: `export const DIAS_DE_CARENCIA = 10;` / `export const DIAS_DE_TRIAL = 14;`. `VALOR_PLANO_MENSAL = 29.9` (D-02) segue o mesmo formato.

---

### `app/services/webhook-asaas.service.ts` (service, event-driven)

**Analog:** `app/services/acesso.service.ts` (arquivo inteiro, 64 linhas) — o padrão de compare-and-swap a **reusar, não duplicar**.

**Forma do módulo** (`app/services/acesso.service.ts:1-4, 62-64`):

```ts
import { prisma } from "@/lib/prisma";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";

class AcessoService {
  // ...
}

export const acessoService = new AcessoService();
```

Classe sem export + singleton `const` exportado (C-02). Assinatura por objeto de parâmetros nomeados.

**Compare-and-swap dentro de `$transaction` — o padrão a chamar, não a copiar** (`app/services/acesso.service.ts:36-61`):

```ts
async registrarTransicao(params: {
  empresaId: string;
  anterior: StatusAcesso | null;
  novo: StatusAcesso;
  causa: CausaTransicaoAcesso;
}) {
  if (params.anterior === params.novo) return null;

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.empresa.updateMany({
      where: { id: params.empresaId, ultimoStatusAuditado: params.anterior },
      data: { ultimoStatusAuditado: params.novo },
    });

    if (count === 0) return null; // outro request já registrou esta transição
    return tx.auditoriaAcesso.create({ /* ... */ });
  });
}
```

O `updateMany` monotônico de `acessoAte` (RESEARCH Pattern 3) é **o mesmo idioma** — guarda no `WHERE`, decisão via `count === 0`, no-op silencioso. Copiar a forma; a auditoria em si vem de `acessoService.registrarTransicao(...)`.

**Densidade de comentário esperada:** `acesso.service.ts:5-35` — 30 linhas de docblock para 25 de código, citando IDs de decisão (D-16, D-17, T-02-15) e explicando por que a alternativa ingênua (ler-comparar-escrever) está errada. O `webhook-asaas.service` deve citar GTW-02/03/04, Pattern 3/4/5 e Pitfall 4/5.

**Tratamento de `P2002`** (`app/services/empresa.service.ts:113-130`):

```ts
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]) : [];
    if (target.includes("email")) {
      throw new HttpError("Este email já está em uso.", 409);
    }
    // ...
  }
  throw error;   // re-lança o inesperado, nunca engole
}
```

No webhook, o `P2002` de `eventoId` é o caminho **feliz** (duplicado → 200 sem processar), não um erro.

**Escrita direta com `tx.` em vez do service quando não há concorrência** (`app/services/empresa.service.ts:95-98`) — comentário que justifica o desvio; existe precedente, mas o webhook **tem** concorrência, então usa o service.

---

### `app/services/assinatura.service.ts` (service, request-response)

**Analog:** `app/services/empresa.service.ts`.

**Bloco de DTOs no topo, antes da classe** (`app/services/empresa.service.ts:12-50`):

```ts
export interface RegisterComUsuarioDTO {
  nomeEmpresa: string;
  nomeResponsavel: string;
  email: string;
  senha: string;
  modoInterface: ModoInterface;
}
```

**Imports com alias `@/` para lib, relativo só entre services irmãos** (`app/services/empresa.service.ts:1-10`):

```ts
import { prisma } from "@/lib/prisma";
import { produtoService } from "./produto.service";
import { HttpError } from "@/lib/http-error";
import { CausaTransicaoAcesso, ModoInterface, Prisma, StatusAcesso } from "@prisma/client";
import { meiaNoiteEmSaoPaulo } from "@/lib/fuso-sao-paulo";
import { DIAS_DE_TRIAL } from "@/lib/avaliar-acesso";
```

**Ordem D-07 (nada gravado antes do 2xx do Asaas):** inverte a ordem do analog (que grava tudo numa `$transaction`). Chamar o Asaas primeiro; só depois `prisma.checkoutAsaas.create`.

---

### `app/api/assinaturas/checkout/route.ts` (route, request-response)

**Analog:** `app/api/produtos/route.ts` — copiar o `POST` (linhas 30-60) quase literalmente.

```ts
import { requireAuth, AuthError } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request);
    const body = await request.json();

    const produto = await produtoService.create({ ...body, empresaId: auth.empresaId });

    return NextResponse.json(produto, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    console.error(error);

    return NextResponse.json({ message: "Erro ao criar produto." }, { status: 500 });
  }
}
```

**Duas correções ao copiar:**
1. `app/api/produtos/route.ts:1` usa `import { produtoService } from "../../services/produto.service";` — viola C-04. Usar `@/app/services/assinatura.service`.
2. O analog não trata `HttpError`. Adicionar um branch `error instanceof HttpError` (para o 502 do gateway, D-07) além do `AuthError`.

`auth.empresaId` é a **única** fonte de tenant (C-08) — nunca ler `empresaId` do body.

---

### `app/api/webhooks/asaas/route.ts` (route, event-driven)

**Analog parcial:** `app/api/produtos/route.ts` para a forma; `lib/api-auth.ts` para a guarda. **Nenhum webhook existe no projeto — este é o primeiro.**

**Divergências obrigatórias vs. o analog** (Pitfall 2):

| Analog faz | O webhook DEVE fazer | Por quê |
|------------|----------------------|---------|
| `NextResponse.json(x, { status: 201 })` | `new Response(null, { status: 200 })` | Só HTTP 200 conta como sucesso; 15 falhas pausam a fila |
| `requireAuth(request)` (Bearer JWT) | `timingSafeEqual` sobre hash do header `asaas-access-token` | O Asaas não é um usuário autenticado |
| `status: 500` em erro genérico | `200` + `console.error("[webhook-asaas] …")` | Erro nosso não pode pausar a fila do Asaas |
| Processa tudo antes de responder | `agendarPosResposta(...)` depois do 200 | Timeout de 10s |

**Padrão de guarda a espelhar em forma** (`lib/api-auth.ts:26-51`): extrair credencial do header → validar → falha vira erro com status; mensagem genérica que não vaza qual das causas falhou (`api-auth.ts:45-48`).

**Trabalho pós-resposta — usar como está, nunca reimplementar** (`lib/agendar-pos-resposta.ts:28`):

```ts
export function agendarPosResposta(tarefa: () => Promise<unknown>): void
```

Já trata: `after()` do Next, drenagem no `SIGTERM`, captura de throw síncrono via `Promise.resolve().then(tarefa)` (linhas 29-40), e fallback inline fora de request scope (erro `E468`, linhas 42-66). Rejeições são logadas com prefixo `[acesso]` — o webhook deve **também** gravar o erro na coluna `erro` do ledger (Pitfall 10), porque o log do helper sozinho não é consultável.

---

### `prisma/schema.prisma` (MOD) + migration

**Analog:** `model AuditoriaAcesso` (linhas 267-283) para o novo `EventoWebhookAsaas`/`CheckoutAsaas`:

```prisma
model AuditoriaAcesso {
  id             String   @id @default(uuid())

  empresaId      String
  empresa        Empresa  @relation(fields: [empresaId], references: [id], onDelete: Cascade)

  statusAnterior StatusAcesso?
  statusNovo     StatusAcesso
  causa          CausaTransicaoAcesso

  createdAt      DateTime @default(now())

  // D-17: sem snapshot dos fatos de billing.

  @@index([empresaId, createdAt])
}
```

Convenções: `String @id @default(uuid())`, relação com `onDelete: Cascade`, `createdAt DateTime @default(now())`, `@@index` explícito, comentário citando o ID da decisão.

**Enum a estender** (`prisma/schema.prisma:32-37`) — o comentário é uma instrução direta ao planner:

```prisma
// D-14: apenas os valores que existem HOJE. Novas causas entram por migration
// propria na fase em que passarem a existir.
enum CausaTransicaoAcesso {
  REGISTRO
  BACKFILL
  AVALIACAO_SESSAO
}
```

Migration: `ALTER TYPE "CausaTransicaoAcesso" ADD VALUE 'WEBHOOK_PAGAMENTO';` **sozinha, sem DML que use o valor** (Pitfall 7).

**Campos de billing na `Empresa`** (linhas 57-70) — o comentário existente já reserva a Fase 3:

```prisma
  // Fatos de billing (BILL-01). Fonte da verdade do acesso. Instantes UTC ja
  // normalizados para a meia-noite de America/Sao_Paulo (D-01).
  acessoAte       DateTime?
  trialFim        DateTime?
  canceladoEm     DateTime?
  acessoVitalicio Boolean   @default(false)

  // Bookkeeping de auditoria (D-16). NAO e fonte da verdade e NENHUMA decisao
  // de acesso pode le-lo: quem decide e sempre avaliarAcesso() sobre os 4 fatos
  // acima.
  ultimoStatusAuditado StatusAcesso?
```

`asaasCustomerId` / `asaasSubscriptionId @unique` entram como novo bloco comentado, **fora** do bloco de fatos de billing (são identificadores externos, não fatos que `avaliarAcesso` consome).

**Nota:** o schema não tem `@@map`/`@map` — nomes de modelo e coluna são usados literalmente no SQL da migration (com aspas duplas).

---

## Shared Patterns

### Testes de service (co-localizados)

**Source:** `app/services/acesso.service.test.ts`
**Apply to:** `assinatura.service.test.ts`, `webhook-asaas.service.test.ts`, `datas.test.ts`

Cabeçalho e mock do Prisma (`acesso.service.test.ts:1-24`):

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { StatusAcesso, CausaTransicaoAcesso } from "@prisma/client";
import { acessoService } from "./acesso.service";

function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
}

beforeEach(() => {
  vi.clearAllMocks();
});
```

Convenções:
- `describe("servico.metodo", ...)`, nomes de `it` em português citando o ID da decisão/requisito ("D-16: não toca o banco quando…").
- `mockResolvedValue({ count: 1 } as never)` para `updateMany`; `as never` é o cast idiomático do projeto para os mocks tipados.
- **Asserção de ausência** para provar invariantes (linhas 38-40) — é exatamente o que RESEARCH § Pattern 4 exige do `PAYMENT_OVERDUE`:

```ts
expect(prismaMock.$transaction).not.toHaveBeenCalled();
expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
```

- **Asserção exata em vez de `objectContaining`** (linhas 74-83), com comentário explicando que a exatidão é a prova da invariante:

```ts
// Asserção EXATA (não `objectContaining`): é ela que prova a ausência de
// snapshot dos fatos de billing.
expect(prismaMock.auditoriaAcesso.create).toHaveBeenCalledWith({
  data: { empresaId: "empresa-1", statusAnterior: "TRIAL", statusNovo: "CARENCIA", causa: "AVALIACAO_SESSAO" },
});
```

- `it.each([...])` para varrer valores de enum (linhas 132-156) — aplicável à matriz de eventos `PAYMENT_*`.

### Erros e status

**Source:** `lib/http-error.ts` (integral acima) + `lib/api-auth.ts:4-11`

```ts
export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
```

**Apply to:** cliente Asaas (502), route de checkout (repassa `error.status`), service de assinatura.
Regra C-05: detalhe no `console.error`, mensagem genérica ao cliente.

### Log com prefixo entre colchetes

**Source:** `lib/agendar-pos-resposta.ts:39,60` → `console.error("[acesso] …")`
**Apply to:** `[asaas]` no cliente/config, `[webhook-asaas]` no route e no service.
Nunca `console.log`; nunca logar o body do webhook (Pitfall 9).

### Isolamento multi-tenant

**Source:** `app/api/produtos/route.ts:32,38` — `auth.empresaId` de `requireAuth`, espalhado no DTO.
**Apply to:** route de checkout.
**Inversão no webhook:** não há `auth`; `empresaId` vem do mapa local (`Empresa.asaasSubscriptionId` / `CheckoutAsaas.asaasCheckoutId`), nunca do payload (C-08, Pattern 5).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/billing/asaas/eventos.ts` | utility (schemas) | transform | `zod` não existe no projeto hoje; nenhuma validação de payload declarativa em uso. Seguir RESEARCH § Pitfall 3 (nunca `.strict()`) e `checkpoint:human-verify` antes do install |
| `app/api/webhooks/asaas/route.ts` (semântica de resposta) | route | event-driven | Nenhum endpoint de webhook existe. A forma vem de `app/api/produtos/route.ts`, mas o contrato de resposta (sempre 200) é **oposto** ao do resto do projeto — ver tabela de divergências |
| `lib/billing/asaas/` (diretório) | — | — | Não existe `lib/<dominio>/` aninhado hoje; `lib/storage/` (com `r2.ts` + `r2.test.ts`) é o único precedente de subdiretório em `lib/` |

## Metadata

**Analog search scope:** `app/services/`, `lib/`, `lib/storage/`, `app/api/`, `prisma/schema.prisma`
**Files scanned:** 45 listados, 10 lidos integralmente ou em seções
**Pattern extraction date:** 2026-08-31
