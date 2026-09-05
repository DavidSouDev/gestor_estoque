---
phase: quick-260905-eqn
plan: 01
subsystem: termos-de-uso
tags: [termos, lgpd, superadmin, scripts, imutabilidade]
requires:
  - "POST /api/termos (TERM-02, Fase 6)"
  - "POST /api/auth/login"
  - "scripts/resolvedor-ts.mjs"
  - "scripts/seed-superadmin.ts"
provides:
  - "Texto juridico real dos Termos de Uso, versionado em texto puro"
  - "npm run termos:publicar — publicacao por HTTP com guarda de destino"
affects:
  - "Todos os usuarios existentes: publicar leva a tela de aceite (TERM-04)"
tech-stack:
  added: []
  patterns:
    - "Script de operacao que fala HTTP e so HTTP, sem importar prisma nem service"
    - "Guarda de destino: default localhost, remoto exige --confirmar E https"
key-files:
  created:
    - .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt
    - scripts/publicar-termos.ts
  modified:
    - package.json
decisions:
  - "A verificacao do banco rodou inline (node -e), nao por arquivo em /tmp — o guard de worktree do runtime bloqueia Write fora do worktree, e rodar inline satisfaz T-Q-07 de forma mais estrita (nenhum arquivo a vazar nem a apagar)"
  - "A versao publicada localmente e a 27, nao a 2 — o banco de dev acumula versoes de cada rodada do e2e. Nada foi 'consertado' para virar 2"
  - "O numero de versao e a data NAO entram no corpo do texto: vem do banco e ja sao exibidos pela tela de aceite"
metrics:
  duration: ~25min
  tasks: 3
  files: 3
  completed: 2026-09-05
---

# Quick 260905-eqn: Publicar texto real dos Termos de Uso — Summary

Os Termos de Uso reais (23.816 caracteres, 16 secoes, sem placeholder) foram redigidos sobre as regras de negocio verdadeiras do codigo e publicados na instancia LOCAL como uma versao NOVA pela superficie REST real, com a imutabilidade da v1 verificada por sha256 — nao assumida.

## O que foi feito

| Task | Entrega | Commit |
|------|---------|--------|
| 1 | `termos-de-uso-v2.txt` — documento juridico completo em texto puro | `0fb6ea2` |
| 2 | `scripts/publicar-termos.ts` + npm script `termos:publicar` | `a8bb366` |
| 3 | Publicacao local executada e verificada (sem commit de codigo — so este SUMMARY) | — |

### Task 1 — o texto

16 secoes numeradas, entre elas: objeto do servico, cadastro, plano e pagamento, periodo de teste, inadimplencia/carencia/bloqueio, reativacao, cancelamento, isolamento multi-tenant, LGPD, obrigacoes, limitacao de responsabilidade, alteracao dos termos, rescisao e foro.

Cada regra do documento corresponde a um valor conferido no codigo, nao a um template generico:

| Regra no texto | Fonte no codigo |
|---|---|
| R$ 29,90 por mes | `lib/billing/asaas/config.ts` (D-02) |
| Teste gratuito de 14 dias | `DIAS_DE_TRIAL = 14` em `lib/avaliar-acesso.ts` |
| Carencia de 10 dias | `DIAS_DE_CARENCIA = 10` em `lib/avaliar-acesso.ts` |
| Carencia nao bloqueia nada, so avisa | `acessoBloqueado` devolve `false` para `CARENCIA` |
| Bloqueio derruba admin E catalogo, sem excecoes | `acessoBloqueado` / `podePublicarCatalogo` |
| Bloqueio nao apaga dados | Nenhum caminho de delete no bloqueio |
| Cancelar nao encurta o periodo pago | `acessoEfetivoAte` ignora `canceladoEm` (D-06) |
| Sem cobranca retroativa na reativacao | Decisao de roadmap, confirmada em `avaliarAcesso` |
| Uma conta administrativa por empresa | `Usuario @@unique([empresaId])` |
| Senha so como hash bcrypt | `bcrypt.hash(..., 10)` |
| Nenhum dado de cartao no nosso banco | Checkout hospedado no Asaas |

Formato: extensao `.txt` e nao `.md` de proposito. O conteudo e renderizado como no de texto React dentro de `whitespace-pre-wrap` (`aceite-card.tsx`, `register-form.tsx`), e o projeto nao tem renderizador de markdown em lugar nenhum — um `#` ou `**` apareceria literalmente na tela de aceite. Nenhum colchete no arquivo inteiro, que e o detector de lacuna nao preenchida.

Acentuacao normal do portugues. A v1 nao tem acentos apenas porque vive dentro de um `.sql` de migration; a restricao era do arquivo, nao da coluna. O round-trip com acentos foi provado por sha256 (abaixo).

### Task 2 — o script

`scripts/publicar-termos.ts` NAO importa `@/lib/prisma` nem service nenhum. Fala HTTP e so HTTP, e essa e a razao de o arquivo existir: a autorizacao de `POST /api/termos` usa o papel REVALIDADO no banco (D-06), e um script que escrevesse direto na tabela contornaria essa verificacao inteira, reabrindo justamente o caminho que a rota e o service fecham.

Guardas, todas antes de qualquer I/O de rede:

- conteudo: `.trim()` (o mesmo do zod da rota), recusa de vazio, teto de 200.000 caracteres, recusa de qualquer texto que ainda contenha o marcador provisorio;
- destino: default `http://localhost:3000`, sem fallback para `APP_BASE_URL` (que faria do comando mais curto o mais perigoso); host remoto exige `--confirmar` E `https`, e a mensagem de recusa nomeia o host;
- segredos: senha, token e corpo do texto nunca sao impressos; nada e gravado em arquivo.

Comportamento verificado:

| Comando | Resultado |
|---|---|
| `--arquivo <txt> --dry-run` | exit 0, reporta 23816 caracteres / 271 linhas / alvo localhost |
| `--url https://exemplo.invalido --dry-run` | exit 1, exige `--confirmar` |
| `--url http://exemplo.invalido --confirmar --dry-run` | exit 1, exige `https` |

### Task 3 — publicacao local e prova de imutabilidade

Publicado contra `http://localhost:3000` com as credenciais descartaveis ja versionadas em `e2e/helpers.ts`:

```
id           9101f570-fabd-432c-b74a-2bcb50c0bafe
versao       27
publicadoEm  2026-09-05T15:23:46.229Z
caracteres   23816
```

**A versao e 27, nao 2, e isso e o esperado.** `e2e/aceite-de-termos.spec.ts` publica uma versao a cada rodada da suite, entao o banco de desenvolvimento ja acumulava 26 linhas (v1 da migration + 25 de e2e, de 110 caracteres cada). O nome do arquivo diz "v2" porque no banco de PRODUCAO existe apenas a v1. Nada foi ajustado para o numero virar 2.

As tres afirmacoes, medidas antes e depois:

| Afirmacao | Resultado |
|---|---|
| (a) exatamente UMA linha nova (26 -> 27) | OK |
| (b) sha256 da linha nova == sha256 do arquivo trimado | OK — `1139510278a7835fb11c70996bfcb54a16a1eaa70d88617ed683946751cd5f7a` |
| (c) v1 byte a byte identica e ainda com o placeholder | OK — 621 caracteres, `9bacef5d5c34a58b45d7ed86f8947e6cc92153306a1039bd89b1019bdd595954`, antes e depois |

(b) prova o round-trip byte a byte, acentos inclusive. (c) prova que publicar foi INSERT e nunca UPDATE (D-07): a linha da v1 tem sha256 e comprimento identicos aos da captura previa e continua comecando com o marcador provisorio.

## AVISO DE AUTORIA POR IA — LEIA ANTES DE PUBLICAR EM PRODUCAO

**O texto dos Termos de Uso foi redigido por IA a partir das regras de negocio implementadas no codigo. Ele NAO foi revisado por advogado.**

Isso nao e uma ressalva de praxe. O documento e juridicamente vinculante, sera imposto a todos os usuarios como condicao de acesso, e tem pelo menos tres pontos de exposicao real que exigem olhar profissional:

1. **Limitacao de responsabilidade frente ao CDC (secao 13).** O texto limita a responsabilidade ao valor pago nos ultimos 12 meses e exclui lucros cessantes e danos indiretos. Em relacao de consumo, clausulas que limitam ou exoneram a responsabilidade do fornecedor sao frequentemente consideradas abusivas e nulas. Foi incluida uma ressalva expressa (13.6) de que as limitacoes nao afastam direitos indisponiveis, mas a ressalva nao garante a validade do restante — so um advogado dira o que sobrevive.

2. **Bloqueio "sem excecoes" apos a carencia (secao 7) e ausencia de reembolso proporcional no cancelamento (secao 9).** Este e exatamente o item que o proprio `STATE.md` ja lista como pendencia aberta: "Revisao juridica (CDC) sobre bloqueio e nao-cobranca retroativa". A suspensao automatica de servico contratado e a retencao integral do periodo corrente sao decisoes com risco consumerista, e o texto as descreve com a firmeza que o codigo implementa — o que torna a revisao MAIS necessaria, nao menos.

3. **Atribuicao de papeis controladora/operadora na secao de LGPD (secao 11).** A divisao adotada (controladora dos dados de cadastro e conta da Empresa Contratante; operadora dos dados que ela insere) e uma leitura defensavel do sistema, mas e uma qualificacao juridica, nao um fato tecnico. Errar o papel muda quem responde perante a ANPD e perante os titulares.

Pontos adicionais que valem a checagem: os prazos de retencao de 90 dias apos o encerramento (15.5 e 15.6), escolhidos por razoabilidade e nao por norma; a clausula de foro (16.8), que em relacao de consumo pode ser afastada em favor do domicilio do consumidor; e a cessao da posicao contratual em reorganizacao societaria (16.5).

**Recomendacao explicita: submeta o documento a revisao juridica antes do go-live. Este plano nao substitui essa revisao e nao deve ser tratado como se substituisse.**

## O QUE AINDA FALTA — o bloqueador do STATE.md CONTINUA ABERTO

A publicacao aconteceu apenas na instancia LOCAL. **A publicacao em PRODUCAO nao foi feita e e acao do operador**, com credencial de producao — deliberadamente fora do escopo deste plano.

Enquanto isso nao acontecer, o bloqueador registrado no `STATE.md` permanece valido tal como esta escrito:

> Texto juridico da v1 dos termos ainda e o placeholder — publicar a versao real via `POST /api/termos` antes do deploy em producao.

Esta task NAO fecha esse item. Ela produz o texto e a ferramenta; a acao em producao continua pendente.

Pre-requisito: o SUPERADMIN de producao precisa existir antes, com **credencial forte — nunca a descartavel de desenvolvimento** usada aqui:

```
npm run seed:superadmin -- --email <email-do-superadmin-de-producao> --senha <credencial-forte>
```

Comando de publicacao em producao, com destino explicito e confirmacao:

```
npm run termos:publicar -- \
  --arquivo .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt \
  --email <email-do-superadmin-de-producao> \
  --senha <credencial-forte> \
  --url https://<host-de-producao> \
  --confirmar
```

Rode antes com `--dry-run` para conferir o alvo sem publicar nada. Em producao a versao criada sera a **2**, porque naquele banco existe apenas a v1 da migration.

## EFEITO DA PUBLICACAO — decida QUANDO, nao apenas se

Publicar uma versao nova leva **todo usuario com aceite da versao anterior** a tela `/{slug}/admin/aceitar-termos` no proximo request autenticado, inclusive pela API REST (403 "Termos de uso pendentes de aceite").

Isso e o comportamento pretendido de TERM-04, nao um efeito colateral. E e a razao pela qual publicar em producao e uma decisao consciente de momento, e nao um detalhe de deploy: no instante da publicacao, todos os clientes ativos passam a ver uma tela de aceite antes de acessar o painel. O Catalogo Publico de uma empresa em dia nao e afetado.

O mecanismo ja e provado por `e2e/aceite-de-termos.spec.ts` — esta task nao o re-prova.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verificacao do banco rodou inline em vez de por arquivo em /tmp**

- **Found during:** Task 3, passo 3
- **Issue:** O plano manda criar `/tmp/verificar-termos.mjs`. O guard de worktree do runtime recusa qualquer Write fora do worktree ("path is not inside any git repository"), tornando o passo literalmente impossivel de executar como escrito.
- **Fix:** A mesma verificacao somente-leitura rodou inline, por `node --import ./scripts/resolvedor-ts.mjs --input-type=module -e '...'`. Nenhum arquivo foi criado.
- **Por que isto satisfaz o plano melhor do que a letra dele:** T-Q-07 existe para impedir que o script de verificacao vaze para o repositorio. Sem arquivo algum, nao ha o que vazar nem o que apagar, e a verificacao `test ! -f /tmp/verificar-termos.mjs` passa trivialmente. A propriedade somente-leitura foi mantida: apenas `findMany` e `sha256`, nenhum create/update/delete.
- **Files modified:** nenhum
- **Commit:** —

**2. [Rule 3 - Blocking] `node_modules` ausente no worktree impedia o `next dev`**

- **Found during:** Task 3, passo 2
- **Issue:** O worktree nao tem `node_modules` (gitignored). Os scripts do projeto funcionavam porque a resolucao do Node sobe para o diretorio pai, mas o Turbopack trata o worktree como workspace root e se recusa a compilar arquivos fora dele: `Could not find the Next.js package (next/package.json)`. Um symlink para o `node_modules` do repositorio principal tambem foi recusado: `Symlink [project]/node_modules is invalid, it points out of the filesystem root`.
- **Fix:** `npm ci --no-audit --no-fund` no worktree, materializando a arvore de dependencias **a partir do `package-lock.json` ja versionado** (649 pacotes), seguido de `npx prisma generate`. Nenhum pacote NOVO foi instalado e nenhum nome de pacote foi resolvido fora do lockfile — o gate `gates:fase-06` confirma: "Gate 5 (nenhum pacote instalado na fase) — 11 deps / 20 devDeps".
- **Cuidado tomado:** o symlink foi removido com `rm` simples (unlink, nunca `-r`) ANTES do `npm ci`, para que o `npm ci` nao pudesse apagar o `node_modules` do repositorio principal atraves dele. Verificado depois: o diretorio do repositorio principal continua com 464 entradas.
- **Files modified:** nenhum arquivo versionado (`node_modules/` e `.next/` sao gitignored)
- **Commit:** —

**3. [Rule 3 - Blocking] `.env` ausente no worktree**

- **Found during:** Task 3, passo 1
- **Issue:** `.env*` e gitignored, entao o worktree nao o tem, e `DATABASE_URL` nao estava no ambiente. Sem ele nao ha como falar com o Postgres local nem subir o dev server.
- **Fix:** O `.env` do repositorio principal foi copiado para o worktree pelo tempo da execucao e **removido ao final**. Ele e gitignored, entao nunca entrou em commit nenhum; `git status` ficou limpo.
- **Files modified:** nenhum arquivo versionado
- **Commit:** —

### Nota sobre `tsc`

Na primeira execucao, `npx tsc --noEmit` acusou `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. Nao e defeito de codigo: `LayoutProps` e um tipo global GERADO pelo Next em `.next/types`, que nao existia no worktree recem-criado. Depois de o `next dev` rodar, `npx tsc --noEmit` saiu **0, sem nenhum erro**. Nenhuma linha de `app/` foi tocada para isso.

## Verificacao

| Verificacao | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros (2 warnings pre-existentes, um deles documentado na decisao `[01-04]`) |
| `npm run gates:fase-06` | 5/5 OK |
| `git diff --name-only HEAD -- app lib prisma e2e` | vazio |
| `test ! -f /tmp/verificar-termos.mjs` | OK |
| `git status --short` | limpo |

`npm test` e `npm run test:e2e` nao foram exigidos por esta task e nao foram rodados: nenhum arquivo de producao foi tocado, e `e2e/aceite-de-termos.spec.ts` publica versoes dinamicamente afirmando sobre `novo.versao`, entao a versao 27 criada localmente nao altera o que a suite espera.

## Pendencia para o STATE.md

O bloqueador existente **nao deve ser marcado como resolvido**. Sugestao de atualizacao, preservando o item aberto:

> Texto juridico da v1 dos termos ainda e o placeholder em PRODUCAO. O texto real ja existe versionado em `.planning/quick/260905-eqn-.../termos-de-uso-v2.txt` e a ferramenta de publicacao existe (`npm run termos:publicar`), com publicacao provada contra a instancia local (v27, sha256 conferido, v1 intacta). Falta a acao do operador em producao, com credencial de producao — e, antes dela, a revisao juridica (CDC/LGPD) do texto, que foi redigido por IA e nao revisado por advogado.

## Known Stubs

Nenhum. O texto entregue e o documento completo, sem lacuna, sem colchete e sem placeholder — verificado por checagem de string literal.

## Threat Flags

Nenhuma superficie de seguranca nova foi introduzida. O script fala com endpoints que ja existiam e ja estavam cobertos pelo threat model da Fase 6; nenhum endpoint, caminho de auth, acesso a arquivo ou mudanca de schema foi criado.

## Self-Check: PASSED

- `FOUND: .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt`
- `FOUND: scripts/publicar-termos.ts`
- `FOUND: package.json` (entrada `termos:publicar` presente)
- `FOUND: 0fb6ea2` (docs: redigir texto real dos Termos de Uso)
- `FOUND: a8bb366` (feat: publicar termos por HTTP com guarda de destino)
