# Technology Stack

**Analysis Date:** 2026-08-31

## Languages

**Primary:**
- TypeScript 5 - Full codebase (frontend and backend)

**Secondary:**
- JavaScript (ES2017 target) - Compiled from TypeScript
- JSX/TSX - React component syntax

## Runtime

**Environment:**
- Node.js v22 (specified in `.github/workflows/tests.yml`)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Next.js 16.3.0 - Full-stack web framework with API routes and Server Components
- React 19.2.8 - UI library with React DOM 19.2.8

**Testing:**
- Vitest 4.1.10 - Unit and component test runner (`vitest.config.mts`)
- Playwright 1.62.1 - E2E testing framework (`playwright.config.ts`)
- @testing-library/react 16.3.3 - React component testing utilities
- @testing-library/dom 10.4.1 - DOM testing library
- jsdom 29.1.1 - DOM implementation for Node.js tests

**Build/Dev:**
- TypeScript 5 - Compilation and type checking
- Tailwind CSS 4 - Utility-first CSS framework (`postcss.config.mjs`)
- PostCSS with @tailwindcss/postcss 4 - CSS transformation pipeline
- ESLint 9 - JavaScript/TypeScript linting (`eslint.config.mjs`)
- Vite (via @vitejs/plugin-react 6.1.1) - Build tooling support

## Key Dependencies

**Critical:**
- @prisma/client 7.9.1 - Database ORM for PostgreSQL
- @prisma/adapter-pg 7.9.1 - PostgreSQL adapter for Prisma
- pg 8.22.0 - PostgreSQL driver
- jose 6.2.10 - JWT generation and verification (authentication)
- bcryptjs 3.0.3 - Password hashing
- @aws-sdk/client-s3 3.1121.0 - AWS S3 SDK (used for Cloudflare R2 compatibility)

**Infrastructure:**
- vite-tsconfig-paths 6.1.1 - TypeScript path alias resolution in Vitest
- @vitejs/plugin-react 6.1.1 - React plugin for Vite
- vitest-mock-extended 5.1.1 - Extended mocking utilities for Vitest
- @vitest/ui 4.1.10 - UI for Vitest test results
- @vitest/coverage-v8 4.1.10 - V8 coverage provider for Vitest

## Configuration

**Environment:**
- `.env` file required with environment variables (`.env` present but not readable per policy)
- Next.js experimental config in `next.config.ts`:
  - Server Actions body size limit: 5MB
- TypeScript config in `tsconfig.json`:
  - Target: ES2017
  - Module resolution: bundler
  - Strict mode: enabled
  - Path alias: `@/*` → root directory
  - JSX: react-jsx

**Build:**
- `next.config.ts` - Next.js configuration
- `tsconfig.json` - TypeScript compiler options
- `vitest.config.mts` - Vitest testing configuration
- `playwright.config.ts` - Playwright E2E testing configuration
- `postcss.config.mjs` - PostCSS configuration for Tailwind
- `eslint.config.mjs` - ESLint configuration with Next.js and TypeScript presets

## Platform Requirements

**Development:**
- Node.js v22
- npm for dependency management
- PostgreSQL database for local development

**Production:**
- Node.js v22
- PostgreSQL database (via Prisma with @prisma/adapter-pg)
- Environment variables: DATABASE_URL, JWT_SECRET, R2_* credentials
- Server-side execution for API routes and Server Actions

**Testing:**
- Unit/component tests run via Vitest with jsdom environment
- E2E tests run via Playwright (Chromium browser)
- CI environment: GitHub Actions on ubuntu-latest

---

*Stack analysis: 2026-08-31*
