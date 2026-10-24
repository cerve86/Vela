/**
 * The coach's library workbook, read into movements, domains and per-client priorities.
 *
 * The Run&Bun workbook keeps its library on a "Library" tab (code, domain, movement,
 * type, dose, load rule, L1–L4, regression, why), its domains on "Domains", and which
 * movements each client is on, with PRIORITY marks, on "Assignment". A "Vela selection"
 * tab, when there is one, narrows the curated library to the codes it lists, says for
 * each which exercise in Vela to use ("Vela name to use": her own, or a stock one) or to
 * create it as hers, and adds movements the Library tab does not carry (ADD1…). Without
 * it, every movement on the Library tab is selected and created as hers. Columns are
 * found by their headers, so a reordered or extended sheet still reads.
 *
 * Pure, and free of extensionless imports, so it is tested under `node --test` directly.
 */

export type Cell = string | number | boolean | Date | null | undefined;

export type MovementType =
  'Strength' | 'Strength — iso' | 'Stability' | 'Impact' | 'Power' | 'Mobility' | 'Coordination';

export type LibraryPhase = 'base' | 'build' | 'peak' | 'taper';

/** What the selection tab says to do with a movement. */
export interface VelaMapping {
  /** Names to look for in Vela, the coach's own first: "Calf iso", "Seated Calf Raise". */
  names: string[];
  /** Use her own exercise, use a stock one, or create it as hers. */
  use: 'custom' | 'stock' | 'create';
}

export interface SheetMovement {
  code: string;
  /** The domain code: the letters of the movement code, "FA" for "FA1". */
  domainCode: string;
  domain: string | null;
  name: string;
  type: MovementType | null;
  /** The library category the type maps to. */
  category: 'strength' | 'plyometric' | 'mobility';
  dose: string | null;
  loadRule: string | null;
  ladder: string[];
  regression: string | null;
  why: string | null;
  watchFor: string | null;
  equipment: string | null;
  phases: LibraryPhase[];
  /** Gates the sheet itself names, from its "GATE" wording. */
  gates: ('pelvic_floor' | 'shin')[];
  /** Her own clip to film, or a stock clip; null when the sheet does not say. */
  videoSource: 'own' | 'stock' | null;
  /** From the selection tab; null when the workbook has none or does not list it. */
  vela: VelaMapping | null;
}

export interface SheetDomain {
  code: string;
  name: string;
  purpose: string | null;
}

export interface SheetPriority {
  clientName: string;
  code: string;
  level: 'priority' | 'yes';
}

export interface LibraryWorkbook {
  movements: SheetMovement[];
  domains: SheetDomain[];
  priorities: SheetPriority[];
  /** Codes on a selection tab, or null when the workbook has none. */
  selection: string[] | null;
  /** Codes the selection marks to create as the coach's own. */
  createAsCustom: string[];
  warnings: string[];
}

const text = (c: Cell | undefined): string | null => {
  if (c === null || c === undefined) return null;
  const s = (c instanceof Date ? c.toISOString().slice(0, 10) : String(c)).trim();
  return s === '' ? null : s;
};

const norm = (c: Cell | undefined) => (text(c) ?? '').toLowerCase();

/** The index of the first header that contains any of the given words. */
function column(headers: Cell[], ...words: string[]): number {
  return headers.findIndex((h) => words.some((w) => norm(h).includes(w)));
}

function findSheet(sheets: Record<string, Cell[][]>, ...names: string[]): Cell[][] | null {
  const key = Object.keys(sheets).find((k) =>
    names.some((n) => k.trim().toLowerCase() === n || k.trim().toLowerCase().includes(n)),
  );
  return key ? (sheets[key] ?? null) : null;
}

const CODE = /^[A-Z]{1,4}\d{1,3}$/;

/**
 * The type column, by the sheet's own legend: "^ strength, = stability, ~ mobility,
 * * impact". Excel evaluates a cell that starts with "=" as a formula, so "=Stability"
 * arrives as an error, which the reader returns as empty. In a sheet whose other types
 * carry symbols, an empty type is therefore read as Stability, with a warning to check.
 */
function readType(
  raw: string | null,
  code: string,
  warnings: string[],
  symbolTypes: boolean,
): MovementType | null {
  if (!raw || raw.startsWith('#')) {
    if (symbolTypes) {
      warnings.push(
        `${code}: type read as Stability (Excel shows "=Stability" as an error). Check it in the library.`,
      );
      return 'Stability';
    }
    warnings.push(`${code}: no type in the sheet. Set it in the library.`);
    return null;
  }
  const t = raw
    .replace(/^[^A-Za-z]+/, '')
    .trim()
    .toLowerCase();
  if (t.startsWith('strength') && /iso/.test(t)) return 'Strength — iso';
  if (t.startsWith('strength')) return 'Strength';
  if (t.startsWith('stabil')) return 'Stability';
  if (t.startsWith('impact') || t.startsWith('plyo')) return 'Impact';
  if (t.startsWith('power')) return 'Power';
  if (t.startsWith('mobility')) return 'Mobility';
  if (t.startsWith('coordination')) return 'Coordination';
  warnings.push(
    `${code}: type "${raw}" is not one Vela knows (Strength, Stability, Impact, Power, Mobility, Coordination).`,
  );
  return null;
}

/**
 * The gates a row names in its own words: "GATE every step: no leakage, heaviness or
 * dragging; no shin pain…". Only a row that says GATE is read; the rest is not guessed.
 */
function gatesFrom(...cells: (string | null)[]): SheetMovement['gates'] {
  const t = cells.filter(Boolean).join(' ');
  if (!/\bgate/i.test(t)) return [];
  const gates: SheetMovement['gates'] = [];
  if (/leak|heaviness|dragging|pelvic/i.test(t)) gates.push('pelvic_floor');
  if (/shin/i.test(t)) gates.push('shin');
  return gates;
}

const categoryOf = (t: MovementType | null): SheetMovement['category'] =>
  t === 'Impact' || t === 'Power'
    ? 'plyometric'
    : t === 'Mobility' || t === 'Coordination'
      ? 'mobility'
      : 'strength';

const ALL_PHASES: LibraryPhase[] = ['base', 'build', 'peak', 'taper'];

/**
 * The phases a movement is developed in, from the sheet's "Phase emphasis": the part
 * before "·" names them ("Base + Taper · present Build/Peak" is base and taper), "All"
 * means all four, and "(+ late Build)" adds build. "Base gate → opens all phases" is a
 * base movement.
 */
export function parsePhases(raw: string | null): LibraryPhase[] {
  if (!raw) return [];
  const head = raw.split(/[·→]/)[0]!.toLowerCase();
  if (/\ball\b/.test(head)) return [...ALL_PHASES];
  const found = ALL_PHASES.filter((p) => new RegExp(`\\b${p}\\b`).test(head));
  if (/\(\s*\+\s*late build/i.test(raw) && !found.includes('build')) found.push('build');
  return ALL_PHASES.filter((p) => found.includes(p));
}

/** "Vela stock clip" is stock; "Film — yours" is her own clip to make. */
function videoFrom(raw: string | null): SheetMovement['videoSource'] {
  if (!raw) return null;
  if (/stock/i.test(raw)) return 'stock';
  if (/film|yours|own|custom/i.test(raw)) return 'own';
  return null;
}

/**
 * The names a "Vela name to use" cell offers, her own first: "Seated calf (mine) [or
 * stock: Seated Calf Raise]" gives "Seated calf" then "Seated Calf Raise". A dash or an
 * empty cell gives none.
 */
export function velaNames(raw: string | null): string[] {
  if (!raw || /^[—–-]+$/.test(raw.trim())) return [];
  return raw
    .replace(/[—–]\s*confirm.*$/i, '')
    .replace(/\[(stock|interim)\]/gi, '')
    .replace(/\(mine\)/gi, '')
    .split(/\[|\]|\s+or\s+|\s+[—–]\s+|\s\/\s/)
    .map((p) =>
      p
        .replace(/^\s*or\s+/i, '')
        .replace(/^\s*(stock:|add\s+)/i, '')
        .replace(/^['"‘’“”\s]+|['"‘’“”\s]+$/g, '')
        .trim(),
    )
    .filter((p) => p.length > 2 && !/^(a|an)\s+band version$/i.test(p));
}

function useFrom(status: string | null): VelaMapping['use'] {
  const s = (status ?? '').toLowerCase();
  // Blank: use hers when there is one by that name, otherwise create it.
  if (!s) return 'custom';
  if (s.includes('your custom')) return 'custom';
  if (s.includes('create')) return 'create';
  if (s.includes('stock')) return 'stock';
  return 'create';
}

export function parseLibraryWorkbook(sheets: Record<string, Cell[][]>): LibraryWorkbook {
  const warnings: string[] = [];

  const library = findSheet(sheets, 'library');
  if (!library || library.length < 2) {
    return {
      movements: [],
      domains: [],
      priorities: [],
      selection: null,
      createAsCustom: [],
      warnings: ['No "Library" tab with a header row and movements.'],
    };
  }

  const [lh = [], ...lrows] = library;
  const c = {
    code: column(lh, 'code'),
    domain: column(lh, 'domain'),
    name: column(lh, 'movement', 'exercise', 'name'),
    type: column(lh, 'type'),
    dose: column(lh, 'dose'),
    load: column(lh, 'load'),
    regression: column(lh, 'regression'),
    why: column(lh, 'why', 'cue'),
    watch: column(lh, 'watch'),
    equipment: column(lh, 'equipment', 'kit'),
    phase: column(lh, 'phase'),
    video: column(lh, 'video'),
    ladder: ['l1', 'l2', 'l3', 'l4'].map((l) => lh.findIndex((h) => norm(h) === l)),
  };
  if (c.code < 0 || c.name < 0) {
    return {
      movements: [],
      domains: [],
      priorities: [],
      selection: null,
      createAsCustom: [],
      warnings: ['The Library tab needs a "Code" and a "Movement" column.'],
    };
  }

  const movements: SheetMovement[] = [];
  const seen = new Set<string>();
  const symbolTypes =
    c.type >= 0 && lrows.some((r) => /^[\^~*=+]\s*[A-Za-z]/.test(text(r[c.type]) ?? ''));
  for (const r of lrows) {
    const code = text(r[c.code])?.toUpperCase() ?? null;
    const name = text(r[c.name]);
    if (!code && !name) continue;
    if (!code || !CODE.test(code) || !name) {
      if (code || name)
        warnings.push(`Skipped a row without a code like "FA1" and a name: ${code ?? name}.`);
      continue;
    }
    if (seen.has(code)) {
      warnings.push(`${code} appears twice; the first row is used.`);
      continue;
    }
    seen.add(code);
    const type = readType(c.type >= 0 ? text(r[c.type]) : null, code, warnings, symbolTypes);
    const why = c.why >= 0 ? text(r[c.why]) : null;
    const loadRule = c.load >= 0 ? text(r[c.load]) : null;
    const watchFor = c.watch >= 0 ? text(r[c.watch]) : null;
    movements.push({
      code,
      domainCode: code.replace(/\d+$/, ''),
      domain: c.domain >= 0 ? text(r[c.domain]) : null,
      name,
      type,
      category: categoryOf(type),
      dose: c.dose >= 0 ? text(r[c.dose]) : null,
      loadRule,
      ladder: c.ladder.map((i) => (i >= 0 ? text(r[i]) : null)).filter((x): x is string => !!x),
      regression: c.regression >= 0 ? text(r[c.regression]) : null,
      why,
      watchFor,
      equipment: c.equipment >= 0 ? text(r[c.equipment]) : null,
      phases: c.phase >= 0 ? parsePhases(text(r[c.phase])) : [],
      gates: gatesFrom(why, loadRule, watchFor),
      videoSource: c.video >= 0 ? videoFrom(text(r[c.video])) : null,
      vela: null,
    });
  }

  const domains: SheetDomain[] = [];
  const dsheet = findSheet(sheets, 'domains');
  if (dsheet && dsheet.length > 1) {
    const [dh = [], ...drows] = dsheet;
    const dc = {
      code: column(dh, 'code'),
      name: column(dh, 'domain', 'name'),
      purpose: column(dh, 'buys', 'purpose', 'why'),
    };
    for (const r of drows) {
      const code = text(r[dc.code])?.toUpperCase();
      const name = text(r[dc.name]);
      if (code && name)
        domains.push({ code, name, purpose: dc.purpose >= 0 ? text(r[dc.purpose]) : null });
    }
  }
  // A domain the Library names but the Domains tab does not, from the movements themselves.
  for (const m of movements) {
    if (m.domain && !domains.some((d) => d.code === m.domainCode))
      domains.push({ code: m.domainCode, name: m.domain, purpose: null });
  }

  const priorities: SheetPriority[] = [];
  const asheet = findSheet(sheets, 'assignment');
  if (asheet && asheet.length > 1) {
    const [ah = [], ...arows] = asheet;
    const codeAt = column(ah, 'code');
    // Client columns are every header after the descriptive ones.
    const lastFixed = Math.max(
      codeAt,
      column(ah, 'domain'),
      column(ah, 'movement'),
      column(ah, 'type'),
    );
    const clients = ah
      .map((h, i) => ({ name: text(h), i }))
      .filter((x) => x.i > lastFixed && x.name !== null) as { name: string; i: number }[];
    for (const r of arows) {
      const code = text(r[codeAt])?.toUpperCase();
      if (!code || !CODE.test(code)) continue;
      for (const cl of clients) {
        const v = norm(r[cl.i]);
        if (!v) continue;
        priorities.push({
          clientName: cl.name,
          code,
          level: v.startsWith('prio') ? 'priority' : 'yes',
        });
      }
    }
  }

  let selection: string[] | null = null;
  const createAsCustom: string[] = [];
  const ssheet = findSheet(sheets, 'vela selection', 'vela_selection', 'selection');
  if (ssheet && ssheet.length > 1) {
    const [sh = [], ...srows] = ssheet;
    const sc = {
      code: column(sh, 'code'),
      name: column(sh, 'movement'),
      domain: column(sh, 'domain'),
      type: column(sh, 'type'),
      phase: column(sh, 'phase'),
      vela: column(sh, 'vela name', 'name to use'),
      status: column(sh, 'status', 'custom', 'create'),
      video: column(sh, 'video'),
    };
    const at = (r: Cell[], i: number) => (i >= 0 ? text(r[i]) : null);
    selection = [];
    for (const r of srows) {
      const code = at(r, sc.code)?.toUpperCase();
      if (!code || !CODE.test(code)) continue;
      selection.push(code);
      const status = at(r, sc.status);
      const vela: VelaMapping = { names: velaNames(at(r, sc.vela)), use: useFrom(status) };
      if (vela.use === 'create') createAsCustom.push(code);
      const m = movements.find((x) => x.code === code);
      if (m) {
        m.vela = vela;
        if (!m.phases.length) m.phases = parsePhases(at(r, sc.phase));
        if (!m.videoSource) m.videoSource = videoFrom(at(r, sc.video));
        continue;
      }
      // On the selection tab only (ADD1…): a movement in its own right.
      const name = at(r, sc.name);
      if (!name) continue;
      const type = readType(at(r, sc.type), code, warnings, symbolTypes);
      const domain = at(r, sc.domain);
      movements.push({
        code,
        domainCode: domains.find((d) => d.name === domain)?.code ?? code.replace(/\d+$/, ''),
        domain,
        name,
        type,
        category: categoryOf(type),
        dose: null,
        loadRule: null,
        ladder: [],
        regression: null,
        why: null,
        watchFor: null,
        equipment: null,
        phases: parsePhases(at(r, sc.phase)),
        gates: [],
        videoSource: videoFrom(at(r, sc.video)),
        vela,
      });
    }
  }

  return { movements, domains, priorities, selection, createAsCustom, warnings };
}
