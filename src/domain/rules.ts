// Regras de negócio R1..R7, extraídas das fórmulas da planilha. Funções puras.
import {
  Tipificacao, StatusPagamento, Condicao, ContaPagar, SimulacaoInput, SimulacaoResultado,
} from "./types";

const MS = 86_400_000;
const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const difDias = (a: Date, b: Date) => Math.round((soData(a).getTime() - soData(b).getTime()) / MS);

/** R1 — sinal do valor. */
export function valorComSinal(t: Tipificacao, valor: number): number {
  if (t === "Entrada") return Math.abs(valor);
  if (t === "Saida") return -Math.abs(valor);
  return 0;
}

/** R3 — status. */
export function statusPagamento(efetivacao: Date | null): StatusPagamento {
  return efetivacao ? "Pago" : "A Pagar";
}

/** R4 — condição (pontualidade). */
export function condicao(vencimento: Date, efetivacao: Date | null, hoje = new Date()): Condicao {
  const v = soData(vencimento), h = soData(hoje);
  if (efetivacao) {
    const e = soData(efetivacao);
    if (e < v) return "Adiantado";
    if (e.getTime() === v.getTime()) return "Em dia";
    return "Vencido";
  }
  return v <= h ? "Vencido" : "A Vencer";
}

/** R5 — dias de atraso/adianto. */
export function diasAtraso(vencimento: Date, efetivacao: Date | null, hoje = new Date()): number {
  return difDias(efetivacao ?? hoje, vencimento);
}

/** R6 + R7 — simulação de pagamento (não grava). */
export function simularPagamento(contas: ContaPagar[], input: SimulacaoInput): SimulacaoResultado {
  const marcados = new Set(input.selecionados);
  const elegiveis = contas.filter((c) => marcados.has(c.id) && c.status === "A Pagar");
  const totalOficial = elegiveis.filter((c) => c.tabela === "Oficial").reduce((s, c) => s + c.valor, 0);
  const totalExtra = elegiveis.filter((c) => c.tabela === "Extra").reduce((s, c) => s + c.valor, 0);
  const totalGeral = totalOficial + totalExtra;
  const saldoApos = input.saldoDisponivel - totalGeral;
  return { totalOficial, totalExtra, totalGeral, saldoApos, estoura: saldoApos < 0 };
}

/** Preenche os campos derivados a partir dos fatos. */
export function derivarCampos(
  base: Omit<ContaPagar, "status" | "condicao" | "dias">,
  hoje = new Date(),
): ContaPagar {
  const venc = new Date(base.vencimento);
  const efe = base.efetivacao ? new Date(base.efetivacao) : null;
  return {
    ...base,
    status: statusPagamento(efe),
    condicao: condicao(venc, efe, hoje),
    dias: diasAtraso(venc, efe, hoje),
  };
}
