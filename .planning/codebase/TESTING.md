# Testing Patterns

**Analysis Date:** 2026-08-31

## Test Framework

**Runner:**
- Vitest v4.1.10
- Config: `vitest.config.mts`
- Environment: `jsdom` (default for React components); `node` for services/lib (opt-in per file)

**Assertion Library:**
- `@testing-library/jest-dom` matchers (e.g., `toBeInTheDocument()`, `toHaveValue()`)
- Vitest's `expect()` from `vitest` package (no separate assertion library)
- Testing Library utilities: `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`

**Mocking:**
- `vitest-mock-extended` for Prisma deep mocking
- `vi.mock()` for module-level mocking (import replacement)
- `vi.fn()` for function spies and mocks

**Run Commands:**
```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (TDD)
npm run test:ui       # Interactive UI dashboard
npm run test:coverage # Coverage report (text + html in /coverage)
npm run test:e2e      # Playwright end-to-end tests
npm run test:e2e:ui   # Interactive Playwright UI
```

## Test File Organization

**Location:**
- **Co-located pattern** (preferred): test files live next to source code
  - `app/services/usuario.service.ts` → `app/services/usuario.service.test.ts`
  - `lib/jwt.ts` → `lib/jwt.test.ts`
  - `app/_components/ModoInterfacePicker.tsx` → `app/_components/ModoInterfacePicker.test.tsx`
- **Shared test utilities** in `tests/helpers/` and `tests/setup/`

**Naming:**
- `.test.ts` suffix for Node.js environment (services, lib, utilities)
- `.test.tsx` suffix for React component tests
- API route tests: co-located with route.ts (e.g., `app/api/produtos/route.test.ts`)

**Structure:**
```
app/
├── services/
│   ├── usuario.service.ts
│   ├── usuario.service.test.ts
│   ├── produto.service.ts
│   └── produto.service.test.ts
├── _components/
│   ├── ModoInterfacePicker.tsx
│   └── ModoInterfacePicker.test.tsx
└── api/
    └── produtos/
        ├── route.ts
        └── route.test.ts

lib/
├── jwt.ts
├── jwt.test.ts
├── http-error.ts
└── http-error.test.ts

tests/
├── setup/
│   ├── vitest.setup.ts        # Runs before all tests
│   └── prisma-mock.ts         # Global Prisma mock
└── helpers/
    ├── request.ts             # buildRequest(), buildParams()
    ├── auth.ts                # buildAuthToken(), testAuthPayload
    └── fixtures.ts            # Shared test data factories
```

## Test Structure

**Suite Organization:**
```typescript
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../../tests/setup/prisma-mock";

// Mock modules BEFORE importing the code being tested
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

// Import after mocks are set up (uses top-level await)
const { usuarioService } = await import("./usuario.service");
const bcrypt = (await import("bcryptjs")).default;

// Setup for this test suite
beforeEach(() => {
  vi.mocked(bcrypt.hash).mockClear();
  vi.mocked(bcrypt.compare).mockClear();
});

describe("usuarioService.list", () => {
  it("lista usuários ordenados por nome", async () => {
    prismaMock.usuario.findMany.mockResolvedValue([...]);
    await usuarioService.list("empresa-1");
    expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(...);
  });
});
```

**Patterns:**
- Use `// @vitest-environment node` comment at top for non-DOM tests
- One describe block per function/method being tested
- One it() per behavior/scenario
- Use `beforeEach()` for test setup (mocks, fixtures)
- Use `afterEach()` cleanup (handled globally in `vitest.setup.ts`)

## Mocking

**Framework:** `vitest-mock-extended` for deep Prisma mocking; `vi.mock()` for modules

**Global Prisma Mock:**
`tests/setup/prisma-mock.ts` creates a deep mock of `PrismaClient` using `mockDeep()`:
```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: mockDeep<PrismaClient>(),
}));

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
```

**Module-level mocking (vi.mock):**
```typescript
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

// Import AFTER vi.mock, using top-level await
const bcrypt = (await import("bcryptjs")).default;
```

**Function spies:**
```typescript
const onChange = vi.fn();
render(<ModoInterfacePicker value="COMPLETO" onChange={onChange} />);
await user.click(screen.getByText("Simples"));
expect(onChange).toHaveBeenCalledWith("SIMPLES");
```

**Prisma mock usage in tests:**
```typescript
prismaMock.usuario.findMany.mockResolvedValue([
  { id: "1", nome: "User", email: "user@test.com", ... },
]);

await usuarioService.list("empresa-1");

expect(prismaMock.usuario.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { empresaId: "empresa-1" },
    orderBy: { nome: "asc" },
  })
);
```

**What to Mock:**
- External libraries: `bcryptjs`, `jose` (JWT), AWS SDK, etc.
- Prisma ORM (always mocked in unit tests — zero DB access)
- Exported services if testing API routes: mock the service module with `vi.mock()`

**What NOT to Mock:**
- Custom error classes (HttpError, AuthError) — test them directly
- Type definitions and interfaces — these don't need mocking
- Internal utilities (slugify, format, etc.) — test behavior directly
- Prisma types and generated types from schema — use real types

## Fixtures and Factories

**Test Data:**
```typescript
const usuarioBase = {
  id: "usuario-1",
  nome: "Usuário Teste",
  email: "usuario@teste.com",
  senhaHash: "hashed-password",
  role: "ADMIN",
  ativo: true,
  empresaId: "empresa-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  empresa: {
    id: "empresa-1",
    nome: "Loja Teste",
    slug: "loja-teste",
  },
};

// Use in tests
prismaMock.usuario.findUnique.mockResolvedValue(usuarioBase as never);
```

**Request Helpers:**
Location: `tests/helpers/request.ts`
```typescript
export function buildRequest(options: {
  method?: string;
  url?: string;
  token?: string;
  body?: unknown;
}): Request { ... }

export function buildParams<T extends Record<string, string>>(params: T): { params: Promise<T> } { ... }

// Usage
const token = await signAuthToken(payload);
const request = buildRequest({ method: "POST", token, body: { nome: "Test" } });
```

**Auth Helpers:**
Location: `tests/helpers/auth.ts`
```typescript
export const testAuthPayload: AuthTokenPayload = {
  sub: "user-1",
  empresaId: "empresa-1",
  empresaSlug: "empresa-teste",
  email: "admin@teste.com",
  role: "ADMIN",
};

export async function buildAuthToken(payload?: Partial<AuthTokenPayload>) {
  return signAuthToken({ ...testAuthPayload, ...payload });
}
```

**Location:**
- Shared fixtures: `tests/setup/` or `tests/helpers/`
- Per-test-file fixtures: defined at top of `.test.ts` file after imports
- Use `beforeEach()` to reset state if needed

## Coverage

**Requirements:** Not explicitly enforced (no coverage thresholds in config)

**Scope (from existing README):**
- **Backend**: all services (`app/services/*.ts`) and all API routes (`app/api/**/route.ts`)
- **Frontend**: components with logic (forms, wizards, cards); pure layout components omitted
- **E2E**: critical user flows (auth, CRUD, workflows)

**View Coverage:**
```bash
npm run test:coverage
# Outputs to stdout and generates HTML report in ./coverage/
```

**Coverage config:**
```typescript
// vitest.config.mts
coverage: {
  provider: "v8",
  reporter: ["text", "html"],
  include: ["app/**/*.{ts,tsx}", "lib/**/*.ts"],
  exclude: [
    "**/*.test.{ts,tsx}",
    "app/**/page.tsx",
    "app/**/layout.tsx",
    "**/node_modules/**",
  ],
}
```

## Test Types

**Unit Tests:**
- Scope: Single function/method in isolation
- Mocks: Database (Prisma), external services (bcrypt, JWT)
- Examples: `usuario.service.test.ts`, `jwt.test.ts`, `http-error.test.ts`
- Location: Co-located with source (`.test.ts`)

**Integration Tests:**
- Scope: Service + Prisma interactions (but Prisma still mocked)
- Mocks: Prisma (still), external services
- Examples: Error handling in services (Prisma constraint violations), end-to-end service flows
- Location: Co-located (`.test.ts`)

**Component Tests:**
- Scope: React component rendering and user interactions
- Mocks: Services (if called), but not DOM or React
- Tools: `@testing-library/react`, `userEvent`
- Examples: `ModoInterfacePicker.test.tsx`, form interactions
- Location: Co-located with component (`.test.tsx`)

**End-to-End (E2E) Tests:**
- Scope: Full user workflows through the app (no mocking)
- Framework: Playwright
- Database: Real (uses `DATABASE_URL` from `.env`)
- Examples: Login → create product → view in catalog, combo management, stock movements
- Location: `e2e/` directory
- Run: `npm run test:e2e`
- Config: `playwright.config.ts` (spins up dev server on port 3100)

## Common Patterns

**Async Testing:**
```typescript
it("handles async operations", async () => {
  prismaMock.usuario.findMany.mockResolvedValue([...]);
  
  const result = await usuarioService.list("empresa-1");
  
  expect(result).toHaveLength(1);
});

// Error case
it("throws when query fails", async () => {
  prismaMock.usuario.findMany.mockRejectedValue(new Error("DB Error"));
  
  await expect(usuarioService.list("empresa-1")).rejects.toThrow("DB Error");
});
```

**Error Testing:**
```typescript
it("throws HttpError with correct status", async () => {
  prismaMock.usuario.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: { target: ["email"] },
    })
  );

  await expect(
    usuarioService.create({ nome: "Test", email: "test@test.com", ... })
  ).rejects.toMatchObject({
    message: "Este email já está em uso.",
    status: 409,
  });
});
```

**React Component Testing:**
```typescript
it("calls onChange when user clicks option", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  render(<ModoInterfacePicker value="COMPLETO" onChange={onChange} />);
  
  await user.click(screen.getByText("Simples"));
  
  expect(onChange).toHaveBeenCalledWith("SIMPLES");
});
```

**Mocking Prisma Constraints:**
```typescript
it("handles unique constraint violation on email", async () => {
  prismaMock.usuario.findUnique.mockResolvedValue(null);
  prismaMock.usuario.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.9.1",
      meta: { target: ["email"] },
    })
  );

  await expect(usuarioService.create({ ... }))
    .rejects.toMatchObject({ status: 409 });
});
```

**Testing with Environment Variables:**
```typescript
// Set environment in beforeEach
beforeEach(() => {
  process.env.JWT_SECRET = "test-jwt-secret";
});

// Or use vi.stubEnv for temporary override
it("throws if JWT_SECRET not configured", async () => {
  vi.stubEnv("JWT_SECRET", "");
  await expect(signAuthToken(payload)).rejects.toThrow("JWT_SECRET não configurado.");
  vi.unstubAllEnvs();
});
```

**Playwright E2E Patterns:**
```typescript
// Handle form submission with redirect
const response = await page.goto("/register");
await page.fill('[name="email"]', "test@test.com");
await page.click('button[type="submit"]');
await expect(page).toHaveURL("/login");

// Handle confirm dialogs
page.once("dialog", (dialog) => dialog.accept());
await page.click("button.delete-btn");

// Wait for async operations
await page.waitForURL("**/catalog");
```

---

*Testing analysis: 2026-08-31*
