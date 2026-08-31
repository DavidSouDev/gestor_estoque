# External Integrations

**Analysis Date:** 2026-08-31

## APIs & External Services

**File Storage:**
- Cloudflare R2 - Image hosting and file storage
  - SDK/Client: @aws-sdk/client-s3 (S3-compatible API)
  - Auth: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY environment variables
  - Implementation: `lib/storage/r2.ts`

## Data Storage

**Databases:**
- PostgreSQL (production database)
  - Connection: DATABASE_URL environment variable
  - Client: @prisma/client with @prisma/adapter-pg
  - Schema: `prisma/schema.prisma`
  - Models: Empresa, Usuario, Produto, ProdutoImagem, Combo, ComboItem, Promocao, PromocaoItem, MovimentacaoEstoque

**File Storage:**
- Cloudflare R2 (AWS S3-compatible object storage)
  - Configured via `lib/storage/r2.ts`
  - Upload function: `uploadImage(file: File, folder: string)`
  - Delete function: `deleteImage(url: string)`
  - Allowed types: JPEG, PNG, WebP
  - Max size: 4MB per image
  - Public URL base: R2_PUBLIC_URL environment variable

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom implementation using JWT tokens

**Implementation Details:**
- **JWT Library:** jose 6.2.10
- **Password Hashing:** bcryptjs 3.0.3
- **Token Generation:** `lib/jwt.ts` - `signAuthToken(payload: AuthTokenPayload)`
  - Algorithm: HS256
  - Expiration: 7 days
  - Payload includes: sub (user ID), empresaId, empresaSlug, email, role
- **Token Verification:** `lib/jwt.ts` - `verifyAuthToken(token: string)`
- **Password Validation:** `app/services/usuario.service.ts` - `validatePassword(email: string, senha: string)`
- **Login Endpoint:** `app/api/auth/login/route.ts` (POST /api/auth/login)
- **Session Management:** `lib/session.ts` - Cookie-based JWT session handling

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, or similar)

**Logs:**
- console.error/console.log for standard logging
- No dedicated logging service

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase (deployment target unknown)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/tests.yml`)
- Runs on: ubuntu-latest
- Node.js v22
- Triggers: push to main branch, pull requests
- Jobs:
  1. **Unit Tests:** npm run test:coverage (Vitest)
  2. **E2E Tests:** npm run test:e2e (Playwright with PostgreSQL service)
  3. **Linting:** npm run lint (ESLint)
  4. **Artifacts:** Coverage reports and Playwright reports uploaded

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string (format: postgresql://user:pass@host:port/database)
- `JWT_SECRET` - Secret key for signing JWT tokens (minimum complexity required)
- `R2_ACCOUNT_ID` - Cloudflare R2 account ID
- `R2_ACCESS_KEY_ID` - R2 API access key
- `R2_SECRET_ACCESS_KEY` - R2 API secret key
- `R2_BUCKET` - R2 bucket name for image storage
- `R2_PUBLIC_URL` - Public base URL for accessing R2 files (e.g., https://domain.com)

**Optional env vars:**
- `PLAYWRIGHT_PORT` - Port for E2E tests (defaults to 3100)

**Secrets location:**
- GitHub Secrets (for CI/CD): JWT_SECRET
- Local `.env` file (development only)
- Production: Environment-specific secret management system

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

---

*Integration audit: 2026-08-31*
