// File: tests/run.js（変更1：先頭の読み込み部分）
['parser.js', 'match.js', 'physics.js', 'levels.js', 'puzzles.js', 'share.js'].forEach((f) => {
  require(path.join(__dirname, '..', 'js', f));
});

const { parse, ParseError } = globalThis.GMParser;
const M = globalThis.GMMatch;
const L = globalThis.GMLevels;
const S = globalThis.GMShare;
const P = globalThis.GMPhysics;
const Z = globalThis.GMPuzzles;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}`);
    console.log(`     ${e.message}`);
  }
}

function near(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} と ${expected} が一致しません`);
}

function at(src, x) {
  return parse(src).fn(x);
}

// ---------- パーサ ----------
test('四則演算と優先順位', () => {
  near(at('1 + 2 * 3', 0), 7);
  near(at('(1 + 2) * 3', 0), 9);
  near(at('2^3^2', 0), 512);
  near(at('-x^2', 3), -9);
  near(at('10 / 4', 0), 2.5);
});

test('乗算記号の省略', () => {
  near(at('2x', 3), 6);
  near(at('3sin(x)', Math.PI / 2), 3);
  near(at('(x+1)(x-2)', 3), 4);
  near(at('2(x+1)', 1), 4);
  near(at('x(x-1)', 4), 12);
});

test('絶対値の記法', () => {
  near(at('|x - 2|', 0), 2);
  near(at('abs(x - 2)', 0), 2);
  near(at('2|x|', -3), 6);
  near(at('||x| - 1|', 0), 1);
});

test('関数と定数', () => {
  near(at('sin(pi / 2)', 0), 1);
  near(at('cos(0)', 0), 1);
  near(at('ln(e)', 0), 1);
  near(at('log(100)', 0), 2);
  near(at('exp(1)', 0), Math.E);
  near(at('sqrt(16)', 0), 4);
});

test('記号の正規化（y=、²、√、全角、π、×÷）', () => {
  near(at('y = 2x + 1', 1), 3);
  near(at('x²', 3), 9);
  near(at('√x + 1', 4), 3);
  near(at('２ｘ－１', 2), 3);
  near(at('π', 0), Math.PI);
  near(at('3 × x ÷ 2', 2), 3);
});

test('不正な式は ParseError になる', () => {
  ['', '   ', '2 +', '(x', 'x)', 'foo', '2 $ 3', 'sin'].forEach((src) => {
    assert.throws(() => parse(src), ParseError, `「${src}」`);
  });
});

// ---------- 一致率 ----------
test('同じグラフの一致率は100%', () => {
  const f = parse('2sin(x) + 1').fn;
  near(M.computeMatch(f, f), 100);
});

test('等価な式の一致率はほぼ100%', () => {
  assert.ok(M.computeMatch(parse('(x + 1)^2').fn, parse('x^2 + 2x + 1').fn) > 99.999);
  assert.ok(M.computeMatch(parse('sin(x)').fn, parse('-sin(x + pi)').fn) > 99.999);
});

test('ずれが大きいほど一致率が下がる', () => {
  const t = parse('x').fn;
  const m1 = M.computeMatch(t, parse('x + 0.5').fn);
  const m2 = M.computeMatch(t, parse('x + 3').fn);
  near(m1, 100 * Math.exp(-0.25));
  assert.ok(m1 > m2);
});

test('定義域外と漸近線の扱い', () => {
  const t = parse('sqrt(x)').fn;
  assert.ok(M.computeMatch(t, parse('sqrt(-x)').fn) < 1);
  near(M.computeMatch(parse('1/x').fn, parse('1/x').fn), 100);
  const m = M.computeMatch(parse('1/x').fn, parse('1/(x-1)').fn);
  assert.ok(Number.isFinite(m) && m >= 0 && m <= 100);
});

test('表示範囲に入る割合', () => {
  near(M.visibleRatio(parse('x').fn), 1);
  near(M.visibleRatio(parse('100').fn), 0);
});

test('ドロップの着地判定：同じ形なら差は一定', () => {
  const probe = M.gapProbe(parse('(x - 1)^2 - 3').fn);
  near(probe(parse('(x - 1)^2 + 5').fn), 8);
  assert.equal(probe(parse('sqrt(-x - 20)').fn), null);
});

// ---------- ステージと問題生成 ----------
test('全ステージの目標値はスライダーの範囲内かつ刻み上にある', () => {
  L.STAGES.forEach((s, i) => {
    const fam = L.FAMILIES[s.family];
    assert.ok(fam, `ステージ${i + 1}`);
    fam.params.forEach((p) => {
      const v = s.target[p.key];
      assert.ok(v >= p.min && v <= p.max, `ステージ${i + 1} の ${p.key}`);
      near(L.snap(v, p), v);
    });
  });
});

test('全ステージは初期状態ではクリアにならない', () => {
  L.STAGES.forEach((s, i) => {
    const fam = L.FAMILIES[s.family];
    const m = M.computeMatch(fam.fn(s.target), fam.fn(L.defaultParams(fam)));
    assert.ok(m < 99, `ステージ${i + 1}`);
  });
});

test('ランダムなパラメータは範囲内・刻み上で、0 禁止の値は 0 にならない', () => {
  const r = L.makeRandom(1);
  Object.values(L.FAMILIES).forEach((fam) => {
    for (let i = 0; i < 50; i++) {
      const t = L.randomParams(fam, r);
      fam.params.forEach((p) => {
        assert.ok(t[p.key] >= p.min && t[p.key] <= p.max);
        near(L.snap(t[p.key], p), t[p.key]);
        if (p.nonzero) {
          assert.notEqual(t[p.key], 0);
        }
      });
    }
  });
});

test('translate は f(x − dx) + dy と一致する', () => {
  Object.entries(L.FAMILIES).forEach(([key, fam]) => {
    const p = L.randomParams(fam, L.makeRandom(7));
    const dx = 1.5;
    const dy = fam.vkey ? -2 : 0;
    const f = fam.fn(p);
    const g = fam.fn(L.translate(fam, p, dx, dy));
    [-3, -0.7, 0.4, 2.2, 5].forEach((x) => {
      const a = f(x - dx) + dy;
      const b = g(x);
      if (Number.isFinite(a) || Number.isFinite(b)) {
        near(b, a, 1e-9);
      }
    });
    assert.ok(key);
  });
});

test('ドロップの目標はドロップ可能な形で、画面に見え、スタート時の形と違う', () => {
  const r = L.makeRandom(42);
  for (let level = 1; level <= 12; level++) {
    for (let i = 0; i < 15; i++) {
      const t = L.generateDropTarget(r, level);
      const fam = L.FAMILIES[t.family];
      assert.ok(fam.drop && fam.vkey, t.family);
      assert.ok(M.visibleRatio(fam.fn(t.target)) >= 0.25, t.family);
      assert.ok(L.startMatch(fam, t.target, true) < 85, t.family);
    }
  }
});

test('数式モードの問題生成は決定的で、すべて解析でき、画面に見える', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const a = L.generateSet(seed);
    assert.deepEqual(a, L.generateSet(seed));
    assert.equal(a.length, L.TIERS.length);
    a.forEach((e) => {
      assert.ok(M.visibleRatio(parse(e).fn) > 0.05, e);
    });
  }
});

// ---------- 共有 ----------
test('共有コードはエンコードとデコードで元に戻る', () => {
  const stages = [
    { type: 'slider', name: 'テスト🎯', by: 'たろう', family: 'quadratic', target: { a: -0.5, h: 2, k: 3 } },
    {
      type: 'drop',
      name: 'drop',
      by: 'b',
      family: 'sine',
      target: { a: 3, b: 1, c: 0.5, d: -2 },
      rec: { by: 'じろう', val: 97.3 }
    },
    { type: 'formula', name: '式', by: 'c', expr: '2sin(x) + 0.1x^2' }
  ];
  stages.forEach((s) => {
    const code = S.encode(s);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(S.decode(code), S.validate(s));
  });
});

test('改ざんされた共有コードは拒否される', () => {
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const bad = [
    'not base64!!',
    enc({ v: 2, y: 'slider' }),
    enc({ v: 1, y: 'hack' }),
    enc({ v: 1, y: 'slider', n: 'x', b: 'y', f: 'constructor', t: [] }),
    enc({ v: 1, y: 'slider', n: 'x', b: 'y', f: 'linear', t: [99, 0] }),
    enc({ v: 1, y: 'slider', n: 'x', b: 'y', f: 'linear', t: [1.3, 0] }),
    enc({ v: 1, y: 'slider', n: 'x', b: 'y', f: 'linear', t: [1] }),
    enc({ v: 1, y: 'drop', n: 'x', b: 'y', f: 'rational', t: [1, 0, 0] }),
    enc({ v: 1, y: 'formula', n: 'x', b: 'y', e: 'alert(1)' })
  ];
  bad.forEach((code) => assert.throws(() => S.decode(code), S.ShareError, code));
});

test('長すぎる名前は切り詰められ、不正な記録は無視される', () => {
  const s = S.validate({
    type: 'slider',
    name: 'あ'.repeat(100),
    by: 'い'.repeat(100),
    family: 'linear',
    target: { a: 2, b: 1 },
    rec: { by: 'z', val: -5 }
  });
  assert.equal(s.name.length, 24);
  assert.equal(s.by.length, 16);
  assert.equal(s.rec, undefined);
});

// File: tests/run.js（変更2：末尾の集計の直前に追加）

// ---------- 数式ドロップ ----------
test('数式ドロップ：模範解答は一致率99%以上で着地し、目標は画面に見える', () => {
  Z.DROP.forEach((p) => {
    const t = parse(p.target).fn;
    const land = P.landCurve(t, parse(p.answer).fn);
    assert.ok(land, p.id);
    assert.ok(land.match >= 99, `${p.id}: ${land.match}`);
    assert.ok(M.visibleRatio(t) >= 0.25, p.id);
  });
});

test('数式ドロップ：定数項が違っても同じ場所に着地する', () => {
  const t = parse('0.5x^2 - 6').fn;
  const a = P.landCurve(t, parse('0.5x^2').fn);
  const b = P.landCurve(t, parse('0.5x^2 + 100').fn);
  [-3, 0, 2.5].forEach((x) => near(a.fn(x), b.fn(x), 1e-9));
  near(a.match, 100, 1e-6);
});

test('数式ドロップ：目標と重なる x の範囲がなければ着地しない', () => {
  assert.equal(P.landCurve(parse('sqrt(x)').fn, parse('sqrt(-x - 1)').fn), null);
});

// ---------- ボールころがし ----------
test('ボール：パズルデータが正しい（ID一意、長方形、スタート位置）', () => {
  const ids = new Set();
  Z.BALL.forEach((p) => {
    assert.ok(!ids.has(p.id), p.id);
    ids.add(p.id);
    assert.ok(p.goal.x1 < p.goal.x2 && p.goal.y1 < p.goal.y2, p.id);
    assert.ok(Number.isInteger(p.par) && p.par > 0, p.id);
    assert.ok(Math.abs(p.start.x) < 10 && Math.abs(p.start.y) < 10, p.id);
    [...(p.walls || []), ...(p.hazards || [])].forEach((r) => {
      assert.ok(r.x1 < r.x2 && r.y1 < r.y2, p.id);
      const cx = Math.min(r.x2, Math.max(r.x1, p.start.x));
      const cy = Math.min(r.y2, Math.max(r.y1, p.start.y));
      assert.ok(Math.hypot(p.start.x - cx, p.start.y - cy) > P.C.r, `${p.id}：スタートが障害物と重なっています`);
    });
  });
});

test('ボール：模範解答でクリアできる', () => {
  Z.BALL.forEach((p) => {
    const sim = P.run(p, parse(p.answer).fn);
    assert.equal(sim.status, 'clear', `${p.id}: ${sim.reason}（x=${sim.x.toFixed(2)}, y=${sim.y.toFixed(2)}）`);
  });
});

test('ボール：地面がなければクリアできない', () => {
  Z.BALL.forEach((p) => {
    assert.equal(P.run(p, null).status, 'fail', p.id);
  });
});

test('ボール：スタート地点が地面の下なら即失敗', () => {
  const sim = P.create(Z.BALL[0], parse('20').fn);
  assert.equal(sim.status, 'fail');
});

test('ボール：同じ式なら結果は毎回同じ', () => {
  const p = Z.BALL[1];
  const f = parse(p.answer).fn;
  const a = P.run(p, f);
  const b = P.run(p, f);
  assert.equal(a.t, b.t);
  assert.equal(a.x, b.x);
  assert.equal(a.status, b.status);
});

test('共有：数式ドロップの自作ステージ', () => {
  const s = { type: 'fdrop', name: 'fd', by: 'a', expr: '0.5x^2 - 3' };
  assert.deepEqual(S.decode(S.encode(s)), S.validate(s));
  assert.throws(() => S.validate({ type: 'fdrop', name: 'x', by: 'y', expr: 'foo(' }), S.ShareError);
});
// File: tests/run.js（変更2：末尾の集計の直前に追加）

// ---------- v4：ボールの自作ステージ ----------
test('ボール：組み込みパズルの配置は自作ステージとして共有できる', () => {
  Z.BALL.forEach((p) => {
    const s = {
      type: 'ball',
      name: p.name,
      by: 'test',
      start: p.start,
      goal: p.goal,
      walls: p.walls || [],
      hazards: p.hazards || [],
      par: p.par
    };
    if (p.startRange) {
      s.startRange = p.startRange;
    }
    const v = S.validate(s);
    assert.deepEqual(S.decode(S.encode(v)), v, p.id);
  });
});

test('ボール：検証済みの自作ステージでも物理は同じ結果になる', () => {
  const p = Z.BALL[1];
  const v = S.validate({ type: 'ball', name: 'x', by: 'y', start: p.start, goal: p.goal, walls: p.walls, hazards: p.hazards });
  assert.equal(P.run(v, parse(p.answer).fn).status, 'clear');
});

test('ボール：不正な配置は拒否される', () => {
  const base = {
    type: 'ball',
    name: 'x',
    by: 'y',
    start: { x: 0, y: 8 },
    goal: { x1: 2, y1: -6, x2: 5, y2: -3 },
    walls: [],
    hazards: []
  };
  assert.ok(S.validate(base));
  const bad = [
    { start: { x: 0.3, y: 8 } },
    { start: { x: 0, y: 12 } },
    { goal: { x1: 2, y1: -6, x2: 2, y2: -3 } },
    { walls: [{ x1: -1, y1: 7, x2: 1, y2: 9 }] },
    { hazards: Array.from({ length: 13 }, (_, i) => ({ x1: -10, y1: -10 + i, x2: -9, y2: -9.5 + i })) },
    { startRange: [1, 3] },
    { par: 0 },
    { par: 2.5 }
  ];
  bad.forEach((patch) => {
    assert.throws(() => S.validate(Object.assign({}, base, patch)), S.ShareError, JSON.stringify(patch));
  });
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  assert.throws(
    () => S.decode(enc({ v: 1, y: 'ball', n: 'x', b: 'y', st: [0, 8], g: [2, -6, 5, -3], w: 'oops' })),
    S.ShareError
  );
  assert.throws(() => S.decode(enc({ v: 1, y: 'ball', n: 'x', b: 'y', st: [0, 8] })), S.ShareError);
});

test('ボール：投下位置によって結果が変わる', () => {
  const p = Z.BALL.find((q) => q.id === 'b9');
  const f = parse(p.answer).fn;
  assert.equal(P.run(p, f).status, 'fail');
  assert.equal(P.run(startAt(p, p.answerX), f).status, 'clear');
});
// File: tests/run.js（末尾の集計の直前に追加）

// ---------- v5：ギミック ----------
function answerFn(p) {
  if (p.answers) {
    return P.piecewise(p.answers.map((a) => (a ? parse(a).fn : null)), p.segs);
  }
  return parse(p.answer).fn;
}

function shareable(p) {
  const keys = ['start', 'goal', 'walls', 'hazards', 'springs', 'winds', 'warps', 'switches', 'coins', 'segs', 'startRange'];
  const s = { type: 'ball', name: p.name, by: 'test', par: p.par };
  keys.forEach((k) => {
    if (p[k] !== undefined) {
      s[k] = p[k];
    }
  });
  return s;
}

test('ギミック：ID は全トラックで一意', () => {
  const ids = new Set();
  Object.values(Z.TRACKS).forEach((arr) => {
    arr.forEach((p) => {
      assert.ok(!ids.has(p.id), p.id);
      ids.add(p.id);
    });
  });
});

test('ギミック：模範解答でクリアできる', () => {
  Z.GIMMICK.forEach((p) => {
    const sim = P.run(p, answerFn(p));
    assert.equal(sim.status, 'clear', `${p.id}: ${sim.reason}（x=${sim.x.toFixed(2)}, y=${sim.y.toFixed(2)}）`);
  });
});

test('ギミック：地面がなければクリアできない', () => {
  Z.GIMMICK.forEach((p) => {
    assert.equal(P.run(p, null).status, 'fail', p.id);
  });
});

test('ギミック：仕掛けを外すと模範解答でもクリアできない', () => {
  const strip = {
    g1: (p) => Object.assign({}, p, { switches: [] }),
    g3: (p) => Object.assign({}, p, { winds: [] }),
    g4: (p) => Object.assign({}, p, { springs: [] }),
    g5: (p) => Object.assign({}, p, { warps: [] }),
    g7: (p) =>
      Object.assign({}, p, {
        walls: p.walls.map((w) => {
          const c = Object.assign({}, w);
          delete c.move;
          return c;
        })
      })
  };
  Object.entries(strip).forEach(([id, fn]) => {
    const p = Z.GIMMICK.find((q) => q.id === id);
    assert.ok(p, id);
    assert.notEqual(P.run(fn(p), answerFn(p)).status, 'clear', id);
  });
});

test('ギミック：コインを取らないとゴールは開かない', () => {
  ['g2', 'g8'].forEach((id) => {
    const p = Z.GIMMICK.find((q) => q.id === id);
    const far = Object.assign({}, p, { coins: [{ x: 9, y: 9 }] });
    const sim = P.run(far, answerFn(p));
    assert.equal(sim.status, 'fail', id);
    assert.equal(sim.coinsLeft, 1, id);
  });
});

test('ギミック：配置は共有でき、デコード後も同じ結果になる', () => {
  Z.GIMMICK.forEach((p) => {
    const v = S.validate(shareable(p));
    assert.deepEqual(S.decode(S.encode(v)), v, p.id);
    assert.equal(P.run(v, answerFn(p)).status, 'clear', p.id);
  });
});

test('ギミック：動くブロックでも同じ式なら結果は毎回同じ', () => {
  const p = Z.GIMMICK.find((q) => q.id === 'g7');
  const a = P.run(p, answerFn(p));
  const b = P.run(p, answerFn(p));
  assert.equal(a.t, b.t);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
});

test('区間の式：空欄の区間は穴になる', () => {
  const f = P.piecewise([null, parse('-5').fn], [0]);
  assert.ok(Number.isNaN(f(-1)));
  near(f(0), -5);
  near(f(3), -5);
  const g = P.piecewise([parse('1').fn, parse('2').fn, parse('3').fn], [-3, 3]);
  near(g(-5), 1);
  near(g(0), 2);
  near(g(5), 3);
});

test('ワープ：入口と出口を往復し続けない', () => {
  const level = {
    start: { x: 0, y: 8 },
    goal: { x1: 5, y1: 5, x2: 6, y2: 6 },
    walls: [],
    hazards: [],
    warps: [{ ax: 0, ay: 4, bx: 0, by: 6 }]
  };
  const sim = P.run(level, parse('-5').fn);
  assert.equal(sim.events.filter((e) => e === 'warp').length, 1);
});

test('共有：不正なギミックは拒否される', () => {
  const base = {
    type: 'ball',
    name: 'x',
    by: 'y',
    start: { x: 0, y: 8 },
    goal: { x1: 2, y1: -6, x2: 5, y2: -3 }
  };
  assert.ok(S.validate(base));
  const bad = [
    { springs: [{ x1: 0, y1: 0, x2: 1, y2: 1, d: 'x' }] },
    { winds: [{ x1: 0, y1: 0, x2: 2, y2: 2, fx: 0, fy: 0 }] },
    { warps: [{ ax: 1, ay: 1, bx: 1, by: 1 }] },
    { coins: Array.from({ length: 9 }, (_, i) => ({ x: i - 4, y: 0 })) },
    { hazards: [{ x1: 0, y1: 0, x2: 1, y2: 1, sw: 'on' }] },
    { walls: [{ x1: 0, y1: 0, x2: 1, y2: 1, sw: 'maybe' }] },
    { walls: [{ x1: 0, y1: 0, x2: 1, y2: 1, move: { dx: 0, dy: 0, T: 4 } }] },
    { walls: [{ x1: 0, y1: 0, x2: 1, y2: 1, move: { dx: 2, dy: 0, T: 0 } }] },
    { segs: [0, 0.5] },
    { segs: [1, 2, 3] }
  ];
  bad.forEach((patch) => {
    assert.throws(() => S.validate(Object.assign({}, base, patch)), S.ShareError, JSON.stringify(patch));
  });
});
// File: tests/run.js（末尾の集計の直前に追加）

// ---------- v6：ワールド ----------
test('ワールド：サンプルワールドは検証を通り、コードとファイルで往復できる', () => {
  Z.SAMPLE_WORLDS.forEach((w) => {
    const v = S.validateWorld(w);
    assert.equal(v.stages.length, w.stages.length, w.name);
    const code = S.encodeWorld(v);
    assert.ok(code.length <= S.MAX_WORLD_CODE, `${w.name}: ${code.length}`);
    assert.deepEqual(S.decodeWorld(code), v, w.name);
    assert.deepEqual(S.worldFromFile(S.worldToFile(v)), v, w.name);
    v.stages.forEach((st, i) => {
      assert.ok(!st.note || st.note.length <= S.MAX_NOTE, `${w.name} ${i + 1}`);
      assert.ok(st.type !== 'ball' || st.par, `${w.name} ${i + 1}：par がありません`);
    });
  });
});

test('ワールド：問題文と改行は残り、記録（rec）は外れる', () => {
  const w = {
    name: 'w',
    by: 'a',
    desc: '1行目\n2行目',
    stages: [{ type: 'formula', name: 'f', by: 'a', expr: 'x^2', note: 'ヒント', rec: { by: 'b', val: 50 } }]
  };
  const v = S.decodeWorld(S.encodeWorld(w));
  assert.equal(v.stages[0].note, 'ヒント');
  assert.equal(v.stages[0].rec, undefined);
  assert.equal(v.desc, '1行目\n2行目');
});

test('ワールド：不正なワールドは拒否される', () => {
  const st = { type: 'formula', name: 'f', by: 'a', expr: 'x' };
  assert.throws(() => S.validateWorld({ name: 'w', stages: [] }), S.ShareError);
  assert.throws(
    () => S.validateWorld({ name: 'w', stages: Array.from({ length: S.MAX_WORLD_STAGES + 1 }, () => st) }),
    S.ShareError
  );
  assert.throws(() => S.validateWorld({ name: 'w', stages: [st, { type: 'formula', name: 'x', expr: 'foo(' }] }), /ステージ2/);
  assert.throws(() => S.decodeWorld('!!!'), S.ShareError);
  assert.throws(() => S.decodeWorld(S.encode(st)), S.ShareError);
  assert.throws(() => S.worldFromFile('{"format":"other","version":1,"world":{}}'), S.ShareError);
  assert.throws(() => S.worldFromFile('not json'), S.ShareError);
});

test('ワールド：ID は内容で決まる', () => {
  const a = { name: 'w', by: 'a', stages: [{ type: 'formula', name: 'f', by: 'a', expr: 'x' }] };
  const b = { name: 'w', by: 'a', stages: [{ type: 'formula', name: 'f', by: 'a', expr: 'x+1' }] };
  assert.equal(S.worldId(a), S.worldId(JSON.parse(JSON.stringify(a))));
  assert.notEqual(S.worldId(a), S.worldId(b));
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;