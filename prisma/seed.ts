// Dados de demonstração (junho/2026) para rodar sem importar a planilha.
// Uso: npm run db:seed
import { prisma } from "../src/db/prisma";

const CLASS = [
  ["Imobilizado", "FC Pós Investimento", "Imobilizado"],
  ["Energia Elétrica", "Fluxo de Caixa Operacional", "Desp. Utilidades"],
  ["Folha de Pagamento", "Fluxo de Caixa Operacional", "Desp. Pessoal"],
  ["Matéria-Prima", "Fluxo de Caixa Operacional", "Mat. Prima/ Embalagens"],
  ["Impostos", "Fluxo de Caixa Operacional", "Impostos"],
  ["Pró-Labore", "FC Pós Desp. Diretoria", "Desp. Diretoria"],
  ["Serviço PJ", "Fluxo de Caixa Operacional", "Serviço PJ"],
] as const;

const CONTAS: [string, number, "Oficial" | "Extra", boolean, string, string, string][] = [
  // desc, valor, tabela, obrig, vencimento, natureza, meioPagamento
  ["RIETER - MÁQUINA 2/11", 300000, "Oficial", false, "2026-06-01", "Imobilizado", "Transferência"],
  ["LUCIANA", 5000, "Extra", false, "2026-06-08", "Pró-Labore", "PIX"],
  ["FIOS BEM BRASIL NF124", 9666, "Oficial", true, "2026-06-05", "Matéria-Prima", "Boleto"],
  ["ICMS ANTECIPADO (FICAMP)", 17081, "Oficial", true, "2026-06-09", "Impostos", "Débito em conta"],
  ["PETRUCIO SANTOS ADV", 5000, "Extra", true, "2026-06-09", "Serviço PJ", "PIX"],
  ["ENERGISA - FATURA JUNHO", 184000, "Oficial", true, "2026-06-15", "Energia Elétrica", "Boleto"],
  ["FOLHA DE PAGAMENTO - JUNHO", 420000, "Oficial", true, "2026-06-16", "Folha de Pagamento", "Transferência"],
  ["SICOOB - EMPRÉSTIMO 17/42", 22769, "Oficial", true, "2026-06-20", "Impostos", "Débito em conta"],
  ["VALE TRANSPORTE - JULHO", 23500, "Oficial", true, "2026-06-22", "Folha de Pagamento", "Boleto"],
  ["CHURCHILL - PRÓ-LABORE", 30000, "Extra", false, "2026-06-28", "Pró-Labore", "PIX"],
  ["MENDES E BARROS - IMPORTAÇÃO", 94742, "Oficial", false, "2026-06-30", "Imobilizado", "Transferência"],
  ["CARTÃO NUBANK", 4124, "Extra", false, "2026-06-25", "Pró-Labore", "Cartão"],
];

async function main() {
  await prisma.$transaction([
    prisma.contaPagar.deleteMany(), prisma.classificacao.deleteMany(),
    prisma.banco.deleteMany(), prisma.saldoBanco.deleteMany(),
  ]);
  for (const [natureza, fc, grupo] of CLASS)
    await prisma.classificacao.create({ data: { natureza, fc, grupo, subGrupo: grupo, conta: grupo, centroCustos: null } });
  for (const nome of ["Banco do Brasil", "Bradesco", "Santander", "Sicoob"])
    await prisma.banco.create({ data: { nome } });
  for (const [desc, valor, tabela, obrig, venc, natureza, meio] of CONTAS)
    await prisma.contaPagar.create({ data: {
      movimentacao: desc, valor, tabela, obrigatorio: obrig, vencimento: new Date(venc),
      natureza, meioPagamento: meio, banco: "Bradesco", dataProgramada: new Date(venc),
    }});
  await prisma.saldoBanco.create({ data: { data: new Date("2026-06-10"), banco: "Bradesco", valor: 239431 } });
  console.log("Seed concluído ✅ (12 contas, banco financeiro)");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
