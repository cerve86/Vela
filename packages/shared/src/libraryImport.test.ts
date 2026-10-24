import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLibraryWorkbook, type Cell } from './libraryImport.ts';

const libraryTab: Cell[][] = [
  [
    'Code',
    'Domain',
    'Movement',
    'Type',
    'Dose',
    'Load rule — perceived / est. kg',
    'L1',
    'L2',
    'L3',
    'L4',
    'Regression',
    'Cue / why this one',
  ],
  [
    'FA2',
    'Foot & ankle',
    'Bent-knee calf raise — seated or supported',
    '^ Strength',
    '4 x 5-6 per side',
    'RIR 2-3 · est. 10-25 kg',
    '+8 kg',
    '+14 kg',
    '+20 kg',
    '+26 kg',
    'Both legs, lighter',
    'Knee flexed biases soleus.',
  ],
  [
    'TP3',
    'Trunk & pelvic floor',
    'Low pogo hops — uphill preferred',
    '* Impact',
    '2 x 10 m',
    'Light and quiet',
    null,
    null,
    null,
    null,
    null,
    'Stiffness, gently.',
  ],
  [
    'UP4',
    'Upper body & posture',
    'Banded serratus wall slide',
    '#NAME?',
    '2 x 8',
    '5-6/10',
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  [null, null, null, null, null, null, null, null, null, null, null, null],
];

describe('parseLibraryWorkbook', () => {
  it('reads movements by header, with the ladder, type and category', () => {
    const w = parseLibraryWorkbook({ Library: libraryTab });
    assert.equal(w.movements.length, 3);
    const fa2 = w.movements[0]!;
    assert.equal(fa2.code, 'FA2');
    assert.equal(fa2.domainCode, 'FA');
    assert.equal(fa2.type, 'Strength');
    assert.equal(fa2.category, 'strength');
    assert.deepEqual(fa2.ladder, ['+8 kg', '+14 kg', '+20 kg', '+26 kg']);
    assert.equal(fa2.why, 'Knee flexed biases soleus.');
    assert.equal(w.movements[1]!.category, 'plyometric');
    assert.equal(w.selection, null, 'no selection tab means no narrowing');
  });

  it("reads an errored type as Stability, by the sheet's own symbol legend, and says so", () => {
    const w = parseLibraryWorkbook({ Library: libraryTab });
    assert.equal(w.movements[2]!.type, 'Stability');
    assert.match(w.warnings.join('\n'), /UP4: type read as Stability/);
  });

  it('reads domains, falling back to the names on the Library tab', () => {
    const w = parseLibraryWorkbook({
      Library: libraryTab,
      Domains: [
        ['Code', 'Domain', 'Colour', 'What it buys in running'],
        ['FA', 'Foot & ankle', null, 'Shock absorption and push-off'],
      ],
    });
    assert.deepEqual(w.domains[0], {
      code: 'FA',
      name: 'Foot & ankle',
      purpose: 'Shock absorption and push-off',
    });
    assert.ok(w.domains.some((d) => d.code === 'TP' && d.name === 'Trunk & pelvic floor'));
  });

  it('reads each client column of the Assignment tab, PRIORITY apart from x', () => {
    const w = parseLibraryWorkbook({
      Library: libraryTab,
      Assignment: [
        ['Code', 'Domain', 'Movement', 'Type', 'Caroline', 'Nupur'],
        ['FA2', 'Foot & ankle', 'Bent-knee calf raise', '^ Strength', 'PRIORITY', 'x'],
        ['TP3', 'Trunk', 'Low pogo hops', '* Impact', null, 'x'],
        [null, null, null, null, null, null],
        ['Priority domain', null, null, null, 'Foot & ankle', 'Lateral hip'],
      ],
    });
    assert.deepEqual(w.priorities, [
      { clientName: 'Caroline', code: 'FA2', level: 'priority' },
      { clientName: 'Nupur', code: 'FA2', level: 'yes' },
      { clientName: 'Nupur', code: 'TP3', level: 'yes' },
    ]);
  });

  it('narrows to a selection tab and notes what to create as her own', () => {
    const w = parseLibraryWorkbook({
      Library: libraryTab,
      'Vela selection': [
        ['Code', 'Movement', 'Create as custom'],
        ['FA2', 'Bent-knee calf raise', null],
        ['TP3', 'Low pogo hops', 'yes'],
      ],
    });
    assert.deepEqual(w.selection, ['FA2', 'TP3']);
    assert.deepEqual(w.createAsCustom, ['TP3']);
  });

  it('reads the gates a row names in its own GATE wording, and nothing else', () => {
    const tab: Cell[][] = [
      ['Code', 'Movement', 'Type', 'Cue / why this one'],
      [
        'TP2',
        'Landing ladder',
        '* Impact',
        'GATE every step: no leakage, heaviness or dragging; no shin pain during or next morning.',
      ],
      ['TP3', 'Low pogo hops', '* Impact', 'Light and quiet.'],
    ];
    const w = parseLibraryWorkbook({ Library: tab });
    assert.deepEqual(w.movements[0]!.gates, ['pelvic_floor', 'shin']);
    assert.deepEqual(w.movements[1]!.gates, []);
  });

  it('leaves an empty type unset in a sheet without symbol types', () => {
    const w = parseLibraryWorkbook({
      Library: [
        ['Code', 'Movement', 'Type'],
        ['UP4', 'Wall slide', null],
      ],
    });
    assert.equal(w.movements[0]!.type, null);
    assert.match(w.warnings[0]!, /UP4: no type/);
  });

  it('says so when there is no Library tab', () => {
    const w = parseLibraryWorkbook({ Sheet1: [['a']] });
    assert.equal(w.movements.length, 0);
    assert.match(w.warnings[0]!, /No "Library" tab/);
  });
});
