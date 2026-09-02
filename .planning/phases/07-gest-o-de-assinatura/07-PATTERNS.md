# Phase 7: Gestão de Assinatura — Pattern Map

**Mapped:** 2026-09-02
**Source:** `07-CONTEXT.md` (decisões travadas) + `07-RESEARCH.md` (§ Recommended Project Structure)
**Purpose:** para cada arquivo a criar/modificar, o análogo existente no repositório, o excerto concreto a copiar e as invariantes que o excerto carrega.

---

## Índice de arquivos → análogo

| # | Arquivo alvo | Papel | Fluxo de dados | Análogo existente |
|---|--------------|-------|----------------|-------------------|
| 1 | `lib/billing/asaas/tipos.ts` (MOD) | Contrato de tipo do gateway | — | `AsaasCheckout` / `AsaasSubscription` no mesmo arquivo |
| 2 | `lib/billing/asaas/client.ts` (MOD) | Adapter HTTP | saída de rede | `buscarAssinatura(id)` (`client.ts:162-164`) |
| 3 | `lib/billing/asaas/client.test.ts` (MOD) | Teste de adapter | — | `describe("autenticação e transporte")` (`client.test.ts:64-90`) |
| 4 | `lib/avaliar-acesso.ts` (MOD) | Regra de negócio pura | in-memory | `diasRestantesDeCarencia` (`avaliar-acesso.ts:181-193`) |
| 5 | `lib/avaliar-acesso.test.ts` (MOD) | Teste de função pura | — | casos existentes de `avaliarAcesso` |
| 6 | `app/services/assinatura.service.ts` (MOD) | Orquestração gateway+DB | rede → DB | `criarCheckout` (`assinatura.service.ts:37-118`) |
| 7 | `app/services/assinatura.service.test.ts` (MOD) | Teste de service | — | "D-07: quando o Asaas rejeita, NENHUMA linha é gravada" (`:114-128`) |
| 8 | `app/[slug]/admin/(protected)/assinatura/page.tsx` (NEW) | RSC de seção do admin | DB+rede → UI | `(protected)/marca/page.tsx` |
| 9 | `app/[slug]/admin/(protected)/assinatura/actions.ts` (NEW) | Server Action de mutação | UI → service | `_lib/assinatura-actions.ts` (`iniciarPagamento`) |
| 10 | `.../assinatura/_components/assinatura-card.tsx` (NEW) | Server component de apresentação | props → UI | `bloqueado/_components/bloqueado-card.tsx`, `_components/aviso-carencia.tsx` |
| 11 | `.../assinatura/_components/cancelar-dialog.tsx` (NEW) | Client component, confirmação 2 cliques | UI local + action | `_components/simples/confirmar-remocao.tsx` + `combo-hub.tsx:93-119` |
| 12 | `app/[slug]/admin/_lib/assinatura-actions.ts` (MOD) | Server Action de leitura (polling) | UI → `revalidarConta` | `iniciarPagamento` no mesmo arquivo |
| 13 | `app/[slug]/admin/_components/poller-de-status.tsx` (NEW) | Client component de polling | timer → action | `combo-hub.tsx` (`useTransition` + `router.refresh()`) |
| 14 | `app/[slug]/admin/(protected)/_components/admin-nav.tsx` (MOD) | Navegação | — | `ICONS` + `buildNavItems` (`admin-nav.tsx:7-34`) |
| 15 | `app/[slug]/admin/bloqueado/_components/bloqueado-card.tsx` (MOD) | Montagem do poller no retorno de checkout | — | o próprio arquivo (`:96-98`, form + `PagarButton`) |
| 16 | `e2e/cancelamento-de-assinatura.spec.ts` (NEW) | E2E | — | `e2e/bloqueio-por-inadimplencia.spec.ts` |

---

## 1. `lib/billing/asaas/tipos.ts` — novo tipo de resposta

**Papel:** contrato de tipo. **Análogo:** `AsaasCheckout` (mesmo arquivo, linhas 11-16).

A regra normativa está no cabeçalho do arquivo e é o que o novo tipo precisa respeitar:

```typescript
/**
 * REGRA (GTW-01, T-03-08): declarar apenas os campos efetivamente usados, nunca
 * o DTO inteiro do fornecedor. ... Nada disso tem tipo aqui, e sem tipo não
 * existe caminho acidental para persistência ou para um log.
 */

/** Resposta de `POST /checkouts`. `link` pode vir nulo (Open Question #1). */
export interface AsaasCheckout {
  id: string;
  link: string | null;
  status: string;
}
```

**Aplicar:** `AsaasAssinaturaRemovida { deleted: boolean; id: string }` — exatamente 2 campos, com JSDoc de uma linha nomeando o endpoint. Nada de `dateCreated`, `customer`, `value`.

---

## 2. `lib/billing/asaas/client.ts` — `removerAssinatura(id)`

**Papel:** adapter HTTP. **Análogo literal:** os métodos de uma linha da mesma classe.

```typescript
  async buscarPagamento(id: string): Promise<AsaasPayment> {
    return chamar<AsaasPayment>(`/payments/${id}`);
  }

  async buscarAssinatura(id: string): Promise<AsaasSubscription> {
    return chamar<AsaasSubscription>(`/subscriptions/${id}`);
  }
```

**Invariantes carregadas pelo `chamar()` (linhas 61-110) — não reimplementar:**
- header `access_token` (não `Authorization`) e `Content-Type` já injetados;
- `AbortSignal.timeout(15_000)` obrigatório (T-03-09);
- corpo de erro truncado em 500 chars no log (T-03-07);
- não-2xx vira `AsaasApiError(msg, status, codigos)` — é o `status` que o service inspeciona por `instanceof`.

**Aplicar:**
```typescript
async removerAssinatura(id: string): Promise<AsaasAssinaturaRemovida> {
  return chamar<AsaasAssinaturaRemovida>(`/subscriptions/${id}`, { method: "DELETE" });
}
```
O JSDuc deste método é o lugar de registrar "NÃO É IDEMPOTENTE: 404 na segunda chamada; o tratamento mora em `assinaturaService.cancelar`, não aqui — este arquivo só traduz HTTP". Precedente de JSDoc normativo em método de client: `atualizarWebhook` (`client.ts:178-182`).

**Anti-pattern a evitar (declarado no cabeçalho do arquivo):** `client.ts` é "o ÚNICO arquivo do projeto que conhece a URL, o header de autenticação e o formato de corpo do Asaas". Nenhum `fetch` novo fora dele.

---

## 3. `lib/billing/asaas/client.test.ts` — casos do novo método

**Análogo:** o harness já montado no topo do arquivo (linhas 1-62): `fetchMock` via `vi.stubGlobal`, `respostaOk`/`respostaErro`, helper `chamada(indice)` que devolve `{ url, init, headers, corpo }`, e `vi.stubEnv("ASAAS_API_URL"/"ASAAS_API_KEY")`.

```typescript
function respostaErro(status: number, corpo: string) {
  return { ok: false, status, json: async () => JSON.parse(corpo), text: async () => corpo } as unknown as Response;
}

it("envia a API key no header access_token, nunca num header de bearer", async () => {
  fetchMock.mockResolvedValue(respostaOk({ id: "pay_1", status: "CONFIRMED" }));
  await asaasClient.buscarPagamento("pay_1");
  expect(chamada().headers.access_token).toBe(API_KEY);
});
```

**Casos novos a escrever no mesmo molde:** método `DELETE`, caminho `/subscriptions/{id}`, **ausência de body** (`expect(chamada().init.body).toBeUndefined()`), e `404 → AsaasApiError` com `status === 404` (usar `respostaErro`).

---

## 4. `lib/avaliar-acesso.ts` — `acessoEfetivoAte(fatos)`

**Papel:** regra de negócio PURA. **Análogos:** `diasRestantesDeCarencia` (dono único de "dias restantes") e o próprio bloco de `Math.max` dentro de `avaliarAcesso`:

```typescript
  const candidatos = [fatos.trialFim, fatos.acessoAte].filter(
    (d): d is Date => d !== null
  );
  if (candidatos.length === 0) { ... }
  const expiraEm = new Date(Math.max(...candidatos.map((d) => d.getTime())));
```

**Contrato do arquivo a herdar:**
- função pura, sem I/O, sem ler o relógio (`avaliarAcesso` recebe `agora` por parâmetro — `acessoEfetivoAte` não precisa de relógio nenhum);
- JSDoc normativo explicando por que existe uma segunda função em vez de reusar `ResultadoAcesso.expiraEm` (D-05 faz `expiraEm` devolver `trialFim` durante o trial → Pitfall 2);
- `acessoVitalicio` tem precedência absoluta e devolve `null`, igual à regra D-03 de `avaliarAcesso:56-58`.

**Anti-pattern (declarado em `avaliar-acesso.ts:165`):** "Este é o ÚNICO lugar autorizado a calcular 'dias restantes'". Nenhum `Math.max` de datas nem formatação de prazo no componente ou na página — o precedente de disciplina é `aviso-carencia.tsx`, que é "uma função pura de um número" e explicitamente não lê relógio nem formata data.

**Escopo proibido:** nada além de acrescentar esta função. `avaliarAcesso`, `BLOQUEIA`, `acessoBloqueado`, `podePublicarCatalogo` ficam intactos (Achado 4).

---

## 5-6. `app/services/assinatura.service.ts` — `consultar()` e `cancelar()`

**Análogo literal:** `criarCheckout` (linhas 37-118). Copiar a estrutura inteira, inclusive a fronteira comentada.

```typescript
const EMPRESA_CHECKOUT_SELECT = {   // ← molde da projeção C-07
  id: true, nome: true, slug: true, trialFim: true, asaasCustomerId: true,
};

class AssinaturaService {
  async criarCheckout(empresaId: string): Promise<CheckoutCriado> {
    const empresa = await prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: EMPRESA_CHECKOUT_SELECT,
    });
    if (!empresa) throw new HttpError("Empresa não encontrada.", 404);

    try {
      checkout = await asaasClient.criarCheckout({ ... });
    } catch (erro) {
      // C-05: `status` e `empresaId` bastam. O corpo da resposta NUNCA vai ao log.
      console.error(
        `[asaas] falha ao criar checkout — empresaId=${empresaId}`,
        `status=${erro instanceof AsaasApiError ? erro.status : "desconhecido"}`
      );
      throw new HttpError("Não foi possível iniciar o pagamento. Tente novamente.", 502);
    }

    // ─── FRONTEIRA D-07 ───────────────────────────────────────────────────────
    // Acima desta linha não existe NENHUMA escrita. ...
    // ──────────────────────────────────────────────────────────────────────────
    await prisma.checkoutAsaas.create({ ... });
  }
}
export const assinaturaService = new AssinaturaService();
```

**Pontos a replicar em `cancelar(empresaId)`:**
1. `findFirst({ where: { id: empresaId, deletedAt: null }, select: <SELECT dedicado> })` — nunca `findUnique({ where: { id } })`, nunca `include`.
2. Novo `EMPRESA_CANCELAMENTO_SELECT` com `{ id, asaasSubscriptionId, canceladoEm, acessoAte, trialFim, acessoVitalicio }` (os 4 fatos são o input de `acessoEfetivoAte`).
3. `HttpError` 404 sem assinatura de empresa; 409 quando `asaasSubscriptionId === null` (sem tocar no gateway).
4. Bloco de log idêntico ao acima (prefixo `[asaas]`, `empresaId`, `status`, nunca o corpo).
5. **Diferença única em relação a `criarCheckout`:** o `catch` precisa deixar passar `AsaasApiError.status === 404` (Pitfall 4) em vez de sempre lançar 502.
6. Fronteira comentada antes do `prisma.empresa.update` — repetir o bloco `─── FRONTEIRA ───` verbatim, adaptando a justificativa (aqui: "achamos que cancelou e o Asaas ainda cobra").
7. Escrita direta por `prisma.empresa.update`, **nunca** `empresaService.update` — o allowlist positivo de `empresa.service.ts:532-548` é defesa deliberada de BILL-04 (Achado 5). Precedente correto: `webhookAsaasService.capturarAssinatura`.

**Para `consultar()` (D-02/D-02b):** mesmo esqueleto, mas o `catch` **não relança** — devolve `{ origem: "indisponivel", ... }`. É a única inversão da convenção do projeto e precisa de JSDoc dizendo por quê (D-02b: a página não pode cair por indisponibilidade do gateway).

---

## 7. `app/services/assinatura.service.test.ts` — casos novos

**Análogos literais no arquivo:**

Mock do client preservando a classe de erro real (linhas 6-20):
```typescript
/**
 * O cliente do Asaas é substituído, mas `AsaasApiError` continua sendo a classe
 * real: o service distingue falha de gateway de erro inesperado por `instanceof`,
 * e uma cópia local da classe faria o teste passar por engano.
 */
vi.mock("@/lib/billing/asaas/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/billing/asaas/client")>();
  return { ...original, asaasClient: { criarCheckout: vi.fn() } };
});
```
→ estender o objeto mockado com `removerAssinatura: vi.fn()` e `buscarAssinatura: vi.fn()`.

Asserção de ausência (linhas 114-128) — o molde exato do teste "gateway falhou ⇒ nada foi escrito":
```typescript
it("D-07: quando o Asaas rejeita, NENHUMA linha é gravada no nosso banco", async () => {
  vi.mocked(asaasClient.criarCheckout).mockRejectedValue(new AsaasApiError("...", 400, ["invalid_value"]));
  await expect(assinaturaService.criarCheckout("empresa-1")).rejects.toBeInstanceOf(HttpError);

  // Asserção de AUSÊNCIA: é a prova executável da ordem D-07.
  expect(prismaMock.checkoutAsaas.create).not.toHaveBeenCalled();
  expect(prismaMock.empresa.update).not.toHaveBeenCalled();
  expect(prismaMock.empresa.updateMany).not.toHaveBeenCalled();
  expect(prismaMock.auditoriaAcesso.create).not.toHaveBeenCalled();
  expect(prismaMock.$transaction).not.toHaveBeenCalled();
});
```

Asserção de log redigido (linhas 141-158) — reusar para `cancelar`:
```typescript
const registrado = vi.mocked(console.error).mock.calls[0].map(String).join(" ");
expect(registrado).toContain("[asaas]");
expect(registrado).toContain("empresa-1");
expect(registrado).toContain("401");
expect(registrado).not.toContain(corpoSensivel);
```

Asserção de projeção C-07 (linhas 208-226) — a versão que também prova ausência de `include`:
```typescript
const [argumento] = prismaMock.empresa.findFirst.mock.calls[0] as [Record<string, unknown>];
expect(argumento).not.toHaveProperty("include");
```

**Convenções obrigatórias:** primeira linha `// @vitest-environment node`; `prismaMock` de `../../tests/setup/prisma-mock`; `vi.spyOn(console, "error").mockImplementation(() => {})` no `beforeEach`.

---

## 8. `assinatura/page.tsx` — RSC da seção

**Análogo:** `app/[slug]/admin/(protected)/marca/page.tsx`.

```typescript
export default async function AdminMarcaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);          // ← boundary de auth POR PÁGINA
  const [empresa, usuario] = await Promise.all([ ... ]);
  if (!empresa) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-slate-800">Personalização da Marca</h1>
        <p className="text-sm text-slate-500">...</p>
      </div>
      <MarcaForm action={updateBranding.bind(null, slug)} empresa={empresa} ... />
    </div>
  );
}
```

**A copiar:** `params` como `Promise` (Next 16); `requireAdminSession(slug)` chamado **na página**, não no layout (T-04-06 — layout não é boundary); `action={fn.bind(null, slug)}` para injetar o slug na Server Action; wrapper `space-y-6` + `<h1 className="font-bold text-slate-800">` + subtítulo `text-sm text-slate-500`.

**Específico desta fase (Pattern 3 da research):** a página decide o estado **antes** de qualquer I/O de gateway, na ordem `acessoVitalicio → canceladoEm → asaasSubscriptionId null → consulta ok → consulta falhou`. O precedente de "decidir no servidor e passar a decisão já tomada como prop" é o JSDoc de `bloqueado-card.tsx`: *"a prop que chega é a decisão já tomada, não o estado bruto"*.

**Precedente de guarda simétrica com `redirect` fora de `try`:** `app/[slug]/admin/bloqueado/page.tsx:36-51` (usa `getVerifiedSession` + `revalidarConta` + `acessoBloqueado`). Não replicar essa guarda aqui — dentro de `(protected)` quem faz isso é `requireAdminSession`.

---

## 9. `assinatura/actions.ts` — `cancelarAssinatura(slug)`

**Análogo literal e canônico:** `app/[slug]/admin/_lib/assinatura-actions.ts`.

```typescript
"use server";

export async function iniciarPagamento(slug: string): Promise<void> {
  const session = await getVerifiedSession();

  // C-08 / T-04-17: o tenant sai da sessão e de mais lugar nenhum. O `FormData`
  // que o React entrega junto nunca é lido, e o `slug` da URL só serve para
  // confirmar que a sessão pertence a ESTA empresa antes de qualquer I/O.
  if (!session || session.empresaSlug !== slug) {
    redirect(`/${slug}/admin/login`);
  }

  try {
    const checkout = await assinaturaService.criarCheckout(session.empresaId);
    url = checkout.url;
  } catch (erro) {
    // T-04-16: só o log do servidor. A mensagem do gateway não é repassada.
    console.error("[assinatura] falha ao iniciar checkout", erro);
  }

  // FORA do `try` de propósito: `redirect()` sinaliza lançando `NEXT_REDIRECT`,
  // e o `catch` acima o engoliria.
  redirect(url ?? `/${slug}/admin/bloqueado?erro=checkout`);
}
```

**Regras a herdar:**
- assinatura da função recebe **só `slug`** — D-05: nenhum `assinaturaId`/`customerId` como parâmetro. Isto é o fechamento do IDOR de Pitfall 11 e é candidato a gate estático.
- `session.empresaSlug !== slug` → sair antes de qualquer I/O.
- log com prefixo `[assinatura]`, mensagem genérica ao usuário.
- **Divergência autorizada:** esta action devolve `{ error?: string }` em vez de terminar em `redirect()` (o modal precisa renderizar o erro). Por isso o `try/catch` pode envolver tudo. Se o plano optar por `redirect()` no sucesso, ele fica FORA do `try`.

**Alternativa de contrato de retorno:** `marca/actions.ts` usa `(slug, _prevState, formData) => Promise<FormState>` com `revalidatePath`. Não é o molde aqui — o cancelamento é acionado por `startTransition` em client component, não por `useActionState`.

**Teste — análogo:** `app/[slug]/admin/_lib/assinatura-actions.test.ts:1-31`, com `vi.hoisted` e o mock de `redirect` que **lança**:
```typescript
const redirectMock = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
```

---

## 10. `_components/assinatura-card.tsx` — apresentação (server component)

**Análogos:** `bloqueado/_components/bloqueado-card.tsx` e `(protected)/_components/aviso-carencia.tsx`.

Contrato de props (de `bloqueado-card.tsx:3-9`) — tudo já serializado, actions como props:
```typescript
export interface BloqueadoCardProps {
  primaryColor: string;
  accentColor: string;
  erroCheckout: boolean;
  pagarAction: () => Promise<void>;
  logoutAction: () => Promise<void>;
}
```

Bloco de erro reutilizável (o único padrão de mensagem de erro do projeto, `bloqueado-card.tsx:76-93`) — usar tal e qual para o **Estado D (gateway indisponível, D-02b)**:
```tsx
<div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
  <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
  <span className="text-xs text-red-600">Não foi possível ... Tente novamente em alguns instantes.</span>
</div>
```

Copy por variante como função pura de dado já calculado (`aviso-carencia.tsx:19-28`) — mesmo molde para os 4/5 estados:
```typescript
function corpoDoAviso(diasRestantes: number): string {
  if (diasRestantes <= 0) return "Seu acesso vence hoje. ...";
  if (diasRestantes === 1) return "Seu acesso vence amanhã. ...";
  return `Seu acesso vence em ${diasRestantes} dias. ...`;
}
```

**Formatação de data:** `formatDate` de `lib/format.ts` (`Intl.DateTimeFormat("pt-BR", { day, month, year })`) — é o formato `14/09/2026` que D-03 pede. Não escrever formatação nova.
**Preço:** `formatCurrency` de `lib/format.ts` sobre `VALOR_PLANO_MENSAL` de `lib/billing/asaas/config.ts` — nunca o literal `29,90`.

---

## 11. `_components/cancelar-dialog.tsx` — confirmação de 2 cliques

**Análogo 1 — o markup e o contrato de props:** `(protected)/_components/simples/confirmar-remocao.tsx` (arquivo inteiro, 45 linhas). É stateless: recebe `pending`, `error`, `onConfirmar`, `onCancelar`, e o botão destrutivo é `bg-red-600` com label afirmativo ("Sim, remover") + rótulo de espera ("Removendo...").

```tsx
<button type="button" onClick={onConfirmar} disabled={pending}
  className="rounded-2xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50">
  {pending ? "Removendo..." : "Sim, remover"}
</button>
```

**Análogo 2 — o orquestrador que chama a action:** `combo-hub.tsx:93-119`:
```tsx
<ConfirmarRemocao
  titulo="Remover combo?"
  mensagem={`Tem certeza que quer remover "${selecionado.nome}"?`}
  pending={pending}
  error={error}
  onCancelar={() => { setError(null); setSub("menu"); }}
  onConfirmar={() => {
    setError(null);
    startTransition(async () => {
      const resultado = await removerComboSimples(slug, selecionado.id);
      if (resultado.error) { setError(resultado.error); return; }
      router.refresh();
      onDone();
    });
  }}
/>
```

**Aplicar:** `useState` para abrir/fechar (2 cliques = D-03), `useTransition` para o pending, `router.refresh()` no sucesso. A mensagem carrega a **data exata** já formatada, vinda por prop do servidor — o componente não calcula nem formata data (regra do § 4).

**Anti-pattern:** nenhuma lib de modal nova. O projeto não tem nenhuma e a research já barra a introdução (§ Package Legitimacy Audit).

---

## 12. `_lib/assinatura-actions.ts` — `consultarStatusAcesso(slug)`

**Papel:** Server Action de **leitura** para o polling. Mesmo arquivo e mesmo cabeçalho JSDoc de `iniciarPagamento` — que já documenta por que a saída de rede do cliente é Server Action e não `fetch` de rota REST:

> `requireAuth` lê exclusivamente o cabeçalho `Authorization: Bearer`, e a sessão do navegador é o cookie `admin_session` com `httpOnly: true` — o JavaScript do cliente não tem como lê-lo. ... Server Actions já vêm com proteção de CSRF embutida (POST-only + comparação `Origin` vs `Host`).

**Fonte do dado:** `revalidarConta(session.sub, session.empresaId)` de `lib/auth-guard.ts:69` → `ContaAtiva.statusAcesso`, combinado com `acessoBloqueado(status)`. Devolver um booleano derivado (`{ liberado: boolean }`), não o status cru.

**Anti-pattern crítico (Pitfall 3):** `asaasClient` **não pode** ser importado por esta action. O polling lê fatos locais; consultar o gateway a cada tick multiplica requests contra a quota de 25k/12h e ainda responde a pergunta errada.

**Anti-pattern (BILL-01):** não ler `ultimoStatusAuditado`. O status é sempre derivado por `avaliarAcesso` via `revalidarConta`.

---

## 13. `_components/poller-de-status.tsx` — loop com backoff

**Análogo:** `combo-hub.tsx` para `useTransition` + `router.refresh()`; `pagar-button.tsx` para o formato de client component de `_components/` (arquivo com `"use client"`, constantes de classe em `const CLASSES = {...} as const`, JSDoc explicando a escolha de hook).

**Contrato (D-01):** intervalos crescentes num array `as const`, teto finito, `clearTimeout` no cleanup do `useEffect`, e fallback textual explícito quando esgota. Ver o exemplo pronto em `07-RESEARCH.md` § Code Examples #4.

**Teste — análogo:** `admin-nav.test.tsx` (render + `screen`), com `vi.mock("next/navigation", ...)` para `useRouter`. Usar fake timers para provar o teto e o `clearTimeout`.

---

## 14. `admin-nav.tsx` — novo item

**Análogo:** o próprio arquivo. Duas edições cirúrgicas:

```typescript
const ICONS = {
  dashboard: "M3 12l2-2m0 0l7-7 ...",
  produtos: "M20 7l-8-4-8 4m16 0l-8 4 ...",
  // ... ← acrescentar `assinatura` aqui (path de 24x24, stroke, mesmo estilo)
};

function buildNavItems(slug: string) {
  return [
    { href: `/${slug}/admin`, label: "Início", icon: ICONS.dashboard },
    { href: `/${slug}/admin/produtos`, label: "Meus Produtos", icon: ICONS.produtos },
    { href: `/${slug}/admin/combos`, label: "Combos", icon: ICONS.combos },
    { href: `/${slug}/admin/promocoes`, label: "Promoções", icon: ICONS.promocoes },
    { href: `/${slug}/admin/estoque`, label: "Estoque", icon: ICONS.estoque },
    { href: `/${slug}/admin/marca`, label: "Minha Loja", icon: ICONS.marca },
    // ← novo item; ordem é Claude's Discretion (D-06). "Minha Loja" e
    //   "Assinatura" são as duas entradas de configuração → agrupar no fim.
  ];
}
```

O destaque de item ativo já é genérico (`pathname.startsWith(item.href)`, linhas 90-93) — nada a mudar.

**Teste — análogo:** `admin-nav.test.tsx:1-47`. O mock de `usePathname` é fixo por arquivo:
```typescript
vi.mock("next/navigation", () => ({ usePathname: () => "/loja-teste/admin/produtos" }));
...
expect(screen.getByRole("link", { name: /combos/i })).toHaveAttribute("href", "/loja-teste/admin/combos");
```

---

## 15. `bloqueado-card.tsx` — montar o poller

**Análogo:** o próprio arquivo. O padrão de composição já existente é "server component monta client component vindo de `_components/`":

```tsx
import { PagarButton } from "../../_components/pagar-button";
...
<form action={pagarAction} className="mt-6">
  <PagarButton variant="bloqueado" primaryColor={primaryColor} />
</form>
```

**Aplicar:** importar `PollerDeStatus` de `../../_components/poller-de-status` e montá-lo condicionalmente. A prop de decisão vem **já resolvida pelo servidor** (`bloqueado/page.tsx` lê `searchParams`, igual já faz com `erro`), respeitando o JSDoc do componente: *"este componente não recebe — e não pode receber — o rótulo de acesso da empresa ... a prop que chega é a decisão já tomada, não o estado bruto"*.

Quando o status destrava, `router.refresh()` faz `bloqueado/page.tsx` reexecutar a guarda que já existe e redirecionar sozinho:
```typescript
if (!conta || !acessoBloqueado(conta.statusAcesso)) {
  redirect(`/${slug}/admin`);
}
```

**Restrição estrutural (JSDoc de `bloqueado/page.tsx:1-16`):** a rota mora FORA de `(protected)` de propósito — mover reintroduz `ERR_TOO_MANY_REDIRECTS`. Nenhum import de chrome do admin aqui.

---

## 16. `e2e/cancelamento-de-assinatura.spec.ts`

**Análogo:** `e2e/bloqueio-por-inadimplencia.spec.ts`.

Helpers já prontos em `e2e/helpers.ts`: `seedFatosBilling(...)`, `uniqueEmpresa()`, `StatusSeed`, `expectGoneFromCatalogo(page, locator)`.

Fixtures locais a copiar do spec análogo:
```typescript
/** Registro pela UI. Deixa cookie `admin_session` válido e devolve o slug. */
async function registrarPelaUI(page) {
  const empresa = uniqueEmpresa();
  await page.goto("/registro");
  await page.getByLabel("Nome da empresa").fill(empresa.nomeEmpresa);
  ...
  await page.getByRole("button", { name: "Criar minha loja" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return { empresa, slug: new URL(page.url()).pathname.split("/")[1] };
}

async function credenciaisDeApi(request, email, senha) {
  const login = await request.post("/api/auth/login", { data: { email, senha } });
  const { token, usuario } = await login.json();
  return { authHeader: { authorization: `Bearer ${token}` }, empresaId: usuario.empresaId };
}
```

**Casos obrigatórios (research § Test Map):** ver status → cancelar → ver "ativo até {data}"; cancelada + período expirado ⇒ admin bloqueado e catálogo despublicado (`expectGoneFromCatalogo`); empresa A não consegue cancelar a de B (checklist de `PITFALLS.md` linha ~558).

---

## Invariantes transversais (valem para todo arquivo desta fase)

| # | Invariante | Onde está declarada |
|---|-----------|---------------------|
| 1 | Ordem gateway→banco, com a fronteira comentada; nenhuma escrita antes do 200 | `assinatura.service.ts:85-92` |
| 2 | Server Action de cancelar sem parâmetro de id; tenant só da sessão | `_lib/assinatura-actions.ts:31-36` (C-08/T-04-17) |
| 3 | `canceladoEm` gravado por `prisma.empresa.update` direto, nunca por `empresaService.update` | allowlist em `empresa.service.ts:532-548` |
| 4 | `select` explícito, `include` proibido em `Empresa`/`Usuario` | `assinatura.service.ts:17-29`, `auth-guard.ts:81-84` |
| 5 | `findFirst({ where: { id, deletedAt: null } })`, nunca `findUnique({ where: { id } })` | `assinatura.service.ts:38-44` |
| 6 | Log: prefixo `[asaas]`/`[assinatura]`, só `status` + `empresaId`; corpo do gateway nunca | `assinatura.service.ts:74-83`, `client.ts:94-107` |
| 7 | Erro ao usuário sempre genérico; `HttpError`/`AsaasApiError` com `.status` | `lib/http-error.ts`, `client.ts:31-41` |
| 8 | Nenhum client component faz chamada de rede | JSDoc de `pagar-button.tsx` e `assinatura-actions.ts` (T-04-09) |
| 9 | `redirect()` sempre FORA de `try/catch` | `_lib/assinatura-actions.ts:49-52` |
| 10 | Toda aritmética/derivação de acesso mora em `lib/avaliar-acesso.ts`, com relógio injetado | `avaliar-acesso.ts:44-51`, `:161-180` |
| 11 | Imports por `@/`, nunca `../` entre diretórios (exceção já existente: imports relativos curtos dentro da mesma árvore `_components`) | CLAUDE.md § Import Organization |
| 12 | Service = classe + singleton `export const xService = new XService()` | `assinatura.service.ts:121` |
| 13 | Teste de service/action começa com `// @vitest-environment node` | `assinatura.service.test.ts:1` |

---

*Pattern map: 2026-09-02*
