# Testes

Este projeto usa três camadas de teste automatizado:

| Camada | Ferramenta | Onde ficam | Comando |
|---|---|---|---|
| Unitário / integração (services, lib, rotas de API) | Vitest | ao lado do arquivo testado (`*.test.ts`) | `npm test` |
| Componentes React | Vitest + Testing Library | ao lado do componente (`*.test.tsx`) | `npm test` |
| End-to-end | Playwright | `e2e/*.spec.ts` | `npm run test:e2e` |

## Rodando os testes

```bash
npm test              # roda toda a suíte Vitest uma vez
npm run test:watch    # modo watch (TDD)
npm run test:ui       # UI interativa do Vitest
npm run test:coverage # com relatório de cobertura (text + html em /coverage)

npm run test:e2e      # Playwright (sobe o dev server automaticamente na porta 3100)
npm run test:e2e:ui   # UI interativa do Playwright
```

Os testes e2e usam o Postgres apontado por `DATABASE_URL` no `.env` — rodam contra um dev
server real (`next dev`) e criam empresas/produtos reais nesse banco (cada teste usa dados
com timestamp único para não colidir). Não há banco de testes isolado configurado; se quiser
isolar, aponte um `DATABASE_URL` separado antes de rodar `npm run test:e2e`.

Na primeira vez, instale os browsers do Playwright:

```bash
npx playwright install chromium
```

## Como os testes unitários mockam o Prisma

`tests/setup/prisma-mock.ts` cria um mock profundo (`vitest-mock-extended`) do `PrismaClient`
e substitui `@/lib/prisma` globalmente (registrado em `tests/setup/vitest.setup.ts`, que é
carregado por todo teste via `setupFiles` no `vitest.config.mts`). Nenhum teste unitário toca
um banco real.

Em qualquer teste de service, importe o mock e configure os retornos:

```ts
// @vitest-environment node
import { prismaMock } from "../../tests/setup/prisma-mock";
import { produtoService } from "./produto.service";

it("faz algo", async () => {
  prismaMock.produto.findMany.mockResolvedValue([...]);
  await produtoService.list("empresa-1");
  expect(prismaMock.produto.findMany).toHaveBeenCalledWith(...);
});
```

## Testando rotas de API

Rotas de API importam services diretamente (sem HTTP real). O padrão é mockar o service com
`vi.mock` usando o MESMO caminho relativo que o `route.ts` usa para importar, e usar os
helpers de `tests/helpers/`:

- `tests/helpers/request.ts` — `buildRequest()` monta um `Request` com header `Authorization`
  e body JSON; `buildParams()` monta o segundo argumento `{ params: Promise<...> }` que as
  rotas dinâmicas (`[id]/route.ts`) esperam no App Router.
- `tests/helpers/auth.ts` — `buildAuthToken()` assina um JWT válido de teste (usa
  `JWT_SECRET` de teste definido em `tests/setup/vitest.setup.ts`); `testAuthPayload` traz o
  payload padrão (`empresaId: "empresa-1"`, etc.) usado nesse token.

Veja `app/api/produtos/route.test.ts` e `app/api/produtos/[id]/route.test.ts` como referência.

## Testando componentes

Ambiente `jsdom` por padrão (`vitest.config.mts`). `tests/setup/vitest.setup.ts` já registra
os matchers do `@testing-library/jest-dom` e faz `cleanup()` automático depois de cada teste.

Para lib/service/rota que não precisa de DOM, adicione `// @vitest-environment node` no topo
do arquivo — evita problemas conhecidos de bibliotecas como `jose` (JWT) rodando sob jsdom.

Cuidado com inputs controlados por prop externa (ex: `NumberStepper`, que recebe `value` via
prop e não a atualiza sozinho): prefira `fireEvent.change` disparando o valor final desejado
em vez de `userEvent.type` caractere a caractere, que acumula sobre o valor antigo da prop.

## Testes e2e

`playwright.config.ts` sobe `next dev` na porta 3100 e roda os specs em `e2e/`. Padrões
importantes:

- Depois de um `<form action={...}>` (Server Action) que redireciona, espere a URL mudar
  (`await expect(page).toHaveURL(...)`) antes de navegar manualmente — um `page.goto()`
  disparado cedo demais pode abortar a submissão em andamento.
- Botões de remoção usam `window.confirm`; trate com
  `page.once("dialog", (dialog) => dialog.accept())` antes do clique.
- `retries: 1` local e timeouts generosos (`actionTimeout`, `navigationTimeout`,
  `expect.timeout`) absorvem a primeira compilação (lenta) de cada rota no `next dev`.

## Escopo de cobertura

- **Backend**: todos os services (`app/services/*.ts`) e todas as rotas de API
  (`app/api/**/route.ts`), incluindo autenticação/autorização e isolamento multi-tenant
  (garantir que uma empresa nunca acesse dado de outra).
- **Frontend**: componentes com lógica própria (formulários, wizards do "modo simples",
  cards do catálogo, navegação do admin). Componentes de puro layout sem lógica foram
  deliberadamente deixados de fora.
- **E2E**: fluxos de ponta a ponta — cadastro/login, CRUD de produto e reflexo no catálogo
  público, combos, promoções, movimentação de estoque, e o modo simples de interface.
