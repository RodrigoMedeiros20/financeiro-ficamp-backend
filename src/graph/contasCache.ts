import { lerContas, ContaLeitura } from "./planilha";

const FRESCO_MS = 2 * 60 * 1000; // 2 minutos

let dados: ContaLeitura[] | null = null;
let carimbo = 0;                  // quando o cache foi preenchido (ms)
let lendo: Promise<ContaLeitura[]> | null = null; // leitura em andamento (evita ler 2x em paralelo)

// lê de verdade no Graph, atualiza o cache e evita leituras concorrentes
function lerEAtualizar(token: string): Promise<ContaLeitura[]> {
  if (lendo) return lendo; // já tem uma leitura acontecendo: reaproveita
  const p = lerContas(token)
    .then((cs) => {
      dados = cs;
      carimbo = Date.now();
      return cs;
    })
    .finally(() => { lendo = null; });
  lendo = p;
  return p;
}

export async function obterContas(token: string): Promise<{ contas: ContaLeitura[]; doCache: boolean; idadeMs: number }> {
  const idade = Date.now() - carimbo;

  // sem cache nenhum -> primeira leitura: espera
  if (!dados) {
    const cs = await lerEAtualizar(token);
    return { contas: cs, doCache: false, idadeMs: 0 };
  }

  // cache fresco -> serve na hora
  if (idade < FRESCO_MS) {
    return { contas: dados, doCache: true, idadeMs: idade };
  }

  // cache velho -> serve o que tem AGORA e relê por trás (sem fazer ninguém esperar)
  lerEAtualizar(token).catch(() => { /* se falhar, mantém o cache atual */ });
  return { contas: dados, doCache: true, idadeMs: idade };
}

export async function obterContasFresco(token: string): Promise<{ contas: ContaLeitura[]; doCache: boolean; idadeMs: number }> {
  const cs = await lerEAtualizar(token);
  return { contas: cs, doCache: false, idadeMs: 0 };
}

export function invalidar() {
  dados = null;
  carimbo = 0;
}