import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { termoVigente } from "@/lib/termo-vigente";
import { register } from "./actions";
import { RegisterForm } from "./_components/register-form";

export default async function RegistroPage() {
  const session = await getVerifiedSession();

  if (session) {
    redirect(`/${session.empresaSlug}/admin`);
  }

  const termo = await termoVigente();

  if (!termo) {
    // ESTADO INALCANÇÁVEL em qualquer ambiente que rodou a migration de seed da
    // v1 (plano 06-01) — inclusive CI. Ele existe para que um banco em estado
    // inesperado produza uma tela legível em vez de um crash ou de um submit
    // que falha em silêncio.
    //
    // Construir aqui um "estado vazio" amigável (um aviso de que não há termo
    // publicado, com o formulário funcionando assim mesmo) é VIOLAÇÃO DE
    // CONTRATO, não gentileza: seria uma segunda chance de o sistema falhar ABERTO
    // exatamente onde TERM-01 exige que ele falhe FECHADO. O registro é o
    // funil de aquisição e a falha atinge um cadastro; o gate de TERM-04 é o
    // oposto e falha aberto de propósito (ver `lib/termo-vigente.ts`, ponto 2).
    //
    // Sem campos, sem botão de submit, sem disclosure: um formulário que
    // renderiza e não pode ter sucesso é pior que uma parada honesta.
    //
    // A copy E4 é genérica por contrato (CLAUDE.md § Error Handling), então a
    // causa real precisa existir em algum lugar — o log do servidor.
    console.error(
      "[registro] nenhuma versão de Termos de Uso publicada — cadastro indisponível (fail-closed, TERM-01)"
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl">
          <div
            className="h-2"
            style={{
              background: "linear-gradient(90deg, #18181b, #f59e0b)",
            }}
          />

          <div className="p-8">
            {termo ? (
              // O cabeçalho (avatar clicável de logo + título) vive DENTRO de
              // `RegisterForm` — precisa ser client component para o avatar
              // abrir o recorte de imagem, e por isso não pode nascer aqui.
              <RegisterForm action={register} termo={termo} />
            ) : (
              <>
                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-white shadow-lg">
                    +
                  </div>
                  <h1 className="text-xl font-bold text-slate-800">Crie sua loja</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Cadastre sua empresa e comece a usar em poucos minutos
                  </p>
                </div>

                {/* Mesmo bloco de erro do login, do registro e do bloqueado — o
                    único padrão de mensagem de erro do projeto (copy E4). */}
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                  <svg
                    className="h-4 w-4 shrink-0 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-xs text-red-600">
                    Não foi possível abrir o cadastro agora. Tente novamente em alguns instantes.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
