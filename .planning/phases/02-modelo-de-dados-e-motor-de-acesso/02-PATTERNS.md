# Phase 2: Modelo de Dados e Motor de Acesso - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 13 (7 novos, 6 modificados)
**Analogs found:** 12 / 13

## File Classification

| New/Modified File | Novo/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|----------|------|-----------|----------------|---------------|
| `lib/fuso-sao-paulo.ts` | novo | utility (puro) | transform | `lib/slugify.ts` | exact |
| `lib/fuso-sao-paulo.test.ts` | novo | test (unit puro) | transform | `lib/slugify.test.ts` / `lib/format.test.ts` | exact |
| `lib/avaliar-acesso.ts` | novo | utility (puro, máquina de estados) | transform | `lib/slugify.ts` + `lib/http-error.ts` (tipos exportados) | role-match |
| `lib/avaliar-acesso.test.ts` | novo | test (unit puro, tabela de casos) | transform | `lib/format.test.ts` | exact |
| `lib/agendar-pos-resposta.ts` | novo | utility (side-effect scheduler) | event-driven | `lib/prisma.ts` (wrapper fino de infra) | partial |
| `app/services/acesso.service.ts` | novo | service | CRUD (write-only) + transação | `app/services/movimentacao-estoque.service.ts` (`$transaction`) | role-match |
| `app/services/acesso.service.test.ts` | novo | test (service c/ prismaMock) | CRUD | `app/services/promocao.service.test.ts` | exact |
| `app/services/empresa.service.ts` | mod | service | CRUD | ele mesmo (`create`, linhas 222-239 = allowlist campo a campo) | exact (auto-analog) |
| `app/services/empresa.service.test.ts` | mod | test | CRUD | ele mesmo (linhas 63-98) | exact |
| `lib/auth-guard.ts` | mod | middleware/DAL | request-response | ele mesmo (linhas 30-72) | exact |
| `lib/auth-guard.test.ts` | mod | test | request-response | ele mesmo | exact |
| `prisma/schema.prisma` + migration | mod/novo | model + migration | schema/DDL | `prisma/migrations/20260829135513_add_modo_interface_to_empresa/migration.sql` | exact (DDL) / **nenhum** (backfill) |
| `tests/setup/prisma-mock.ts` | mod | test config | — | ele mesmo (linhas 24-31) | exact |
| `app/api/empresas/[id]/route.test.ts` | mod | test (rota) | request-response | ele mesmo (linhas 83-97) | exact |
| `e2e/cadastro-e-login.spec.ts` | mod | test (e2e) | request-response | ele mesmo (linhas 5-21) | exact |

---

## Pattern Assignments

### `lib/fuso-sao-paulo.ts` (utility puro, transform)

**Analog:** `lib/slugify.ts` (10 linhas — função pura, export nomeado, zero import).

**Forma do módulo** (`lib/slugify.ts:1-10`):
```typescript
export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    // ...
  return slug || "empresa";
}
```

Regras herdadas: export **nomeado** (não default), sem singleton, sem import de `@/lib/prisma`, sem `new Date()`. Constantes de módulo em `const` no topo (padrão de `lib/jwt.ts` com `JWT_EXPIRATION`) — aplicar a `const FUSO = "America/Sao_Paulo"` e ao `Intl.DateTimeFormat` instanciado uma vez no módulo.

**Implementação:** copiar **literalmente** o Code Example 1 de `02-RESEARCH.md` (linhas 505-570). Não re-derivar o ponto-fixo.

---

### `lib/avaliar-acesso.ts` (utility puro, máquina de estados)

**Analog de forma:** `lib/slugify.ts` (pureza) + `lib/http-error.ts` (arquivo `lib/` que exporta tipo + valor).

**Import de enum do Prisma em módulo puro** — padrão existente em `app/services/movimentacao-estoque.service.ts:2`:
```typescript
import { TipoMovimentacao } from "@prisma/client";
```
Aplicar como `import { StatusAcesso } from "@prisma/client";`. Importar o enum como **valor** (não `import type`) porque ele é usado nos retornos.

**Interfaces de entrada** — o repo usa `interface` exportada acima da implementação, sufixo `DTO` só quando é payload de escrita (`app/services/movimentacao-estoque.service.ts:4-14`). Aqui `FatosDeAcesso` / `ResultadoAcesso` sem sufixo DTO estão corretos.

**Implementação:** Code Example 3 de `02-RESEARCH.md` (linhas 649-715). Ordem das regras (D-03 → D-05 → D-06 → carência → D-08) é normativa.

**Import path:** sempre `@/lib/fuso-sao-paulo`, nunca `./fuso-sao-paulo` em código de app — mas dentro de `lib/` o repo usa `@/lib/...` mesmo entre irmãos (`lib/slug.ts:1-3`):
```typescript
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import { pickUniqueWithSuffix } from "@/lib/unique-suffix";
```

---

### `lib/fuso-sao-paulo.test.ts` e `lib/avaliar-acesso.test.ts` (test unit puro)

**Analog:** `lib/slugify.test.ts` (25 linhas) e `lib/format.test.ts` (36 linhas).

**Cabeçalho e estrutura** (`lib/slugify.test.ts:1-6`):
```typescript
import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("converte para minúsculas e troca espaços por hífen", () => {
```

Notas:
- Import do módulo sob teste é **relativo** (`./slugify`) em testes co-localizados — mantém-se.
- **Sem** `// @vitest-environment node` nestes dois: `lib/slugify.test.ts` e `lib/format.test.ts` não têm, porque não tocam Prisma nem APIs de servidor. Funções puras rodam bem em jsdom.
- Nomes de `it()` em português, descrevendo comportamento.
- Datas construídas com `Date.UTC` explícito (`lib/format.test.ts:22`): `new Date(Date.UTC(2026, 0, 5, 12))` — usar o mesmo para os casos de virada, evitando `new Date("...")` sem `Z`.
- **Sem fake timers** aqui: `agora` é parâmetro (Pattern 2 da pesquisa).

---

### `app/services/acesso.service.ts` (service, write-only + transação)

**Analog:** `app/services/movimentacao-estoque.service.ts` (transação interativa) + `app/services/empresa.service.ts` (forma da classe/singleton).

**Imports e forma da classe** (`app/services/movimentacao-estoque.service.ts:1-16` e `app/services/empresa.service.ts:50, 262`):
```typescript
import { prisma } from "@/lib/prisma";
import { TipoMovimentacao } from "@prisma/client";

export interface CreateMovimentacaoDTO { /* ... */ }

class MovimentacaoEstoqueService {
  async create(data: CreateMovimentacaoDTO) {
    return prisma.$transaction(async (tx) => {
```
```typescript
// empresa.service.ts:262 — o singleton no fim do arquivo, sem default export
export const empresaService = new EmpresaService();
```

Aplicar: `class AcessoService { ... }` + `export const acessoService = new AcessoService();`.

**Transação interativa** — `prisma.$transaction(async (tx) => { ... })` com todas as escritas usando `tx.` (nunca `prisma.` dentro do callback). Ver `movimentacao-estoque.service.ts:58-59`.

**Implementação:** Code Example 4 de `02-RESEARCH.md` (linhas 722-763) — `updateMany` CAS + `count === 0 → null`.

**Erros:** este service não valida entrada de usuário; nenhum `HttpError` é esperado. Se precisar, o padrão é `app/services/empresa.service.ts:81`:
```typescript
throw new HttpError("Este email já está em uso.", 409);
```

---

### `app/services/acesso.service.test.ts` (test de service)

**Analog:** `app/services/promocao.service.test.ts:1-14` (cabeçalho + fixture) e `app/services/empresa.service.test.ts:45-49` (mock de `$transaction`).

**Cabeçalho obrigatório** (`app/services/promocao.service.test.ts:1-4`):
```typescript
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";
import { promocaoService } from "./promocao.service";
```
Nota: services importam o mock por caminho **relativo** (`../../tests/setup/prisma-mock`), enquanto `lib/auth-guard.test.ts:3` usa `@/tests/setup/prisma-mock`. Ambos existem; siga o relativo dentro de `app/services/`.

**Mock de `$transaction`** (`app/services/empresa.service.test.ts:45-49`) — copiar este helper para `acesso.service.test.ts`:
```typescript
function mockTransaction() {
  prismaMock.$transaction.mockImplementation((callback: (tx: typeof prismaMock) => unknown) =>
      Promise.resolve(callback(prismaMock))
    );
}
```

**Asserção de chamada Prisma** (`app/services/promocao.service.test.ts:26-34`):
```typescript
expect(prismaMock.promocao.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { empresaId: "empresa-1", dataInicio: { lte: agora }, dataFim: { gte: agora } },
  })
);
```
Usar para provar o `where` do CAS (`{ id, ultimoStatusAuditado: anterior }`) e o `data` da linha de auditoria (D-17: exatamente 4 campos, nada mais — asserção com `toHaveBeenCalledWith` **exato**, não `objectContaining`, para provar que não há snapshot).

**Retorno mockado:** `mockResolvedValue(x as never)` — o `as never` é a convenção do repo para driblar o tipo do DeepMockProxy (`promocao.service.test.ts:22`).

---

### `app/services/empresa.service.ts` (MODIFICADO — trial no registro + allowlist)

**Analog interno (o mais importante desta fase):** o próprio `create` do mesmo arquivo já é a allowlist correta — `update` é a exceção incoerente.

**Padrão a replicar** (`app/services/empresa.service.ts:222-239`):
```typescript
async create(data: CreateEmpresaDTO) {
  return prisma.empresa.create({
    data: {
      nome: data.nome,
      slug: data.slug,
      logo: data.logo,
      banner: data.banner,
      descricao: data.descricao,
      telefone: data.telefone,
      instagram: data.instagram,
      primaryColor: data.primaryColor,
      accentColor: data.accentColor,
    },
  });
}
```

**Código a corrigir** (`app/services/empresa.service.ts:241-248` — mass assignment, Pitfall 1):
```typescript
async update(id: string, data: UpdateEmpresaDTO) {
  return prisma.empresa.update({
    where: { id },
    data,          // <-- body cru; vira privilege escalation nesta fase
  });
}
```
Reescrever como allowlist condicional (`if (data.X !== undefined)`) cobrindo exatamente os 10 campos de `UpdateEmpresaDTO` (linhas 33-48): `nome, slug, logo, banner, descricao, telefone, instagram, primaryColor, accentColor, modoInterface`. Usar `Prisma.EmpresaUpdateInput` — `Prisma` já é importado na linha 7:
```typescript
import { ModoInterface, Prisma } from "@prisma/client";
```

**Trial na transação existente** (`app/services/empresa.service.ts:56-75`) — o `$transaction` já existe; adicionar `trialFim` + `ultimoStatusAuditado` ao `empresa.create` e um terceiro `tx.auditoriaAcesso.create` antes do `return`:
```typescript
return await prisma.$transaction(async (tx) => {
  const empresa = await tx.empresa.create({
    data: { nome: data.nomeEmpresa, slug, modoInterface: data.modoInterface },
  });
  const usuario = await tx.usuario.create({ /* ... */ });
  return { empresa, usuario };
});
```
Ver Code Example 5 de `02-RESEARCH.md` (linhas 771-802) para a versão final.

**Tratamento de erro do bloco** (`empresa.service.ts:76-93`) — não alterar; o `catch` de `P2002` continua envolvendo a transação.

---

### `app/services/empresa.service.test.ts` (MODIFICADO)

**Analog interno:** `app/services/empresa.service.test.ts:80-86` — a asserção **exata** do `empresa.create`:
```typescript
expect(prismaMock.empresa.create).toHaveBeenCalledWith({
  data: {
    nome: "Minha Loja",
    slug: "minha-loja",
    modoInterface: ModoInterface.COMPLETO,
  },
});
```
Este teste **vai quebrar** ao adicionar `trialFim`/`ultimoStatusAuditado` — é a asserção que precisa ser estendida (não relaxada para `objectContaining`).

**Fixture `empresaBase`** (linhas 16-31) precisa ganhar os 5 campos novos (`acessoAte: null, trialFim: <Date>, canceladoEm: null, acessoVitalicio: false, ultimoStatusAuditado: null`).

**Fake timers para `trialFim` determinístico** — padrão de `app/services/promocao.service.test.ts:18-20, 37`:
```typescript
vi.useFakeTimers();
const agora = new Date("2026-08-30T12:00:00.000Z");
vi.setSystemTime(agora);
// ...
vi.useRealTimers();
```
(Aqui o fake timer é legítimo: `registerComUsuario` chama `new Date()` internamente. Em `avaliarAcesso` não — `agora` é parâmetro.)

**Teste novo de regressão do allowlist:** mesmo formato, asserção `toHaveBeenCalledWith` sobre `prismaMock.empresa.update` provando que `acessoVitalicio` **não** aparece no `data`.

---

### `lib/auth-guard.ts` (MODIFICADO — estender select + expor status)

**Analog:** ele mesmo. O comentário nas linhas 26-28 já declara este ponto de extensão.

**Interface a estender** (`lib/auth-guard.ts:5-11`) — **acrescentar** `statusAcesso` (Pitfall 8: não mudar assinaturas de `requireAdminSession`/`requireAuth`):
```typescript
export interface ContaAtiva {
  usuarioId: string;
  empresaId: string;
  empresaSlug: string;
  email: string;
  role: UserRole;
}
```

**Select aninhado a estender** (`lib/auth-guard.ts:42-52`) — Pitfall 7: manter projeção explícita, **nunca** trocar por `include`:
```typescript
select: {
  // select explícito: nunca traz senhaHash (C-06). `include` é proibido
  // no modelo Usuario justamente porque arrastaria o hash da senha.
  id: true,
  email: true,
  role: true,
  empresaId: true,
  empresa: {
    select: { slug: true },      // <-- estender com os 4 fatos + ultimoStatusAuditado
  },
},
```

**Envelope try/catch fail-closed** (`lib/auth-guard.ts:32, 66-70`) — não alterar; a avaliação de acesso entra **dentro** do `try`, e uma falha de auditoria não pode derrubar o request:
```typescript
} catch (error) {
  // Fail-closed: erro de banco NÃO autoriza (D-01).
  console.error("[auth-guard] falha ao revalidar conta:", error);
  return null;
}
```
Convenção de log prefixado: usar `[acesso]` no `.catch` de `agendarPosResposta` (mesma forma que `[auth-guard]`).

**Wrapper `cache()`** (`lib/auth-guard.ts:30-31`) — preservar; é o que garante uma avaliação por request:
```typescript
export const revalidarConta = cache(
  async (usuarioId: string, empresaId: string): Promise<ContaAtiva | null> => {
```

---

### `lib/auth-guard.test.ts` (MODIFICADO)

**Fixture** (`lib/auth-guard.test.ts:6-12`) precisa dos campos de billing dentro de `empresa`:
```typescript
const contaAtiva = {
  id: "user-1",
  email: "admin@teste.com",
  role: "ADMIN",
  empresaId: "empresa-1",
  empresa: { slug: "empresa-teste" },
};
```

**Teste que sobrevive intacto** (linhas 27-42): a asserção do `where` usa `expect.objectContaining` e não é afetada pela mudança de `select`.

**Teste de proteção a preservar/estender** (linhas 62-71) — o "nunca seleciona senhaHash" continua válido e é a guarda contra o Pitfall 7.

---

### `prisma/schema.prisma` + `prisma/migrations/<ts>_add_billing_a_empresa/migration.sql`

**Analog do enum** (`prisma/schema.prisma:9-22`):
```prisma
enum UserRole { ADMIN }

enum ModoInterface {
  COMPLETO
  SIMPLES
}

enum TipoMovimentacao {
  ENTRADA
  SAIDA
  AJUSTE
}
```
PascalCase no tipo, SCREAMING_SNAKE_CASE nos valores, **sem `@map`**.

**Analog do model + relação + índice** (`prisma/schema.prisma:24-73`):
```prisma
model Empresa {
  id          String   @id @default(uuid())
  // ...
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  usuarios    Usuario[]
  @@index([slug])
}

model Usuario {
  empresaId      String
  empresa        Empresa @relation(fields: [empresaId], references: [id], onDelete: Cascade)
  createdAt      DateTime @default(now())
}
```
`AuditoriaAcesso` copia: `id String @id @default(uuid())`, o par `empresaId` + `@relation(... onDelete: Cascade)`, `createdAt DateTime @default(now())` (sem `updatedAt` — a linha é imutável), `@@index([empresaId, createdAt])`. Campos alinhados por coluna, blocos separados por linha em branco. Nada de `@db.Timestamptz`.

**Analog da migration aditiva** (`prisma/migrations/20260829135513_add_modo_interface_to_empresa/migration.sql` — arquivo inteiro, 5 linhas):
```sql
-- CreateEnum
CREATE TYPE "ModoInterface" AS ENUM ('COMPLETO', 'SIMPLES');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "modoInterface" "ModoInterface" NOT NULL DEFAULT 'COMPLETO';
```
Comentários `-- CreateEnum` / `-- AlterTable` / `-- CreateTable` são gerados pelo Prisma — preservá-los. Manter o espaçamento gerado (`ADD COLUMN` + 5 espaços).

**Sem analog:** a parte de **backfill** (`UPDATE` + `INSERT ... SELECT` com duplo `AT TIME ZONE`). Nenhuma das 7 migrations existentes contém DML. Usar Code Example 6 de `02-RESEARCH.md` (linhas 810-857) na íntegra, incluindo o comentário-cabeçalho marcando a seção como adicionada à mão após `--create-only`.

---

### `tests/setup/prisma-mock.ts` (MODIFICADO — bloqueador de Wave 0)

**Código exato a estender** (`tests/setup/prisma-mock.ts:24-30`):
```typescript
  prismaMock.usuario.findFirst.mockResolvedValue({
    id: "user-1",
    email: "admin@teste.com",
    role: "ADMIN",
    empresaId: "empresa-1",
    empresa: { slug: "empresa-teste" },
  } as never);
```
Adicionar dentro de `empresa`: `acessoAte: null, trialFim: <futuro>, canceladoEm: null, acessoVitalicio: false, ultimoStatusAuditado: "TRIAL"`. Sem isso, **todos** os testes de rota autenticada quebram de uma vez. O comentário das linhas 16-23 já explica por que o stub tem que ficar dentro deste `beforeEach`, depois do `mockReset` — preservá-lo e estendê-lo.

---

### `app/api/empresas/[id]/route.test.ts` (MODIFICADO — teste de regressão do mass assignment)

**Analog interno** (`app/api/empresas/[id]/route.test.ts:83-97`) — copiar a forma, mudar o payload:
```typescript
it("atualiza a empresa quando o id corresponde ao token", async () => {
  const token = await buildAuthToken();
  vi.mocked(empresaService.update).mockResolvedValue({ ...empresaDoToken, nome: "Novo nome" } as never);

  const response = await PATCH(
    buildRequest({ method: "PATCH", token, body: { nome: "Novo nome" } }),
    buildParams({ id: testAuthPayload.empresaId })
  );

  expect(response.status).toBe(200);
  expect(empresaService.update).toHaveBeenCalledWith(testAuthPayload.empresaId, { nome: "Novo nome" });
});
```
Nota: o service é **mockado inteiro** neste arquivo (linhas 6-12), então o allowlist não é exercitado aqui — a prova de runtime mora em `empresa.service.test.ts`. O teste novo aqui documenta a superfície HTTP.

**Mock de módulo por caminho relativo** (linhas 6-14) — o repo usa `vi.mock("../../../services/empresa.service", ...)`, não `@/`. `vi.mock` com alias é inconsistente no repo; siga o relativo neste arquivo.

---

### `e2e/cadastro-e-login.spec.ts` (MODIFICADO — asserção nova)

**Analog interno** (`e2e/cadastro-e-login.spec.ts:5-21`):
```typescript
test("cria uma nova empresa e entra direto no painel administrativo", async ({ page }) => {
  const empresa = uniqueEmpresa();
  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  // ...
  await page.getByRole("button", { name: "Criar minha loja" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Meus Produtos" })).toBeVisible();
});
```
Padrões: `uniqueEmpresa()` de `./helpers` para isolamento entre runs; locators por role/label (nunca CSS); `await expect(...)` sempre. A asserção da Fase 2 é negativa (nada de banner de bloqueio) — o admin simplesmente continua acessível, já que a Fase 4 é quem aplica bloqueio.

---

## Shared Patterns

### Imports com alias `@/`
**Source:** `lib/slug.ts:1-3`, `app/services/empresa.service.ts:1-8`
**Apply to:** todos os arquivos novos
```typescript
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http-error";
import { ModoInterface, Prisma } from "@prisma/client";
```
Exceção documentada: **testes co-localizados** importam o alvo por caminho relativo (`./empresa.service`), e testes de service importam `prismaMock` por `../../tests/setup/prisma-mock`.

### Service = classe privada + singleton exportado
**Source:** `app/services/empresa.service.ts:50` e `:262`
**Apply to:** `app/services/acesso.service.ts`
```typescript
class EmpresaService { /* ... */ }
export const empresaService = new EmpresaService();
```
A classe **não** é exportada; nenhum `export default` em nenhum service do repo.

### Allowlist de escrita campo a campo
**Source:** `app/services/empresa.service.ts:222-239` (`create`)
**Apply to:** `empresaService.update` (correção), e a qualquer método futuro que receba payload externo
Nunca repassar objeto cru para `prisma.*.update({ data })`. Tipos TypeScript não filtram em runtime.

### Fail-closed com log prefixado
**Source:** `lib/auth-guard.ts:66-70`
**Apply to:** `lib/agendar-pos-resposta.ts` (`[acesso]`), qualquer novo caminho que possa lançar
```typescript
} catch (error) {
  console.error("[auth-guard] falha ao revalidar conta:", error);
  return null;
}
```
`console.error` apenas; sem lib de logging. Nunca `console.log`.

### Transação interativa Prisma
**Source:** `app/services/empresa.service.ts:56-75`, `app/services/movimentacao-estoque.service.ts:57+`
**Apply to:** `acessoService.registrarTransicao`, trial no registro
```typescript
return await prisma.$transaction(async (tx) => {
  const empresa = await tx.empresa.create({ /* ... */ });
  const usuario = await tx.usuario.create({ /* ... */ });
  return { empresa, usuario };
});
```
Dentro do callback, **sempre** `tx.` — nunca `prisma.`.

### Teste server-side declara o ambiente
**Source:** `lib/auth-guard.test.ts:1`, `app/services/empresa.service.test.ts:1`, `app/api/empresas/[id]/route.test.ts:1`
**Apply to:** `app/services/acesso.service.test.ts`
```typescript
// @vitest-environment node
```
**Não** aplicar a `lib/fuso-sao-paulo.test.ts` / `lib/avaliar-acesso.test.ts` — funções puras seguem o default jsdom, como `lib/slugify.test.ts` e `lib/format.test.ts`.

### Projeção Prisma explícita, `include` proibido em `Usuario`
**Source:** `lib/auth-guard.ts:42-52` (comentário normativo inline)
**Apply to:** a extensão do `select` de `revalidarConta`
Manter o comentário existente; ele é a defesa contra o Pitfall 7.

### Nomes de teste em português, descrevendo comportamento
**Source:** `lib/slugify.test.ts:5,9,13`, `lib/auth-guard.test.ts:15,27,44`
**Apply to:** todos os testes novos
Ex.: `it("devolve VITALICIO mesmo com canceladoEm e acessoAte vencido", ...)`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/agendar-pos-resposta.ts` | utility (scheduler) | event-driven | Nenhum uso de `after()` do `next/server` existe no repositório; não há nenhum trabalho pós-resposta hoje. Usar Pitfall 3 de `02-RESEARCH.md` (linhas 409-425) como fonte — inclui o `try/catch` que degrada para execução inline fora de escopo de request (E468). O único padrão herdável é o `console.error` prefixado de `lib/auth-guard.ts:68`. |
| Seção de backfill do `migration.sql` | migration (DML) | batch | Nenhuma das 7 migrations existentes contém DML — todas são puro DDL. Usar Code Example 6 de `02-RESEARCH.md` (linhas 836-857) e Pitfall 4 (duplo `AT TIME ZONE`). |

---

## Metadata

**Analog search scope:** `lib/`, `app/services/`, `app/api/empresas/[id]/`, `app/registro/`, `prisma/schema.prisma`, `prisma/migrations/`, `tests/setup/`, `e2e/`
**Files scanned:** 48 listados, 14 lidos integralmente ou em seções
**Pattern extraction date:** 2026-08-31
