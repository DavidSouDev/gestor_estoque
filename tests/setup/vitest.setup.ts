import "@testing-library/jest-dom/vitest";

import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

/*
  Polyfill de `HTMLDialogElement` para o jsdom.

  POR QUE existe: `node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js`
  é, no jsdom 29.1.1, literalmente `class HTMLDialogElementImpl extends HTMLElementImpl {}`.
  O construtor global `HTMLDialogElement` existe, mas `show`, `showModal` e `close` são
  `undefined` — qualquer teste que clique num gatilho de modal lança
  `TypeError: dialogo.showModal is not a function`.

  Isto é um DUBLÊ, não uma implementação. Ele só reflete o atributo `open`, o que basta
  porque a folha de estilo padrão do jsdom já esconde `<dialog>` sem `open`
  (`display: none`), e é isso que faz `toBeVisible()` e as queries por papel do
  testing-library se comportarem corretamente.

  O que o dublê NÃO faz, e portanto nenhum teste unitário deste projeto prova:
  top layer, `inert` no resto do documento, foco preso dentro do dialog, retorno de
  foco ao fechar, fechamento por Escape e o `::backdrop` nativo. Fingir qualquer um
  desses produziria testes que passam pelo motivo errado. A prova dessas propriedades
  mora em `e2e/cadastro-e-login.spec.ts`, contra Chromium real.

  Aplicado condicionalmente para morrer sozinho no dia em que o jsdom implementar o
  elemento de verdade: quando `showModal` existir no prototype, este bloco não faz nada
  e pode ser apagado.
*/
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  const abrir = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };

  HTMLDialogElement.prototype.show = abrir;
  HTMLDialogElement.prototype.showModal = abrir;

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute("open");
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    // Sem bubbling, como na especificação.
    this.dispatchEvent(new Event("close"));
  };
}

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-jwt-secret";
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
});

afterEach(() => {
  cleanup();
});

import "./prisma-mock";
