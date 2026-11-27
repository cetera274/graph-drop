// File: js/levels.js
(function (global) {
  'use strict';

  // ---------- 表示用フォーマット ----------
  function num(v) {
    const r = Math.round(v * 100) / 100;
    const s = String(Object.is(r, -0) ? 0 : r);
    return s.replace('-', '−');
  }

  function coef(a) {
    if (a === 1) return '';
    if (a === -1) return '−';
    return num(a);
  }

  function tail(k) {
    if (k === 0) return '';
    return k > 0 ? ` + ${num(k)}` : ` − ${num(-k)}`;
  }

  function shift(h) {
    if (h === 0) return 'x';
    return h > 0 ? `x − ${num(h)}` : `x + ${num(-h)}`;
  }

  function wrapShift(h) {
    return h === 0 ? 'x' : `(${shift(h)})`;
  }

  // ---------- 関数ファミリー ----------
  // vkey : 上下に平行移動するパラメータ（ドロップでは落下で決まる）
  // hkey : 左右に平行移動するパラメータ
  // drop : ドロップで使えるか（漸近線をもつ形などは除外）
  // gen  : ランダム生成で使う [最小, 最大, 刻み]
  const FAMILIES = {
    linear: {
      label: '一次関数',
      template: 'y = a·x + b',
      hint: 'a は傾き（右へ1進んだときに上がる量）、b は y 切片（x = 0 のときの値）です。',
      params: [
        { key: 'a', min: -5, max: 5, step: 0.5, def: 1, gen: [-3, 3, 0.5], nonzero: true },
        { key: 'b', min: -8, max: 8, step: 0.5, def: 0, gen: [-6, 6, 1] }
      ],
      vkey: 'b',
      hkey: null,
      drop: true,
      translate: (s, dx, dy) => ({ b: s.b + dy - s.a * dx }),
      fn: (p) => (x) => p.a * x + p.b,
      pretty: (p) => `y = ${coef(p.a)}x${tail(p.b)}`
    },
    quadratic: {
      label: '二次関数',
      template: 'y = a(x − h)² + k',
      hint: '(h, k) が頂点です。a が正なら下に凸、絶対値が大きいほど細くなります。',
      params: [
        { key: 'a', min: -3, max: 3, step: 0.25, def: 1, gen: [-2, 2, 0.5], nonzero: true },
        { key: 'h', min: -6, max: 6, step: 0.5, def: 0, gen: [-5, 5, 1] },
        { key: 'k', min: -8, max: 8, step: 0.5, def: 0, gen: [-6, 6, 1] }
      ],
      vkey: 'k',
      hkey: 'h',
      drop: true,
      fn: (p) => (x) => p.a * (x - p.h) * (x - p.h) + p.k,
      pretty: (p) => `y = ${coef(p.a)}${wrapShift(p.h)}²${tail(p.k)}`
    },
    abs: {
      label: '絶対値',
      template: 'y = a|x − h| + k',
      hint: '(h, k) が折れ曲がる点です。a は左右の傾きの大きさと向きを決めます。',
      params: [
        { key: 'a', min: -4, max: 4, step: 0.25, def: 1, gen: [-3, 3, 0.5], nonzero: true },
        { key: 'h', min: -6, max: 6, step: 0.5, def: 0, gen: [-5, 5, 1] },
        { key: 'k', min: -8, max: 8, step: 0.5, def: 0, gen: [-6, 6, 1] }
      ],
      vkey: 'k',
      hkey: 'h',
      drop: true,
      fn: (p) => (x) => p.a * Math.abs(x - p.h) + p.k,
      pretty: (p) => `y = ${coef(p.a)}|${shift(p.h)}|${tail(p.k)}`
    },
    sqrt: {
      label: '平方根',
      template: 'y = a√(x − h) + k',
      hint: '(h, k) がグラフの始点です。a の符号で上向きか下向きかが変わります。',
      params: [
        { key: 'a', min: -4, max: 4, step: 0.25, def: 1, gen: [-3, 3, 0.5], nonzero: true },
        { key: 'h', min: -8, max: 8, step: 0.5, def: 0, gen: [-7, 3, 1] },
        { key: 'k', min: -8, max: 8, step: 0.5, def: 0, gen: [-5, 5, 1] }
      ],
      vkey: 'k',
      hkey: 'h',
      drop: true,
      fn: (p) => (x) => p.a * Math.sqrt(x - p.h) + p.k,
      pretty: (p) => `y = ${coef(p.a)}√${wrapShift(p.h)}${tail(p.k)}`
    },
    sine: {
      label: '三角関数',
      template: 'y = a·sin(b(x − c)) + d',
      hint: 'a は振幅、b は波の細かさ（周期 = 2π ÷ b）、c は左右のずれ、d は上下のずれです。',
      params: [
        { key: 'a', min: -6, max: 6, step: 0.5, def: 1, gen: [-5, 5, 1], nonzero: true },
        { key: 'b', min: 0.25, max: 3, step: 0.25, def: 1, gen: [0.5, 2, 0.5] },
        { key: 'c', min: -4, max: 4, step: 0.25, def: 0, gen: [-3, 3, 0.5] },
        { key: 'd', min: -6, max: 6, step: 0.5, def: 0, gen: [-4, 4, 1] }
      ],
      vkey: 'd',
      hkey: 'c',
      drop: true,
      fn: (p) => (x) => p.a * Math.sin(p.b * (x - p.c)) + p.d,
      pretty: (p) => {
        let inner;
        if (p.c === 0) {
          inner = `${coef(p.b)}x`;
        } else if (p.b === 1) {
          inner = shift(p.c);
        } else {
          inner = `${num(p.b)}(${shift(p.c)})`;
        }
        return `y = ${coef(p.a)}sin(${inner})${tail(p.d)}`;
      }
    },
    exp: {
      label: '指数関数',
      template: 'y = a·2^(x − h) + k',
      hint: '直線 y = k に近づいていきます。h で左右に動き、a で縦に伸び縮み・反転します。',
      params: [
        { key: 'a', min: -4, max: 4, step: 0.25, def: 1, gen: [-2, 2, 0.5], nonzero: true },
        { key: 'h', min: -6, max: 6, step: 0.5, def: 0, gen: [-4, 4, 1] },
        { key: 'k', min: -8, max: 8, step: 0.5, def: 0, gen: [-6, 6, 1] }
      ],
      vkey: 'k',
      hkey: 'h',
      drop: true,
      fn: (p) => (x) => p.a * Math.pow(2, x - p.h) + p.k,
      pretty: (p) => `y = ${coef(p.a)}2^${p.h === 0 ? 'x' : `(${shift(p.h)})`}${tail(p.k)}`
    },
    rational: {
      label: '分数関数',
      template: 'y = a / (x − h) + k',
      hint: '直線 x = h と y = k が漸近線です。a の符号で曲線が入る象限が変わります。',
      params: [
        { key: 'a', min: -8, max: 8, step: 0.5, def: 1, gen: [-6, 6, 1], nonzero: true },
        { key: 'h', min: -6, max: 6, step: 0.5, def: 0, gen: [-4, 4, 1] },
        { key: 'k', min: -6, max: 6, step: 0.5, def: 0, gen: [-4, 4, 1] }
      ],
      vkey: 'k',
      hkey: 'h',
      drop: false,
      fn: (p) => (x) => p.a / (x - p.h) + p.k,
      pretty: (p) => `y = ${num(p.a)} / ${wrapShift(p.h)}${tail(p.k)}`
    },
    cubic: {
      label: '三次関数',
      template: 'y = a(x − p)(x − q)(x − r)',
      hint: 'p, q, r は x 軸と交わる点です。a は全体の伸び縮みと向きを決めます。',
      params: [
        { key: 'a', min: -0.5, max: 0.5, step: 0.05, def: 0.1, gen: [-0.3, 0.3, 0.05], nonzero: true },
        { key: 'p', min: -8, max: 8, step: 0.5, def: -2, gen: [-7, 7, 1] },
        { key: 'q', min: -8, max: 8, step: 0.5, def: 0, gen: [-7, 7, 1] },
        { key: 'r', min: -8, max: 8, step: 0.5, def: 2, gen: [-7, 7, 1] }
      ],
      vkey: null,
      hkey: null,
      drop: false,
      translate: (s, dx) => ({ p: s.p + dx, q: s.q + dx, r: s.r + dx }),
      fn: (p) => (x) => p.a * (x - p.p) * (x - p.q) * (x - p.r),
      pretty: (p) => `y = ${coef(p.a)}(${shift(p.p)})(${shift(p.q)})(${shift(p.r)})`
    }
  };

  // ---------- ステージ ----------
  const STAGES = [
    { name: '傾き', family: 'linear', target: { a: 2, b: 0 } },
    { name: '切片', family: 'linear', target: { a: 1, b: 3 } },
    { name: '右下がり', family: 'linear', target: { a: -1.5, b: 2 } },
    { name: 'ゆるやかな坂', family: 'linear', target: { a: 0.5, b: -4 } },
    { name: '放物線を下げる', family: 'quadratic', target: { a: 1, h: 0, k: -4 } },
    { name: '頂点を動かす', family: 'quadratic', target: { a: 1, h: 3, k: 0 } },
    { name: '逆さまの放物線', family: 'quadratic', target: { a: -0.5, h: -2, k: 5 } },
    { name: '細い放物線', family: 'quadratic', target: { a: 2, h: 1.5, k: -6 } },
    { name: 'V の字', family: 'abs', target: { a: 1, h: -3, k: 0 } },
    { name: '山の形', family: 'abs', target: { a: -2, h: 2, k: 6 } },
    { name: '平方根の始点', family: 'sqrt', target: { a: 2, h: -4, k: 0 } },
    { name: '下向きの平方根', family: 'sqrt', target: { a: -1.5, h: 2, k: 5 } },
    { name: '振幅', family: 'sine', target: { a: 3, b: 1, c: 0, d: 0 } },
    { name: '周期', family: 'sine', target: { a: 2, b: 2, c: 0, d: 1 } },
    { name: '位相と反転', family: 'sine', target: { a: -4, b: 0.5, c: 1, d: -2 } },
    { name: '総合：正弦波', family: 'sine', target: { a: 5, b: 1.5, c: -1.5, d: 2 } },
    { name: '指数関数', family: 'exp', target: { a: 1, h: 0, k: -5 } },
    { name: '反転した指数', family: 'exp', target: { a: -0.5, h: 2, k: 6 } },
    { name: '双曲線', family: 'rational', target: { a: 4, h: 0, k: 0 } },
    { name: '漸近線を動かす', family: 'rational', target: { a: -3, h: 2, k: -1 } },
    { name: '三次関数', family: 'cubic', target: { a: 0.1, p: -4, q: 1, r: 5 } },
    { name: '重解', family: 'cubic', target: { a: -0.2, p: -3, q: -3, r: 4 } },
    { name: '精密な正弦波', family: 'sine', target: { a: 2.5, b: 2.5, c: 0.75, d: -3 }, par: 50 },
    { name: '最終ステージ', family: 'rational', target: { a: 6, h: -3.5, k: 4 } }
  ];

  function defaultParams(family) {
    const out = {};
    family.params.forEach((p) => {
      out[p.key] = p.def;
    });
    return out;
  }

  function snap(v, p) {
    const clamped = Math.min(p.max, Math.max(p.min, v));
    const n = Math.round((clamped - p.min) / p.step);
    return parseFloat((p.min + n * p.step).toFixed(6));
  }

  // グラフ全体を (dx, dy) だけ平行移動したパラメータを返す
  function translate(family, params, dx, dy) {
    const out = Object.assign({}, params);
    if (family.translate) {
      return Object.assign(out, family.translate(params, dx, dy));
    }
    if (family.hkey) {
      out[family.hkey] += dx;
    }
    if (family.vkey) {
      out[family.vkey] += dy;
    }
    return out;
  }

  // ---------- 乱数（シード付き） ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRandom(seed) {
    const next = mulberry32(seed);
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)]
    };
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---------- ランダムな目標（ドロップ・エディタ用） ----------
  function randomParams(family, r) {
    const out = {};
    family.params.forEach((p) => {
      const [lo, hi, st] = p.gen || [p.min, p.max, p.step];
      const n = Math.round((hi - lo) / st);
      let v = 0;
      for (let tries = 0; tries < 20; tries++) {
        v = parseFloat((lo + r.int(0, n) * st).toFixed(6));
        if (!(p.nonzero && v === 0)) {
          break;
        }
      }
      out[p.key] = snap(v, p);
    });
    return out;
  }

  // スタート時の形のままで、どれくらい目標に一致してしまうか
  function startMatch(family, target, forDrop) {
    const M = global.GMMatch;
    const tf = family.fn(target);
    const def = defaultParams(family);
    if (forDrop && family.vkey) {
      def[family.vkey] = 0;
      const f0 = family.fn(def);
      const m = M.gapProbe(tf)(f0);
      if (m === null) {
        return 0;
      }
      return M.computeMatch(tf, (x) => f0(x) - m);
    }
    return M.computeMatch(tf, family.fn(def));
  }

  function randomTarget(familyKey, r, opts = {}) {
    const family = FAMILIES[familyKey];
    let last = null;
    for (let i = 0; i < 60; i++) {
      const t = randomParams(family, r);
      last = t;
      if (global.GMMatch.visibleRatio(family.fn(t)) < 0.25) {
        continue;
      }
      if (startMatch(family, t, opts.forDrop) >= 85) {
        continue;
      }
      return t;
    }
    return last;
  }

  function dropFamilies(level) {
    const pool = ['linear', 'abs'];
    if (level >= 3) {
      pool.push('quadratic');
    }
    if (level >= 5) {
      pool.push('sqrt', 'exp');
    }
    if (level >= 7) {
      pool.push('sine');
    }
    return pool;
  }

  function generateDropTarget(r, level) {
    const family = r.pick(dropFamilies(level));
    return { family, target: randomTarget(family, r, { forDrop: true }) };
  }

  // ---------- 数式モード用の問題生成 ----------
  function tidy(expr) {
    return expr
      .replace(/- -/g, '+ ')
      .replace(/\+ -/g, '- ')
      .replace(/x - 0\)/g, 'x)')
      .replace(/\(x\)\^/g, 'x^')
      .replace(/ [+-] 0$/, '')
      .replace(/(^|[^\d.])1\*/g, '$1');
  }

  const TIERS = [
    {
      name: '一次関数',
      gen: (r) => `${r.pick([-3, -2, -1, -0.5, 0.5, 1, 2, 3])}*x + ${r.int(-6, 6)}`
    },
    {
      name: '二次関数',
      gen: (r) => `${r.pick([-2, -1, -0.5, 0.5, 1, 2])}*(x - ${r.int(-5, 5)})^2 + ${r.int(-6, 6)}`
    },
    {
      name: '絶対値・平方根',
      gen: (r) =>
        r.next() < 0.5
          ? `${r.pick([-2, -1, -0.5, 0.5, 1, 2])}*abs(x - ${r.int(-5, 5)}) + ${r.int(-5, 5)}`
          : `${r.pick([-3, -2, -1, 1, 2, 3])}*sqrt(x - ${r.int(-6, 2)}) + ${r.int(-4, 4)}`
    },
    {
      name: '三角関数',
      gen: (r) => `${r.pick([-4, -3, -2, 2, 3, 4, 5])}*sin(${r.pick([0.5, 1, 2])}*x) + ${r.int(-3, 3)}`
    },
    {
      name: 'ミックス',
      gen: (r) =>
        r.pick([
          () => `${r.pick([0.5, 1, -0.5])}*x + ${r.pick([1, 2, 3])}*sin(${r.pick([1, 2])}*x)`,
          () => `${r.pick([-6, -4, -2, 2, 4, 6])}/(x - ${r.int(-4, 4)}) + ${r.int(-4, 4)}`,
          () => `0.1*(x - ${r.int(-7, -2)})*(x - ${r.int(-1, 2)})*(x - ${r.int(3, 7)})`,
          () => `2^(x - ${r.int(-3, 3)}) + ${r.int(-6, 0)}`,
          () => `${r.pick([2, 3])}*cos(x) + 0.1*x^2 - ${r.int(2, 6)}`
        ])()
    }
  ];

  function generateSet(seed) {
    const r = makeRandom(seed);
    return TIERS.map((t) => tidy(t.gen(r)));
  }

  global.GMLevels = {
    FAMILIES,
    STAGES,
    TIERS,
    defaultParams,
    snap,
    translate,
    num,
    hashString,
    makeRandom,
    randomParams,
    startMatch,
    randomTarget,
    dropFamilies,
    generateDropTarget,
    generateSet
  };
})(typeof window !== 'undefined' ? window : globalThis);