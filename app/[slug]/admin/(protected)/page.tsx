import { requireAdminSession } from "@/lib/session";
import { produtoService } from "@/app/services/produto.service";
import { comboService } from "@/app/services/combo.service";
import { promocaoService } from "@/app/services/promocao.service";
import { usuarioService } from "@/app/services/usuario.service";
import { serializeDecimals } from "@/lib/serialize";
import { QuickActions } from "./_components/quick-actions";
import { SimplesAssistant } from "./_components/simples/simples-assistant";
import { getModoInterface } from "./_lib/modo";

const ESTOQUE_BAIXO_LIMITE = 5;

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && (
        <p className="mt-1 text-xs" style={{ color }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireAdminSession(slug);
  const modo = await getModoInterface(session.empresaId);

  if (modo === "SIMPLES") {
    const [usuario, produtosSimples, combosSimples, promocoesSimples] = await Promise.all([
      usuarioService.findById(session.sub),
      produtoService.list(session.empresaId),
      comboService.list(session.empresaId),
      promocaoService.list(session.empresaId),
    ]);

    const primeiroNome = (usuario?.nome ?? "").split(" ")[0] || "tudo bem";

    return (
      <SimplesAssistant
        slug={slug}
        nome={primeiroNome}
        produtos={serializeDecimals(produtosSimples.filter((produto) => produto.ativo))}
        combos={serializeDecimals(combosSimples)}
        promocoes={serializeDecimals(promocoesSimples)}
      />
    );
  }

  const [produtos, combos, promocoes] = await Promise.all([
    produtoService.list(session.empresaId),
    comboService.list(session.empresaId),
    promocaoService.list(session.empresaId),
  ]);

  const agora = new Date();
  const produtosAtivos = produtos.filter((produto) => produto.ativo);
  const estoqueBaixo = produtosAtivos.filter(
    (produto) => produto.estoque <= ESTOQUE_BAIXO_LIMITE
  );
  const combosAtivos = combos.filter((combo) => combo.ativo);
  const promocoesVigentes = promocoes.filter(
    (promocao) => promocao.dataInicio <= agora && promocao.dataFim >= agora
  );

  const categorias = [...new Set(produtosAtivos.map((produto) => produto.categoria))].map(
    (categoria) => ({
      nome: categoria,
      total: produtosAtivos.filter((produto) => produto.categoria === categoria).length,
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-slate-800">Visão Geral</h1>
        <p className="text-xs text-slate-400">Multi-tenant · JWT autenticado</p>
      </div>

      <QuickActions slug={slug} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Produtos ativos"
          value={produtosAtivos.length}
          sub="Cadastrados"
          color="#2563eb"
        />
        <StatCard
          label="Estoque baixo"
          value={estoqueBaixo.length}
          sub={`de ${produtosAtivos.length} produtos`}
          color="#f59e0b"
        />
        <StatCard
          label="Combos ativos"
          value={combosAtivos.length}
          sub="Disponíveis no catálogo"
          color="#7c3aed"
        />
        <StatCard
          label="Promoções vigentes"
          value={promocoesVigentes.length}
          sub="Ativas agora"
          color="#059669"
        />
      </div>

      {estoqueBaixo.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-700">Alertas de estoque</h3>
          <div className="space-y-2">
            {estoqueBaixo.map((produto) => (
              <div key={produto.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <span className="flex-1 text-sm text-slate-700">{produto.nome}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    produto.estoque === 0
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {produto.estoque === 0 ? "Esgotado" : `${produto.estoque} restantes`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {categorias.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-700">Categorias</h3>
          <div className="space-y-2">
            {categorias.map((categoria) => (
              <div key={categoria.nome} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{categoria.nome}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-800"
                      style={{
                        width: `${(categoria.total / produtosAtivos.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-4 text-right text-xs text-slate-400">{categoria.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
