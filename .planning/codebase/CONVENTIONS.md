# Coding Conventions

**Analysis Date:** 2026-08-31

## Naming Patterns

**Files:**
- Services: `[entity].service.ts` (e.g., `usuario.service.ts`, `produto.service.ts`)
- Service tests: `[entity].service.test.ts` (co-located with service)
- API routes: `route.ts` in nested directories per resource (e.g., `app/api/produtos/route.ts`)
- Utilities: `[utility-name].ts` (e.g., `slugify.ts`, `format.ts`, `jwt.ts`)
- Components: PascalCase with `.tsx` extension (e.g., `ModoInterfacePicker.tsx`)
- Component tests: `[Component].test.tsx` (co-located with component)

**Functions:**
- camelCase for all function names
- Service methods: verb + noun pattern (e.g., `list()`, `findById()`, `create()`, `update()`, `delete()`)
- Utility functions are lowercase (e.g., `slugify()`, `formatCurrency()`, `buildRequest()`)
- Async functions use same naming convention as sync (async is transparent)

**Variables:**
- camelCase for all variables and local constants
- Constants declared at module level use SCREAMING_SNAKE_CASE only when environment-derived (e.g., `JWT_EXPIRATION = "7d"`)
- Private functions in classes: underscore prefix not used; use class encapsulation
- Singleton instances: lowercase (e.g., `usuarioService`, `prismaMock`)

**Types/Interfaces:**
- PascalCase for all type names (e.g., `CreateUsuarioDTO`, `UpdateProdutoDTO`, `AuthTokenPayload`)
- DTO suffix for data transfer objects (e.g., `CreateProdutoDTO`, `UpdateMovimentacaoDTO`)
- Interface names use `I` prefix ONLY if distinguishing from class implementation; otherwise omit (e.g., use `AuthTokenPayload` interface, not `IAuthTokenPayload`)
- Prisma-generated types used as-is from `@prisma/client` (e.g., `UserRole`, `Usuario`)

**Directories:**
- kebab-case for directory names (e.g., `app/api/`, `app/services/`, `app/_components/`)
- Underscore prefix for Next.js special directories (e.g., `_components/`, `_layout/`)
- One resource = one subdirectory (e.g., `app/api/produtos/`, `app/api/usuarios/`)

## Code Style

**Formatting:**
- ESLint v9 with Next.js core-web-vitals and TypeScript configs (`eslint-config-next`)
- Config file: `eslint.config.mjs` (flat config format)
- No Prettier config (uses ESLint only for formatting enforcement)
- Indentation: 2 spaces (default ESLint behavior)
- Semicolons: required (ESLint default)
- Trailing commas: always (for objects/arrays)
- Line length: not explicitly limited

**Linting:**
- Tool: ESLint v9 (flat config)
- Base configs: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Extends: Next.js recommended rules for web vitals, TypeScript, and React best practices
- Ignored: `.next/`, `out/`, `build/`, `coverage/`, `playwright-report/`, `test-results/`, `.env*`
- Run: `npm run lint`

## Import Organization

**Order:**
1. External third-party packages (`react`, `next`, `jose`, `bcryptjs`, etc.)
2. Prisma client and types (`@prisma/client`)
3. Internal absolute imports using `@/` alias (e.g., `@/lib/prisma`, `@/lib/jwt`)
4. Relative imports only if necessary (prefer `@/` for all internal code)

**Path Aliases:**
- `@/*` maps to root directory (configured in `tsconfig.json`)
- All internal imports use `@/` prefix (e.g., `@/lib/prisma`, `@/app/services/usuario.service`)
- Do not use relative paths like `../` for cross-directory imports; use `@/` instead

**Example:**
```typescript
import { SignJWT, jwtVerify } from "jose";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugify";
import bcrypt from "bcryptjs";
```

## Error Handling

**Custom Error Classes:**
- `HttpError`: Base error for HTTP responses (status + message)
  - Constructor: `new HttpError(message: string, status = 400)`
  - Location: `lib/http-error.ts`
- `AuthError`: Authentication/authorization failures (extends Error, adds status)
  - Constructor: `new AuthError(message: string, status = 401)`
  - Location: `lib/api-auth.ts`
- Both errors include a `status` property for HTTP status codes

**Error Handling Pattern in Services:**
- Catch specific Prisma errors (`Prisma.PrismaClientKnownRequestError`)
- Check `error.code` for specific constraint violations (e.g., `P2002` for unique constraint)
- Throw custom `HttpError` with appropriate message and HTTP status
- Re-throw unexpected errors (don't swallow them)

**Example:**
```typescript
try {
  return await prisma.usuario.create({ data });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target) ? error.meta.target as string[] : [];
    if (target.includes("email")) {
      throw new HttpError("Este email já está em uso.", 409);
    }
  }
  throw error;
}
```

**Error Handling in API Routes:**
- Use try-catch to wrap service calls
- Catch `AuthError` and `HttpError` separately to extract status codes
- Return JSON with message and appropriate status code
- Log unexpected errors to console with `console.error()`
- Return generic 500 error message to client for unexpected errors (don't leak details)

**Example:**
```typescript
try {
  const auth = await requireAuth(request);
  return NextResponse.json(data);
} catch (error) {
  if (error instanceof AuthError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ message: "Erro interno." }, { status: 500 });
}
```

## Logging

**Framework:** `console` (native browser/Node.js console)

**Patterns:**
- `console.error()` for exceptions and unexpected errors in API routes
- `console.warn()` not commonly used in codebase
- `console.log()` not used (no verbose logging in production code)
- No structured logging library (Pino, Winston, etc.) in use

**Example:**
```typescript
catch (error) {
  console.error(error);
  return NextResponse.json({ message: "Erro..." }, { status: 500 });
}
```

## Comments

**When to Comment:**
- Complex business logic that isn't obvious from code
- Non-obvious workarounds or constraints
- Explanations of Prisma mock patterns in tests
- References to GitHub issues or external requirements (rarely used)

**JSDoc/TSDoc:**
- Not consistently used throughout codebase
- Interfaces and DTOs have inline type descriptions via TypeScript types (preferred)
- Functions don't have JSDoc comments unless documenting complex behavior
- Example: `interface AuthTokenPayload { ... }` documents itself

**No JSDoc Example:**
```typescript
// Good: type is self-documenting
export interface CreateUsuarioDTO {
  nome: string;
  email: string;
  senha: string;
  empresaId: string;
}

// Avoid: over-commenting
/**
 * Create a new usuario
 * @param data The usuario data
 * @returns The created usuario
 */
async function create(data: CreateUsuarioDTO) { ... }
```

## Function Design

**Size:**
- Keep services methods focused (5-25 lines typically)
- Extract complex validation into separate functions
- Avoid deeply nested conditions; use early returns

**Parameters:**
- Use object parameters for DTOs (e.g., `CreateUsuarioDTO`)
- Use primitive parameters for IDs and simple lookups (e.g., `findById(id: string)`)
- Limit to 3-4 parameters; use object for more

**Return Values:**
- Service methods return the entity or throw (never null for success cases)
- Authentication functions return typed payload or throw `AuthError`
- Null returns only for "not found" queries (e.g., `findByEmail` returns `null | Usuario`)

**Async/Await:**
- Use async/await (not `.then()` chains)
- All database calls are async
- Await Prisma queries directly

**Example:**
```typescript
async list(empresaId: string) {
  return prisma.usuario.findMany({
    where: { empresaId },
    select: SAFE_SELECT,
    orderBy: { nome: "asc" },
  });
}
```

## Module Design

**Exports:**
- Default export: singleton service instances (e.g., `export const usuarioService = new UsuarioService()`)
- Named exports: classes, interfaces, types, utility functions
- Each service file exports its class + singleton instance

**Barrel Files:**
- Not used; import directly from module files
- Example: import `usuarioService` from `@/app/services/usuario.service`, not from `@/app/services/`

**Singleton Services:**
- Classes are instantiated once at module level
- Export as const (e.g., `export const produtoService = new ProdutoService()`)
- All API routes and other modules import the singleton and call its methods

**Example:**
```typescript
class UsuarioService {
  async list(empresaId: string) { ... }
  async create(data: CreateUsuarioDTO) { ... }
}

export const usuarioService = new UsuarioService();
```

**Private Helpers:**
- Utility functions used only within one module don't need export
- Keep them at the top or use function declarations for clarity

**Data Projections:**
- Use named constants for Prisma `select` projections (e.g., `SAFE_SELECT`, `PRODUTO_CATALOGO_SELECT`)
- Define at module level, export if reused across files
- Prevents leaking sensitive fields (e.g., `senhaHash`)

**Example:**
```typescript
const SAFE_SELECT = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  empresaId: true,
  createdAt: true,
  updatedAt: true,
} as const;
```

---

*Convention analysis: 2026-08-31*
