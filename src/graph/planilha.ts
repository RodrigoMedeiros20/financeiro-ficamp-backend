// backend/src/graph/planilha.ts
// Lê a aba A_Pagar via Microsoft Graph e marca a coluna Observação (G) = true
// nas linhas selecionadas, IDENTIFICANDO POR NÚMERO DE LINHA + REVALIDAÇÃO.
//
// Estratégia (sem coluna de ID na planilha):
//  - A leitura devolve, para cada conta, a LINHA física (rowReal) e uma
//    "impressão digital" (fp) = Banco|Movimentação|Valor|Competência|Vencimento.
//  - No Confirmar, o backend RELÊ a planilha e, para cada conta, confere se a
//    linha rowReal ainda tem a mesma fp. Se bater, marca. Se não bater, tenta
//    reencontrar a conta pela fp; se for única, marca; se houver duplicidade ou
//    sumiço, NÃO marca e reporta para o usuário recarregar.

const ITEM = process.env.GRAPH_ITEM_ID!;
const SHEET = process.env.GRAPH_SHEET || "A_Pagar";
const BASE = `https://graph.microsoft.com/v1.0/me/drive/items/${ITEM}/workbook`;

// Cabeçalho na LINHA 7 (1-based); dados começam na 8.
const HEADER_ROW = 7;
// Índices 0-based das colunas dentro de usedRange:
// A=Tipificação(0) B=Banco(1) C=Movimentação(2) D=Valor(3) E=Tipo(4)
// F=Descrição(5) G=Observação(6) H=Competência(7) I=Vencimento(8) J=Programação(9)
const COL = { tipif: 0, banco: 1, mov: 2, valor: 3, tipo: 4, desc: 5, obs: 6, comp: 7, venc: 8, prog: 9, efet: 10, tabela: 11, obrig: 12 };

export type ContaLeitura = {
  rowReal: number;          // número da linha física na planilha (1-based)
  fp: string;               // impressão digital
  movimentacao: string;
  valor: number;
  banco: string;
  tipo: string | null;
  descricao: string | null;
  vencimentoISO: string;
  programadaISO: string;
  observacao: boolean;
  tabela: "Oficial" | "Extra" | string;
  obrigatorio: boolean;
};

// item enviado pelo front no Confirmar
export type Alvo = { rowReal: number; fp: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch ao Graph com retry/backoff em erros temporários (429/503/500/504) e timeout por chamada.
async function gfetch(token: string, url: string, init: RequestInit = {}, tentativas = 3): Promise<any> {
  let ultimoErro = "";
  for (let i = 0; i < tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000); // 30s por tentativa
    let r: Response;
    try {
      r = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
    } catch (err: any) {
      clearTimeout(timer);
      ultimoErro = `fetch falhou: ${err?.message || err}`;
      if (i < tentativas - 1) { await sleep(Math.min(1000 * 2 ** i, 8000)); continue; }
      throw new Error(ultimoErro);
    }
    clearTimeout(timer);
    if (r.ok) return r.status === 204 ? null : r.json();

    const corpo = await r.text();
    ultimoErro = `Graph ${r.status}: ${corpo}`;
    // erros temporários -> espera e tenta de novo
    if ([429, 500, 503, 504].includes(r.status) && i < tentativas - 1) {
      const ra = Number(r.headers.get("Retry-After"));
      const espera = ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** i, 8000); // backoff até 8s
      await sleep(espera);
      continue;
    }
    throw new Error(ultimoErro);
  }
  throw new Error(ultimoErro || "Graph: falha após várias tentativas");
}

// cabeçalho de sessão (se houver)
function hSess(sessionId?: string): Record<string,string> {
  return sessionId ? { "workbook-session-id": sessionId } : {};
}

// lê UMA linha (colunas A:M) -> array de valores; null se vazia/fora do range
async function lerLinha(token: string, rowReal: number, sessionId?: string): Promise<any[] | null> {
  const data = await gfetch(
    token,
    `${BASE}/worksheets('${SHEET}')/range(address='A${rowReal}:M${rowReal}')?$select=values`,
    { headers: hSess(sessionId) }
  );
  return data?.values?.[0] ?? null;
}

// lê uma única célula (verificação pós-escrita)
async function lerCelula(token: string, addr: string, sessionId?: string): Promise<any> {
  const data = await gfetch(
    token,
    `${BASE}/worksheets('${SHEET}')/range(address='${addr}')?$select=values`,
    { headers: hSess(sessionId) }
  );
  return data?.values?.[0]?.[0];
}

// abre uma sessão de workbook (abre o arquivo UMA vez). Retorna null se não conseguir.
async function abrirSessao(token: string): Promise<string | null> {
  try {
    const s = await gfetch(token, `${BASE}/createSession`, {
      method: "POST",
      body: JSON.stringify({ persistChanges: true }),
    });
    return (s?.id as string) || null;
  } catch { return null; }
}

async function fecharSessao(token: string, sessionId: string) {
  try {
    await gfetch(token, `${BASE}/closeSession`, { method: "POST", headers: hSess(sessionId) });
  } catch {}
}

// matriz de valores + linha real inicial (uma única leitura do usedRange)
async function lerMatriz(token: string): Promise<{ valores: any[][]; linha0: number }> {
  const data = await gfetch(token, `${BASE}/worksheets('${SHEET}')/usedRange(valuesOnly=true)?$select=values,rowIndex`);
  const valores = (data?.values as any[][]) || [];
  const ri = Number(data?.rowIndex);
  const linha0 = Number.isFinite(ri) ? ri + 1 : 1; // 0-based -> 1-based
  return { valores, linha0 };
}

// número de série/data do Excel ou string -> ISO yyyy-mm-dd
function paraISO(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(+d) ? String(v) : d.toISOString().slice(0, 10);
}

// impressão digital estável (Banco|Movimentação|Valor|Competência|Vencimento)
function fingerprint(linha: any[]): string {
  const banco = String(linha[COL.banco] ?? "").trim();
  const mov = String(linha[COL.mov] ?? "").trim();
  const valor = Number(linha[COL.valor] ?? 0).toFixed(2);
  const comp = String(linha[COL.comp] ?? "").trim();
  const venc = paraISO(linha[COL.venc]);
  return [banco, mov, valor, comp, venc].join("|");
}

export async function lerContas(token: string): Promise<ContaLeitura[]> {
  const { valores: matriz, linha0 } = await lerMatriz(token);
  const inicioDados = Math.max(0, (HEADER_ROW + 1) - linha0); // índice da 1ª linha de dados
  const out: ContaLeitura[] = [];
  for (let i = inicioDados; i < matriz.length; i++) {
    const linha = matriz[i];
    const mov = String(linha[COL.mov] ?? "").trim();
    if (!mov) continue;                       // pula linhas vazias
    if (linha[COL.obs] === true) continue;    // já marcada => não é "A Pagar"
    out.push({
      rowReal: linha0 + i,                    // linha REAL na planilha
      fp: fingerprint(linha),
      movimentacao: mov,
      valor: Number(linha[COL.valor] ?? 0),
      banco: String(linha[COL.banco] ?? "").trim(),
      tipo: linha[COL.tipo] != null ? String(linha[COL.tipo]) : null,
      descricao: linha[COL.desc] != null ? String(linha[COL.desc]) : null,
      vencimentoISO: paraISO(linha[COL.venc]),
      programadaISO: paraISO(linha[COL.prog]),
      observacao: linha[COL.obs] === true,
      tabela: String(linha[COL.tabela] ?? "").trim() || "Oficial",
      obrigatorio: String(linha[COL.obrig] ?? "").trim().toLowerCase() === "sim",
    });
  }
  return out;
}

// CONFIRMAR: abre a sessão UMA vez (arquivo aberto 1x) e faz tudo dentro dela.
export async function confirmarPagamentos(token: string, alvos: Alvo[]) {
  const confirmadas: number[] = [];
  const conflitos: { alvo: Alvo; motivo: string }[] = [];
  const falhas: { rowReal: number; motivo: string }[] = [];

  // abre 1 sessão (reaproveitada em todas as chamadas). Se falhar, segue sem sessão.
  const sessionId = await abrirSessao(token);

  try {
    for (const alvo of alvos) {
      try {
        const linha = await lerLinha(token, alvo.rowReal, sessionId || undefined);
        if (!linha) { conflitos.push({ alvo, motivo: "linha não encontrada" }); continue; }
        const fpLido = fingerprint(linha);
        if (fpLido !== alvo.fp) {
          console.log("FP DIVERGE row", alvo.rowReal, "\n  esperado:", alvo.fp, "\n  lido:    ", fpLido, "\n  linhaRaw:", JSON.stringify(linha));
          conflitos.push({ alvo, motivo: "a planilha mudou (recarregue e tente de novo)" });
          continue;
        }
        if (linha[COL.obs] === true) { confirmadas.push(alvo.rowReal); continue; }

        await gfetch(token, `${BASE}/worksheets('${SHEET}')/range(address='G${alvo.rowReal}')`, {
          method: "PATCH",
          headers: hSess(sessionId || undefined),
          body: JSON.stringify({ values: [[true]] }),
        });

        const v = await lerCelula(token, `G${alvo.rowReal}`, sessionId || undefined);
        if (v === true) confirmadas.push(alvo.rowReal);
        else falhas.push({ rowReal: alvo.rowReal, motivo: "não persistiu (verificação falhou)" });
      } catch (e: any) {
        falhas.push({ rowReal: alvo.rowReal, motivo: e?.message || "erro ao gravar" });
      }
    }
  } finally {
    if (sessionId) await fecharSessao(token, sessionId);
  }

  return {
    ok: conflitos.length === 0 && falhas.length === 0,
    marcadas: confirmadas.length,
    linhas: confirmadas,
    conflitos,
    falhas,
    usouSessao: !!sessionId,
  };
}