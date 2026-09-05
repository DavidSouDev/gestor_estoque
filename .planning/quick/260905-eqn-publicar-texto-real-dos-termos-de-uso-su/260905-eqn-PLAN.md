---
phase: quick-260905-eqn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt
  - scripts/publicar-termos.ts
  - package.json
  - .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/260905-eqn-SUMMARY.md
autonomous: true
requirements: [TERM-02, TERM-03]
user_setup: []

must_haves:
  truths:
    - "Existe no repositório o texto jurídico REAL e completo dos Termos de Uso, redigido sobre as regras de negócio verdadeiras do sistema — sem placeholder, sem lacuna entre colchetes"
    - "O operador publica esse texto com UM comando, sem escrever SQL e sem tocar na linha da v1"
    - "O texto que fica no banco é byte a byte o texto do arquivo versionado (depois do trim que a rota aplica)"
    - "A linha da v1 continua com o texto original — publicar é INSERT (D-07), nunca UPDATE"
    - "Rodar o comando contra qualquer host que não seja localhost exige confirmação explícita e HTTPS"
    - "Publicar uma versão nova leva os usuários existentes à tela de aceite — mecanismo JÁ provado por e2e/aceite-de-termos.spec.ts; esta task não o re-prova"
  artifacts:
    - path: ".planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt"
      provides: "Texto integral dos Termos de Uso em texto puro (sem markdown), pronto para publicação"
      min_lines: 200
      contains: "59.111.718/0001-06"
    - path: "scripts/publicar-termos.ts"
      provides: "Publicação por HTTP: login como SUPERADMIN + POST /api/termos, com guarda de destino"
      contains: "/api/termos"
    - path: "package.json"
      provides: "Entrada npm termos:publicar rodando pelo resolvedor de ambiente do projeto"
      contains: "termos:publicar"
  key_links:
    - from: "scripts/publicar-termos.ts"
      to: "POST /api/auth/login"
      via: "fetch com { email, senha } para obter o Bearer token"
      pattern: "api/auth/login"
    - from: "scripts/publicar-termos.ts"
      to: "POST /api/termos"
      via: "fetch com Authorization: Bearer e corpo { conteudo }"
      pattern: "api/termos"
    - from: "package.json"
      to: "scripts/publicar-termos.ts"
      via: "npm script com --import ./scripts/resolvedor-ts.mjs"
      pattern: "resolvedor-ts.mjs scripts/publicar-termos.ts"
---

<objective>
Substituir o placeholder jurídico dos Termos de Uso pelo texto real, publicando-o como uma NOVA versão via `POST /api/termos` — jamais por UPDATE da v1.

Purpose: hoje a v1 no banco é `[TEXTO PROVISORIO - ...]` (semeada pela migration `20260902120200_seed_termo_v1`). É o último bloqueador não-técnico registrado no STATE.md para o go-live: todo usuário que se cadastrou aceitou um texto que não diz nada. A imutabilidade de `TermoDeUso` (D-07) é o produto desta parte do sistema — corrigir o texto significa publicar a versão seguinte, nunca reescrever a anterior.

Output:
1. `termos-de-uso-v2.txt` — o documento jurídico completo, em texto puro, versionado no repo.
2. `scripts/publicar-termos.ts` + npm script `termos:publicar` — publicação pela superfície REST real, com guarda contra publicar em produção por engano.
3. Publicação executada e verificada contra a instância LOCAL, com prova de que a v1 continua intacta.

Fora de escopo (deliberadamente): publicar em produção — é ação do operador, com credencial de produção, documentada no SUMMARY.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Fontes que definem o contrato (LEIA antes de escrever qualquer linha):
@app/api/termos/route.ts
@app/services/termo.service.ts
@lib/termo-vigente.ts
@lib/auth-guard.ts
@scripts/seed-superadmin.ts
@scripts/registrar-webhook-asaas.ts
@scripts/resolvedor-ts.mjs
@e2e/helpers.ts
@prisma/migrations/20260902120200_seed_termo_v1/migration.sql
@app/[slug]/admin/aceitar-termos/_components/aceite-card.tsx

Fatos já extraídos destes arquivos — não redescubra, use:

- `POST /api/termos` autoriza pela role lida do BANCO (`revalidarConta`), nunca pelo JWT. Corpo `{ conteudo: string }`, `z.string().trim().min(1).max(200_000)`. Respostas: 201 `{ id, versao, publicadoEm }`, 400 corpo inválido, 401 sessão inválida, 403 não-SUPERADMIN, 409 publicação concorrente.
- `POST /api/auth/login` devolve `{ token, usuario }` com JWT de 7 dias. É o único jeito de obter o Bearer.
- SUPERADMIN é isento do gate de termos (D-03, `lib/auth-guard.ts`) e a empresa interna tem `acessoVitalicio` (D-02) — por isso ele consegue publicar mesmo com termos pendentes/assinatura vencida. Nenhum ajuste é necessário para isso funcionar.
- `termoService.publicar` NÃO tem `update` nem `delete`, e essa ausência é o contrato (D-07). Nada neste plano adiciona um.
- O texto é renderizado como NÓ DE TEXTO React dentro de `whitespace-pre-wrap` — em `aceite-card.tsx` e em `app/registro/_components/register-form.tsx:146`. **Não existe renderizador de markdown em lugar nenhum.** `#`, `**`, `|` de tabela apareceriam literalmente na tela do usuário.
- Credenciais de dev do SUPERADMIN já existem e são descartáveis: `e2e/helpers.ts` → `SUPERADMIN_E2E` = `superadmin-e2e@teste.com` / `senha-e2e-descartavel`. `npm run seed:superadmin` é idempotente por email.
- Scripts `.ts` rodam por `node --import ./scripts/resolvedor-ts.mjs`, que carrega o `.env` com `@next/env` (o MESMO leitor da aplicação — `--env-file` do Node diverge e já custou horas na Fase 3).
- Nenhum gate de grep varre `scripts/` hoje (`scripts/gates-fase-06.mjs`), então o script novo não colide com gate nenhum.
- `e2e/aceite-de-termos.spec.ts` publica versões dinamicamente e afirma sobre `novo.versao` — publicar uma versão local NÃO quebra a suíte e2e.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Redigir o texto real dos Termos de Uso como texto puro</name>
  <files>.planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt</files>
  <action>
Escreva o documento jurídico completo em português do Brasil, do zero, pronto para produção. Este é o entregável principal do plano — não é um esqueleto para alguém preencher depois.

FORMATO (restrição dura, com evidência no código, não preferência de estilo):
Extensão `.txt` e não `.md` de propósito: o conteúdo é renderizado como nó de texto React dentro de uma caixa `whitespace-pre-wrap` (`aceite-card.tsx`, `register-form.tsx:146`), sem nenhum renderizador de markdown no projeto. Um `#` ou `**` apareceria literalmente na tela de aceite. A extensão `.txt` remove a tentação de um editor futuro "melhorar a formatação". Regras concretas:
- Títulos de seção em linha própria, MAIÚSCULAS, numerados: `1. OBJETO E DEFINICOES` — no mínimo 14 seções numeradas de topo.
- Cláusulas numeradas `1.1.`, `1.2.` etc.; listas com hífen e espaço no início da linha.
- Proibidos no arquivo inteiro: `#`, `*`, `|` de tabela, e **qualquer colchete `[` ou `]`** (é o detector de lacuna não preenchida — a v1 é literalmente `[TEXTO PROVISORIO - ...]`).
- Acentuação normal do português: a coluna é UTF-8 e a aplicação exibe acentos em todo lugar. A v1 não tem acentos apenas porque vive dentro de um arquivo `.sql` de migration — a restrição era do arquivo, não do banco. A Task 3 prova o round-trip por sha256.
- **NÃO escreva o número da versão nem a data de publicação dentro do texto.** Os dois vêm do banco e a tela já mostra "Versão N · publicada em DD/MM/AAAA" (`aceite-card.tsx`). Um número embutido no corpo contradiria o real (localmente a versão criada não será 2 — ver Task 3).
- Alvo de tamanho: entre 10.000 e 25.000 caracteres. O teto duro da rota é 200.000, mas a caixa de leitura é pequena (`max-h-72` num card `max-w-md`) — parágrafos curtos, sem paredes de texto.

TOM: direto, segunda pessoa ("você"/"a Empresa Contratante"), português claro. Sem teatro jurídico, sem cláusula genérica copiada de template SaaS americano. Cada regra do documento tem que corresponder ao que o código faz de verdade.

DADOS REAIS (fornecidos pelo usuário — transcreva exatamente, não invente, não troque):
- Responsável: David Rafael de Lima Sousa, CNPJ 59.111.718/0001-06
- Foro eleito: comarca de Santa Cruz do Capibaribe - PE
- Contato (inclusive para exercício de direitos LGPD): davidsoudev@gmail.com

SEÇÕES OBRIGATÓRIAS (cobrindo as regras REAIS do sistema, valores conferidos no código):

1. IDENTIFICAÇÃO E ACEITE — quem é o responsável (nome + CNPJ + contato), o que significa aceitar, e que o aceite é registrado de forma versionada por usuário.
2. DEFINIÇÕES — Plataforma; Empresa Contratante (o tenant); Usuário Administrador (hoje o sistema mantém uma conta administrativa por empresa — `Usuario @@unique([empresaId])`); Catálogo Público; Gateway de Pagamento.
3. OBJETO — SaaS multi-tenant de gestão de estoque e catálogo: cadastro de produtos, combos, promoções, movimentações de estoque, e um catálogo público acessível em `/{slug}` por qualquer visitante, sem conta.
4. CADASTRO E CONTA — veracidade dos dados, responsabilidade pela guarda da senha, responsabilidade por tudo que for feito pela conta.
5. PLANO E PAGAMENTO — plano único de R$ 29,90 por mês, cobrança recorrente processada por gateway externo (Asaas), por checkout hospedado. Deixe explícito e destacado: **a Plataforma não recebe, não processa e não armazena dados de cartão ou meio de pagamento** — esses dados trafegam e ficam exclusivamente no ambiente do gateway. O que fica no nosso banco são apenas identificadores de cliente/assinatura do gateway e o status da assinatura.
6. PERÍODO DE TESTE — teste gratuito de 14 dias contados do cadastro (`DIAS_DE_TRIAL = 14`), sem cobrança e sem necessidade de cartão para começar.
7. INADIMPLÊNCIA, CARÊNCIA E BLOQUEIO — vencido o período pago, há prazo de carência de 10 dias (`DIAS_DE_CARENCIA = 10`) em que o acesso continua normal. Terminada a carência sem pagamento: o painel administrativo é bloqueado e o catálogo público é despublicado (deixa de ser exibido), **sem exceções**. Diga também o que NÃO acontece: os dados não são apagados pelo bloqueio.
8. REATIVAÇÃO — o pagamento do período corrente reativa o acesso automaticamente, sem novo cadastro e **sem cobrança retroativa dos meses em que a conta esteve bloqueada**.
9. CANCELAMENTO — pode ser feito a qualquer momento pelo painel; o acesso permanece até o fim do período já pago; não há reembolso proporcional do período corrente; não há renovação automática seguinte.
10. DADOS DA EMPRESA E ISOLAMENTO — os dados cadastrados pertencem à Empresa Contratante; o sistema isola tenants (uma empresa nunca acessa dados de outra); a Empresa pode exportar/solicitar seus dados enquanto a conta existir.
11. PROTEÇÃO DE DADOS (LGPD) — papéis: a Plataforma é **controladora** dos dados de cadastro e conta da própria Empresa Contratante (nome, e-mail, senha em hash, telefone, dados de assinatura) e **operadora** dos dados que a Empresa insere no sistema (catálogo, estoque, conteúdo publicado). Liste o que é efetivamente tratado, sem inventar: nome e e-mail do usuário administrador, senha armazenada apenas como hash (bcrypt, nunca em texto claro), dados públicos da empresa (nome, telefone, Instagram, logo, banner, descrição, cores, slug), catálogo e movimentações de estoque, registros de status de assinatura e trilha de auditoria de acesso, identificadores do gateway de pagamento, e registro de aceite dos termos. Diga que não há criação de conta nem cadastro de visitantes do catálogo público. Cite os operadores/subprocessadores por função: gateway de pagamento (Asaas), armazenamento de imagens em provedor de objetos, e provedor de hospedagem e banco de dados. Direitos do titular (confirmação, acesso, correção, anonimização, portabilidade, eliminação, revogação de consentimento) e o canal de exercício: davidsoudev@gmail.com, com prazo de resposta.
12. OBRIGAÇÕES E CONDUTA — veracidade das informações, uso lícito do catálogo público, proibição de conteúdo ilegal/enganoso/de terceiros sem autorização, proibição de tentar acessar dados de outra empresa ou burlar o controle de assinatura.
13. DISPONIBILIDADE E LIMITAÇÃO DE RESPONSABILIDADE — serviço prestado no estado em que se encontra, sem garantia de operação ininterrupta; manutenções e indisponibilidades de terceiros; exclusão de responsabilidade por lucros cessantes e danos indiretos; limite de responsabilidade ao valor efetivamente pago nos últimos 12 meses; ressalva expressa de que essas limitações não afastam direitos indisponíveis do consumidor quando a legislação aplicável assim determinar.
14. ALTERAÇÃO DOS TERMOS — nova versão é publicada como um documento novo (as versões anteriores são preservadas e nunca reescritas); a partir da publicação, o acesso ao painel exige aceite da nova versão; quem não aceitar pode encerrar a conta e continua podendo sair da sessão.
15. RESCISÃO E ENCERRAMENTO — encerramento pela Empresa (cancelamento) e pela Plataforma (violação dos termos, inadimplência prolongada, exigência legal); efeitos: despublicação do catálogo, perda de acesso ao painel; prazo em que os dados permanecem recuperáveis e política de eliminação após esse prazo.
16. DISPOSIÇÕES GERAIS E FORO — independência das cláusulas, ausência de vínculo societário, comunicações por e-mail, lei brasileira aplicável e foro da comarca de Santa Cruz do Capibaribe - PE.

PROIBIÇÕES DE CONTEÚDO: não prometa nada que o sistema não faz — sem SLA numérico, sem "suporte 24/7", sem "backup diário", sem API pública para clientes, sem app mobile, sem multi-usuário por empresa. Se um fato não estiver no código lido acima, ele não entra no documento.

As strings a seguir precisam aparecer LITERALMENTE (a verificação depende delas, e cada uma é um dado real ou um valor do código): `David Rafael de Lima Sousa`, `59.111.718/0001-06`, `Santa Cruz do Capibaribe`, `davidsoudev@gmail.com`, `R$ 29,90` (espaço normal, não non-breaking), `14 dias`, `10 dias`, `Asaas`, `LGPD`.
  </action>
  <verify>
    <automated>node --input-type=module -e 'import {readFileSync} from "node:fs"; const p=".planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt"; const t=readFileSync(p,"utf8"); const e=[]; for (const s of ["David Rafael de Lima Sousa","59.111.718/0001-06","Santa Cruz do Capibaribe","davidsoudev@gmail.com","R$ 29,90","14 dias","10 dias","Asaas","LGPD"]) if(!t.includes(s)) e.push("faltando: "+s); for (const s of ["[","]","**","#","|","TEXTO PROVISORIO"]) if(t.includes(s)) e.push("proibido: "+s); const secoes=(t.match(/^\d+\.\s+[A-ZÁÂÃÉÊÍÓÔÕÚÇ]/gm)||[]).length; if(secoes<14) e.push("secoes numeradas de topo: "+secoes+" (<14)"); if(t.trim().length<10000||t.trim().length>200000) e.push("tamanho fora da faixa: "+t.trim().length); if(e.length){console.error(e.join("\n"));process.exit(1);} console.log("ok "+t.trim().length+" caracteres, "+secoes+" secoes");'</automated>
  </verify>
  <done>O arquivo existe, tem entre 10.000 e 25.000 caracteres, 16 seções numeradas, contém os dados reais exatos, não contém colchete/markdown/placeholder, e cobre as 16 seções da lista sem prometer funcionalidade inexistente.</done>
</task>

<task type="auto">
  <name>Task 2: Script de publicação por HTTP, seguro por padrão</name>
  <files>scripts/publicar-termos.ts, package.json</files>
  <action>
Crie `scripts/publicar-termos.ts` seguindo o idioma já estabelecido por `scripts/seed-superadmin.ts` e `scripts/registrar-webhook-asaas.ts` (leitura de `--chave valor` sobre `process.argv` sem parser instalado, `falhar()` com prefixo de log, `principal().catch(...)`). Zero pacote novo: `fetch` é global no Node 22 e `node:fs/promises` basta.

REGRA ESTRUTURAL, e ela é o ponto do arquivo: **o script NÃO importa `@/lib/prisma` nem nenhum service.** Ele fala HTTP e só HTTP. Um script que escrevesse direto no banco contornaria a autorização por role revalidada de `POST /api/termos` (D-06) e reabriria justamente o caminho que `termo.service.ts` fecha — publicar tem que passar pela superfície real, que é a única auditável. É a mesma decisão que `e2e/helpers.ts` registra ao escolher o endpoint real em vez de um INSERT direto.

JSDoc de cabeçalho, cobrindo: por que existe (D-04 — não há e não deve haver tela de superadmin; quem publica usa script), por que INSERT e nunca UPDATE (D-07 / TERM-03: o texto da v1 é a prova de qual documento quem aceitou realmente viu), e por que roda pelo `resolvedor-ts.mjs` (mesmo leitor de `.env` da aplicação).

ARGUMENTOS:
- `--arquivo <caminho>` (obrigatório) — caminho do `.txt` a publicar.
- `--email <email>` e `--senha <credencial>` (obrigatórios fora de `--dry-run`) — credenciais do SUPERADMIN. Nunca lidas de variável de ambiente, nunca com valor embutido, pelo mesmo motivo registrado em `seed-superadmin.ts` (T-06-25): é uma operação rara, e um segredo permanente no `.env` para isso é dívida à toa.
- `--url <base>` (default `http://localhost:3000`). **Não** caia para `APP_BASE_URL`: aquela variável aponta para a origem pública da aplicação, e usá-la como default faria o comando mais curto ser o mais perigoso.
- `--confirmar` — exigido para qualquer host que não seja `localhost`/`127.0.0.1`.
- `--dry-run` — valida arquivo e destino, não faz nenhuma chamada HTTP.
- Uso impresso em `imprimirUso()` quando faltar argumento obrigatório.

ORDEM DE EXECUÇÃO (as guardas vêm antes de qualquer I/O de rede):
1. Ler o arquivo (`readFile` utf8) e aplicar `.trim()` — o mesmo trim que o zod da rota aplica, para que o que é medido aqui seja o que será gravado lá.
2. Recusar: vazio depois do trim; comprimento acima de 200.000 (repita o número com um comentário apontando para `app/api/termos/route.ts` como fonte — a duplicação é consciente, o script não importa código de produção); conteúdo que contenha `[TEXTO PROVISORIO` (republicar o placeholder como versão nova é o pior desfecho possível desta ferramenta).
3. Guarda de destino: `new URL(base)`; se o host não for `localhost` nem `127.0.0.1`, exigir `--confirmar` E exigir `https:` — as credenciais do SUPERADMIN viajam no corpo do login, e mandá-las em texto claro para um host remoto seria vazá-las (mesmo raciocínio do check de https em `registrar-webhook-asaas.ts`). Mensagem de recusa nomeia o host, para o operador ver contra o que quase publicou.
4. Se `--dry-run`: imprimir caminho, número de caracteres, número de linhas e o destino; encerrar com "nada foi publicado" e código 0. **Nunca imprimir o corpo do texto.**
5. `POST ${base}/api/auth/login` com `{ email, senha }`. Esperar 200 e ler `{ token }`. Em 401, mensagem acionável citando `npm run seed:superadmin -- --email <email> --senha <credencial>`. Em qualquer outro status, falhar informando o status.
6. `POST ${base}/api/termos` com `authorization: Bearer <token>`, `content-type: application/json`, corpo `{ conteudo }`. Esperar 201.
7. Traduzir os status de erro conhecidos da rota em mensagens acionáveis: 400 corpo inválido; 401 sessão inválida; 403 a conta autenticada não é SUPERADMIN (lembrando que a role vem do banco, não do token — rebaixar a conta invalida na hora); 409 outra publicação ocorreu em paralelo, basta rodar de novo; demais status, mensagem genérica com o código.
8. Saída de sucesso no formato das outras ferramentas do projeto: prefixo `[termos:publicar]`, e as linhas `id`, `versao`, `publicadoEm`, `alvo`, `caracteres`.

SEGREDOS: nunca imprima `--senha`, nunca imprima o token (nem truncado), nunca ecoe o corpo do texto. Não grave nada em arquivo.

`package.json`: acrescente ao bloco `scripts`, junto das outras entradas do mesmo formato, `"termos:publicar": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/resolvedor-ts.mjs scripts/publicar-termos.ts"`. Nenhuma dependência é adicionada.

PROIBIDO nesta task: qualquer alteração em `app/`, `lib/`, `prisma/` ou `e2e/`. Nada lá precisa mudar — o endpoint, o service e o gate já existem e já estão provados por 1153 testes unitários e 32 e2e.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm run termos:publicar -- --arquivo .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt --dry-run && bash -c '! npm run termos:publicar -- --arquivo .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt --url https://exemplo.invalido --dry-run' && test -z "$(git diff --name-only HEAD -- app lib prisma e2e)" && echo "guardas ok"</automated>
  </verify>
  <done>`npm run termos:publicar -- --arquivo <txt> --dry-run` sai 0 e reporta o tamanho; o mesmo comando com `--url https://exemplo.invalido` sem `--confirmar` sai diferente de 0; `tsc` e `lint` limpos; `git diff` não mostra nenhum arquivo em `app/`, `lib/`, `prisma/` ou `e2e/`.</done>
</task>

<task type="auto">
  <name>Task 3: Publicar contra a instância local e provar que a v1 continua intacta</name>
  <files>.planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/260905-eqn-SUMMARY.md</files>
  <action>
Execute a publicação de verdade contra o ambiente LOCAL e prove os dois invariantes que importam: o texto chegou byte a byte, e a v1 não foi tocada.

1. Garanta o SUPERADMIN local (idempotente por email): `npm run seed:superadmin -- --email superadmin-e2e@teste.com --senha senha-e2e-descartavel`. Essas são as credenciais descartáveis já versionadas em `e2e/helpers.ts` (`SUPERADMIN_E2E`) — não invente outras nem gere um segundo tenant interno. Se o comando falhar por conexão recusada, **PARE e reporte que o Postgres local não está no ar** (o STATE.md registra um histórico de conflito de porta 5432 com outro projeto). Não simule, não estime, não invente número nenhum.

2. Suba `npm run dev` em background e espere `http://localhost:3000` responder antes de seguir.

3. Antes de publicar, capture o estado atual do banco com um script TEMPORÁRIO fora do repositório — `/tmp/verificar-termos.mjs`, executado por `node --import ./scripts/resolvedor-ts.mjs /tmp/verificar-termos.mjs` a partir da raiz do projeto (o resolvedor mapeia `@/` para a raiz e carrega o `.env` da aplicação). Ele importa `@/lib/prisma`, lê todas as linhas de `TermoDeUso` e imprime, por linha: `versao`, `publicadoEm`, o comprimento de `conteudo` e o `sha256` do `conteudo`; e, para a v1 especificamente, se o texto ainda começa com `[TEXTO PROVISORIO`. Ele é somente-leitura: nenhuma escrita, nenhum `update`, nenhum `delete`. Não versione este arquivo e apague-o no fim.

4. Publique: `npm run termos:publicar -- --arquivo .planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/termos-de-uso-v2.txt --email superadmin-e2e@teste.com --senha senha-e2e-descartavel`. Sem `--url` — o default localhost é o alvo correto.

5. Rode `/tmp/verificar-termos.mjs` de novo e confira as três afirmações:
   (a) existe exatamente UMA linha nova em relação à captura do passo 3;
   (b) o `sha256` do `conteudo` da linha nova é igual ao `sha256` do arquivo depois de `.trim()` — é o que prova o round-trip byte a byte, acentos inclusive;
   (c) a linha da v1 tem `sha256` e comprimento IDÊNTICOS aos do passo 3 e continua começando com `[TEXTO PROVISORIO` — publicar foi INSERT, não UPDATE (D-07).

6. **A versão criada localmente provavelmente NÃO será 2.** `e2e/aceite-de-termos.spec.ts` publica versões a cada rodada da suíte, então o banco de desenvolvimento já pode estar em v5, v12 etc. Isso é esperado e não é defeito: o nome do arquivo diz "v2" porque no banco de PRODUÇÃO existe apenas a v1 da migration. Registre o número real obtido; não "conserte" nada para ele virar 2.

7. Derrube o dev server, apague `/tmp/verificar-termos.mjs` e rode `npm run gates:fase-06` para confirmar que nenhuma invariante da Fase 6 foi arranhada.

8. Escreva o SUMMARY. Além do relato padrão, ele DEVE conter, em seção própria e destacada:
   - **Aviso de autoria por IA, escrito sem eufemismo:** o texto dos Termos de Uso foi redigido por IA a partir das regras de negócio implementadas no código, e não foi revisado por advogado. Nomeie os pontos de maior exposição, que são exatamente os que um advogado precisa olhar: a cláusula de limitação de responsabilidade frente ao CDC (limitações contratuais podem ser inválidas em relação de consumo); o bloqueio "sem exceções" após a carência e a ausência de reembolso do período corrente no cancelamento (o próprio STATE.md já lista "revisão jurídica (CDC) sobre bloqueio e não-cobrança retroativa" como pendência aberta); e a atribuição de papéis controlador/operador na seção de LGPD. Diga com todas as letras que revisão jurídica antes do go-live é recomendada e que este plano não a substitui.
   - **O que ainda falta:** a publicação em PRODUÇÃO é ação do operador e não foi feita aqui. O comando é o mesmo com destino explícito e confirmação: `npm run termos:publicar -- --arquivo <caminho> --email <email-do-superadmin-de-producao> --senha <credencial-forte> --url https://<host-de-producao> --confirmar`. O SUPERADMIN de produção precisa existir antes (`npm run seed:superadmin`, com credencial forte, nunca a descartável de dev). Enquanto isso não acontecer, o bloqueador do STATE.md ("texto jurídico da v1 ainda é o placeholder") continua aberto — e o SUMMARY deve dizer isso explicitamente, em vez de dar a tarefa por encerrada.
   - **Efeito da publicação:** todo usuário com aceite da versão anterior é levado à tela `/{slug}/admin/aceitar-termos` no próximo request autenticado, inclusive pela API REST (403 "Termos de uso pendentes de aceite"). É o comportamento pretendido de TERM-04, não um efeito colateral — e é a razão de publicar em produção ser uma decisão consciente de quando, não um detalhe de deploy.
  </action>
  <verify>
    <automated>npm run gates:fase-06 && test -z "$(git diff --name-only HEAD -- app lib prisma e2e)" && test ! -f /tmp/verificar-termos.mjs && echo "publicacao local verificada"</automated>
  </verify>
  <done>Uma versão nova existe no banco local com sha256 igual ao do arquivo (trimado); a linha da v1 permanece byte a byte a original com o placeholder; `gates:fase-06` verde; nenhum arquivo de `app/`, `lib/`, `prisma/` ou `e2e/` modificado; script temporário removido; SUMMARY escrito com o aviso de autoria por IA e com a pendência de publicação em produção declarada.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| script (host do operador) → `POST /api/auth/login` | credenciais do SUPERADMIN saem da linha de comando e viajam pela rede |
| script → `POST /api/termos` | conteúdo controlado pelo operador entra num documento legal que todos os usuários serão obrigados a aceitar |
| arquivo `.txt` versionado → banco de produção | texto que vira registro de consentimento imutável |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-Q-01 | Information Disclosure | credenciais em `argv` e em logs | mitigate | script nunca imprime `--senha`, o token nem o corpo do texto; credencial descartável em dev (`SUPERADMIN_E2E`) e credencial forte só em produção; nada é gravado em arquivo |
| T-Q-02 | Information Disclosure | login contra host remoto em HTTP simples | mitigate | destino não-localhost exige `https:`; recusa nomeando o host antes de qualquer chamada |
| T-Q-03 | Tampering | publicar contra o ambiente errado (produção por engano) | mitigate | default `http://localhost:3000`, `--confirmar` obrigatório fora de localhost, e recusa explícita de cair para `APP_BASE_URL` |
| T-Q-04 | Tampering | republicar o placeholder ou texto vazio como versão nova | mitigate | guarda de conteúdo no script (trim + não-vazio + teto 200.000 + recusa de `[TEXTO PROVISORIO`) e verificação de strings obrigatórias na Task 1 |
| T-Q-05 | Repudiation | alguém "corrigir" a v1 por UPDATE, destruindo a prova de qual texto foi aceito | mitigate | script só faz POST, não importa Prisma nem service; Task 3 compara sha256 da v1 antes e depois; ausência de `update`/`delete` em `termo.service.ts` continua coberta por `gates:fase-06` |
| T-Q-06 | Elevation of Privilege | contornar a autorização por role revalidada escrevendo direto no banco | mitigate | proibição explícita de importar `@/lib/prisma` no script; a publicação passa por `revalidarConta` na rota, como o e2e já faz |
| T-Q-07 | Information Disclosure | script temporário de verificação vazar para o repositório | mitigate | vive em `/tmp`, é somente-leitura e é apagado ao fim; a verificação da Task 3 falha se o arquivo ainda existir |
| T-Q-SC | Tampering | supply chain | accept | nenhum pacote é instalado: `fetch` global do Node 22, `node:fs/promises` e `node:crypto`. Sem instalação, o gate de legitimidade de pacote não se aplica |
</threat_model>

<verification>
- `npx tsc --noEmit` sem erro (o `tsconfig.json` inclui `**/*.ts`, portanto `scripts/` é verificado).
- `npm run lint` sem erro.
- `npm run gates:fase-06` verde.
- `git diff --name-only HEAD` mostra apenas: `scripts/publicar-termos.ts`, `package.json` e arquivos sob `.planning/`.
- `npm test` e `npm run test:e2e` não são exigidos por esta task: nenhum arquivo de produção é tocado e `e2e/aceite-de-termos.spec.ts` publica versões dinamicamente, afirmando sobre `novo.versao` — publicar uma versão local não altera o que a suíte espera.
</verification>

<success_criteria>
- O texto real e completo dos Termos de Uso existe versionado, em texto puro, cobrindo as 16 seções e os dados reais do responsável, sem placeholder e sem colchete.
- `npm run termos:publicar` publica com um comando, recusa destino remoto sem confirmação e recusa HTTP simples fora de localhost.
- Uma versão nova foi publicada no banco local pela superfície REST real, com conteúdo idêntico (sha256) ao arquivo.
- A linha da v1 permanece byte a byte a original — a imutabilidade de D-07 foi verificada, não assumida.
- O SUMMARY carrega o aviso de autoria por IA com os pontos concretos que exigem advogado, e declara que a publicação em produção continua pendente.
</success_criteria>

<output>
Crie `.planning/quick/260905-eqn-publicar-texto-real-dos-termos-de-uso-su/260905-eqn-SUMMARY.md` ao terminar, com as três seções obrigatórias descritas no passo 8 da Task 3.
</output>

## Auditoria de Cobertura das Fontes

Não há ROADMAP/REQUIREMENTS/RESEARCH/CONTEXT para uma quick task; as fontes são o objetivo declarado, as constraints do brief e os invariantes já registrados no código e no STATE.md.

| Fonte | Item | Status | Onde |
|-------|------|--------|------|
| GOAL | Publicar o texto real como v2 via `POST /api/termos`, nunca por UPDATE da v1 | COVERED | Task 2 (script HTTP), Task 3 (execução + prova de imutabilidade) |
| CONSTRAINT | Entregável (a): texto jurídico completo em português, versionado em `.planning/` | COVERED | Task 1 |
| CONSTRAINT | Entregável (b): script utilitário no padrão de `seed-superadmin.ts`, com o leitor de env do projeto | COVERED | Task 2 |
| CONSTRAINT | Sem alteração de código de produção em `app/`/`lib/` | COVERED | Proibição explícita na Task 2 e gate `git diff` nas Tasks 2 e 3 |
| CONSTRAINT | Cobertura temática do texto (objeto, cadastro, R$ 29,90/Asaas/PCI, trial 14d, carência 10d + bloqueio, reativação sem retroativo, cancelamento, isolamento multi-tenant, LGPD, obrigações, limitação, alteração com novo aceite, rescisão, foro) | COVERED | Task 1, seções 1–16 |
| CONSTRAINT | Dados reais (nome, CNPJ, foro, contato) sem invenção | COVERED | Task 1 + verificação por string literal |
| CONSTRAINT | Aviso não-perfunctório de autoria por IA no SUMMARY | COVERED | Task 3, passo 8 |
| CONSTRAINT | Script seguro por padrão (confirmação fora de localhost, senha nunca versionada/logada) | COVERED | Task 2, guardas 3 e 5–8; T-Q-01..T-Q-03 |
| CONSTRAINT | Nenhuma migration nova | COVERED | Nenhuma task toca `prisma/`; verificado por `git diff` |
| STATE.md | Bloqueador "texto jurídico da v1 ainda é placeholder" | PARCIAL — permanece aberto até a publicação em PRODUÇÃO, que é ação do operador | Declarado explicitamente no SUMMARY (Task 3, passo 8) |
