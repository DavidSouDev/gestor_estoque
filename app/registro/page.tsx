import Link from "next/link";
import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/session";
import { register } from "./actions";
import { RegisterForm } from "./_components/register-form";

export default async function RegistroPage() {
  const session = await getVerifiedSession();

  if (session) {
    redirect(`/${session.empresaSlug}/admin`);
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
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-white shadow-lg">
                +
              </div>
              <h1 className="text-xl font-bold text-slate-800">Crie sua loja</h1>
              <p className="mt-1 text-sm text-slate-500">
                Cadastre sua empresa e comece a usar em poucos minutos
              </p>
            </div>

            <RegisterForm action={register} />

          </div>
        </div>
      </div>
    </div>
  );
}
