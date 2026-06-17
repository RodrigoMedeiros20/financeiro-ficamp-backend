// Tipos de domínio.
export type Tipificacao = "Entrada" | "Saida";
export type Tabela = "Oficial" | "Extra";
export type StatusPagamento = "A Pagar" | "Pago";
export type Condicao = "Adiantado" | "Em dia" | "Vencido" | "A Vencer";

export interface ContaPagar {
  id: number;
  movimentacao: string;
  valor: number;
  banco: string | null;
  meioPagamento: string | null;   // Tipo
  detalhe: string | null;         // Descrição
  competencia: string | null;     // ISO
  vencimento: string;             // ISO
  dataProgramada: string | null;  // ISO — Programação
  efetivacao: string | null;      // ISO — vazio => A Pagar
  tabela: Tabela;
  obrigatorio: boolean;
  selecionado: boolean;
  natureza: string;
  centroCustos: string | null;
  // derivados:
  grupo: string;
  fc: string;
  status: StatusPagamento;
  condicao: Condicao | null;
  dias: number;
}

export interface SimulacaoInput {
  selecionados: number[];
  saldoDisponivel: number;
}

export interface SimulacaoResultado {
  totalOficial: number;
  totalExtra: number;
  totalGeral: number;
  saldoApos: number;
  estoura: boolean;
}
