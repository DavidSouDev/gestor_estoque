# Phase 6: Termos de Uso e Aceite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 6-Termos de Uso e Aceite
**Areas discussed:** Papel SUPERADMIN, UI de termos, Padrão do gate de bloqueio, Exibição no registro, Billing do SUPERADMIN, Aceite para SUPERADMIN, Formato do texto

---

## Papel SUPERADMIN — modelo de dados e login

| Option | Description | Selected |
|--------|-------------|----------|
| Empresa interna dedicada | Empresa "da plataforma" via seed; SUPERADMIN é Usuario normal nela, role=SUPERADMIN. Sem mudança de schema. | ✓ |
| empresaId nullable | Mudança estrutural no schema, migration, revisar queries que assumem empresaId presente. | |
| Deixar pesquisa/planner decidir | — | |

**User's choice:** Empresa interna dedicada.
**Notes:** Usuario hoje exige `empresaId` obrigatório e único por empresa (`@@unique([empresaId])`) — a empresa interna evita quebrar essa restrição.

---

## Publicação de termos — UI ou só API?

| Option | Description | Selected |
|--------|-------------|----------|
| Só API, sem UI | Mesmo padrão de acessoVitalicio — endpoint protegido, sem tela. | ✓ |
| Tela simples de publicação | Formulário mínimo protegido por SUPERADMIN. | |

**User's choice:** Só API, sem UI.
**Notes:** Consistente com PROJECT.md §Out of Scope (nenhuma UI de superadmin em v1).

---

## Padrão do gate de bloqueio (TERM-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect para rota dedicada | Mesmo padrão de `requireAdminSession`/`/admin/bloqueado` da Fase 4 — gate roda antes do render, fora do grupo `(protected)`. | ✓ |
| Modal overlay client-side | Componente de modal sobre a página, bloqueando via CSS/JS. | |

**User's choice:** Redirect para rota dedicada.
**Notes:** A Fase 4 documentou explicitamente por que layout não é boundary de autorização (RSC payload já vaza dados antes do modal aparecer) — manter consistência evita reintroduzir esse risco.

---

## Exibição dos termos no registro (TERM-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox + link/modal com texto completo | Checkbox obrigatório + link/modal que mostra o texto sem sair da tela. | ✓ |
| Texto inline na página | Texto completo direto na página de registro. | |
| Página separada | Link para rota própria (/termos). | |

**User's choice:** Checkbox + link/modal com texto completo.
**Notes:** —

---

## Billing da empresa interna do SUPERADMIN

| Option | Description | Selected |
|--------|-------------|----------|
| acessoVitalicio=true | Empresa interna nunca entra em trial/carência/bloqueio. | ✓ |
| Não tratar nesta fase | Resolver depois se acontecer. | |

**User's choice:** acessoVitalicio=true.
**Notes:** Reaproveita a precedência absoluta já existente em `avaliarAcesso` (Fase 2, D-03) — sem lógica nova.

---

## Aceite de termos para o SUPERADMIN

| Option | Description | Selected |
|--------|-------------|----------|
| Mesma regra pra todos | SUPERADMIN aceita como qualquer usuário. | |
| SUPERADMIN isento do gate | Caso especial explícito no código do gate. | ✓ |

**User's choice:** SUPERADMIN isento do gate.
**Notes:** Quem publica a própria versão vigente não precisa "aceitá-la" para poder usar o sistema.

---

## Formato do conteúdo do termo

| Option | Description | Selected |
|--------|-------------|----------|
| Texto puro | String simples, renderizada com `white-space: pre-wrap`. | ✓ |
| Markdown | Exige biblioteca de render, ainda não presente no projeto. | |

**User's choice:** Texto puro.
**Notes:** Evita risco de XSS por HTML não sanitizado; sem dependência nova.

---

## Claude's Discretion

- Nome exato do endpoint de publicação e da(s) tabela(s) Prisma (`Termo`/`TermoDeUso`, `AceiteTermos`).
- Shape exato do link/modal de termos no registro.
- Onde exatamente a checagem de aceite pendente entra no fluxo de sessão (dentro de `requireAdminSession` vs. wrapper novo).
- Nome exato da rota de aceite (`/aceitar-termos`, `/termos-pendentes`, etc.).
- Estratégia de seed da empresa interna do SUPERADMIN (script separado vs. migration com dado).
- Comportamento de borda: registro acontecendo sem nenhuma versão de termos publicada ainda (banco vazio) — não decidido, fica para pesquisa (D-12).

## Deferred Ideas

- Tela de admin para o SUPERADMIN escrever/editar o texto dos termos — futura fase, se depender de Postman/curl em produção se mostrar inviável.
- Suporte a Markdown/HTML formatado no texto dos termos — revisitar se texto puro se mostrar insuficiente.
- Rota de autenticação separada para SUPERADMIN — descartada; modelo de "empresa interna" evita essa complexidade.
