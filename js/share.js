// File: js/share.js
(function (global) {
  'use strict';

  const TYPES = ['slider', 'drop', 'formula', 'fdrop', 'ball'];
  const EXPR_TYPES = ['formula', 'fdrop'];
  const MAX_NAME = 24;
  const MAX_BY = 16;
  const MAX_EXPR = 80;
  const MAX_CODE = 4000;
  const GRID = 0.5;
  const BOUND = 10;
  const RECT_BOUND = 20;
  const START_BOUND = 9.5;
  const BALL_R = 0.35;
  const LIMITS = Object.freeze({ walls: 12, hazards: 12, springs: 6, winds: 4, warps: 3, switches: 4, coins: 8 });
  const SPRING_DIRS = ['u', 'r', 'l'];

  class ShareError extends Error {}

  const Lv = () => global.GMLevels;
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function cleanText(v, max) {
    if (typeof v !== 'string') {
      return '';
    }
    return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  }

  // ---------- ボール配置の検証 ----------
  function gridNum(v, lo, hi, what) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo - 1e-9 || v > hi + 1e-9) {
      throw new ShareError(`${what}が範囲外です`);
    }
    const n = Math.round(v / GRID);
    if (Math.abs(n * GRID - v) > 1e-6) {
      throw new ShareError(`${what}が${GRID}単位になっていません`);
    }
    const out = n * GRID;
    return out === 0 ? 0 : out;
  }

  function coord(v, lim, what) {
    return gridNum(v, -lim, lim, `${what}の座標`);
  }

  function rectObj(r, what, lim) {
    if (!r || typeof r !== 'object') {
      throw new ShareError(`${what}のデータがありません`);
    }
    const b = lim || BOUND;
    const x1 = coord(r.x1, b, what);
    const y1 = coord(r.y1, b, what);
    const x2 = coord(r.x2, b, what);
    const y2 = coord(r.y2, b, what);
    if (!(x2 - x1 >= GRID - 1e-9 && y2 - y1 >= GRID - 1e-9)) {
      throw new ShareError(`${what}の大きさが正しくありません`);
    }
    return { x1, y1, x2, y2 };
  }

  function moveObj(m, what) {
    if (!m || typeof m !== 'object') {
      throw new ShareError(`${what}の動きが正しくありません`);
    }
    const dx = gridNum(m.dx, -20, 20, `${what}の動き`);
    const dy = gridNum(m.dy, -20, 20, `${what}の動き`);
    const T = gridNum(m.T, 1, 30, `${what}の周期`);
    if (dx === 0 && dy === 0) {
      throw new ShareError(`${what}の動きが正しくありません`);
    }
    return { dx, dy, T };
  }

  function wallObj(r) {
    const o = rectObj(r, 'ブロック', RECT_BOUND);
    if (r.sw !== undefined && r.sw !== null) {
      if (r.sw !== 'on' && r.sw !== 'off') {
        throw new ShareError('ON/OFF ブロックの種類が正しくありません');
      }
      o.sw = r.sw;
    }
    if (r.move !== undefined && r.move !== null) {
      o.move = moveObj(r.move, 'ブロック');
    }
    return o;
  }

  function hazardObj(r) {
    const o = rectObj(r, 'トゲ', RECT_BOUND);
    if (r.sw !== undefined && r.sw !== null) {
      throw new ShareError('トゲは ON/OFF にできません');
    }
    if (r.move !== undefined && r.move !== null) {
      o.move = moveObj(r.move, 'トゲ');
    }
    return o;
  }

  function springObj(r) {
    const o = rectObj(r, 'バネ', BOUND);
    const d = r.d === undefined ? 'u' : r.d;
    if (!SPRING_DIRS.includes(d)) {
      throw new ShareError('バネの向きが正しくありません');
    }
    o.d = d;
    return o;
  }

  function windObj(r) {
    const o = rectObj(r, '風', BOUND);
    o.fx = gridNum(r.fx === undefined ? 0 : r.fx, -30, 30, '風の強さ');
    o.fy = gridNum(r.fy === undefined ? 0 : r.fy, -30, 30, '風の強さ');
    if (o.fx === 0 && o.fy === 0) {
      throw new ShareError('風の強さが 0 です');
    }
    return o;
  }

  function warpObj(w) {
    if (!w || typeof w !== 'object') {
      throw new ShareError('ワープのデータがありません');
    }
    const o = {
      ax: coord(w.ax, BOUND, 'ワープ'),
      ay: coord(w.ay, BOUND, 'ワープ'),
      bx: coord(w.bx, BOUND, 'ワープ'),
      by: coord(w.by, BOUND, 'ワープ')
    };
    if (o.ax === o.bx && o.ay === o.by) {
      throw new ShareError('ワープの入口と出口が同じ場所です');
    }
    return o;
  }

  function pointObj(p, what) {
    if (!p || typeof p !== 'object') {
      throw new ShareError(`${what}のデータがありません`);
    }
    return { x: coord(p.x, BOUND, what), y: coord(p.y, BOUND, what) };
  }

  function listOf(arr, max, what, fn) {
    if (arr === undefined || arr === null) {
      return [];
    }
    if (!Array.isArray(arr)) {
      throw new ShareError(`${what}のデータが正しくありません`);
    }
    if (arr.length > max) {
      throw new ShareError(`${what}は${max}個までです`);
    }
    return arr.map(fn);
  }

  function segsObj(s) {
    if (!Array.isArray(s) || s.length < 1 || s.length > 2) {
      throw new ShareError('式の区間が正しくありません');
    }
    const out = s.map((v) => gridNum(v, -9.5, 9.5, '式の区間'));
    for (let i = 1; i < out.length; i++) {
      if (out[i] - out[i - 1] < 1) {
        throw new ShareError('式の区間が正しくありません');
      }
    }
    return out;
  }

  function touches(r, x, y) {
    const cx = Math.min(r.x2, Math.max(r.x1, x));
    const cy = Math.min(r.y2, Math.max(r.y1, y));
    return Math.hypot(x - cx, y - cy) <= BALL_R;
  }

  function validateBall(raw, out) {
    const s = raw.start;
    if (!s || typeof s !== 'object') {
      throw new ShareError('スタート地点がありません');
    }
    const start = { x: coord(s.x, START_BOUND, 'スタート'), y: coord(s.y, START_BOUND, 'スタート') };
    const goal = rectObj(raw.goal, 'ゴール', BOUND);
    const walls = listOf(raw.walls, LIMITS.walls, 'ブロック', wallObj);
    const hazards = listOf(raw.hazards, LIMITS.hazards, 'トゲ', hazardObj);
    const springs = listOf(raw.springs, LIMITS.springs, 'バネ', springObj);
    const winds = listOf(raw.winds, LIMITS.winds, '風', windObj);
    const warps = listOf(raw.warps, LIMITS.warps, 'ワープ', warpObj);
    const switches = listOf(raw.switches, LIMITS.switches, 'スイッチ', (p) => pointObj(p, 'スイッチ'));
    const coins = listOf(raw.coins, LIMITS.coins, 'コイン', (p) => pointObj(p, 'コイン'));
    const blocking = walls.filter((w) => !w.move).concat(hazards.filter((h) => !h.move));
    if (blocking.some((r) => touches(r, start.x, start.y))) {
      throw new ShareError('スタート地点がブロックかトゲと重なっています');
    }
    Object.assign(out, { start, goal, walls, hazards, springs, winds, warps, switches, coins });

    if (raw.segs !== undefined && raw.segs !== null) {
      out.segs = segsObj(raw.segs);
    }

    if (raw.startRange !== undefined && raw.startRange !== null) {
      const sr = raw.startRange;
      if (!Array.isArray(sr) || sr.length !== 2) {
        throw new ShareError('投下範囲が正しくありません');
      }
      const a = coord(sr[0], START_BOUND, '投下範囲');
      const b = coord(sr[1], START_BOUND, '投下範囲');
      if (!(a < b && a <= start.x && start.x <= b)) {
        throw new ShareError('投下範囲が正しくありません');
      }
      out.startRange = [a, b];
    }

    if (raw.par !== undefined && raw.par !== null) {
      if (!Number.isInteger(raw.par) || raw.par < 1 || raw.par > MAX_EXPR * 3) {
        throw new ShareError('作者の記録が正しくありません');
      }
      out.par = raw.par;
    }
  }

  // 共有ステージを検証し、正規化したコピーを返す（不正なら ShareError）
  function validate(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new ShareError('データの形式が正しくありません');
    }
    if (!TYPES.includes(raw.type)) {
      throw new ShareError('不明なステージの種類です');
    }
    const out = {
      type: raw.type,
      name: cleanText(raw.name, MAX_NAME) || 'ななしのステージ',
      by: cleanText(raw.by, MAX_BY) || 'ななし'
    };

    if (EXPR_TYPES.includes(raw.type)) {
      const expr = cleanText(raw.expr, MAX_EXPR);
      if (!expr) {
        throw new ShareError('目標の式がありません');
      }
      try {
        global.GMParser.parse(expr);
      } catch (e) {
        throw new ShareError('目標の式が正しくありません');
      }
      out.expr = expr;
    } else if (raw.type === 'ball') {
      validateBall(raw, out);
    } else {
      const families = Lv().FAMILIES;
      if (typeof raw.family !== 'string' || !has(families, raw.family)) {
        throw new ShareError('不明なグラフの形です');
      }
      const family = families[raw.family];
      if (raw.type === 'drop' && !family.drop) {
        throw new ShareError('この形はドロップでは使えません');
      }
      const target = {};
      family.params.forEach((p) => {
        const v = raw.target && typeof raw.target === 'object' ? raw.target[p.key] : undefined;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < p.min - 1e-9 || v > p.max + 1e-9) {
          throw new ShareError(`パラメータ ${p.key} の値が範囲外です`);
        }
        const s = Lv().snap(v, p);
        if (Math.abs(s - v) > 1e-6) {
          throw new ShareError(`パラメータ ${p.key} の値が刻みに合っていません`);
        }
        target[p.key] = s;
      });
      out.family = raw.family;
      out.target = target;
    }

    if (raw.rec && typeof raw.rec === 'object') {
      const val = raw.rec.val;
      if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 100000) {
        out.rec = { by: cleanText(raw.rec.by, MAX_BY) || 'ななし', val: Math.round(val * 10) / 10 };
      }
    }
    return out;
  }

  function toB64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64Url(s) {
    if (!/^[A-Za-z0-9_-]+$/.test(s)) {
      throw new ShareError('リンクが壊れています');
    }
    let b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) {
      b += '=';
    }
    const bin = atob(b);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  // ---------- 短い形式との変換 ----------
  const r4 = (r) => [r.x1, r.y1, r.x2, r.y2];
  const isArr = (a, n) => Array.isArray(a) && a.length >= n;
  const o4 = (a) => (isArr(a, 4) ? { x1: a[0], y1: a[1], x2: a[2], y2: a[3] } : null);

  function wallArr(r) {
    const a = r4(r);
    if (r.sw || r.move) {
      a.push(r.sw === 'off' ? 1 : r.sw === 'on' ? 2 : 0);
      if (r.move) {
        a.push(r.move.dx, r.move.dy, r.move.T);
      }
    }
    return a;
  }

  function wallFrom(a) {
    const o = o4(a);
    if (!o) {
      return null;
    }
    if (a.length >= 5) {
      if (a[4] === 1) {
        o.sw = 'off';
      } else if (a[4] === 2) {
        o.sw = 'on';
      } else if (a[4] !== 0) {
        o.sw = '?';
      }
    }
    if (a.length >= 8) {
      o.move = { dx: a[5], dy: a[6], T: a[7] };
    } else if (a.length > 5) {
      o.move = '?';
    }
    return o;
  }

  // URL を短くするため、短いキーと配列で表す
  function toCompact(s) {
    const c = { v: 1, y: s.type, n: s.name, b: s.by };
    if (EXPR_TYPES.includes(s.type)) {
      c.e = s.expr;
    } else if (s.type === 'ball') {
      c.st = [s.start.x, s.start.y];
      c.g = r4(s.goal);
      c.w = s.walls.map(wallArr);
      c.h = s.hazards.map(wallArr);
      if (s.springs.length) {
        c.sp = s.springs.map((r) => r4(r).concat([SPRING_DIRS.indexOf(r.d)]));
      }
      if (s.winds.length) {
        c.wi = s.winds.map((r) => r4(r).concat([r.fx, r.fy]));
      }
      if (s.warps.length) {
        c.wp = s.warps.map((w) => [w.ax, w.ay, w.bx, w.by]);
      }
      if (s.switches.length) {
        c.sw = s.switches.map((p) => [p.x, p.y]);
      }
      if (s.coins.length) {
        c.co = s.coins.map((p) => [p.x, p.y]);
      }
      if (s.segs) {
        c.sg = s.segs.slice();
      }
      if (s.startRange) {
        c.sr = s.startRange.slice();
      }
      if (s.par) {
        c.p = s.par;
      }
    } else {
      c.f = s.family;
      c.t = Lv().FAMILIES[s.family].params.map((p) => s.target[p.key]);
    }
    if (s.rec) {
      c.r = [s.rec.by, s.rec.val];
    }
    return c;
  }

  function fromCompact(c) {
    if (!c || typeof c !== 'object' || c.v !== 1) {
      throw new ShareError('対応していないバージョンのリンクです');
    }
    const raw = { type: c.y, name: c.n, by: c.b, expr: c.e, family: c.f };
    const mapArr = (v, fn) => (Array.isArray(v) ? v.map(fn) : v);
    if (c.y === 'ball') {
      raw.start = isArr(c.st, 2) ? { x: c.st[0], y: c.st[1] } : null;
      raw.goal = o4(c.g);
      raw.walls = mapArr(c.w, wallFrom);
      raw.hazards = mapArr(c.h, wallFrom);
      raw.springs = mapArr(c.sp, (a) => {
        const o = o4(a);
        if (o) {
          o.d = a.length > 4 ? SPRING_DIRS[a[4]] || '?' : undefined;
        }
        return o;
      });
      raw.winds = mapArr(c.wi, (a) => {
        const o = o4(a);
        if (o) {
          o.fx = a[4];
          o.fy = a[5];
        }
        return o;
      });
      raw.warps = mapArr(c.wp, (a) => (isArr(a, 4) ? { ax: a[0], ay: a[1], bx: a[2], by: a[3] } : null));
      raw.switches = mapArr(c.sw, (a) => (isArr(a, 2) ? { x: a[0], y: a[1] } : null));
      raw.coins = mapArr(c.co, (a) => (isArr(a, 2) ? { x: a[0], y: a[1] } : null));
      raw.segs = c.sg;
      raw.startRange = c.sr;
      raw.par = c.p;
    } else if (typeof c.f === 'string' && has(Lv().FAMILIES, c.f) && Array.isArray(c.t)) {
      raw.target = {};
      Lv().FAMILIES[c.f].params.forEach((p, i) => {
        raw.target[p.key] = c.t[i];
      });
    }
    if (Array.isArray(c.r)) {
      raw.rec = { by: c.r[0], val: c.r[1] };
    }
    return validate(raw);
  }

  function encode(stage) {
    return toB64Url(JSON.stringify(toCompact(validate(stage))));
  }

  function decode(code) {
    if (typeof code !== 'string' || !code || code.length > MAX_CODE) {
      throw new ShareError('リンクが壊れています');
    }
    let data;
    try {
      data = JSON.parse(fromB64Url(code));
    } catch (e) {
      throw new ShareError('リンクが壊れています');
    }
    return fromCompact(data);
  }

  // File: js/share.js（末尾のエクスポートを置き換え）

  // ---------- ワールド（複数ステージのまとまり） ----------
  const MAX_WORLD_STAGES = 20;
  const MAX_DESC = 200;
  const MAX_NOTE = 120;
  const MAX_WORLD_CODE = 60000;
  const MAX_FILE = 500000;
  const FILE_FORMAT = 'graph-tsukuri-math-world';

  // 改行を残す文字列の整形
  function cleanLong(v, max) {
    if (typeof v !== 'string') {
      return '';
    }
    return v
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
      .trim()
      .slice(0, max);
  }

  function validateWorld(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new ShareError('ワールドのデータが正しくありません');
    }
    if (!Array.isArray(raw.stages) || raw.stages.length < 1) {
      throw new ShareError('ワールドにステージがありません');
    }
    if (raw.stages.length > MAX_WORLD_STAGES) {
      throw new ShareError(`ワールドのステージは${MAX_WORLD_STAGES}個までです`);
    }
    const stages = raw.stages.map((s, i) => {
      let v;
      try {
        v = validate(s);
      } catch (e) {
        throw new ShareError(`ステージ${i + 1}：${e.message}`);
      }
      delete v.rec;
      const note = cleanLong(s && typeof s === 'object' ? s.note : '', MAX_NOTE);
      if (note) {
        v.note = note;
      }
      return v;
    });
    return {
      name: cleanText(raw.name, MAX_NAME) || 'ななしのワールド',
      by: cleanText(raw.by, MAX_BY) || 'ななし',
      desc: cleanLong(raw.desc, MAX_DESC),
      stages
    };
  }

  function encodeWorld(world) {
    const w = validateWorld(world);
    const c = {
      v: 1,
      k: 'w',
      n: w.name,
      b: w.by,
      s: w.stages.map((st) => {
        const sc = toCompact(st);
        if (st.note) {
          sc.m = st.note;
        }
        return sc;
      })
    };
    if (w.desc) {
      c.d = w.desc;
    }
    return toB64Url(JSON.stringify(c));
  }

  function decodeWorld(code) {
    if (typeof code !== 'string' || !code || code.length > MAX_WORLD_CODE) {
      throw new ShareError('リンクが壊れています');
    }
    let c;
    try {
      c = JSON.parse(fromB64Url(code));
    } catch (e) {
      throw new ShareError('リンクが壊れています');
    }
    if (!c || typeof c !== 'object' || c.v !== 1 || c.k !== 'w' || !Array.isArray(c.s)) {
      throw new ShareError('ワールドのリンクではありません');
    }
    if (c.s.length > MAX_WORLD_STAGES) {
      throw new ShareError(`ワールドのステージは${MAX_WORLD_STAGES}個までです`);
    }
    const stages = c.s.map((sc, i) => {
      let st;
      try {
        st = fromCompact(sc);
      } catch (e) {
        throw new ShareError(`ステージ${i + 1}：${e.message}`);
      }
      if (sc && typeof sc.m === 'string') {
        st.note = sc.m;
      }
      return st;
    });
    return validateWorld({ name: c.n, by: c.b, desc: c.d, stages });
  }

  function worldToFile(world) {
    return JSON.stringify({ format: FILE_FORMAT, version: 1, world: validateWorld(world) }, null, 2);
  }

  function worldFromFile(text) {
    if (typeof text !== 'string' || text.length > MAX_FILE) {
      throw new ShareError('ファイルが大きすぎるか、形式が正しくありません');
    }
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new ShareError('ファイルを読みこめませんでした');
    }
    if (!obj || typeof obj !== 'object' || obj.format !== FILE_FORMAT || obj.version !== 1) {
      throw new ShareError('グラフ作りmath のワールドのファイルではありません');
    }
    return validateWorld(obj.world);
  }

  // FNV-1a（32ビット）。ワールドやステージの内容から短い ID を作る
  function hashCode(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  function worldId(world) {
    return hashCode(encodeWorld(world));
  }

  global.GMShare = {
    encode,
    decode,
    validate,
    ShareError,
    isExprType: (t) => EXPR_TYPES.includes(t),
    MAX_RECTS: LIMITS.walls,
    LIMITS,
    validateWorld,
    encodeWorld,
    decodeWorld,
    worldToFile,
    worldFromFile,
    worldId,
    hashCode,
    MAX_WORLD_STAGES,
    MAX_NOTE,
    MAX_WORLD_CODE
  };
})(typeof window !== 'undefined' ? window : globalThis);