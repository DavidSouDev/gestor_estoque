# Gestor de Estoque

Plataforma **multi-tenant** que dá a cada empresa dois produtos em um só sistema:

- um **catálogo público** para os clientes navegarem produtos e combos (com preço de varejo/atacado, destaques e promoções por período);
- um **gestor de estoque e vendas** para o lojista cadastrar produtos, montar combos, criar promoções e controlar movimentações de estoque (entrada, saída, ajuste).

Cada empresa tem seu próprio espaço isolado, acessado por um slug único (`/<slug>` para o catálogo, `/<slug>/admin` para a gestão), com dados completamente segregados entre tenants.

## Índice

- [Objetivo](#objetivo)
- [Como o sistema é organizado](#como-o-sistema-é-organizado)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Rodando o projeto localmente](#rodando-o-projeto-localmente)
  - [Opção A — Docker Compose](#opção-a--docker-compose-recomendado)
  - [Opção B — Node local (com hot reload)](#opção-b--node-local-com-hot-reload)
- [Contribuindo (fork + PR)](#contribuindo-fork--pr)
- [Testes](#testes)
- [Documentação da API](#documentação-da-api)
- [Deploy](#deploy)

## Objetivo

O projeto resolve duas pontas do mesmo negócio:

1. **Cliente final** — acessa `/<slug-da-empresa>` e vê uma vitrine (catálogo) com os produtos e combos ativos daquela empresa: fotos, categorias, preços, destaques e promoções vigentes. Não precisa de login.
2. **Vendedor/lojista** — acessa `/<slug-da-empresa>/admin`, autenticado, para:
   - cadastrar e editar produtos, imagens, preços (varejo/atacado) e categorias;
   - montar **combos** (kits com vários produtos e preço próprio);
   - criar **promoções** com vigência (data início/fim) sobre produtos ou combos;
   - registrar **movimentações de estoque** (entrada, saída, ajuste) com histórico por usuário;
   - configurar a marca da empresa (nome, logo, banner, cores, contato).

A interface do admin tem dois **modos**, escolhidos no cadastro da empresa (`ModoInterface`: `COMPLETO` ou `SIMPLES`) — o modo simples reduz o admin a wizards guiados (passo a passo) para quem prefere menos telas e menos decisões.

## Como o sistema é organizado

- **Multi-tenant por slug**: toda empresa (`Empresa`) tem um `slug` único, gerado a partir do nome no cadastro. As rotas dinâmicas `app/[slug]/...` roteiam catálogo e admin para o tenant certo.
- **Autenticação**: login gera um JWT (assinado com `JWT_SECRET`, via [`jose`](https://github.com/panva/jose)) guardado em cookie `httpOnly`. O payload carrega `empresaId`/`empresaSlug`, então um token de uma empresa nunca autentica em outra.
  - `proxy.ts` faz a checagem otimista nas rotas `/:slug/admin/*` (redireciona para o login se não houver sessão válida para aquele slug).
  - `lib/session.ts#requireAdminSession` faz a checagem definitiva em toda page/layout/Server Action do admin — nunca confia só no proxy.
- **Camadas do backend**: rotas de API (`app/api/**/route.ts`) chamam **services** (`app/services/*.service.ts`), que concentram as regras de negócio e o acesso ao banco via Prisma. Erros de negócio usam `HttpError` (`lib/http-error.ts`) para mapear status HTTP.
- **Banco de dados**: PostgreSQL via Prisma ORM (schema em `prisma/schema.prisma`). Entidades principais: `Empresa`, `Usuario`, `Produto` (+ `ProdutoImagem`), `Combo` (+ `ComboItem`), `Promocao` (+ `PromocaoItem`) e `MovimentacaoEstoque`.

## Tecnologias

| Camada | Escolha |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Actions) |
| Linguagem | TypeScript |
| UI | React 19 + Tailwind CSS 4 |
| ORM / Banco | Prisma 7 + PostgreSQL (via `@prisma/adapter-pg`) |
| Autenticação | JWT (`jose`) em cookie `httpOnly` + `bcryptjs` para hash de senha |
| Testes unitários/integração/componentes | [Vitest](https://vitest.dev) + Testing Library |
| Testes e2e | [Playwright](https://playwright.dev) |
| Documentação de API | OpenAPI (`public/openapi.json`) servido via Swagger UI em `/docs` |
| CI | GitHub Actions (`.github/workflows/tests.yml`) — lint, testes unitários com cobertura e e2e a cada push/PR na `main` |

## Pré-requisitos

Há dois jeitos de rodar o projeto localmente — escolha um:

- **Com Docker** (mais rápido para só ver o sistema no ar, sem hot reload): [Docker](https://docs.docker.com/get-docker/) com Docker Compose v2 (já incluído no Docker Desktop). Não precisa instalar Node, PostgreSQL nem Redis — o `docker compose` sobe tudo.
- **Sem Docker** (para desenvolver com hot reload):
  - Node.js 22+ (mesma versão usada no CI)
  - npm
  - PostgreSQL rodando localmente (ou acessível via `DATABASE_URL`)
  - Redis rodando localmente — opcional, mas recomendado: sem ele o freio de força bruta de login/registro (`lib/redis-rate-limiter.ts`) fica desativado (fail-open) e só loga um aviso, o resto da aplicação funciona normalmente.

## Rodando o projeto localmente

### Opção A — Docker Compose (recomendado)

Builda a aplicação (build de produção do Next, `output: standalone`) e sobe Postgres, Redis e as migrations do Prisma junto, tudo isolado do seu ambiente. É o caminho mais rápido para ter o sistema completo no ar, mas **não tem hot reload** — para editar código e ver o resultado sem rebuildar a imagem, use a [Opção B](#opção-b--node-local-com-hot-reload).

1. **Clone o repositório** (veja [Contribuindo](#contribuindo-fork--pr) se for contribuir via fork):

   ```bash
   git clone https://github.com/<seu-usuario>/gestor_estoque.git
   cd gestor_estoque/gestor_estoque
   ```

2. **Configure as variáveis de ambiente** — crie um `.env` na raiz do projeto com pelo menos `JWT_SECRET` (veja [`.env.example`](./.env.example) para a lista completa — credenciais do Asaas, do R2, `CRON_SECRET` etc. só são necessárias para exercitar essas integrações). `DATABASE_URL` e `REDIS_URL` não precisam ser preenchidos: o `docker-compose.yml` os sobrescreve para apontar para os serviços `db`/`redis` da própria rede do compose.

3. **Suba tudo:**

   ```bash
   docker compose up --build -d
   ```

   Isso builda a imagem, sobe `db` (Postgres 16) e `redis` (Redis 7), roda `prisma migrate deploy` num container `migrate` de execução única e só então inicia o `app`, exposto em [http://localhost:3000](http://localhost:3000) (porta configurável via `APP_PORT`).

   > `migrate` não fica rodando — ele aplica as migrations e sai. `docker compose ps` (sem `-a`) nem lista containers já finalizados; `docker compose ps -a` mostra `Exited (0)` para ele, que é o resultado esperado (confira com `docker compose logs migrate`). O `app` só inicia depois que o `migrate` termina com sucesso. Para reaplicar as migrations manualmente a qualquer momento: `docker compose run --rm migrate`.

4. **Acompanhe os logs** com `docker compose logs -f app` e **derrube tudo** com `docker compose down` (os dados do Postgres/Redis persistem em volumes nomeados entre execuções; use `docker compose down -v` para descartá-los também).

5. **Crie sua primeira empresa** em [`/registro`](http://localhost:3000/registro) — veja o passo 6 da Opção B.

### Opção B — Node local (com hot reload)

1. **Clone o repositório** (veja [Contribuindo](#contribuindo-fork--pr) se for contribuir via fork):

   ```bash
   git clone https://github.com/<seu-usuario>/gestor_estoque.git
   cd gestor_estoque/gestor_estoque
   ```

2. **Instale as dependências:**

   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente** — crie um `.env` na raiz do projeto apontando para o seu PostgreSQL (e, opcionalmente, Redis) locais:

   ```bash
   DATABASE_URL="postgresql://usuario:senha@localhost:5432/gestor_estoque"
   JWT_SECRET="uma-string-secreta-qualquer-para-desenvolvimento"
   # opcional — sem isto o freio de força bruta de login/registro fica desativado
   REDIS_URL="redis://localhost:6379"
   ```

4. **Gere o client do Prisma e aplique as migrations:**

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. **Suba o servidor de desenvolvimento:**

   ```bash
   npm run dev
   ```

   Acesse [http://localhost:3000](http://localhost:3000).

6. **Crie sua primeira empresa** em `/registro` — o formulário cria a `Empresa` (com slug gerado a partir do nome), o `Usuario` administrador e já autentica, redirecionando para `/<slug>/admin`. A partir daí:
   - o catálogo público fica em `/<slug>`;
   - o admin fica em `/<slug>/admin`.

### Scripts úteis

```bash
npm run dev            # servidor de desenvolvimento
npm run build           # build de produção
npm run start            # roda o build de produção
npm run lint            # ESLint
npm test                # suíte Vitest (unitário + componentes)
npm run test:e2e         # suíte Playwright (sobe o dev server na porta 3100)
```

Veja a seção [Testes](#testes) para detalhes de cada camada.

## Contribuindo (fork + PR)

1. Faça um **fork** deste repositório pelo GitHub (botão "Fork" no canto superior direito).
2. Clone o **seu fork** localmente:

   ```bash
   git clone https://github.com/<seu-usuario>/gestor_estoque.git
   cd gestor_estoque/gestor_estoque
   git remote add upstream https://github.com/<dono-original>/gestor_estoque.git
   ```

3. Siga os passos de [Rodando o projeto localmente](#rodando-o-projeto-localmente) para configurar o ambiente.
4. Crie uma branch a partir da `main`:

   ```bash
   git checkout -b minha-feature
   ```

5. Mantenha seu fork atualizado com o repositório original quando necessário:

   ```bash
   git fetch upstream
   git merge upstream/main
   ```

6. Rode lint e testes antes de abrir o PR (o CI roda os mesmos checks a cada push/PR):

   ```bash
   npm run lint
   npm test
   npm run test:e2e
   ```

7. Abra o Pull Request do seu fork para a `main` do repositório original.

## Testes

O projeto tem três camadas de teste automatizado (unitário/integração, componentes e e2e), todas rodadas pelo CI a cada push/PR. Comandos, convenções de mock do Prisma e padrões de teste de rota/e2e estão detalhados em **[TESTING.md](./TESTING.md)**.

## Documentação da API

A API REST (`app/api/**`) é documentada em OpenAPI (`public/openapi.json`) e pode ser explorada interativamente em [`/docs`](http://localhost:3000/docs) (Swagger UI) com o servidor rodando.

## Deploy

Por ser um app Next.js padrão, pode ser publicado em qualquer plataforma que suporte Next.js (ex: [Vercel](https://vercel.com)), desde que as variáveis `DATABASE_URL` e `JWT_SECRET` estejam configuradas e as migrations do Prisma (`npx prisma migrate deploy`) sejam aplicadas no banco de produção.

Para um deploy self-hosted, o mesmo `docker compose up --build -d` descrito na [Opção A de "Rodando o projeto localmente"](#opção-a--docker-compose-recomendado) serve de base: aponte o `.env` do host para os segredos e o `APP_BASE_URL` de produção (em vez dos valores de desenvolvimento) e rode o mesmo comando lá.
