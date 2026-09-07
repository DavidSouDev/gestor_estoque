import {
  acessoBloqueado,
  avaliarAcesso,
  type FatosDeAcesso,
  type ResultadoAcesso,
} from "@/lib/avaliar-acesso";

/**
 * Passada 1 do worker diário: **pura**. Recebe a lista de empresas já lida do
 * banco e um instante, e devolve quais transições existem, quais delas são
 * perda de acesso, se o freio de D-01 arma e qual subconjunto pode ser
 * persistido. Zero I/O, zero assincronia, zero leitura de relógio.
 *
 * O arquivo mora em `app/services/` por proximidade de domínio, mas segue o
 * idioma de `lib/avaliar-acesso.ts` — funções nomeadas, não o singleton
 * `export const xService = new XService()`. Aquele idioma existe para services
 * com efeito colateral; aqui não há nenhum (precedente `[02-03]`: motor puro,
 * efeito colateral em outro lugar).
 *
 * Três coisas que um leitor futuro vai querer "consertar" e não deve:
 *
 * 1. **NÃO encadear transições.** `avaliarAcesso` é total e pura no par
 *    (fatos, instante), então uma empresa não avaliada há 30 dias produz o
 *    status final correto de hoje numa ÚNICA chamada. Simular
 *    `TRIAL → CARENCIA → BLOQUEADO` gravaria linhas de auditoria de transições
 *    que ninguém observou. Consequência aceita e desejada: a trilha registra
 *    `TRIAL → BLOQUEADO` e nunca a linha `CARENCIA` intermediária —
 *    `AuditoriaAcesso` registra transições OBSERVADAS, não simuladas
 *    (05-RESEARCH §Achado crítico 1).
 *
 * 2. **NÃO existe marca d'água de "última execução".** Um ledger de execução
 *    INTRODUZIRIA o bug que pretende evitar: pular um dia passaria a importar.
 *    A idempotência de WRK-01 já é consequência da pureza de `avaliarAcesso`
 *    somada ao compare-and-swap que persiste a transição.
 *
 * 3. **O freio mora AQUI**, e não dentro de `avaliarAcesso` nem do serviço que
 *    escreve a auditoria. Ele é uma propriedade da execução INTEIRA — de um
 *    lote — e empurrá-lo para baixo contaminaria duas peças reusadas por três
 *    chamadores com um conceito que só faz sentido em batch.
 */

/**
 * O status derivado, tomado emprestado do retorno do motor de acesso em vez de
 * importado do client do banco. Não é preciosismo: este módulo é provado puro
 * por gate estático, e derivar o tipo do próprio contrato de `avaliarAcesso`
 * mantém a única dependência do arquivo sendo o motor — quem manda no conjunto
 * de status é ele, não a camada de persistência.
 */
export type StatusAcesso = ResultadoAcesso["status"];

/**
 * Fração de perdas de acesso, sobre o total avaliado, a partir da qual a
 * execução é considerada anômala (D-01).
 *
 * A comparação é ESTRITAMENTE MAIOR (`>`), nunca `>=`: D-01 diz "mais de 20%".
 * Com `>=`, 100 empresas e exatamente 20 perdas armariam o freio — um caso que
 * o texto da decisão manda deixar passar. O teste pareado 20/21 existe para
 * travar isto.
 */
export const LIMIAR_DE_BLOQUEIO_EM_MASSA = 0.2;

/**
 * Piso absoluto de perdas de acesso: abaixo dele o freio NUNCA arma, por mais
 * alto que o percentual seja (D-01 revisado).
 *
 * A aritmética que motiva o piso (05-RESEARCH §Achado crítico 3): sem ele, 1
 * bloqueio legítimo numa base de 4 empresas dá 25%, arma o freio, e o worker
 * vira um no-op silencioso durante toda a fase inicial do produto — o único
 * sinal disso seria um booleano num JSON que ninguém lê diariamente. O critério
 * de sucesso "empresa cujo trial termina sem pagamento aparece bloqueada no dia
 * seguinte" ficaria falso de forma indistinguível de um bug.
 *
 * O trial de 14 dias agrava isso estruturalmente: ele produz COORTES. Empresas
 * cadastradas no mesmo dia vencem o trial no mesmo dia e a carência no mesmo
 * dia. Um lançamento com 20 cadastros numa semana gera, 24 dias depois, um pico
 * legítimo de bloqueios que o percentual sozinho classificaria como anomalia.
 */
export const PISO_DE_BLOQUEIO_EM_MASSA = 5;

/**
 * Uma empresa como o worker precisa dela: os 4 fatos de billing (a fonte da
 * verdade de BILL-01) mais a identidade e o comparador do compare-and-swap.
 *
 * `ultimoStatusAuditado` é lido aqui EXCLUSIVAMENTE como bookkeeping — o
 * `anterior` da transição. Ele nunca é fonte da verdade de acesso: quem decide
 * o status é `avaliarAcesso` sobre os 4 fatos (BILL-01 / T-02-03 / T-05-09).
 */
export interface EmpresaAvaliavel extends FatosDeAcesso {
  id: string;
  ultimoStatusAuditado: StatusAcesso | null;
}

/**
 * Exatamente o `params` de `acessoService.registrarTransicao` MENOS a `causa`.
 * O formato é intencional: quem persiste faz `{ ...t, causa: WORKER_DIARIO }`
 * sem tradução campo a campo.
 */
export interface Transicao {
  empresaId: string;
  anterior: StatusAcesso | null;
  novo: StatusAcesso;
}

export interface PlanoDeReconciliacao {
  avaliadas: number;
  transicoes: Transicao[];
  perigosas: Transicao[];
  aplicaveis: Transicao[];
  freio: {
    disparou: boolean;
    proporcao: number;
    suprimidas: number;
  };
}

/**
 * A transição faz a empresa PERDER acesso agora? (D-02)
 *
 * O predicado ingênuo — `novo === BLOQUEADO || novo === CANCELADO` — contaria
 * uma empresa que JÁ estava sem acesso e apenas trocou de rótulo para
 * `CANCELADO`, inflando o numerador do freio contra o texto explícito de D-02
 * ("empresas que já estavam bloqueadas antes desta execução não contam"). O
 * efeito prático seria perverso: o freio armaria contra ninguém e, no mesmo
 * movimento, deixaria bloqueios reais passarem em outro dia (Pitfall 6 /
 * T-05-15).
 *
 * `anterior === null` (empresa nunca auditada) é tratado como "tinha acesso" de
 * propósito. É a leitura conservadora — a que faz o freio PROTEGER em vez de
 * deixar passar.
 *
 * Existe como nome próprio, e não como negação inline no chamador, pelo mesmo
 * motivo que `podePublicarCatalogo` existe em `lib/avaliar-acesso.ts`: é uma
 * regra de negócio, e regras de negócio ganham nome.
 */
export function perdeAcesso(t: Transicao): boolean {
  const tinhaAcesso = t.anterior === null || !acessoBloqueado(t.anterior);

  return tinhaAcesso && acessoBloqueado(t.novo);
}

/**
 * Materializa, em memória, o plano completo de reconciliação de um lote.
 *
 * `agora` é injetado, nunca lido aqui: é o que torna as viradas de data exatas
 * testáveis sem fake timers, e o que garante que todas as empresas do lote
 * sejam julgadas contra o MESMO instante — sem isso, uma virada de meia-noite
 * no meio do laço colocaria duas empresas com fatos idênticos em status
 * diferentes.
 */
export function planejarReconciliacao(
  empresas: EmpresaAvaliavel[],
  agora: Date
): PlanoDeReconciliacao {
  const transicoes: Transicao[] = [];

  for (const empresa of empresas) {
    // UMA única avaliação por empresa. O resultado é materializado na lista, e
    // é por isso que a fase de decisão não custa uma segunda passada.
    // `EmpresaAvaliavel` estende `FatosDeAcesso`, então o próprio objeto serve
    // de argumento — nenhuma cópia campo a campo.
    const { status } = avaliarAcesso(empresa, agora);

    // Réplica em memória da guarda D-16 que o serviço de auditoria aplica. Não
    // é duplicação acidental: é o que evita abrir I/O para uma empresa sem
    // mudança nenhuma, que é a maioria absoluta do lote em qualquer dia normal.
    if (status !== empresa.ultimoStatusAuditado) {
      transicoes.push({
        empresaId: empresa.id,
        anterior: empresa.ultimoStatusAuditado,
        novo: status,
      });
    }
  }

  const perigosas = transicoes.filter(perdeAcesso);

  // A guarda de divisão por zero é obrigatória, não defensiva: um lote vazio
  // produziria `NaN`, e `NaN > 0.2` é `false` — o resultado certo por acidente,
  // que é a pior forma de estar certo. Aqui o zero é explícito.
  const proporcao = empresas.length === 0 ? 0 : perigosas.length / empresas.length;

  const disparou =
    proporcao > LIMIAR_DE_BLOQUEIO_EM_MASSA &&
    perigosas.length >= PISO_DE_BLOQUEIO_EM_MASSA;

  // D-03: o freio suprime SÓ a classe perigosa. `TRIAL → CARENCIA` e
  // reativações continuam sendo aplicadas — o freio é uma trava contra perda de
  // acesso em massa, não uma parada total do worker.
  const aplicaveis = disparou ? transicoes.filter((t) => !perdeAcesso(t)) : transicoes;

  return {
    avaliadas: empresas.length,
    transicoes,
    perigosas,
    aplicaveis,
    freio: {
      disparou,
      proporcao,
      suprimidas: disparou ? perigosas.length : 0,
    },
  };
}
