@AGENTS.md

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Gestor de Estoque — Controle de Pagamento e Assinatura**

Um gestor de estoque e catálogo multi-tenant (SaaS): cada empresa (tenant) cadastra seus produtos, gerencia estoque e expõe um catálogo público (`/{slug}`) para seus clientes. Esta fase do projeto adiciona controle de pagamento/assinatura: empresas pagam para continuar usando o painel admin e ter o catálogo publicado, com um gateway de pagamento externo cuidando da cobrança recorrente.

**Core Value:** Uma empresa que não paga (após o prazo de carência) perde acesso ao admin e tem o catálogo despublicado — sem exceções e sem que dados de pagamento fiquem armazenados no nosso sistema.

### Constraints

- **Segurança/PCI**: não armazenar dados de pagamento (cartão, etc.) no banco próprio — gateway externo deve cuidar disso — pedido explícito do usuário
- **Compatibilidade**: mudanças de auth/bloqueio devem respeitar o isolamento multi-tenant existente (`empresaId`) e não quebrar o catálogo público para empresas em dia
- **Escopo do worker**: a lógica de avaliação diária de status precisa rodar de forma confiável mesmo sem hosting definido ainda — decisão de plataforma de cron é um bloqueador de pesquisa
- **Modelo de dados**: status de pagamento é por Empresa; aceite de termos é por Usuario — não confundir os dois escopos

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5 - Full codebase (frontend and backend)
- JavaScript (ES2017 target) - Compiled from TypeScript
- JSX/TSX - React component syntax

## Runtime

- Node.js v22 (specified in `.github/workflows/tests.yml`)
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

- Next.js 16.3.0 - Full-stack web framework with API routes and Server Components
- React 19.2.8 - UI library with React DOM 19.2.8
- Vitest 4.1.10 - Unit and component test runner (`vitest.config.mts`)
- Playwright 1.62.1 - E2E testing framework (`playwright.config.ts`)
- @testing-library/react 16.3.3 - React component testing utilities
- @testing-library/dom 10.4.1 - DOM testing library
- jsdom 29.1.1 - DOM implementation for Node.js tests
- TypeScript 5 - Compilation and type checking
- Tailwind CSS 4 - Utility-first CSS framework (`postcss.config.mjs`)
- PostCSS with @tailwindcss/postcss 4 - CSS transformation pipeline
- ESLint 9 - JavaScript/TypeScript linting (`eslint.config.mjs`)
- Vite (via @vitejs/plugin-react 6.1.1) - Build tooling support

## Key Dependencies

- @prisma/client 7.9.1 - Database ORM for PostgreSQL
- @prisma/adapter-pg 7.9.1 - PostgreSQL adapter for Prisma
- pg 8.22.0 - PostgreSQL driver
- jose 6.2.10 - JWT generation and verification (authentication)
- bcryptjs 3.0.3 - Password hashing
- @aws-sdk/client-s3 3.1121.0 - AWS S3 SDK (used for Cloudflare R2 compatibility)
- vite-tsconfig-paths 6.1.1 - TypeScript path alias resolution in Vitest
- @vitejs/plugin-react 6.1.1 - React plugin for Vite
- vitest-mock-extended 5.1.1 - Extended mocking utilities for Vitest
- @vitest/ui 4.1.10 - UI for Vitest test results
- @vitest/coverage-v8 4.1.10 - V8 coverage provider for Vitest

## Configuration

- `.env` file required with environment variables (`.env` present but not readable per policy)
- Next.js experimental config in `next.config.ts`:
- TypeScript config in `tsconfig.json`:
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript compiler options
- `vitest.config.mts` - Vitest testing configuration
- `playwright.config.ts` - Playwright E2E testing configuration
- `postcss.config.mjs` - PostCSS configuration for Tailwind
- `eslint.config.mjs` - ESLint configuration with Next.js and TypeScript presets

## Platform Requirements

- Node.js v22
- npm for dependency management
- PostgreSQL database for local development
- Node.js v22
- PostgreSQL database (via Prisma with @prisma/adapter-pg)
- Environment variables: DATABASE_URL, JWT_SECRET, R2_* credentials
- Server-side execution for API routes and Server Actions
- Unit/component tests run via Vitest with jsdom environment
- E2E tests run via Playwright (Chromium browser)
- CI environment: GitHub Actions on ubuntu-latest

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Services: `[entity].service.ts` (e.g., `usuario.service.ts`, `produto.service.ts`)
- Service tests: `[entity].service.test.ts` (co-located with service)
- API routes: `route.ts` in nested directories per resource (e.g., `app/api/produtos/route.ts`)
- Utilities: `[utility-name].ts` (e.g., `slugify.ts`, `format.ts`, `jwt.ts`)
- Components: PascalCase with `.tsx` extension (e.g., `ModoInterfacePicker.tsx`)
- Component tests: `[Component].test.tsx` (co-located with component)
- camelCase for all function names
- Service methods: verb + noun pattern (e.g., `list()`, `findById()`, `create()`, `update()`, `delete()`)
- Utility functions are lowercase (e.g., `slugify()`, `formatCurrency()`, `buildRequest()`)
- Async functions use same naming convention as sync (async is transparent)
- camelCase for all variables and local constants
- Constants declared at module level use SCREAMING_SNAKE_CASE only when environment-derived (e.g., `JWT_EXPIRATION = "7d"`)
- Private functions in classes: underscore prefix not used; use class encapsulation
- Singleton instances: lowercase (e.g., `usuarioService`, `prismaMock`)
- PascalCase for all type names (e.g., `CreateUsuarioDTO`, `UpdateProdutoDTO`, `AuthTokenPayload`)
- DTO suffix for data transfer objects (e.g., `CreateProdutoDTO`, `UpdateMovimentacaoDTO`)
- Interface names use `I` prefix ONLY if distinguishing from class implementation; otherwise omit (e.g., use `AuthTokenPayload` interface, not `IAuthTokenPayload`)
- Prisma-generated types used as-is from `@prisma/client` (e.g., `UserRole`, `Usuario`)
- kebab-case for directory names (e.g., `app/api/`, `app/services/`, `app/_components/`)
- Underscore prefix for Next.js special directories (e.g., `_components/`, `_layout/`)
- One resource = one subdirectory (e.g., `app/api/produtos/`, `app/api/usuarios/`)

## Code Style

- ESLint v9 with Next.js core-web-vitals and TypeScript configs (`eslint-config-next`)
- Config file: `eslint.config.mjs` (flat config format)
- No Prettier config (uses ESLint only for formatting enforcement)
- Indentation: 2 spaces (default ESLint behavior)
- Semicolons: required (ESLint default)
- Trailing commas: always (for objects/arrays)
- Line length: not explicitly limited
- Tool: ESLint v9 (flat config)
- Base configs: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Extends: Next.js recommended rules for web vitals, TypeScript, and React best practices
- Ignored: `.next/`, `out/`, `build/`, `coverage/`, `playwright-report/`, `test-results/`, `.env*`
- Run: `npm run lint`

## Import Organization

- `@/*` maps to root directory (configured in `tsconfig.json`)
- All internal imports use `@/` prefix (e.g., `@/lib/prisma`, `@/app/services/usuario.service`)
- Do not use relative paths like `../` for cross-directory imports; use `@/` instead

## Error Handling

- `HttpError`: Base error for HTTP responses (status + message)
- `AuthError`: Authentication/authorization failures (extends Error, adds status)
- Both errors include a `status` property for HTTP status codes
- Catch specific Prisma errors (`Prisma.PrismaClientKnownRequestError`)
- Check `error.code` for specific constraint violations (e.g., `P2002` for unique constraint)
- Throw custom `HttpError` with appropriate message and HTTP status
- Re-throw unexpected errors (don't swallow them)
- Use try-catch to wrap service calls
- Catch `AuthError` and `HttpError` separately to extract status codes
- Return JSON with message and appropriate status code
- Log unexpected errors to console with `console.error()`
- Return generic 500 error message to client for unexpected errors (don't leak details)

## Logging

- `console.error()` for exceptions and unexpected errors in API routes
- `console.warn()` not commonly used in codebase
- `console.log()` not used (no verbose logging in production code)
- No structured logging library (Pino, Winston, etc.) in use

## Comments

- Complex business logic that isn't obvious from code
- Non-obvious workarounds or constraints
- Explanations of Prisma mock patterns in tests
- References to GitHub issues or external requirements (rarely used)
- Not consistently used throughout codebase
- Interfaces and DTOs have inline type descriptions via TypeScript types (preferred)
- Functions don't have JSDoc comments unless documenting complex behavior
- Example: `interface AuthTokenPayload { ... }` documents itself

## Function Design

- Keep services methods focused (5-25 lines typically)
- Extract complex validation into separate functions
- Avoid deeply nested conditions; use early returns
- Use object parameters for DTOs (e.g., `CreateUsuarioDTO`)
- Use primitive parameters for IDs and simple lookups (e.g., `findById(id: string)`)
- Limit to 3-4 parameters; use object for more
- Service methods return the entity or throw (never null for success cases)
- Authentication functions return typed payload or throw `AuthError`
- Null returns only for "not found" queries (e.g., `findByEmail` returns `null | Usuario`)
- Use async/await (not `.then()` chains)
- All database calls are async
- Await Prisma queries directly

## Module Design

- Default export: singleton service instances (e.g., `export const usuarioService = new UsuarioService()`)
- Named exports: classes, interfaces, types, utility functions
- Each service file exports its class + singleton instance
- Not used; import directly from module files
- Example: import `usuarioService` from `@/app/services/usuario.service`, not from `@/app/services/`
- Classes are instantiated once at module level
- Export as const (e.g., `export const produtoService = new ProdutoService()`)
- All API routes and other modules import the singleton and call its methods
- Utility functions used only within one module don't need export
- Keep them at the top or use function declarations for clarity
- Use named constants for Prisma `select` projections (e.g., `SAFE_SELECT`, `PRODUTO_CATALOGO_SELECT`)
- Define at module level, export if reused across files
- Prevents leaking sensitive fields (e.g., `senhaHash`)

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| API Routes | REST endpoint handlers, request validation, response serialization | `app/api/**/*.ts` |
| Server Pages | Server-side data fetching, React component rendering | `app/**/page.tsx` |
| Server Actions | Form handling, mutations, server-side form validation | `app/**/actions.ts` |
| Services | Business logic, data transformation, domain operations | `app/services/*.service.ts` |
| Prisma Client | Database queries, ORM abstraction | Singleton via `lib/prisma.ts` |
| Authentication | JWT validation, session management, authorization checks | `lib/api-auth.ts`, `lib/jwt.ts`, `lib/session.ts` |
| Utilities | Cross-cutting concerns (formatting, slugifying, serialization) | `lib/*.ts` |
| Middleware | (Not present - auth via function calls in routes) | - |

## Pattern Overview

- **Multi-tenancy:** Each company (empresa) is an isolated tenant with its own data
- **API-first backend:** REST API via Next.js route handlers (`app/api/**`)
- **Full-stack components:** Server components for data fetching, client components for interactivity
- **Service layer:** Centralized business logic via service classes
- **Type-safe:** Full TypeScript throughout, Prisma types auto-generated
- **JWT-based auth:** Bearer token authentication for API, cookies for web sessions

## Layers

- Purpose: Handle HTTP requests and return JSON responses
- Location: `app/api/**/*.ts`
- Contains: Route handlers (GET, POST, PATCH, DELETE)
- Depends on: Services, authentication utilities
- Used by: External clients, frontend API calls
- Purpose: Server-side rendering and client-side rendering
- Location: `app/**/page.tsx` (server), `_components/*.tsx` (client)
- Contains: React components, server data fetching
- Depends on: Services, server actions, utilities
- Used by: Browser via Next.js routing
- Purpose: Encapsulate business logic and data operations
- Location: `app/services/*.service.ts`
- Contains: Domain-specific methods (CRUD, business operations)
- Depends on: Prisma client, utilities
- Used by: API routes, server pages, server actions
- Purpose: Abstract database interactions
- Location: Prisma ORM (`lib/prisma.ts`)
- Contains: Database schema, migrations
- Depends on: PostgreSQL driver
- Used by: All services
- Purpose: Shared utilities for authentication, formatting, validation
- Location: `lib/*.ts`
- Contains: JWT handling, session management, slug generation, formatting
- Depends on: jose, bcryptjs, other utilities
- Used by: All layers

## Data Flow

### Primary Request Path (API)

### Server Component Path

### Form Submission Path

- Request-based: Each request is independent, no global state
- Session state: Stored in cookies (server-side session) or JWT tokens (API)
- Database state: Single source of truth in PostgreSQL
- Component state: Local React state in client components
- No centralized state management (Redux, Zustand, etc.)

## Key Abstractions

- Purpose: Encapsulate domain logic and database operations
- Examples: `app/services/produto.service.ts`, `app/services/empresa.service.ts`
- Pattern: Class with static singleton instance; methods are async and delegate to Prisma
- Purpose: Type-safe parameters for service methods
- Examples: `CreateProdutoDTO`, `UpdateProdutoDTO` in `app/services/produto.service.ts`
- Pattern: Interface defining input/output shape separate from database model
- Purpose: Specify which fields to fetch from database (performance optimization)
- Examples: `PRODUTO_CATALOGO_SELECT` in `app/services/produto.service.ts:50`
- Pattern: Const object with field selectors reused across queries
- Purpose: Abstract data fetching with caching
- Examples: `getEmpresaCatalogo()` in `app/[slug]/_lib/empresa.ts`
- Pattern: React `cache()` wrapper around service calls for request-level deduplication
- Purpose: Verify user has access to resource
- Examples: Checks in API routes like `if (!existente || existente.empresaId !== auth.empresaId)`
- Pattern: Company-level isolation (empresaId matching)

## Entry Points

- Location: `app/page.tsx`
- Triggers: Direct navigation to `/`
- Responsibilities: Redirects to `/registro` (registration page)
- Location: `app/registro/page.tsx`
- Triggers: New user signup
- Responsibilities: Render registration form, call `register()` server action
- Location: `app/[slug]/(catalogo)/page.tsx`
- Triggers: Navigate to `/{company-slug}`
- Responsibilities: Fetch and display public product catalog
- Location: `app/[slug]/admin/(protected)/page.tsx`
- Triggers: Navigate to `/{company-slug}/admin` with valid session
- Responsibilities: Display admin interface (interface mode switches between SIMPLES and COMPLETO)
- Location: `app/[slug]/admin/login/page.tsx`
- Triggers: Unauthenticated user tries to access protected routes
- Responsibilities: Render login form, call login server action
- Auth: `POST /api/auth/login` - Authenticate user, return JWT
- Produtos: `GET|POST /api/produtos`, `GET|PATCH|DELETE /api/produtos/[id]`
- Combos: `GET|POST /api/combos`, `GET|PATCH|DELETE /api/combos/[id]`
- Promocoes: `GET|POST /api/promocoes`, `GET|PATCH|DELETE /api/promocoes/[id]`
- Usuarios: `GET|POST /api/usuarios`, `GET|PATCH|DELETE /api/usuarios/[id]`
- Empresas: `GET|POST /api/empresas`, `GET|PATCH|DELETE /api/empresas/[id]`
- Movimentacoes: `GET|POST /api/movimentacoes`, `GET|PATCH|DELETE /api/movimentacoes/[id]`
- Catalogo: `GET /api/catalogo/produtos`, `GET /api/catalogo/combos`

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js). Long-running operations should use background jobs (not implemented).
- **Global state:** Prisma client singleton in `lib/prisma.ts`. Connection pooling via PostgreSQL adapter.
- **Circular imports:** None detected. Services → Prisma (one direction). Pages → Services (one direction).
- **Multi-tenancy enforcement:** All services filter by `empresaId`. API routes verify ownership before mutations.
- **Session model:** JWT for API + HTTPOnly cookies for web sessions. No shared session store.
- **Type safety:** Strict TypeScript. Prisma auto-generates types from schema.

## Anti-Patterns

### Lack of Input Validation Middleware

### Missing Error Handling Strategy

### Direct Prisma Calls in Routes

## Error Handling

- API routes catch errors and return JSON error responses
- Server actions catch errors and return error state to form
- Unhandled errors logged to console (should be replaced with proper logging service)
- Generic error messages returned to client (specifics logged server-side)
- Custom `AuthError` class for authentication failures
- Custom `HttpError` class for business logic errors

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| prisma-cli | Prisma ORM CLI commands reference covering init, generate, migrate, db, dev, complete, studio, validate, format, debug, and mcp. Use for ORM/database CLI workflows, not the Prisma Platform CLI. Triggers on "prisma init", "prisma generate", "prisma migrate", "prisma db", "prisma complete", "prisma studio", "prisma mcp". | `.agents/skills/prisma-cli/SKILL.md` |
| prisma-client-api | Prisma Client API reference covering model queries, filters, operators, and client methods. Use when writing database queries, using CRUD operations, filtering data, or configuring Prisma Client. Triggers on "prisma query", "findMany", "create", "update", "delete", "$transaction". | `.agents/skills/prisma-client-api/SKILL.md` |
| prisma-compute | Prisma Compute deployment and hosting guide. Use whenever the user mentions Prisma Compute, `prisma.compute.ts`, `defineComputeConfig`, deploying or hosting a Prisma app, `@prisma/cli app deploy`, `compute:deploy`, `create-prisma --deploy`, `PRISMA_SERVICE_TOKEN`, Compute auth/workspaces, apps/deployments/build logs/domains, localhost vs `0.0.0.0`, deploy port binding, or framework deploy readiness for Hono, Elysia, Next.js, TanStack Start, Astro, Nuxt, Svelte, Nest, Turborepo, or custom/prebuilt artifacts. | `.agents/skills/prisma-compute/SKILL.md` |
| prisma-database-setup | Guides for configuring Prisma with different database providers (PostgreSQL, MySQL, SQLite, MongoDB, etc.). Use when setting up a new project, changing databases, or troubleshooting connection issues. Triggers on "configure postgres", "connect to mysql", "setup mongodb", "sqlite setup". | `.agents/skills/prisma-database-setup/SKILL.md` |
| prisma-driver-adapter-implementation | Required reference for Prisma ORM 7 SQL driver adapter work. Use when implementing or modifying adapters, adding database drivers, or touching SqlDriverAdapter, Transaction, savepoint, result mapping, or DriverAdapterError behavior. Covers current transaction lifecycle, optional savepoint hooks, original database-error preservation, and verification. | `.agents/skills/prisma-driver-adapter-implementation/SKILL.md` |
| prisma-mongodb-upgrade | Decision and migration guide for Prisma ORM MongoDB projects on v6, which have no upgrade path to v7. Use when a MongoDB project asks about upgrading Prisma, when "upgrade to prisma 7" comes up in a project with provider = "mongodb", or when evaluating a move to Prisma Next. Triggers on "upgrade prisma mongodb", "prisma 7 mongodb", "mongodb prisma migration", "prisma next mongodb". | `.agents/skills/prisma-mongodb-upgrade/SKILL.md` |
| prisma-postgres | Prisma Postgres setup and operations guidance across Console, create-db CLI, Management API, and Management API SDK. Use when creating Prisma Postgres databases, working in Prisma Console, provisioning with create-db/create-pg/create-postgres, or integrating programmatic provisioning with service tokens or OAuth. | `.agents/skills/prisma-postgres/SKILL.md` |
| prisma-postgres-setup | Set up a new Prisma Postgres database and connect it to a local project using the Management API. Use when asked to "set up a database", "create a Prisma Postgres project", "get a connection string", "connect my app to Prisma Postgres", or "provision a database". | `.agents/skills/prisma-postgres-setup/SKILL.md` |
| prisma-upgrade-v7 | Complete migration guide from Prisma ORM v6 to v7 covering all breaking changes. Use when upgrading Prisma versions, encountering v7 errors, or migrating existing projects. Triggers on "upgrade to prisma 7", "prisma 7 migration", "prisma-client generator", "driver adapter required". | `.agents/skills/prisma-upgrade-v7/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
