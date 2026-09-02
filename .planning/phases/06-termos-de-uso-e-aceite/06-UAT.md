---
status: testing
phase: 06-termos-de-uso-e-aceite
source: [06-VERIFICATION.md]
started: 2026-09-02T14:50:07Z
updated: 2026-09-02T14:50:07Z
---

## Current Test

number: 1
name: Publicação do texto jurídico real dos Termos de Uso
expected: |
  A tela de aceite e o registro exibem o texto legal definitivo, não o placeholder
  '[TEXTO PROVISORIO - ...]' semeado pela migration 20260902120200_seed_termo_v1.
awaiting: user response

## Tests

### 1. Publicação do texto jurídico real dos Termos de Uso
expected: Publicar o texto legal definitivo como uma NOVA versão via `POST /api/termos`, autenticado como SUPERADMIN (`npm run seed:superadmin` cria a conta), antes do deploy em produção. A tela de aceite e o registro devem exibir o texto real, não o placeholder.
result: [pending]

### 2. Ciência do operador sobre o gate retroativo
expected: Confirmar que o operador está ciente de que todos os `Usuario` existentes (termoAceitoId = NULL após a migration) verão o gate de aceite obrigatório no próximo request autenticado — decisão registrada sobre aviso prévio aos clientes pagantes.
result: [pending]

### 3. Ordem de deploy em produção
expected: Confirmar a sequência — (a) migration add_superadmin_role, (b) migration add_termos_de_uso, (c) migration seed_termo_v1, (d) deploy da aplicação, (e) `npm run seed:superadmin`. Migrations aplicadas antes do deploy do código que referencia UserRole.SUPERADMIN.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
