"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { VarianteFormState } from "../variantes-actions";
import { uploadImagemVariante } from "../variantes-actions";
import { UploadDropzoneButton } from "@/app/_components/upload-dropzone-button";

const INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-800/20";

interface AtributoRow {
  key: string;
  nome: string;
  valor: string;
}

interface ImagemItem {
  url: string;
  alt?: string;
}

export interface VarianteFormData {
  nome: string;
  precoVarejo: number | null;
  precoAtacado: number | null;
  estoque: number;
  atributos: { nome: string; valor: string }[];
  imagens: { url: string; alt: string | null }[];
}

export function VarianteForm({
  slug,
  action,
  controlaEstoquePorVariante,
  variante,
  onCancel,
  onSuccess,
}: {
  slug: string;
  action: (state: VarianteFormState, formData: FormData) => Promise<VarianteFormState>;
  controlaEstoquePorVariante: boolean;
  variante?: VarianteFormData;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  // Prefixo único por instância: sem ele, os `id`/`htmlFor` deste form
  // colidiriam com os do ProdutoForm principal (mesma página) e entre duas
  // instâncias deste form abertas ao mesmo tempo (criar + editar outra
  // variante) — o label resolveria pro elemento ERRADO, digitando no campo
  // trocado.
  const idPrefix = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const eraPendente = useRef(false);

  useEffect(() => {
    if (eraPendente.current && !pending && !state.error) {
      onSuccess?.();
    }
    eraPendente.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  const [atributos, setAtributos] = useState<AtributoRow[]>(() =>
    variante && variante.atributos.length > 0
      ? variante.atributos.map((atributo, index) => ({ key: `a${index}`, ...atributo }))
      : [{ key: "a0", nome: "", valor: "" }]
  );

  const [imagens, setImagens] = useState<ImagemItem[]>(
    () => variante?.imagens.map((imagem) => ({ url: imagem.url, alt: imagem.alt ?? undefined })) ?? []
  );
  const [enviando, setEnviando] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);

  function addAtributo() {
    setAtributos((rows) => [...rows, { key: `a${Date.now()}`, nome: "", valor: "" }]);
  }

  function removeAtributo(key: string) {
    setAtributos((rows) => rows.filter((row) => row.key !== key));
  }

  async function handleFiles(files: File[]) {
    setEnviando(true);
    setErroUpload(null);

    // Sequencial de propósito: o Next.js despacha Server Actions do mesmo
    // cliente uma de cada vez, então `Promise.all` aqui não paralelizaria de
    // verdade — só tornaria o tratamento de erro por arquivo mais confuso.
    for (const file of files) {
      const dados = new FormData();
      dados.set("arquivo", file);
      const resultado = await uploadImagemVariante(slug, dados);

      if (resultado.error) {
        setErroUpload(resultado.error);
        continue;
      }

      if (resultado.url) {
        const url = resultado.url;
        setImagens((atual) => [...atual, { url }]);
      }
    }

    setEnviando(false);
  }

  function removeImagem(url: string) {
    setImagens((atual) => atual.filter((imagem) => imagem.url !== url));
  }

  function moverImagem(index: number, direcao: -1 | 1) {
    setImagens((atual) => {
      const destino = index + direcao;
      if (destino < 0 || destino >= atual.length) {
        return atual;
      }
      const proximo = [...atual];
      [proximo[index], proximo[destino]] = [proximo[destino], proximo[index]];
      return proximo;
    });
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-nome`} className="text-sm font-medium text-slate-600">
          Nome da variante
        </label>
        <input
          id={`${idPrefix}-nome`}
          name="nome"
          defaultValue={variante?.nome}
          placeholder="Ex: P - Estampa A"
          required
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <span className="text-sm font-medium text-slate-600">Atributos</span>
        <div className="mt-1 flex flex-col gap-2">
          {atributos.map((row) => (
            <div key={row.key} className="flex gap-2">
              <input
                name="atributoNome"
                defaultValue={row.nome}
                placeholder="Ex: Tamanho"
                className={`${INPUT_CLASS} flex-1`}
              />
              <input
                name="atributoValor"
                defaultValue={row.valor}
                placeholder="Ex: P"
                className={`${INPUT_CLASS} flex-1`}
              />
              <button
                type="button"
                onClick={() => removeAtributo(row.key)}
                className="text-sm text-red-500"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addAtributo}
          className="mt-2 text-sm font-medium text-slate-600 underline"
        >
          + Adicionar atributo
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-precoVarejo`} className="text-sm font-medium text-slate-600">
            Preço (opcional)
          </label>
          <input
            id={`${idPrefix}-precoVarejo`}
            name="precoVarejo"
            type="number"
            step="0.01"
            defaultValue={variante?.precoVarejo ?? ""}
            placeholder="Usa o preço do produto"
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-precoAtacado`} className="text-sm font-medium text-slate-600">
            Preço atacado (opcional)
          </label>
          <input
            id={`${idPrefix}-precoAtacado`}
            name="precoAtacado"
            type="number"
            step="0.01"
            defaultValue={variante?.precoAtacado ?? ""}
            placeholder="Usa o preço do produto"
            className={INPUT_CLASS}
          />
        </div>
      </div>

      {controlaEstoquePorVariante && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-estoque`} className="text-sm font-medium text-slate-600">
            Estoque desta variante
          </label>
          <input
            id={`${idPrefix}-estoque`}
            name="estoque"
            type="number"
            defaultValue={variante?.estoque ?? 0}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div>
        <span className="text-sm font-medium text-slate-600">Imagens</span>
        <div className="mt-2 flex flex-wrap gap-3">
          {imagens.map((imagem, index) => (
            <div key={imagem.url} className="flex flex-col items-center gap-1">
              <input type="hidden" name="imagemUrl" value={imagem.url} />
              <input type="hidden" name="imagemAlt" value={imagem.alt ?? ""} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <div className="flex gap-1 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => moverImagem(index, -1)}
                  disabled={index === 0}
                  className="disabled:opacity-30"
                  aria-label="Mover para a esquerda"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => removeImagem(imagem.url)}
                  className="text-red-500"
                >
                  Remover
                </button>
                <button
                  type="button"
                  onClick={() => moverImagem(index, 1)}
                  disabled={index === imagens.length - 1}
                  className="disabled:opacity-30"
                  aria-label="Mover para a direita"
                >
                  ▶
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <UploadDropzoneButton onFilesSelected={handleFiles} disabled={enviando} />
        </div>
        {enviando && <p className="mt-1 text-xs text-slate-500">Enviando imagens...</p>}
        {erroUpload && <p className="mt-1 text-xs text-red-600">{erroUpload}</p>}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || enviando}
          className="w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar variante"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-fit rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
