# Phase 1: Pré-requisitos de Produção - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-31
**Phase:** 1-Pré-requisitos de Produção
**Areas discussed:** Falha na revalidação, Escopo da revalidação, Onde aplicar a checagem, Custo por request

---

## Falha na revalidação

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-closed: bloqueia | Trata falha de DB como sessão inválida, redireciona/401. Mais seguro, alinhado ao Core Value "sem exceções". | ✓ |
| Fail-open: confia no JWT | Segue com dados do JWT se o banco falhar. Evita bloqueios falsos, mas abre janela de acesso indevido. | |

**User's choice:** Fail-closed: bloqueia (recomendado)
**Notes:** —

---

## Escopo da revalidação

| Option | Description | Selected |
|--------|-------------|----------|
| Só existe/ativo | Verifica apenas `Usuario.ativo` e `Empresa.deletedAt`. Cobre exatamente os success criteria da Fase 1. | ✓ |
| Já desenhar para extensão | Mesma checagem, mas assinatura já pensada para plugar `avaliarAcesso()` da Fase 2. | |

**User's choice:** Só existe/ativo (recomendado)
**Notes:** —

---

## Onde aplicar a checagem

| Option | Description | Selected |
|--------|-------------|----------|
| As duas: cookie + API | `requireAdminSession` e `requireAuth` revalidam no banco. Já cobre o requisito da Fase 4 de bloquear `/api/*` direto. | ✓ |
| Só requireAdminSession por agora | Só a sessão do admin revalida agora; `requireAuth` ganha revalidação só na Fase 4. | |

**User's choice:** As duas: cookie + API (recomendado)
**Notes:** —

---

## Custo por request

| Option | Description | Selected |
|--------|-------------|----------|
| Cache por-request | Usa `React.cache()` (já usado em `getEmpresaCatalogo`) para deduplicar a query dentro do mesmo request. | ✓ |
| Sem cache, query a cada chamada | Mais simples, mas multiplica queries por request. | |

**User's choice:** Cache por-request (recomendado)
**Notes:** —

---

## Claude's Discretion

- Estrutura exata do retorno da função de revalidação (throw vs. objeto tipado).
- Nome e local exato do helper de revalidação compartilhado entre `session.ts` e `api-auth.ts`.
- Estratégia de teste para a correção do singleton do Prisma.

## Deferred Ideas

- Extensão da revalidação para status de pagamento — Fase 2 (modelo de dados) e Fase 4 (aplicação do bloqueio).
- Gate no catálogo público — Fase 4 (Aplicação do Bloqueio).
