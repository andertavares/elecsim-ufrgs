#!/usr/bin/env node
// Automatic grader: checks whether a circuit (JSON) implements a truth table (CSV/TSV).
// Usage: node grader.js <circuit.json> <truth-table.csv|tsv> [--quiet]
// Exit codes: 0 = correct, 1 = incorrect, 2 = usage/input error.
//
// Inputs are the circuit's switches, outputs are its lamps. Columns are matched to
// switches/lamps by name (case-insensitive); unnamed (or unmatched) ones are matched by
// trying every assignment, so the order of variables never matters.
// Separate circuits in one file are evaluated independently; if more than one
// is found, the result is flagged. The submission passes if any circuit matches.
const fs = require('fs');
const { simulate } = require('./engine.js');

const MAX_PERMUTATION_VARS = 8;

function norm(s) { return String(s || '').trim().toLowerCase(); }

function parseBool(v) {
  const s = norm(v);
  if (['1', 'true', 't', 'v', 'on', 'sim', 'yes', 'high', 'h'].includes(s)) return true;
  if (['0', 'false', 'f', 'off', 'nao', 'não', 'no', 'low', 'l'].includes(s)) return false;
  throw new Error(`Valor inválido na tabela verdade: "${v}"`);
}

function parseTable(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) throw new Error('A tabela verdade precisa de cabeçalho e ao menos uma linha.');
  const delim = ['\t', ';', ','].find(d => lines[0].includes(d));
  if (!delim) throw new Error('Delimitador não reconhecido (use TSV ou CSV).');
  const split = l => l.split(delim).map(c => c.trim().replace(/^"(.*)"$/, '$1'));
  const header = split(lines[0]);
  const rows = lines.slice(1).map(split);
  rows.forEach((r, i) => {
    if (r.length !== header.length) throw new Error(`Linha ${i + 2} tem ${r.length} colunas; esperado ${header.length}.`);
  });
  return { header, rows: rows.map(r => r.map(parseBool)) };
}

// Splits the drawing into independent circuits. Batteries are shared sources and do
// not join circuits together; every other component joins whatever it is wired to.
function findCircuits(circuit) {
  const comps = circuit.components, wires = circuit.wires || [];
  const parent = new Map(comps.map(c => [c.id, c.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const byId = new Map(comps.map(c => [c.id, c]));
  for (const w of wires) {
    const a = byId.get(w.fromComp), b = byId.get(w.toComp);
    if (!a || !b || a.type === 'battery' || b.type === 'battery') continue;
    parent.set(find(a.id), find(b.id));
  }
  const groups = new Map();
  for (const c of comps) {
    if (c.type === 'battery') continue;
    const r = find(c.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  const batteries = comps.filter(c => c.type === 'battery');
  const result = [];
  for (const members of groups.values()) {
    const inputs = members.filter(c => c.type === 'switch');
    const outputs = members.filter(c => c.type === 'lamp');
    if (!inputs.length || !outputs.length) continue; // stray/incomplete parts are not circuits
    const ids = new Set(members.concat(batteries).map(c => c.id));
    const sub = members.concat(batteries).map(c => JSON.parse(JSON.stringify(c)));
    const subWires = wires.filter(w => ids.has(w.fromComp) && ids.has(w.toComp));
    result.push({
      comps: sub, wires: subWires,
      inputs: sub.filter(c => c.type === 'switch'),
      outputs: sub.filter(c => c.type === 'lamp' && ids.has(c.id))
        .filter(c => members.some(m => m.id === c.id))
    });
  }
  return result;
}

// Simulates every input combination; returns Map(key of input bits) -> output bits.
function evaluate(c) {
  const n = c.inputs.length, table = new Map();
  for (let mask = 0; mask < (1 << n); mask++) {
    const bits = c.inputs.map((_, i) => Boolean(mask >> i & 1));
    c.inputs.forEach((s, i) => { s.closed = bits[i]; });
    simulate(c.comps, c.wires);
    table.set(bits.join(), c.outputs.map(l => Boolean(l.on)));
  }
  return table;
}

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return; }
  for (let i = 0; i < arr.length; i++) {
    for (const rest of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) yield [arr[i], ...rest];
  }
}

// Yields assignments: for each circuit element index, the table column index.
// Named elements are pinned to the same-named column; the rest are permuted.
function* assignments(names, columnNames) {
  const assign = new Array(names.length).fill(-1);
  const used = new Set();
  names.forEach((n, i) => {
    const col = n ? columnNames.findIndex((cn, j) => cn === n && !used.has(j)) : -1;
    if (col >= 0) { assign[i] = col; used.add(col); }
  });
  const freeEls = names.map((_, i) => i).filter(i => assign[i] < 0);
  const freeCols = columnNames.map((_, j) => j).filter(j => !used.has(j));
  if (freeEls.length > MAX_PERMUTATION_VARS) {
    throw new Error(`Variáveis sem nome demais (${freeEls.length}) para testar todas as ordens; nomeie-as.`);
  }
  for (const p of permutations(freeCols)) {
    const a = assign.slice();
    freeEls.forEach((el, k) => { a[el] = p[k]; });
    yield a;
  }
}

function check(c, table) {
  const nIn = table.inCols.length;
  const sim = evaluate(c);
  const inNames = c.inputs.map(s => norm(s.name));
  const outNames = c.outputs.map(l => norm(l.name));
  let best = null;
  for (const ia of assignments(inNames, table.inCols.map(h => norm(h)))) {
    for (const oa of assignments(outNames, table.outCols.map(h => norm(h)))) {
      const wrong = [];
      for (const row of table.rows) {
        const bits = new Array(nIn);
        ia.forEach((col, i) => { bits[i] = row.in[col]; });
        const got = sim.get(bits.join());
        const expected = oa.map(col => row.out[col]);
        const bad = expected.some((e, k) => e !== got[k]);
        if (bad) wrong.push({ row, got: oa.map((_, k) => got[k]), oa });
      }
      if (!best || wrong.length < best.wrong.length) best = { ia, oa, wrong };
      if (!wrong.length) return { ok: true, ia, oa, c };
    }
  }
  return { ok: false, best, c, reason: `${best.wrong.length} linha(s) da tabela divergem` };
}

function main() {
  const args = process.argv.slice(2).filter(a => a !== '--quiet');
  const quiet = args.length !== process.argv.length - 2;
  if (args.length !== 2) {
    console.error('Uso: node grader.js <circuito.json> <tabela.csv|tsv> [--quiet]');
    return 2;
  }
  let circuit, parsed;
  try {
    circuit = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    parsed = parseTable(fs.readFileSync(args[1], 'utf8'));
  } catch (e) {
    console.error('Erro: ' + e.message);
    return 2;
  }
  if (!Array.isArray(circuit.components)) { console.error('Erro: JSON de circuito inválido.'); return 2; }

  const circuits = findCircuits(circuit);
  const log = quiet ? () => {} : console.log;
  if (!circuits.length) { console.log('INCORRETO: nenhum circuito (interruptor + lâmpada) encontrado.'); return 1; }

  const nCols = parsed.header.length;
  const results = circuits.map((c, idx) => {
    const nOut = c.outputs.length, nIn = nCols - nOut;
    const lampNames = new Set(c.outputs.map(l => norm(l.name)).filter(Boolean));
    if (nIn < 1 || nIn !== c.inputs.length) {
      return { idx, ok: false, reason: `circuito tem ${c.inputs.length} interruptor(es) e ${nOut} lâmpada(s); a tabela tem ${nCols} colunas` };
    }
    // Output columns: those named like a lamp (when every lamp is named and found),
    // otherwise the last columns of the table.
    const all = parsed.header.map((_, j) => j);
    const named = all.filter(j => lampNames.has(norm(parsed.header[j])));
    const outIdx = lampNames.size === nOut && named.length === nOut ? named : all.slice(nIn);
    const inIdx = parsed.header.map((_, j) => j).filter(j => !outIdx.includes(j));
    const table = {
      inCols: inIdx.map(j => parsed.header[j]),
      outCols: outIdx.map(j => parsed.header[j]),
      rows: parsed.rows.map(r => ({ in: inIdx.map(j => r[j]), out: outIdx.map(j => r[j]) }))
    };
    try {
      const r = check(c, table);
      return { idx, table, ...r };
    } catch (e) { return { idx, ok: false, reason: e.message }; }
  });

  const passed = results.filter(r => r.ok);
  results.forEach(r => {
    if (r.ok) {
      log(`Circuito ${r.idx + 1}: CORRETO`);
      const map = (els, a, cols) => els.map((e, i) => `${e.name || '(sem nome)'}→${cols[a[i]]}`).join(', ');
      log(`  entradas: ${map(r.c.inputs, r.ia, r.table.inCols)}`);
      log(`  saídas:   ${map(r.c.outputs, r.oa, r.table.outCols)}`);
    } else {
      log(`Circuito ${r.idx + 1}: INCORRETO (${r.reason})`);
      if (r.best) {
        const b = r.best;
        b.wrong.slice(0, 5).forEach(w => {
          log(`  entradas=${w.row.in.map(Number).join('')} esperado=${w.row.out.map(Number).join('')} obtido=${w.got.map(Number).join('')} (colunas permutadas conforme melhor correspondência)`);
        });
      }
    }
  });
  if (circuits.length > 1) {
    console.log(`AVISO: ${circuits.length} circuitos independentes encontrados no envio.`);
  }
  console.log(passed.length ? 'RESULTADO: CORRETO' : 'RESULTADO: INCORRETO');
  return passed.length ? 0 : 1;
}

process.exitCode = main();
