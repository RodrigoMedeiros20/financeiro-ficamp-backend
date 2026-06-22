const ITEM = process.env.GRAPH_ITEM_ID!;
const SHEET = process.env.GRAPH_SHEET || "A_Pagar";
const DRIVE = process.env.GRAPH_DRIVE_ID!;
const BASE = `https://graph.microsoft.com/v1.0/drives/${DRIVE}/items/${ITEM}/workbook`;

const HEADER_ROW = 7;
const COL = { tipif: 0, banco: 1, mov: 2, valor: 3, tipo: 4, desc: 5, obs: 6, comp: 7, venc: 8, prog: 9, efet: 10, tabela: 11, obrig: 12, natureza: 13 };
const ULTIMA_COL = "N";

export type ContaLeitura = {
    rowReal: number;
    fp: string;
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
        if ([429, 500, 503, 504].includes(r.status) && i < tentativas - 1) {
            const ra = Number(r.headers.get("Retry-After"));
            const espera = ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** i, 8000);
            await sleep(espera);
            continue;
        }
        throw new Error(ultimoErro);
    }
    throw new Error(ultimoErro || "Graph: falha após várias tentativas");
}

function hSess(sessionId?: string): Record<string, string> {
    return sessionId ? { "workbook-session-id": sessionId } : {};
}

async function lerLinha(token: string, rowReal: number, sessionId?: string): Promise<any[] | null> {
    const data = await gfetch(
        token,
        `${BASE}/worksheets('${SHEET}')/range(address='A${rowReal}:${ULTIMA_COL}${rowReal}')?$select=values`,
        { headers: hSess(sessionId) }
    );
    return data?.values?.[0] ?? null;
}

async function lerCelula(token: string, addr: string, sessionId?: string): Promise<any> {
    const data = await gfetch(
        token,
        `${BASE}/worksheets('${SHEET}')/range(address='${addr}')?$select=values`,
        { headers: hSess(sessionId) }
    );
    return data?.values?.[0]?.[0];
}

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
    } catch { }
}

async function lerMatriz(token: string): Promise<{ valores: any[][]; linha0: number }> {
    const meta = await gfetch(
        token,
        `${BASE}/worksheets('${SHEET}')/usedRange(valuesOnly=true)?$select=rowIndex,rowCount`
    );
    const ri = Number(meta?.rowIndex);
    const rc = Number(meta?.rowCount);
    const linha0 = Number.isFinite(ri) ? ri + 1 : 1;
    if (!Number.isFinite(rc) || rc <= 0) return { valores: [], linha0 };
    const ultima = linha0 + rc - 1;

    const data = await gfetch(
        token,
        `${BASE}/worksheets('${SHEET}')/range(address='A${linha0}:${ULTIMA_COL}${ultima}')?$select=values`
    );
    const valores = (data?.values as any[][]) || [];
    return { valores, linha0 };
}

function paraISO(v: any): string {
    if (v == null || v === "") return "";
    if (typeof v === "number") {
        const ms = Math.round((v - 25569) * 86400 * 1000);
        return new Date(ms).toISOString().slice(0, 10);
    }
    const d = new Date(v);
    return isNaN(+d) ? String(v) : d.toISOString().slice(0, 10);
}

function fingerprint(linha: any[]): string {
    const banco = String(linha[COL.banco] ?? "").trim();
    const mov   = String(linha[COL.mov] ?? "").trim();
    const valor = Number(linha[COL.valor] ?? 0).toFixed(2);
    const tipo  = String(linha[COL.tipo] ?? "").trim();
    const desc  = String(linha[COL.desc] ?? "").trim();
    const comp  = String(linha[COL.comp] ?? "").trim();
    const venc  = paraISO(linha[COL.venc]);
    const prog  = paraISO(linha[COL.prog]);
    const nat   = String(linha[COL.natureza] ?? "").trim();
    return [banco, mov, valor, tipo, desc, comp, venc, prog, nat].join("|");
}

export async function lerContas(token: string): Promise<ContaLeitura[]> {
    const { valores: matriz, linha0 } = await lerMatriz(token);
    const inicioDados = Math.max(0, (HEADER_ROW + 1) - linha0);
    const out: ContaLeitura[] = [];
    for (let i = inicioDados; i < matriz.length; i++) {
        const linha = matriz[i];
        if (!linha) continue;
        const mov = String(linha[COL.mov] ?? "").trim();
        if (!mov) continue;
        if (linha[COL.obs] === true) continue;
        out.push({
            rowReal: linha0 + i,
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

export async function confirmarPagamentos(token: string, alvos: Alvo[]) {
    const confirmadas: number[] = [];
    const conflitos: { alvo: Alvo; motivo: string }[] = [];
    const falhas: { rowReal: number; motivo: string }[] = [];

    const sessionId = await abrirSessao(token);

    try {
        for (const alvo of alvos) {
            try {
                const linha = await lerLinha(token, alvo.rowReal, sessionId || undefined);
                if (!linha) { conflitos.push({ alvo, motivo: "linha não encontrada" }); continue; }
                const fpLido = fingerprint(linha);
                if (fpLido !== alvo.fp) {
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