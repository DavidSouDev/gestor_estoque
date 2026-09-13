"use client";

import { useActionState } from "react";
import type { ProdutoFormState } from "../actions";
import { uploadImagemProduto } from "../actions";
import type { ProdutoAdminDetalhe } from "../../../_lib/types";
import { fotosIniciaisDoProduto } from "../../../_lib/fotos-iniciais";
import { CollapsibleSection } from "../../_components/collapsible-section";
import { MultiImageUploadField } from "@/app/_components/multi-image-upload-field";

const INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  step,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  step?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium text-slate-600">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step={step}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export function ProdutoForm({
  slug,
  action,
  produto,
}: {
  slug: string;
  action: (state: ProdutoFormState, formData: FormData) => Promise<ProdutoFormState>;
  produto?: ProdutoAdminDetalhe;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <Field label="Nome" name="nome" defaultValue={produto?.nome} required />

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Preço"
          name="precoVarejo"
          type="number"
          step="0.01"
          defaultValue={produto ? Number(produto.precoVarejo) : undefined}
          required
        />
        <Field label="Estoque" name="estoque" type="number" defaultValue={produto?.estoque ?? 0} />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-600">Fotos</span>
        <MultiImageUploadField
          slug={slug}
          uploadAction={uploadImagemProduto}
          initialUrls={fotosIniciaisDoProduto(produto)}
          fieldName="imagemUrl"
        />
        <p className="text-xs text-slate-400">
          Escolha mais de uma foto de uma vez e cada uma vira uma variante que o cliente pode
          selecionar no catálogo — útil pra vender o mesmo produto em tamanhos, estampas ou cores
          diferentes.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="controlaEstoquePorVariante"
            defaultChecked={produto?.controlaEstoquePorVariante ?? false}
          />
          Ativar controle por variante
        </label>
        <p className="text-xs text-slate-400">
          Ative se cada variante (tamanho, estampa, etc.) tiver seu próprio saldo de estoque. O
          campo &ldquo;Estoque&rdquo; acima passa a ser a soma das variantes. Ativar não
          redistribui o estoque atual — cadastre o estoque de cada variante depois de salvar.
        </p>
      </div>

      <CollapsibleSection>
        <Field
          label="Código"
          name="codigo"
          defaultValue={produto?.codigo}
          placeholder="Gerado automaticamente se deixar em branco"
        />
        <Field label="Categoria" name="categoria" defaultValue={produto?.categoria ?? "Geral"} />

        <div className="flex flex-col gap-1">
          <label htmlFor="descricao" className="text-sm font-medium text-slate-600">
            Descrição
          </label>
          <textarea
            id="descricao"
            name="descricao"
            rows={3}
            defaultValue={produto?.descricao ?? ""}
            className={INPUT_CLASS}
          />
        </div>

        <Field
          label="Preço atacado"
          name="precoAtacado"
          type="number"
          step="0.01"
          defaultValue={produto ? Number(produto.precoAtacado) : undefined}
          placeholder="Usa o preço acima se deixar em branco"
        />

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="destaque" defaultChecked={produto?.destaque ?? false} />
            Destaque
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              name="visivelCatalogo"
              defaultChecked={produto?.visivelCatalogo ?? true}
            />
            Visível no catálogo
          </label>
        </div>
      </CollapsibleSection>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
