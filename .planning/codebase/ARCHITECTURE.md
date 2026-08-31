<!-- refreshed: 2026-08-31 -->
# Architecture

**Analysis Date:** 2026-08-31

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    HTTP Clients (Browser / API)                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  API Routes      │ │  Server Pages    │ │  Server Actions  │
│  `app/api/*`     │ │  `app/**/page.tsx`│ │  `**/actions.ts` │
└──────────┬───────┘ └──────────┬───────┘ └──────────┬───────┘
           │                    │                    │
           └────────────────────┼────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Authentication & Authorization Layer            │
│                  `lib/api-auth.ts`, `lib/jwt.ts`                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Service Layer                                │
│  `app/services/*.service.ts`                                        │
│  - produtoService                                                   │
│  - comboService                                                     │
│  - empresaService                                                   │
│  - promocaoService                                                  │
│  - usuarioService                                                   │
│  - movimentacaoEstoqueService                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Data Access Layer (Prisma ORM)                   │
│                     `lib/prisma.ts`                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                            │
│                   `prisma/schema.prisma`                            │
└─────────────────────────────────────────────────────────────────────┘
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

**Overall:** Multi-tenant SaaS platform using Next.js App Router with service-oriented architecture.

**Key Characteristics:**
- **Multi-tenancy:** Each company (empresa) is an isolated tenant with its own data
- **API-first backend:** REST API via Next.js route handlers (`app/api/**`)
- **Full-stack components:** Server components for data fetching, client components for interactivity
- **Service layer:** Centralized business logic via service classes
- **Type-safe:** Full TypeScript throughout, Prisma types auto-generated
- **JWT-based auth:** Bearer token authentication for API, cookies for web sessions

## Layers

**API Layer:**
- Purpose: Handle HTTP requests and return JSON responses
- Location: `app/api/**/*.ts`
- Contains: Route handlers (GET, POST, PATCH, DELETE)
- Depends on: Services, authentication utilities
- Used by: External clients, frontend API calls

**Page/Component Layer:**
- Purpose: Server-side rendering and client-side rendering
- Location: `app/**/page.tsx` (server), `_components/*.tsx` (client)
- Contains: React components, server data fetching
- Depends on: Services, server actions, utilities
- Used by: Browser via Next.js routing

**Service Layer:**
- Purpose: Encapsulate business logic and data operations
- Location: `app/services/*.service.ts`
- Contains: Domain-specific methods (CRUD, business operations)
- Depends on: Prisma client, utilities
- Used by: API routes, server pages, server actions

**Data Access Layer:**
- Purpose: Abstract database interactions
- Location: Prisma ORM (`lib/prisma.ts`)
- Contains: Database schema, migrations
- Depends on: PostgreSQL driver
- Used by: All services

**Cross-Cutting Concerns:**
- Purpose: Shared utilities for authentication, formatting, validation
- Location: `lib/*.ts`
- Contains: JWT handling, session management, slug generation, formatting
- Depends on: jose, bcryptjs, other utilities
- Used by: All layers

## Data Flow

### Primary Request Path (API)

1. Client sends HTTP request with Bearer token (`app/api/produtos/route.ts:5`)
2. `requireAuth()` verifies JWT token and extracts payload (`lib/api-auth.ts:12`)
3. API route calls service method with authenticated user's `empresaId` (`app/api/produtos/route.ts:9`)
4. Service queries database via Prisma with company isolation filter (`app/services/produto.service.ts:87`)
5. Prisma executes query on PostgreSQL
6. Service returns result to API route
7. API route serializes response and returns JSON (`app/api/produtos/route.ts:11`)

### Server Component Path

1. User navigates to `/{slug}` route
2. Server component async function executes (`app/[slug]/(catalogo)/page.tsx:4`)
3. Component calls `getEmpresaCatalogo(slug)` which queries database (`app/[slug]/_lib/empresa.ts:5`)
4. Prisma returns empresa data with related products and combos
5. Server component transforms/processes data (price calculations, sorting) (`app/[slug]/(catalogo)/page.tsx:14-42`)
6. Server component passes props to client component for rendering
7. Client component renders interactive UI

### Form Submission Path

1. Client submits form to server action
2. Server action function executes with FormData (`app/registro/actions.ts:15`)
3. Server action validates input
4. Server action calls service to perform business operation (`app/registro/actions.ts:53`)
5. Service creates database records via Prisma
6. Server action creates session cookie via `createAdminSession()` (`app/registro/actions.ts:61`)
7. Server action redirects client to new page

**State Management:**
- Request-based: Each request is independent, no global state
- Session state: Stored in cookies (server-side session) or JWT tokens (API)
- Database state: Single source of truth in PostgreSQL
- Component state: Local React state in client components
- No centralized state management (Redux, Zustand, etc.)

## Key Abstractions

**Service Classes:**
- Purpose: Encapsulate domain logic and database operations
- Examples: `app/services/produto.service.ts`, `app/services/empresa.service.ts`
- Pattern: Class with static singleton instance; methods are async and delegate to Prisma

**DTO (Data Transfer Object) Interfaces:**
- Purpose: Type-safe parameters for service methods
- Examples: `CreateProdutoDTO`, `UpdateProdutoDTO` in `app/services/produto.service.ts`
- Pattern: Interface defining input/output shape separate from database model

**Query Result Selectors:**
- Purpose: Specify which fields to fetch from database (performance optimization)
- Examples: `PRODUTO_CATALOGO_SELECT` in `app/services/produto.service.ts:50`
- Pattern: Const object with field selectors reused across queries

**Server Functions:**
- Purpose: Abstract data fetching with caching
- Examples: `getEmpresaCatalogo()` in `app/[slug]/_lib/empresa.ts`
- Pattern: React `cache()` wrapper around service calls for request-level deduplication

**Authorization Guards:**
- Purpose: Verify user has access to resource
- Examples: Checks in API routes like `if (!existente || existente.empresaId !== auth.empresaId)`
- Pattern: Company-level isolation (empresaId matching)

## Entry Points

**Home Page:**
- Location: `app/page.tsx`
- Triggers: Direct navigation to `/`
- Responsibilities: Redirects to `/registro` (registration page)

**Registration Page:**
- Location: `app/registro/page.tsx`
- Triggers: New user signup
- Responsibilities: Render registration form, call `register()` server action

**Catalog Page (Public):**
- Location: `app/[slug]/(catalogo)/page.tsx`
- Triggers: Navigate to `/{company-slug}`
- Responsibilities: Fetch and display public product catalog

**Admin Dashboard (Protected):**
- Location: `app/[slug]/admin/(protected)/page.tsx`
- Triggers: Navigate to `/{company-slug}/admin` with valid session
- Responsibilities: Display admin interface (interface mode switches between SIMPLES and COMPLETO)

**Admin Login:**
- Location: `app/[slug]/admin/login/page.tsx`
- Triggers: Unauthenticated user tries to access protected routes
- Responsibilities: Render login form, call login server action

**API Endpoints:**
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

**What happens:** Each API route manually validates input (checking for null, type checking). Server actions do inline validation.
**Why it's wrong:** Validation logic duplicated across handlers. No centralized validation rules. Error messages inconsistent.
**Do this instead:** Create a validation middleware/wrapper that handles common checks before reaching handlers. Use a schema validation library (zod, joi) in `lib/validation/`.

### Missing Error Handling Strategy

**What happens:** Errors are caught with try/catch, logged to console, and a generic error message returned.
**Why it's wrong:** Errors don't distinguish between validation errors, auth errors, not found, etc. Stack traces logged to console (security issue in production).
**Do this instead:** Create centralized error handler in `lib/error-handler.ts` that:
  - Categorizes errors by type
  - Returns appropriate HTTP status codes
  - Logs securely without exposing internals
  - Provides consistent error response shape

### Direct Prisma Calls in Routes

**What happens:** Some routes call Prisma directly instead of services (e.g., authorization checks).
**Why it's wrong:** Business logic leaks into HTTP layer. Hard to test authorization logic. Duplicated query patterns.
**Do this instead:** Move all database queries into services. Create authorization service methods like `canAccessProduct(userId, productId)`.

## Error Handling

**Strategy:** Try-catch at handler level with centralized error logging.

**Patterns:**
- API routes catch errors and return JSON error responses
- Server actions catch errors and return error state to form
- Unhandled errors logged to console (should be replaced with proper logging service)
- Generic error messages returned to client (specifics logged server-side)
- Custom `AuthError` class for authentication failures
- Custom `HttpError` class for business logic errors

## Cross-Cutting Concerns

**Logging:** Console.error() for unexpected errors. No structured logging or log levels. Should implement proper logging service.

**Validation:** Inline in handlers and server actions. No centralized validation. Email regex in `app/registro/actions.ts:13`. Password length validation hardcoded.

**Authentication:** JWT-based for API (`lib/jwt.ts`). HTTPOnly cookies for web sessions (`lib/session.ts`). Bearer token extraction in `lib/api-auth.ts`.

---

*Architecture analysis: 2026-08-31*
