---
status: complete
phase: 06-termos-de-uso-e-aceite
source: [06-VERIFICATION.md]
started: 2026-09-02T14:50:07Z
updated: 2026-09-02T15:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Publicação do texto jurídico real dos Termos de Uso
expected: Publicar o texto legal definitivo como uma NOVA versão via `POST /api/termos`, autenticado como SUPERADMIN (`npm run seed:superadmin` cria a conta), antes do deploy em produção. A tela de aceite e o registro devem exibir o texto real, não o placeholder.
result: pass

### 2. Ciência do operador sobre o gate retroativo
expected: Confirmar que o operador está ciente de que todos os `Usuario` existentes (termoAceitoId = NULL após a migration) verão o gate de aceite obrigatório no próximo request autenticado — decisão registrada sobre aviso prévio aos clientes pagantes.
result: pass

### 3. Ordem de deploy em produção
expected: Confirmar a sequência — (a) migration add_superadmin_role, (b) migration add_termos_de_uso, (c) migration seed_termo_v1, (d) deploy da aplicação, (e) `npm run seed:superadmin`. Migrations aplicadas antes do deploy do código que referencia UserRole.SUPERADMIN.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
