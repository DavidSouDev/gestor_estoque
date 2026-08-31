# Codebase Structure

**Analysis Date:** 2026-08-31

## Directory Layout

```
gestor_estoque/
├── app/                          # Next.js app directory (routes & components)
│   ├── api/                      # API routes (REST endpoints)
│   │   ├── auth/login/           # Authentication endpoints
│   │   ├── catalogo/             # Public catalog API
│   │   ├── combos/               # Combo CRUD endpoints
│   │   ├── empresas/             # Company CRUD endpoints
│   │   ├── movimentacoes/        # Inventory movement endpoints
│   │   ├── produtos/             # Product CRUD endpoints
│   │   ├── promocoes/            # Promotion CRUD endpoints
│   │   └── usuarios/             # User CRUD endpoints
│   ├── services/                 # Business logic services
│   │   ├── combo.service.ts
│   │   ├── combo.service.test.ts
│   │   ├── empresa.service.ts
│   │   ├── empresa.service.test.ts
│   │   ├── movimentacao-estoque.service.ts
│   │   ├── movimentacao-estoque.service.test.ts
│   │   ├── produto.service.ts
│   │   ├── produto.service.test.ts
│   │   ├── promocao.service.ts
│   │   ├── promocao.service.test.ts
│   │   ├── usuario.service.ts
│   │   └── usuario.service.test.ts
│   ├── _components/              # Global shared components
│   ├── [slug]/                   # Dynamic multi-tenant routes
│   │   ├── (catalogo)/           # Public catalog view (route group)
│   │   │   ├── page.tsx          # Catalog server page
│   │   │   ├── layout.tsx        # Catalog layout
│   │   │   └── _components/      # Catalog-specific components
│   │   ├── admin/                # Admin area
│   │   │   ├── login/            # Login page
│   │   │   │   └── page.tsx
│   │   │   ├── (protected)/      # Protected routes (route group)
│   │   │   │   ├── page.tsx      # Dashboard
│   │   │   │   ├── layout.tsx    # Protected layout with auth guard
│   │   │   │   ├── combos/       # Combo management
│   │   │   │   ├── produtos/     # Product management
│   │   │   │   ├── promocoes/    # Promotion management
│   │   │   │   ├── estoque/      # Inventory management
│   │   │   │   ├── marca/        # Branding management
│   │   │   │   ├── _lib/         # Protected area utilities
│   │   │   │   └── _components/  # Protected area components
│   │   │   ├── _lib/             # Admin area utilities
│   │   │   └── _components/      # Admin area components (login form, etc.)
│   │   └── _lib/                 # Tenant-specific utilities
│   ├── registro/                 # Registration/signup page
│   │   ├── page.tsx
│   │   ├── actions.ts            # Server action for registration
│   │   └── _components/          # Registration form component
│   ├── docs/                     # Documentation pages
│   ├── page.tsx                  # Root page (redirects to /registro)
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   └── favicon.ico
├── lib/                          # Shared utilities & cross-cutting concerns
│   ├── api-auth.ts               # API authentication guard
│   ├── api-auth.test.ts
│   ├── format.ts                 # Data formatting utilities
│   ├── format.test.ts
│   ├── http-error.ts             # Custom HTTP error class
│   ├── http-error.test.ts
│   ├── jwt.ts                    # JWT token signing/verification
│   ├── jwt.test.ts
│   ├── prisma.ts                 # Prisma client singleton
│   ├── serialize.ts              # Object serialization utilities
│   ├── serialize.test.ts
│   ├── session.ts                # Session management (cookies)
│   ├── session.test.ts
│   ├── slug.ts                   # URL slug parsing
│   ├── slug.test.ts
│   ├── slugify.ts                # String to URL slug conversion
│   ├── slugify.test.ts
│   ├── unique-suffix.ts          # Unique code generation with suffix
│   ├── unique-suffix.test.ts
│   └── storage/                  # File storage utilities (S3/R2)
├── prisma/                       # Database schema & migrations
│   ├── schema.prisma             # Database schema definition
│   └── migrations/               # Database migration history
│       ├── 20260806115042_init/
│       ├── 20260806115426_update_produto/
│       ├── 20260806120744_update_produto_preco/
│       ├── 20260806184810_update_schema/
│       ├── 20260825120000_usuario_empresa_unique/
│       ├── 20260828120439_add_categoria_e_branding/
│       └── 20260829135513_add_modo_interface_to_empresa/
├── tests/                        # Test setup & utilities
│   ├── setup/
│   │   ├── vitest.setup.ts       # Global test setup
│   │   └── prisma-mock.ts        # Prisma mock for unit tests
│   └── helpers/                  # Test helper functions
├── e2e/                          # End-to-end tests (Playwright)
├── public/                       # Static assets
├── .planning/                    # Codebase analysis documents
│   └── codebase/                 # Generated analysis
│       ├── STACK.md
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├── .claude/                      # Claude-specific configuration
│   └── skills/                   # Skill definitions for Claude
├── .agents/                      # Agent configuration
│   └── skills/                   # Agent skill definitions
├── .github/                      # GitHub Actions workflows
│   └── workflows/
├── postman/                      # Postman collections & documentation
│   ├── collections/
│   ├── environments/
│   ├── specs/
│   ├── flows/
│   ├── globals/
│   ├── mocks/
│   └── documents/
├── .windsurf/                    # Windsurf IDE configuration
│   └── skills/
├── next.config.ts                # Next.js configuration
├── tsconfig.json                 # TypeScript configuration
├── vitest.config.mts             # Vitest configuration
├── package.json                  # NPM dependencies & scripts
├── package-lock.json             # Locked dependency versions
├── CLAUDE.md                     # Project instructions for Claude
├── AGENTS.md                     # Agent-specific instructions
└── .gitignore                    # Git ignore rules
```

## Directory Purposes

**`app/`**
- Purpose: All Next.js routes, pages, and components
- Contains: App Router structure with dynamic routes, API handlers, server/client components
- Key files: `page.tsx` (pages), `route.ts` (API), `layout.tsx` (layouts), `actions.ts` (server actions)

**`app/api/`**
- Purpose: REST API endpoints
- Contains: HTTP route handlers for CRUD operations on all resources
- Organized by: Resource name (produtos, combos, usuarios, etc.)
- Pattern: Each resource has a `route.ts` for collection and `[id]/route.ts` for item

**`app/services/`**
- Purpose: Business logic and data access
- Contains: Service classes with CRUD and domain-specific methods
- Pattern: One service per domain entity, uses Prisma for database access
- Testing: Each service has a `.test.ts` file with unit tests

**`app/[slug]/`**
- Purpose: Multi-tenant routing (one subdirectory per company)
- Contains: Tenant-specific pages and components
- Dynamic param: `slug` is the company's unique slug identifier
- Child routes: `(catalogo)` for public catalog, `admin` for protected admin area

**`app/[slug]/(catalogo)/`**
- Purpose: Public product catalog view (not authenticated)
- Contains: Catalog page showing products and combos
- Components: Product cards, combo cards, category filters
- Data source: Products where `ativo=true` and `visivelCatalogo=true`

**`app/[slug]/admin/`**
- Purpose: Company admin interface
- Contains: Login page and protected admin routes
- Access: Login required via `admin/login`, redirects to dashboard
- Interface modes: SIMPLES (simplified) or COMPLETO (full featured)

**`app/[slug]/admin/(protected)/`**
- Purpose: Protected admin routes (require authentication)
- Contains: Dashboard, product management, combo management, promotions, inventory, branding
- Guard: Layout checks session and redirects to login if unauthenticated
- Sub-routes: `productos/`, `combos/`, `promocoes/`, `estoque/`, `marca/`

**`app/registro/`**
- Purpose: User registration and company signup
- Contains: Registration form page and server action
- Server action: Validates input, creates empresa + usuario, sets session cookie
- Redirect: Redirects to admin dashboard after successful registration

**`lib/`**
- Purpose: Shared utilities for all layers
- Contains: Authentication, JWT, session, formatting, validation, serialization
- Pattern: Pure functions and utility classes, no side effects (except prisma.ts)
- Testing: Each utility has corresponding `.test.ts` file

**`prisma/`**
- Purpose: Database schema and evolution
- Contains: Prisma schema defining all models, migrations history
- Schema file: `schema.prisma` - source of truth for database structure
- Migrations: One directory per migration, auto-generated by Prisma

**`tests/`**
- Purpose: Test setup and global test utilities
- Setup: `vitest.setup.ts` - runs before all tests, configures environment
- Mocks: `prisma-mock.ts` - Mock Prisma client for unit testing services
- Helpers: Shared test helper functions (not present yet)

**`e2e/`**
- Purpose: End-to-end tests using Playwright
- Contains: Full workflow tests (registration, login, product creation, etc.)
- Test files: Feature-based (e.g., `auth.spec.ts`, `products.spec.ts`)

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Root page (redirects to /registro)
- `app/layout.tsx`: Root HTML layout, global font setup
- `app/registro/page.tsx`: User registration page
- `app/[slug]/(catalogo)/page.tsx`: Public product catalog
- `app/[slug]/admin/(protected)/page.tsx`: Admin dashboard

**Configuration:**
- `next.config.ts`: Next.js config (server actions body size limit)
- `tsconfig.json`: TypeScript config with path alias `@/*` → root
- `vitest.config.mts`: Test runner config (jsdom environment, setup files)
- `prisma/schema.prisma`: Database schema and models

**Core Logic:**
- `app/services/`: All business logic (6 service classes)
- `lib/api-auth.ts`: Bearer token authentication for API
- `lib/jwt.ts`: JWT signing and verification
- `lib/session.ts`: HTTPOnly cookie session management
- `lib/prisma.ts`: Prisma client singleton

**Testing:**
- `tests/setup/vitest.setup.ts`: Global test configuration
- `tests/setup/prisma-mock.ts`: Mock Prisma for unit tests
- `app/services/*.test.ts`: Service unit tests
- `lib/*.test.ts`: Utility unit tests
- `app/**/*.test.tsx`: Component tests
- `e2e/`: End-to-end tests with Playwright

## Naming Conventions

**Files:**
- Services: `{entity}.service.ts` (e.g., `produto.service.ts`)
- Tests: `{file}.test.ts` or `{file}.test.tsx`
- Server actions: `actions.ts` (placed in route directory)
- Components: PascalCase (e.g., `ProductCard.tsx`, `CatalogoClient.tsx`)
- Utilities: camelCase (e.g., `slugify.ts`, `api-auth.ts`)

**Directories:**
- Route groups: `(name)` - e.g., `(catalogo)`, `(protected)` - don't appear in URL
- Dynamic routes: `[param]` - e.g., `[slug]`, `[id]`
- Private components: `_components/` - Next.js convention, not exposed
- Private utilities: `_lib/` - Next.js convention, route-local utilities

**Classes & Functions:**
- Services: PascalCase class, exported as camelCase instance (e.g., `class ProdutoService`, export `produtoService`)
- DTOs: PascalCase interfaces (e.g., `CreateProdutoDTO`)
- Database models: PascalCase (Prisma convention, auto-generated)
- Utilities: camelCase functions (e.g., `slugify()`, `requireAuth()`)

## Where to Add New Code

**New Feature (e.g., new resource type):**
- Data model: Add to `prisma/schema.prisma`
- Service: Create `app/services/{entity}.service.ts` with CRUD methods
- API: Create `app/api/{entity}/route.ts` and `app/api/{entity}/[id]/route.ts`
- Pages: Create `app/[slug]/admin/(protected)/{entity}/page.tsx` and actions
- Components: Create `app/[slug]/admin/(protected)/{entity}/_components/*.tsx`
- Tests: Create `.test.ts` files alongside implementation

**New Component/Module:**
- Implementation: `app/_components/` if global, or `app/[slug]/_components/` if tenant-specific
- Tests: Create `*.test.tsx` alongside component
- Styling: Use Tailwind CSS classes in component files (globals.css for global styles)

**Utilities:**
- Shared helpers: `lib/{name}.ts`
- Cross-cutting concerns: Extend existing files in `lib/` or create new utility
- Tests: Create `lib/{name}.test.ts` alongside utility
- Tenant-specific: `app/[slug]/_lib/{name}.ts`

**Server Actions:**
- Location: Create `actions.ts` file in the route directory where form is rendered
- Example: `app/registro/actions.ts` for registration form in `app/registro/page.tsx`
- Pattern: Export async function accepting FormData, returning state object

**Database:**
- Schema changes: Modify `prisma/schema.prisma`
- Migration: Run `npx prisma migrate dev --name descriptive_name`
- Migration files: Auto-generated in `prisma/migrations/`

## Special Directories

**`app/[slug]/_lib/`**
- Purpose: Tenant-specific utility functions
- Generated: No
- Committed: Yes
- Example: `getEmpresaCatalogo()` function that fetches company-specific data

**`.next/`**
- Purpose: Next.js build output and caching
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`node_modules/`**
- Purpose: Installed npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**`prisma/migrations/`**
- Purpose: Database migration history
- Generated: Semi (auto-created by Prisma, but contents are reviewed/committed)
- Committed: Yes - migrations are source-controlled

**`.planning/codebase/`**
- Purpose: Generated codebase analysis documents
- Generated: Yes (by GSD map-codebase)
- Committed: Yes - documentation is tracked

**`.claude/` and `.agents/`**
- Purpose: Agent skill definitions and Claude configuration
- Generated: No
- Committed: Yes - project-specific AI agent rules

---

*Structure analysis: 2026-08-31*
