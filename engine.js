// --- Component definitions ---
// Each component has named pins with relative positions
function getPins(comp) {
  const {type, x, y} = comp;
  switch(type) {
    case 'battery':
      return {
        pos: {x: x+25, y: y},
        neg: {x: x+25, y: y+50}
      };
    case 'switch':
      return {
        a: {x: x,    y: y+20},
        b: {x: x+60, y: y+20}
      };
    case 'resistor':
      return {
        a: {x: x,    y: y+20},
        b: {x: x+60, y: y+20}
      };
    case 'lamp':
      return {
        a: {x: x+25, y: y},
        b: {x: x+25, y: y+60}
      };
    case 'connector':
      return {
        n: {x: x+20, y: y},
        e: {x: x+40, y: y+20},
        s: {x: x+20, y: y+40},
        w: {x: x,    y: y+20}
      };
    case 'and':
    case 'nand':
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor':
      return {
        a: {x: x,    y: y+12},
        b: {x: x,    y: y+28},
        out: {x: x+60, y: y+20}
      };
    case 'not':
      return {
        in: {x: x,    y: y+20},
        out: {x: x+60, y: y+20}
      };
    case 'sr-latch':
      return {
        s: {x: x,    y: y+12},
        r: {x: x,    y: y+28},
        q: {x: x+60, y: y+12},
        qbar: {x: x+60, y: y+28}
      };
    case 'd-flipflop':
      return {
        d: {x: x,    y: y+12},
        clk: {x: x,    y: y+28},
        q: {x: x+60, y: y+12},
        qbar: {x: x+60, y: y+28}
      };
    case 'oscillator':
      return {
        out: {x: x+60, y: y+20},
        gnd: {x: x,    y: y+20}
      };
    default: return {};
  }
}

function compSize(type) {
  switch(type) {
    case 'battery':    return {w:50, h:70};
    case 'switch':     return {w:60, h:40};
    case 'lamp':       return {w:50, h:60};
    case 'resistor':   return {w:60, h:40};
    case 'connector':  return {w:40, h:40};
    case 'and':
    case 'nand':
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor':
    case 'not':
    case 'sr-latch':
    case 'd-flipflop':
    case 'oscillator': return {w:60, h:40};
    default:           return {w:60, h:60};
  }
}

function gateLogic(type, values) {
  switch(type) {
    case 'and': return Boolean(values.a) && Boolean(values.b);
    case 'nand': return !(Boolean(values.a) && Boolean(values.b));
    case 'or': return Boolean(values.a) || Boolean(values.b);
    case 'nor': return !(Boolean(values.a) || Boolean(values.b));
    case 'xor': return Boolean(values.a) !== Boolean(values.b);
    case 'xnor': return Boolean(values.a) === Boolean(values.b);
    case 'not': return !Boolean(values.in);
    default: return false;
  }
}

// --- Simulation ---
// Wires, connectors and closed switches have 0 resistance; lamps and resistors
// share the same resistance value. Current is assumed to take the path(s) of
// least total resistance, so a 0-resistance bypass (e.g. a closed switch in
// parallel with a lamp) short-circuits the lamp and it stays off.
function pinKey(compId, pin) { return compId + ':' + pin; }

function buildElectricalGraph(components, wires) {
  const parent = new Map();
  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const c of components) {
    for (const pin of Object.keys(getPins(c))) find(pinKey(c.id, pin));
  }

  for (const w of wires) {
    union(pinKey(w.fromComp, w.fromPin), pinKey(w.toComp, w.toPin));
  }

  for (const c of components) {
    if (c.type === 'connector') {
      const pins = Object.keys(getPins(c));
      for (let i = 1; i < pins.length; i++) union(pinKey(c.id, pins[0]), pinKey(c.id, pins[i]));
    } else if (c.type === 'switch' && c.closed) {
      union(pinKey(c.id, 'a'), pinKey(c.id, 'b'));
    }
  }

  const edges = [];
  for (const c of components) {
    if (c.type === 'lamp' || c.type === 'resistor') {
      edges.push({ comp: c, a: find(pinKey(c.id, 'a')), b: find(pinKey(c.id, 'b')) });
    }
  }

  const batteries = components.filter(c => c.type === 'battery').map(bat => ({
    comp: bat,
    pos: find(pinKey(bat.id, 'pos')),
    neg: find(pinKey(bat.id, 'neg'))
  }));

  return { find, edges, batteries };
}

function multiSourceBfs(starts, adjacency) {
  const dist = new Map();
  const queue = [];
  for (const s of starts) {
    if (!dist.has(s)) { dist.set(s, 0); queue.push(s); }
  }
  let qi = 0;
  while (qi < queue.length) {
    const node = queue[qi++];
    const d = dist.get(node);
    const neighbors = adjacency.get(node);
    if (!neighbors) continue;
    for (const next of neighbors) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

// Groups nodes that are linked by resistive edges, so each parallel branch's
// least-resistance path is evaluated independently of other, unrelated branches.
function connectedComponents(adjacency) {
  const compId = new Map();
  let id = 0;
  for (const node of adjacency.keys()) {
    if (compId.has(node)) continue;
    const stack = [node];
    compId.set(node, id);
    while (stack.length) {
      const n = stack.pop();
      for (const next of adjacency.get(n) || []) {
        if (!compId.has(next)) { compId.set(next, id); stack.push(next); }
      }
    }
    id++;
  }
  return compId;
}

// Defaults let the browser page call simulate() on its global circuit state;
// other callers (e.g. the grader) pass their own components/wires.
function simulate(comps = components, wrs = wires) {
  const components = comps, wires = wrs;
  components.forEach(c => { c.voltage = {}; });

  const { find, edges, batteries } = buildElectricalGraph(components, wires);

  const adjacency = new Map();
  function addEdge(a, b) {
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  // A self-loop (a === b) means the component's own terminals were merged by
  // a 0-resistance bypass elsewhere in the circuit: it is short-circuited.
  for (const e of edges) {
    if (e.a !== e.b) addEdge(e.a, e.b);
  }

  // --- Digital layer: gates are ideal (0-resistance) sources, evaluated purely
  // through wire/switch connectivity, independent of any downstream resistance.
  const highRoots = new Set();
  for (const bat of batteries) highRoots.add(bat.pos);

  for (const c of components) {
    if (c.type === 'sr-latch') {
      const sHigh = highRoots.has(find(pinKey(c.id, 's')));
      const rHigh = highRoots.has(find(pinKey(c.id, 'r')));
      let nextState = Boolean(c.state);
      if (sHigh && !rHigh) nextState = true;
      else if (rHigh && !sHigh) nextState = false;
      else if (sHigh && rHigh) nextState = false;
      c.state = nextState;
      if (nextState) highRoots.add(find(pinKey(c.id, 'q')));
      else highRoots.add(find(pinKey(c.id, 'qbar')));
    } else if (c.type === 'd-flipflop') {
      const dHigh = highRoots.has(find(pinKey(c.id, 'd')));
      const clkHigh = highRoots.has(find(pinKey(c.id, 'clk')));
      const prevClk = Boolean(c.prevClk);
      if (clkHigh && !prevClk) c.state = Boolean(dHigh);
      c.prevClk = clkHigh;
      if (c.state) highRoots.add(find(pinKey(c.id, 'q')));
      else highRoots.add(find(pinKey(c.id, 'qbar')));
    } else if (c.type === 'oscillator') {
      // c.state is toggled solely by the setTimeout loop in restartOscillator, honoring c.period
      if (c.state) highRoots.add(find(pinKey(c.id, 'out')));
    }
  }

  const gateTypes = new Set(['and', 'or', 'xor', 'not', 'nand', 'nor', 'xnor']);
  const gates = components.filter(c => gateTypes.has(c.type));
  for (let pass = 0; pass < gates.length + 1; pass++) {
    let changed = false;
    for (const g of gates) {
      const inputNames = g.type === 'not' ? ['in'] : ['a', 'b'];
      const values = {};
      for (const pin of inputNames) values[pin] = highRoots.has(find(pinKey(g.id, pin)));
      const outRoot = find(pinKey(g.id, 'out'));
      if (gateLogic(g.type, values) && !highRoots.has(outRoot)) {
        highRoots.add(outRoot);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // --- Analog layer: current from any HIGH source (battery or energized gate
  // output) follows the least-resistance path(s) to a battery's negative terminal.
  const distFromPos = multiSourceBfs(highRoots, adjacency);
  const distFromNeg = multiSourceBfs(batteries.map(b => b.neg), adjacency);
  const compId = connectedComponents(adjacency);

  const localShortest = new Map();
  for (const [node, id] of compId) {
    const dPos = distFromPos.get(node);
    const dNeg = distFromNeg.get(node);
    if (dPos !== undefined && dNeg !== undefined) {
      const total = dPos + dNeg;
      if (!localShortest.has(id) || total < localShortest.get(id)) localShortest.set(id, total);
    }
  }

  const energizedEdgeComps = new Set();
  for (const e of edges) {
    if (e.a === e.b) continue;
    const id = compId.has(e.a) ? compId.get(e.a) : compId.get(e.b);
    const shortestTotal = id !== undefined ? localShortest.get(id) : undefined;
    if (shortestTotal === undefined) continue;
    const viaAB = distFromPos.has(e.a) && distFromNeg.has(e.b) &&
      (distFromPos.get(e.a) + 1 + distFromNeg.get(e.b) === shortestTotal);
    const viaBA = distFromPos.has(e.b) && distFromNeg.has(e.a) &&
      (distFromPos.get(e.b) + 1 + distFromNeg.get(e.a) === shortestTotal);
    if (viaAB || viaBA) energizedEdgeComps.add(e.comp.id);
  }

  // Pins on a resistive branch light up only when actually carrying current;
  // purely digital/connectivity pins (switches, gates, batteries) follow highRoots directly.
  for (const c of components) {
    for (const pin of Object.keys(getPins(c))) {
      const root = find(pinKey(c.id, pin));
      if (compId.has(root)) {
        const dPos = distFromPos.get(root);
        const dNeg = distFromNeg.get(root);
        const shortestTotal = localShortest.get(compId.get(root));
        c.voltage[pin] = dPos !== undefined && dNeg !== undefined &&
          shortestTotal !== undefined && (dPos + dNeg === shortestTotal);
      } else {
        c.voltage[pin] = highRoots.has(root);
      }
    }
  }

  // A lamp only lights up when it actually carries current on a least-resistance path.
  components.filter(c => c.type === 'lamp').forEach(c => {
    c.on = energizedEdgeComps.has(c.id);
  });
}



if (typeof module !== 'undefined') module.exports = { getPins, compSize, gateLogic, simulate };
