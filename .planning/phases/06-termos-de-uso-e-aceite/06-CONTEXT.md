# Phase 6: Termos de Uso e Aceite - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Ninguém usa a plataforma sem ter aceitado a versão vigente dos termos de uso, e só a plataforma (não os admins de empresa) pode publicar uma nova versão. Cobre TERM-01 a TERM-04:

1. O cadastro em `/registro` só conclui depois de o usuário aceitar os termos vigentes.
2. Um novo papel `SUPERADMIN` (distinto do `ADMIN` por empresa) é o único autorizado a publicar nova versão dos termos, via endpoint.
3. Termos são versionados de forma imutável; cada aceite de um `Usuario` fica registrado contra a versão específica vista, com data/hora.
4. Se a versão vigente for mais recente que o último aceite do usuário, um modal/gate obrigatório bloqueia o uso do admin até aceitar — mas permite sair/deslogar.

Fora do escopo: UI de gestão de assinatura (Fase 7), qualquer UI de superadmin além do endpoint de publicação (decisão desta discussão — ver D-04), ativação de `acessoVitalicio` pela UI (fora do milestone inteiro).

</domain>

<decisions>
## Implementation Decisions

### Papel SUPERADMIN e modelo de dados
- **D-01:** `Usuario` hoje exige `empresaId` obrigatório e é único por empresa (`@@unique([empresaId])`) — não existe conceito de usuário "sem empresa" no schema atual. O papel `SUPERADMIN` **não** força mudança nesse modelo: uma empresa interna/dedicada da plataforma é criada (seed, direto no banco — mesmo espírito de `acessoVitalicio` hoje, sem UI) e o usuário `SUPERADMIN` é um `Usuario` normal dentro dela, com `role: SUPERADMIN`. Login segue o fluxo padrão (`/{slug-interno}/admin/login`), sem rota nova de autenticação.
- **D-02:** A empresa interna que hospeda o `SUPERADMIN` recebe `acessoVitalicio: true` no seed — do contrário ela teria trial/carência/bloqueio como qualquer tenant normal, e o próprio superadmin ficaria bloqueado por "falta de pagamento" fictícia. Nenhuma lógica nova: reaproveita o campo que já tem precedência absoluta em `avaliarAcesso` (Fase 2, D-03).
- **D-03:** O `SUPERADMIN` fica **isento** do gate obrigatório de aceite de termos (TERM-04/D-08 abaixo) — como é ele quem publica a versão vigente, exigir que aceite a própria publicação antes de conseguir usar o admin é um caso degenerado sem valor. Isso exige um caso especial explícito no código do gate (checar `role === SUPERADMIN` e pular), documentado como tal — não é a regra geral silenciosamente ignorada.

### Publicação de termos (TERM-02) — só API, sem UI
- **D-04:** Esta fase constrói **apenas o endpoint** de publicação (`POST` ou similar, protegido por `role: SUPERADMIN`) — nenhuma tela de admin para escrever/editar o texto. Mesmo padrão de `acessoVitalicio`: quem publica usa curl/Postman/script. UI de superadmin fica para uma fase futura se a operação em produção mostrar necessidade.
- **D-05:** O conteúdo do termo é **texto puro** (string simples), não Markdown/HTML. Renderizado preservando quebras de linha (`white-space: pre-wrap`). Evita risco de XSS por HTML não sanitizado e não introduz dependência nova de parser/renderer de Markdown no projeto.
- **D-06:** Um `ADMIN` comum (de qualquer empresa) que tentar chamar o endpoint de publicação recebe negação — consistente com o critério de sucesso #2 do roadmap. Segue o padrão de erro já estabelecido (`AuthError`/`HttpError` com `.status`), sem novo formato de resposta.

### Versionamento imutável (TERM-03)
- **D-07:** Cada publicação cria uma **nova linha** imutável (nunca `UPDATE` numa versão existente) — a versão vigente é a mais recente por data de publicação. Cada aceite (`Usuario` × versão) fica registrado com data/hora, análogo ao padrão de auditoria já usado em `AuditoriaAcesso` (Fase 2): tabela de fatos, nunca reescrita.

### Gate obrigatório no admin (TERM-04)
- **D-08:** Segue o **mesmo padrão estabelecido na Fase 4** para bloqueio total: `requireAdminSession` (ou ponto equivalente) faz o `redirect()` para uma rota dedicada (ex: `/{slug}/admin/aceitar-termos`) quando `role !== SUPERADMIN` e o último aceite do usuário é anterior à versão vigente — **não** um modal client-side sobreposto na página. Motivo explícito da Fase 4 (`lib/session.ts` docblock, `requireAdminSession`): um layout não é boundary de autorização — segmentos filhos continuam saindo no RSC Payload mesmo com um modal por cima, então o gate de verdade precisa acontecer antes do render da página, não depois. A rota dedicada fica **fora** do grupo `(protected)` (mesmo motivo do `/admin/bloqueado` da Fase 4: entrar nela não pode disparar a própria guarda que redirecionou para lá, senão é loop de redirect).
- **D-09:** A rota dedicada de aceite tem: o texto completo da versão vigente, um botão de aceitar (Server Action que grava o aceite e redireciona de volta para o admin) e uma opção de logout — para o usuário não ficar preso sem conseguir sair, exatamente como o critério de sucesso #4 do roadmap exige.
- **D-10:** Depois de aceitar, o usuário volta para o admin (home ou a página que estava tentando acessar — decisão de implementação do planner, sem preferência forte do usuário).

### Fluxo de registro (TERM-01)
- **D-11:** Checkbox obrigatório "Li e aceito os Termos de Uso" no formulário de `/registro` (mesmo componente `RegisterForm`), com um link ou modal que mostra o texto completo da versão vigente sem sair da tela — não texto inline na página nem rota separada obrigatória. Sem aceite marcado, o registro não é submetido (validação client-side) e o backend também recusa (`empresaService.registerComUsuario` ou a Server Action `register`) se o aceite não vier — mesma disciplina de "nunca confiar só no client" já usada nas outras validações de `app/registro/actions.ts`.
- **D-12:** O aceite registrado no registro é contra a versão vigente **no momento do cadastro** — se não houver nenhuma versão de termos publicada ainda (banco vazio), é uma condição de borda que o planner/pesquisa precisa resolver (ex: seed obrigatório de uma v1 dos termos antes do registro funcionar, ou erro claro). Não decidido nesta discussão — fica para pesquisa.

### Claude's Discretion
- Nome exato do endpoint de publicação (ex: `POST /api/termos`) e da tabela/modelo Prisma (`Termo`/`TermoDeUso`, `AceiteTermos`) — seguir convenção já usada (`Empresa`, `AuditoriaAcesso`).
- Exato shape do texto do link/modal no registro (D-11) — componente novo vs. reaproveitar algum padrão existente de modal, se houver.
- Onde exatamente a checagem de aceite pendente entra no fluxo de sessão (dentro de `requireAdminSession` vs. um wrapper novo) — desde que a rota dedicada (D-08) fique fora do grupo `(protected)` e o gate rode antes do render da página, nunca depois.
- Nome exato da rota de aceite (`/aceitar-termos`, `/termos-pendentes`, etc.).
- Estratégia de seed da empresa interna do SUPERADMIN (script separado vs. migration com dado) — desde que D-01/D-02 sejam respeitados.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/ROADMAP.md` §"Phase 6: Termos de Uso e Aceite" — goal e 4 success criteria.
- `.planning/REQUIREMENTS.md` §TERM-01 a TERM-04 — texto completo dos requisitos.
- `.planning/PROJECT.md` §"Active" (linhas 41-44) e §"Constraints" (linha 74: "status de pagamento é por Empresa; aceite de termos é por Usuario — não confundir os dois escopos").

### Pontos de extensão e padrões já estabelecidos
- `lib/session.ts` (`requireAdminSession`, linha ~124) — padrão de gate por `redirect()` fora do grupo `(protected)`, com o docblock completo explicando por que layout não é boundary de autorização (cita `node_modules/next/dist/docs/01-app/02-guides/authentication.md`). Este é o modelo direto para o gate de TERM-04 (D-08).
- `lib/auth-guard.ts` (`revalidarConta`, `ContaAtiva`) — padrão de `React.cache()` por request e de projetar dados frescos do banco (role, status) sem re-derivar do JWT; o campo de "último aceite" do usuário deveria seguir o mesmo caminho de leitura.
- `app/[slug]/admin/(protected)/layout.tsx` — comentário normativo no topo do arquivo repetindo por que o layout não pode ser o boundary; não inserir o gate de termos aqui.
- `.planning/phases/04-aplica-o-do-bloqueio/04-CONTEXT.md` §D-04, §D-09 — padrão de tela de bloqueio total (banner + CTA + logout) que a rota de aceite de termos (D-09) replica para o caso "termos pendentes" em vez de "assinatura suspensa".
- `prisma/schema.prisma` — modelo `Usuario` atual (`role: UserRole @default(ADMIN)`, `@@unique([empresaId])`) e enum `UserRole` (hoje só `ADMIN`) — precisa de migration adicionando `SUPERADMIN` ao enum.
- `app/registro/actions.ts` + `app/registro/_components/register-form.tsx` — Server Action e formulário de registro onde o checkbox de aceite (D-11) entra; mesmo padrão de validação dupla (client `required` + backend recusa) já usado para email/senha.
- `app/services/empresa.service.ts` (`registerComUsuario`, transação com `Usuario`) — ponto onde o aceite do registro deveria ser gravado na mesma transação que cria `Empresa`+`Usuario` (mesmo padrão da Fase 2 para o trial inicial).
- `.planning/phases/02-modelo-de-dados-e-motor-de-acesso/02-CONTEXT.md` §D-03 — precedência de `acessoVitalicio`, reaproveitada para a empresa interna do SUPERADMIN (D-02).

### Ausências confirmadas (para o planner não perder tempo procurando)
- Não existe nenhum modelo `Termo`/`AceiteTermos` no schema hoje — schema novo.
- Não existe papel `SUPERADMIN` no enum `UserRole` hoje (só `ADMIN`) — migration nova.
- Não existe nenhuma checagem de `role` em `requireAuth`/`requireAdminSession` hoje — esta fase introduz o primeiro uso de `role` para autorização (além do valor default).
- Não existe componente de modal reutilizável no projeto hoje (confirmado na Fase 4) — se o link/modal de termos no registro (D-11) precisar de modal, esta fase pode estabelecer o primeiro, ou usar um `<details>`/expansível simples.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Padrão de `redirect()` fora do grupo `(protected)` + docblock explicativo (`lib/session.ts`) — reusar a mesma técnica e justificar a rota de aceite do mesmo jeito.
- Padrão de erro (`HttpError`/`AuthError` com `.status`) para negar `ADMIN` comum no endpoint de publicação (D-06).
- Transação Prisma em `app/registro/actions.ts`/`empresaService.registerComUsuario` — ponto de extensão natural para gravar o primeiro aceite atomicamente com a criação da conta.

### Established Patterns
- Enum Prisma para valores fechados (`UserRole`, `StatusAcesso`, `CausaTransicaoAcesso`) — `SUPERADMIN` deve entrar como valor de `UserRole`, não um campo booleano separado.
- Tabela de fatos imutável, nunca reescrita (`AuditoriaAcesso`) — modelo direto para a tabela de aceites de termos (D-07).
- `select` explícito (nunca `include`) para nunca vazar `senhaHash` — qualquer query nova envolvendo `Usuario` (ex: checar último aceite) deve seguir o mesmo projeto de campos.

### Integration Points
- `prisma/schema.prisma` — novo enum value `SUPERADMIN`, novos modelos `Termo`/`AceiteTermos` (nomes exatos: discrição do Claude).
- `lib/session.ts` (`requireAdminSession`) — ponto onde o gate de termos pendentes entra, análogo ao gate de bloqueio de assinatura já existente ali.
- `app/registro/actions.ts` + `register-form.tsx` — checkbox de aceite obrigatório no fluxo de cadastro.
- Novo endpoint `app/api/termos/**/route.ts` (nome exato: discrição do Claude) — publicação de nova versão, protegido por `role: SUPERADMIN`.
- Nova rota `app/[slug]/admin/aceitar-termos/**` (nome exato: discrição do Claude) — fora do grupo `(protected)`, mesmo padrão de `admin/bloqueado`.

</code_context>

<specifics>
## Specific Ideas

- O gate de termos pendentes deve seguir EXATAMENTE o padrão de arquitetura que a Fase 4 já validou (redirect para rota dedicada fora de `(protected)`) — não uma solução nova ou mais simples (modal overlay), mesmo sendo mais rápida de implementar, porque reintroduziria o problema de segurança que a Fase 4 documentou e resolveu deliberadamente.
- SUPERADMIN é modelado como "só mais um Usuario, numa empresa especial" — não uma entidade separada no schema. Mantém `empresaId` obrigatório sem exceção em nenhuma query existente.

</specifics>

<deferred>
## Deferred Ideas

- Tela de admin para o SUPERADMIN escrever/editar o texto dos termos (UI de publicação) — descartada para esta fase (D-04); pode virar fase futura se depender de Postman/curl em produção mostrar-se inviável na prática.
- Suporte a Markdown/HTML formatado no texto dos termos — descartado para esta fase (D-05); revisitar se o texto puro se mostrar insuficiente para os termos reais da plataforma.
- Rota de autenticação separada para SUPERADMIN (fora do fluxo `/{slug}/admin/login`) — descartada (D-01); o modelo de "empresa interna" evita essa complexidade.

</deferred>

---

*Phase: 6-Termos de Uso e Aceite*
*Context gathered: 2026-09-02*
