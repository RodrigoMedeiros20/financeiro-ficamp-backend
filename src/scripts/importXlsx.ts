// Importa TODAS as abas da planilha para o banco, sem alterar o arquivo.
// Uso: npm run import -- "/caminho/Fluxo de Caixa Manual.xlsx"
import * as XLSX from "xlsx";
import { prisma } from "../db/prisma";

const arquivo = process.argv[2];
if (!arquivo) { console.error('Informe o caminho do .xlsx (entre aspas se tiver espacos)'); process.exit(1); }

const wb = XLSX.readFile(arquivo, { cellDates: true });
const sheet = (nome: string) => wb.Sheets[nome];
const dt = (v: any): Date | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const txt = (v: any) => (v == null ? null : String(v).trim() || null);
const nat = (v: any) => txt(v) ?? "Indefinida";
const num = (v: any) => Math.abs(Number(v) || 0);
const verdadeiro = (v: any) => String(v).toLowerCase().startsWith("verdadeiro") || v === true;

async function emLotes<T>(itens: T[], criar: (lote: T[]) => Promise<any>, tam = 1000) {
  for (let i = 0; i < itens.length; i += tam) await criar(itens.slice(i, i + tam));
  return itens.length;
}

async function importar() {
  console.log("Limpando tabelas...");
  await prisma.$transaction([
    prisma.contaPagar.deleteMany(), prisma.contaReceber.deleteMany(), prisma.lancamento.deleteMany(),
    prisma.cheque.deleteMany(), prisma.chequeDevolvido.deleteMany(), prisma.movimentoCaixa.deleteMany(),
    prisma.saldoBanco.deleteMany(), prisma.saldoInicial.deleteMany(), prisma.mapaDescricao.deleteMany(),
    prisma.classificacao.deleteMany(), prisma.banco.deleteMany(), prisma.parametro.deleteMany(),
  ]);

  const ap = XLSX.utils.sheet_to_json<any>(sheet("A_Pagar"), { range: 6 });
  const ar = (() => { try { return XLSX.utils.sheet_to_json<any>(sheet("A_Receber"), { range: 5 }); } catch { return []; } })();
  const lan = (() => { try { return XLSX.utils.sheet_to_json<any>(sheet("Lançamentos")); } catch { return []; } })();

  const dexpara = XLSX.utils.sheet_to_json<any>(sheet("De_Para"), { range: "P1:T200" });
  const ccRows = XLSX.utils.sheet_to_json<any>(sheet("De_Para"), { range: "K2:L200" });
  const ccMap = new Map<string, string | null>();
  for (const r of ccRows) if (r["Natureza"]) ccMap.set(String(r["Natureza"]).trim(), txt(r["Centro de Custos"]));
  const classMap = new Map<string, any>();
  for (const r of dexpara) {
    const n = txt(r["Natureza"]); if (!n || classMap.has(n)) continue;
    classMap.set(n, { natureza: n, fc: txt(r["FC"]) ?? "Fluxo de Caixa Operacional", grupo: txt(r["Grupo"]) ?? "Outros", subGrupo: txt(r["Sub-Grupo"]) ?? "", conta: txt(r["Conta"]) ?? "", centroCustos: ccMap.get(n) ?? null });
  }

  // GARANTIA DE INTEGRIDADE: toda natureza usada precisa existir na classificacao.
  const usadas = new Set<string>(["Indefinida"]);
  for (const r of ap) usadas.add(nat(r["Natureza"]));
  for (const r of ar) usadas.add(nat(r["Natureza"]));
  for (const r of lan) usadas.add(nat(r["Natureza"]));
  for (const n of usadas) {
    if (!classMap.has(n)) classMap.set(n, { natureza: n, fc: "Fluxo de Caixa Operacional", grupo: "Outros", subGrupo: "", conta: "", centroCustos: ccMap.get(n) ?? null });
  }
  await emLotes([...classMap.values()], (lote) => prisma.classificacao.createMany({ data: lote, skipDuplicates: true }));
  console.log(`Classificacao: ${classMap.size} naturezas (${usadas.size} usadas; faltantes criadas como "Outros")`);

  const t2 = XLSX.utils.sheet_to_json<any>(sheet("De_Para"), { range: "A1:H762" })
    .filter((r) => txt(r["Descrição da Movimentação"]))
    .map((r) => ({ tipo: txt(r["Tipo"]), descricaoMovimentacao: String(r["Descrição da Movimentação"]).trim(), natureza: nat(r["Natureza"]), centroCustos: txt(r["Centro de Custos"]), observacao: txt(r["Observação"]), naturezaAnterior: txt(r["Natureza Anterior"]), centroCustosAnterior: txt(r["Centro de Custos Anterior"]) }));
  await emLotes(t2, (lote) => prisma.mapaDescricao.createMany({ data: lote }));
  console.log(`MapaDescricao: ${t2.length}`);

  await prisma.banco.createMany({ data: ["Banco do Brasil", "Bradesco", "Santander", "Sicoob"].map((nome) => ({ nome })), skipDuplicates: true });

  const dadosAP = ap
    .filter((r) => dt(r["Vencimento"]) && (r["Movimentação"] || r["Tipiificação"]))
    .map((r) => ({
      tipificacao: txt(r["Tipiificação"]) ?? "Saída", banco: txt(r["Banco"]),
      movimentacao: (txt(r["Movimentação"]) ?? "").slice(0, 250), valor: num(r["Valor"]),
      meioPagamento: txt(r["Tipo"]), detalhe: txt(r["Descrição"]),
      competencia: dt(r["Competência"]), vencimento: dt(r["Vencimento"])!, dataProgramada: dt(r["Programação"]),
      efetivacao: dt(r["Efetivação"]), tabela: txt(r["Tabela"]) === "Extra" ? "Extra" : "Oficial",
      obrigatorio: txt(r["Obrigatório"]) === "Sim", selecionado: verdadeiro(r["Observação"]),
      natureza: nat(r["Natureza"]), centroCustos: null as string | null,
    }));
  const np = await emLotes(dadosAP, (lote) => prisma.contaPagar.createMany({ data: lote }));
  console.log(`Contas a pagar: ${np}`);

  const dadosAR = ar
    .filter((r) => dt(r["Vencimento"]) && r["Movimentação"])
    .map((r) => ({
      movimentacao: (txt(r["Movimentação"]) ?? "").slice(0, 250), valor: num(r["Valor"]),
      meioPagamento: txt(r["Tipo"]), detalhe: txt(r["Descrição"]), centroCustos: txt(r["C. Custo"]),
      competencia: dt(r["Competência"]), vencimento: dt(r["Vencimento"])!, efetivacao: dt(r["Efetivação"]),
      banco: txt(r["Banco"]), tabela: txt(r["Tabela"]), natureza: nat(r["Natureza"]), selecionado: verdadeiro(r["Observação"]),
    }));
  const nr = await emLotes(dadosAR, (lote) => prisma.contaReceber.createMany({ data: lote }));
  console.log(`Contas a receber: ${nr}`);

  const dadosLan = lan
    .filter((r) => r["Tipiificação"])
    .map((r) => ({
      tipificacao: txt(r["Tipiificação"]) ?? "Saída", clienteFornecedor: txt(r["Cliente/Fornecedor"]),
      dataColeta: dt(r["Data de Coleta"]), numCheque: txt(r["Núm Cheque"]), nomeCheque: txt(r["Nome Cheque"]),
      banco: txt(r["Banco"]), descricao: (txt(r["Descrição da Movimentação"]) ?? "").slice(0, 250),
      valor: num(r["Valor (R$)"]), vencimento: dt(r["Data de Vencimento"]), liquidacao: dt(r["Data Liquidação"]),
      observacao: txt(r["Observação"]), natureza: nat(r["Natureza"]), inadimplencia: txt(r["Inadimplência"]),
    }));
  const nl = await emLotes(dadosLan, (lote) => prisma.lancamento.createMany({ data: lote }));
  console.log(`Lancamentos: ${nl}`);

  const cheques = (() => { try { return XLSX.utils.sheet_to_json<any>(sheet("Cheques")); } catch { return []; } })()
    .filter((r) => r["Descrição"]).map((r) => ({ tipificacao: txt(r["Tipificação"]) ?? "", descricao: String(r["Descrição"]).slice(0, 250), lancamento: txt(r["Lançamento"]), data: dt(r["Data"]), valor: num(r["Valor"]) }));
  await emLotes(cheques, (lote) => prisma.cheque.createMany({ data: lote }));

  const cdev = (() => { try { return XLSX.utils.sheet_to_json<any>(sheet("Cheques Devolvidos")); } catch { return []; } })()
    .filter((r) => r["Descrição"]).map((r) => ({ banco: txt(r["Banco"]), descricao: String(r["Descrição"]).slice(0, 250), valor: num(r["Valor"]), status: txt(r["Status"]), data: dt(r["Data"]) }));
  await emLotes(cdev, (lote) => prisma.chequeDevolvido.createMany({ data: lote }));

  const caixa = (() => { try { return XLSX.utils.sheet_to_json<any>(sheet("Caixa")); } catch { return []; } })()
    .filter((r) => r["Descrição"]).map((r) => ({ entrada: txt(r["Entrada"]), descricao: String(r["Descrição"]).slice(0, 250), valor: num(r["Valor"]), lancamento: txt(r["Lançamento"]), natureza: txt(r["Natureza"]), centroCustos: txt(r["Centro de Custos"]), data: dt(r["Data"]), tipificacao: txt(r["Tipificação"]) }));
  await emLotes(caixa, (lote) => prisma.movimentoCaixa.createMany({ data: lote }));
  console.log(`Cheques: ${cheques.length} · Devolvidos: ${cdev.length} · Caixa: ${caixa.length}`);

  try {
    const sd = XLSX.utils.sheet_to_json<any>(sheet("Saldo"), { range: 4 })
      .filter((r) => dt(r["Data"]) && r["Banco"])
      .map((r) => ({ data: dt(r["Data"])!, banco: String(r["Banco"]), valor: Number(r["Valor"]) || 0 }));
    const m = new Map<string, any>();
    for (const s of sd) m.set(`${s.data.toISOString()}|${s.banco}`, s);
    await prisma.saldoBanco.createMany({ data: [...m.values()], skipDuplicates: true });
    console.log(`Saldos: ${m.size}`);
  } catch (e) { console.log("Saldo: pulada", (e as Error).message); }

  await prisma.parametro.create({ data: { chave: "saldo_maximo_dia", valor: "0" } });
  console.log("\nImportacao concluida (OK)");
}

importar().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());