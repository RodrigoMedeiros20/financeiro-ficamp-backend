import { prisma } from "./prisma";
import { derivarCampos } from "../domain/rules";
import { ContaPagar, Tabela } from "../domain/types";

export interface FiltroContas {
  tabela?: Tabela;
  obrigatorio?: boolean;
  apenasAPagar?: boolean;
  de?: string;   // ISO — filtra por vencimento
  ate?: string;  // ISO
}

const isoOuNull = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export async function listarContasPagar(f: FiltroContas = {}): Promise<ContaPagar[]> {
  const where: any = {};
  if (f.tabela) where.tabela = f.tabela;
  if (f.obrigatorio !== undefined) where.obrigatorio = f.obrigatorio;
  if (f.apenasAPagar) where.efetivacao = null;
  if (f.de || f.ate) {
    where.vencimento = {};
    if (f.de) where.vencimento.gte = new Date(f.de);
    if (f.ate) where.vencimento.lte = new Date(f.ate);
  }

  const rows = await prisma.contaPagar.findMany({
    where, include: { classificacao: true }, orderBy: { vencimento: "asc" },
  });

  return rows.map((r: any) =>
    derivarCampos({
      id: r.id,
      movimentacao: r.movimentacao,
      valor: Number(r.valor),
      banco: r.banco,
      meioPagamento: r.meioPagamento,
      detalhe: r.detalhe,
      competencia: isoOuNull(r.competencia),
      vencimento: r.vencimento.toISOString().slice(0, 10),
      dataProgramada: isoOuNull(r.dataProgramada),
      efetivacao: isoOuNull(r.efetivacao),
      tabela: r.tabela as Tabela,
      obrigatorio: r.obrigatorio,
      selecionado: r.selecionado,
      natureza: r.natureza,
      centroCustos: r.centroCustos,
      grupo: r.classificacao?.grupo ?? "Outros",
      fc: r.classificacao?.fc ?? "Fluxo de Caixa Operacional",
    })
  );
}

/** Dá baixa: grava efetivação (R3 => "Pago"). */
export async function darBaixa(id: number, dataEfetivacao: string) {
  return prisma.contaPagar.update({
    where: { id },
    data: { efetivacao: new Date(dataEfetivacao), selecionado: false },
  });
}
