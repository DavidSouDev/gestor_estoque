# Codebase Concerns

**Analysis Date:** 2026-08-31

## Critical Issues

### Prisma Client Singleton Misconfiguration (Production Bug)

**Status:** Resolvido na Fase 1 — plano 01-01 (requisito INFRA-01).

**Issue:** Prisma client is only cached in development, not in production.

**Files:** `lib/prisma.ts`

**Mechanism (corrigido):** a conclusão original estava certa, mas o mecanismo descrito estava errado. O cache de módulos do Node **impede** a duplicação dentro de uma mesma camada de bundle — importar `lib/prisma.ts` de dez arquivos da mesma camada devolve a mesma instância. O problema real é que o Next.js 16 compila o código de servidor em **camadas de bundle separadas** (`rsc`, `ssr`, `api-node`, `api-edge`, `action-browser`, `instrument`, `middleware`, `shared` — verificado em `node_modules/next/dist/lib/constants.js:331-372`), e o mesmo arquivo importado de camadas diferentes vira **instâncias de módulo distintas em runtime**. Como `lib/prisma.ts` é importado tanto por Server Components/Server Actions (camadas `rsc`/`action-browser`) quanto por todas as rotas `app/api/*` (camada `api-node`), em produção o processo abria um `PrismaClient` por camada — cada um com o seu próprio `pg.Pool` (`max` default = 10).

**Impact:**
- Pools de conexão redundantes no mesmo processo (um por camada de bundle, não um por processo)
- Dois multiplicadores agravam o quadro: em serverless cada lambda é um processo novo; e os pontos de entrada extras das Fases 3 e 5 (webhooks do gateway e worker diário) adicionam mais camadas/processos
- Sob carga, isso esgota o limite de conexões do PostgreSQL e o servidor para de responder
- **System will fail under load in production**

**Código anterior:**
```typescript
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**Fix approach (implementado):** a construção do client foi extraída para uma factory `createPrismaClient()` — o que também tira a leitura de `process.env.DATABASE_URL` do tempo de import — e a atribuição a `globalThis` passou a ser **incondicional**, sem nenhuma guarda por ambiente. `globalThis` é o único escopo compartilhado entre as camadas de bundle, então é ele que garante um pool por processo:
```typescript
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
```
Gate automatizado em `lib/prisma.test.ts` (reavalia o módulo sob `NODE_ENV=production` e exige a mesma instância). O dimensionamento de `max` do pool e a escolha entre URL *pooled* e direta continuam **fora de escopo** — são entrada da fase de deploy/hosting.

**Priority:** CRITICAL - Production blocker

---

### Race Conditions on Unique Constraints

**Slug Generation Race Condition:**

**Issue:** `generateUniqueSlug()` queries existing slugs, picks a unique one, then creates the empresa. Between the query and create, another request could claim the same slug.

**Files:** `lib/slug.ts`

**Flow:**
1. Query: Get all slugs starting with base
2. Calculate: Pick next available suffix (e.g., "acme", "acme-2", "acme-3")
3. Create: Insert empresa with chosen slug
4. **RACE: Another request could insert "acme-2" between steps 2-3**

**Consequence:** Unique constraint violation on `Empresa.slug`, error thrown to user despite valid input

**Fix approach:** Use Prisma database-level unique constraint + transaction, or implement optimistic locking with retries

---

**Usuario Creation Race Condition:**

**Issue:** `UsuarioService.create()` checks if company already has admin, then Prisma enforces the same check via unique constraint.

**Files:** `app/services/usuario.service.ts` (lines 63-70, 85-90)

**Problem:** Manual check at line 63 can pass, then another request creates a user, then the create at line 75 fails with P2002 error. The error is caught and re-thrown correctly, but this is inefficient and fragile.

**Fix approach:** Remove manual check; rely on Prisma unique constraint and handle P2002 error only

---

## Security Concerns

### Unauthenticated User Creation Endpoint

**Issue:** `POST /api/usuarios` does not require authentication.

**Files:** `app/api/usuarios/route.ts`

**Behavior:** Anyone can POST to create a user for ANY existing company.

**Risk:** 
- Unauthorized privilege escalation (create admin user for another company)
- Account takeover (if email validation is missing)

**Current code:** No `requireAuth` call in POST handler

**Mitigation:** This is likely intentional for the registration flow (`app/registro/actions.ts` uses `empresaService.registerComUsuario` instead). However:
1. This endpoint is still discoverable and usable by attackers
2. No rate limiting prevents brute-force account creation
3. No email verification prevents account takeover

**Fix approach:** 
- Either remove the open POST endpoint and use only the service method
- Or implement strong validation: require proof of company ownership (e.g., invitation token, company setup key)

**Priority:** HIGH

---

### Unvalidated Request Bodies

**Issue:** API routes accept `request.json()` and pass directly to services without schema validation.

**Files:** 
- `app/api/combos/[id]/route.ts` (line 74-76, PATCH)
- `app/api/usuarios/route.ts` (line 33-35, POST)
- `app/api/produtos/[id]/route.ts` (PATCH)
- `app/api/promocoes/[id]/route.ts` (PATCH)
- All other PATCH/POST routes

**Example problem:**
```typescript
// Line 74-76: No validation
const body = await request.json();
const combo = await comboService.update(id, body);
// If body contains: { preco: "not-a-number", produtoIds: null, ...}
// Service will pass it unchecked to Prisma
```

**Risk:** 
- Type errors at runtime (e.g., passing string where number expected)
- Invalid data persisted to database
- Unexpected Prisma errors returned as 500 instead of 400

**Fix approach:** Add schema validation using Zod, Joi, or similar. Validate at route handler before calling service.

**Priority:** MEDIUM

---

### No Input Validation on Core Services

**Issue:** Services accept DTOs but perform NO validation on input values.

**Files:** `app/services/*.service.ts` (all create/update methods)

**Examples:**
- `ProdutoService.create()`: No validation that `precoVarejo` > 0, `estoque` >= 0, `nome` not empty
- `MovimentacaoEstoqueService.create()`: No validation that `quantidade` > 0
- `ComboService.create()`: No validation on `preco`, `nome`

**Risk:** Invalid data reaches database; business logic constraints violated

**Consequence:** Negative prices, empty product names, invalid stock quantities allowed if validation is bypassed at route level

**Fix approach:** Add input validation in services OR use shared validation utilities called from both services and server actions.

**Priority:** MEDIUM

---

## Data Integrity Issues

### PromocaoItem Allows Orphaned References

**Issue:** `PromocaoItem` can have both `produtoId` and `comboId` as optional.

**Files:** `prisma/schema.prisma` (lines 200-206)

**Schema:**
```prisma
produtoId   String?
produto     Produto? @relation(...)

comboId     String?
combo       Combo? @relation(...)
```

**Risk:** A promotion item could have:
- Neither produtoId nor comboId (orphaned)
- Both set (ambiguous)
- Referenced product/combo gets deleted (cascade), leaving orphaned item

**Consequence:** Inconsistent data; promotion appears to apply to nothing

**Fix approach:** Add constraint in service layer to ensure exactly one of `produtoId` or `comboId` is set; consider database check constraint (PostgreSQL CHECK)

**Priority:** MEDIUM

---

### Missing Audit Trail for Stock Movements

**Issue:** `MovimentacaoEstoque` records are deletable and not immutable.

**Files:** `app/services/movimentacao-estoque.service.ts` (line 140-146)

**Risk:** 
- Delete movements to hide stock discrepancies
- Audit trail is not reliable
- Impossible to reconstruct accurate inventory history

**Consequence:** Can tamper with stock audit trail

**Fix approach:** 
- Remove delete endpoint OR make it soft-delete only
- Add immutability: once created, movimentações cannot be modified
- Only allow deletion/correction via separate "Correction" movement

**Priority:** MEDIUM

---

## Configuration & Environment Issues

### JWT Secret Validation Missing

**Issue:** If `JWT_SECRET` is not set, error is thrown at runtime during token creation, not at startup.

**Files:** `lib/jwt.ts` (lines 14-22)

**Current:**
```typescript
function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurado.");
  }
  return new TextEncoder().encode(secret);
}
```

**Problem:** 
- Called every time a token is signed (wasteful encoding)
- Error thrown during request, not startup
- Hard to debug in production

**Fix approach:** 
- Validate at module load time
- Cache encoded key once
- Fail fast on startup

**Priority:** LOW (not production-breaking, but poor DX)

---

### JWT Expiration Hardcoded

**Issue:** Token expiration is hardcoded to "7d".

**Files:** `lib/jwt.ts` (line 4)

**Problem:** 
- Cannot adjust without code change
- No environment-based configuration
- Same expiration for all tokens

**Fix approach:** Move to environment variable with sensible default

**Priority:** LOW

---

### S3 Credentials Validation Missing

**Issue:** R2 credentials are read from environment but not validated at startup.

**Files:** `lib/storage/r2.ts` (lines 16-17)

**Current:**
```typescript
accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
```

**Risk:** 
- Empty strings used as credentials if env vars missing
- Upload attempts fail cryptically at runtime
- Should fail at startup, not during first image upload

**Fix approach:** Validate credentials exist during module initialization

**Priority:** LOW

---

## Performance Concerns

### N+1 Query Risk in Produto.findById

**Issue:** While not currently present, `findById()` includes nested relations that could cause N+1 if not careful.

**Files:** `app/services/produto.service.ts` (lines 133-161)

**Current code** is fine with explicit includes, but if a loop calls `findById()` for each product, it will be N+1.

**Risk:** Low currently, but fragile pattern

**Fix approach:** Document that `findById` includes all relations; add batch query method for lists

**Priority:** LOW

---

### S3 Client Lazy Initialization

**Issue:** S3 client is lazy-loaded (created on first use), not during module initialization.

**Files:** `lib/storage/r2.ts` (lines 8-23)

**Impact:** 
- First image upload slower than subsequent ones
- If credentials are invalid, first upload fails instead of startup

**Fix approach:** Initialize client eagerly at module load

**Priority:** LOW

---

## Testing & Coverage Gaps

### Missing Validation Testing

**Issue:** Services have many validation rules implemented in server actions, not in services.

**Files:** `app/[slug]/admin/(protected)/_lib/simples-actions.ts` (validation scattered)

**Risk:** 
- Validation logic is hard to test in isolation
- Server actions are harder to unit test than services
- Multiple paths could bypass validation

**Fix approach:** Move validation to services; test at service layer

**Priority:** MEDIUM

---

### No E2E Tests for Multi-Tenancy Isolation

**Issue:** No E2E tests verify that Company A cannot see/modify Company B's data.

**Files:** `e2e/` directory

**Risk:** 
- Tenant isolation could be broken without detection
- Cross-tenant data leak possible if enterpriseId checks removed

**Fix approach:** Add E2E tests that:
1. Create two companies
2. Authenticate as Company A
3. Attempt to access/modify Company B's resources
4. Verify 404 or 403 responses

**Priority:** MEDIUM

---

### No Error Scenario Tests

**Issue:** Services throw generic `Error` in some places instead of `HttpError`.

**Files:** 
- `app/services/produto.service.ts` (line 247, throws generic Error)
- `app/services/movimentacao-estoque.service.ts` (lines 67, 81, throws generic Error)

**Problem:** 
- Inconsistent error handling
- Unclear which errors are business errors vs. unexpected errors
- API routes cannot distinguish error types reliably

**Fix approach:** 
- Create custom error classes (ProductNotFound, InsufficientStock, etc.)
- Throw specific errors from services
- Map to HTTP status codes in routes

**Priority:** MEDIUM

---

## Code Quality Issues

### Type Assertions Without Validation

**Issue:** JWT payload fields are cast without validation.

**Files:** `lib/jwt.ts` (lines 35-41)

**Current:**
```typescript
return {
  sub: payload.sub as string,
  empresaId: payload.empresaId as string,
  // ...
};
```

**Risk:** If JWT payload structure changes or is forged, these assertions will silently allow invalid data

**Fix approach:** Validate payload shape using schema validator (runtime)

**Priority:** LOW

---

### Inconsistent Error Handling

**Issue:** Some routes return error details, others return generic messages.

**Files:** Multiple API routes

**Example:**
- `POST /api/usuarios` returns generic "Erro ao criar usuário"
- `POST /api/produtos` also returns generic message
- But test comments note "rota não exige autenticação" — inconsistent docs

**Fix approach:** Standardize error response format across all routes; document all requirements

**Priority:** LOW

---

## Summary of Priorities

| Priority | Count | Items |
|----------|-------|-------|
| **CRITICAL** | 1 | Prisma singleton bug (production blocker) |
| **HIGH** | 1 | Unauthenticated user creation endpoint |
| **MEDIUM** | 7 | Race conditions, unvalidated bodies, missing audit trail, data integrity, validation testing, E2E isolation tests, error handling consistency |
| **LOW** | 4 | JWT config, S3 validation, N+1 prevention, type safety |

---

*Concerns audit: 2026-08-31*
