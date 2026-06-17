import assert from "node:assert";
import { valorComSinal, statusPagamento, condicao, diasAtraso, simularPagamento, derivarCampos } from "./rules";
import { ContaPagar } from "./types";

const HOJE = new Date("2026-06-10");
let ok = 0;
const t = (n: string, f: () => void) => { f(); ok++; console.log("  ✓", n); };

t("R1 entrada +", () => assert.equal(valorComSinal("Entrada", 100), 100));
t("R1 saída -", () => assert.equal(valorComSinal("Saida", 100), -100));
t("R3 sem efetivação", () => assert.equal(statusPagamento(null), "A Pagar"));
t("R3 com efetivação", () => assert.equal(statusPagamento(new Date("2026-06-01")), "Pago"));
t("R4 adiantado", () => assert.equal(condicao(new Date("2026-06-10"), new Date("2026-06-05"), HOJE), "Adiantado"));
t("R4 em dia", () => assert.equal(condicao(new Date("2026-06-10"), new Date("2026-06-10"), HOJE), "Em dia"));
t("R4 vencido (pago após)", () => assert.equal(condicao(new Date("2026-06-10"), new Date("2026-06-15"), HOJE), "Vencido"));
t("R4 vencido (aberto)", () => assert.equal(condicao(new Date("2026-06-01"), null, HOJE), "Vencido"));
t("R4 a vencer", () => assert.equal(condicao(new Date("2026-06-20"), null, HOJE), "A Vencer"));
t("R5 atraso", () => assert.equal(diasAtraso(new Date("2026-06-05"), null, HOJE), 5));
t("R5 adianto", () => assert.equal(diasAtraso(new Date("2026-06-10"), new Date("2026-06-07"), HOJE), -3));

const mk = (id: number, valor: number, tabela: "Oficial" | "Extra", efe?: string): ContaPagar =>
  derivarCampos({
    id, movimentacao: "T" + id, valor, banco: null, meioPagamento: null, detalhe: null,
    competencia: null, vencimento: "2026-06-05", dataProgramada: null, efetivacao: efe ?? null,
    tabela, obrigatorio: false, selecionado: false, natureza: "X", centroCustos: null,
    grupo: "Outros", fc: "Operacional",
  }, HOJE);

const contas = [mk(1, 300000, "Oficial"), mk(2, 5000, "Extra"), mk(3, 184000, "Oficial"), mk(4, 99, "Oficial", "2026-06-01")];
const r = simularPagamento(contas, { selecionados: [1, 2, 3, 4], saldoDisponivel: 239431 });
t("R6 oficial", () => assert.equal(r.totalOficial, 484000));
t("R6 extra", () => assert.equal(r.totalExtra, 5000));
t("R6 geral ignora pago", () => assert.equal(r.totalGeral, 489000));
t("R7 saldo após", () => assert.equal(r.saldoApos, 239431 - 489000));
t("R7 estoura", () => assert.equal(r.estoura, true));

console.log(`\n${ok} testes OK ✅`);
