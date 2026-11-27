// File: js/physics.js
(function (global) {
  'use strict';

  const M = global.GMMatch;
  const VIEW = M.VIEW;

  // 単位は座標の1マス。固定ステップなので同じ式なら結果は毎回同じになる
  const C = Object.freeze({
    g: 12,
    r: 0.35,
    eGround: 0.35,
    eWall: 0.5,
    bounceMin: 1.2,
    rolling: 0.6,
    dt: 1 / 240,
    maxSpeed: 40,
    maxTime: 20,
    hold: 2,
    deep: 1,
    spring: 18,
    switchR: 0.5,
    coinR: 0.45,
    warpR: 0.7,
    carry: 8
  });

  const S5 = Math.sqrt(5);
  const SPRING_DIRS = Object.freeze({
    u: [0, 1],
    r: [1 / S5, 2 / S5],
    l: [-1 / S5, 2 / S5]
  });

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  // 地面（y = f(x)）の高さと傾き。定義されない x では地面なし
  function groundAt(fn, x) {
    if (!fn) {
      return null;
    }
    const y = M.safeEval(fn, x);
    if (!Number.isFinite(y)) {
      return null;
    }
    const h = 1e-3;
    const a = M.safeEval(fn, x - h);
    const b = M.safeEval(fn, x + h);
    let s;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      s = (b - a) / (2 * h);
    } else if (Number.isFinite(b)) {
      s = (b - y) / h;
    } else if (Number.isFinite(a)) {
      s = (y - a) / h;
    } else {
      s = 0;
    }
    if (!Number.isFinite(s)) {
      s = 0;
    }
    return { y, s: clamp(s, -1000, 1000) };
  }

  // 円と長方形の重なり。重なっていれば押し出す向きと量を返す
  function overlap(rect, x, y, r) {
    const cx = clamp(x, rect.x1, rect.x2);
    const cy = clamp(y, rect.y1, rect.y2);
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) {
      return null;
    }
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, pen: r - d };
    }
    const options = [
      { nx: -1, ny: 0, pen: x - rect.x1 + r },
      { nx: 1, ny: 0, pen: rect.x2 - x + r },
      { nx: 0, ny: -1, pen: y - rect.y1 + r },
      { nx: 0, ny: 1, pen: rect.y2 - y + r }
    ];
    return options.reduce((a, b) => (b.pen < a.pen ? b : a));
  }

  function inside(rect, x, y) {
    return x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2;
  }

  // 動くブロックの時刻 t での位置と速度。cos で往復するので端ではゆっくりになる
  function rectAt(r, t) {
    const out = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, vx: 0, vy: 0 };
    const m = r.move;
    if (m && m.T > 0) {
      const w = (2 * Math.PI) / m.T;
      const k = (1 - Math.cos(w * t)) / 2;
      const dk = (w * Math.sin(w * t)) / 2;
      out.x1 += m.dx * k;
      out.x2 += m.dx * k;
      out.y1 += m.dy * k;
      out.y2 += m.dy * k;
      out.vx = m.dx * dk;
      out.vy = m.dy * dk;
    }
    return out;
  }

  // ON/OFF ブロック：sw が 'off' なら OFF のとき、'on' なら ON のときだけ実体がある
  function isSolid(w, on) {
    return !w.sw || (w.sw === 'on') === !!on;
  }

  // 法線方向の相対速度を反発係数で反転する。遅いときは跳ねずに止める
  function resolve(sim, nx, ny, e, bvx, bvy) {
    const vx = bvx || 0;
    const vy = bvy || 0;
    const vn = (sim.vx - vx) * nx + (sim.vy - vy) * ny;
    if (vn < 0) {
      const out = vn < -C.bounceMin ? -e * vn : 0;
      sim.vx += (out - vn) * nx;
      sim.vy += (out - vn) * ny;
    }
  }

  // 区間の境界 [b1, b2, ...] から区間の一覧を作る
  function segmentsFrom(bounds) {
    const b = Array.isArray(bounds) ? bounds : [];
    const pts = [VIEW.xmin].concat(b, [VIEW.xmax]);
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      out.push([pts[i], pts[i + 1]]);
    }
    return out;
  }

  // 区間ごとの式をつないだ地面。null の区間は穴（地面なし）
  function piecewise(fns, bounds) {
    const segs = segmentsFrom(bounds);
    if (segs.length === 1) {
      return fns[0] || null;
    }
    return function (x) {
      for (let i = 0; i < segs.length; i++) {
        const lo = i === 0 ? -Infinity : segs[i][0];
        const hi = i === segs.length - 1 ? Infinity : segs[i][1];
        if (x >= lo && x < hi) {
          const f = fns[i];
          return f ? f(x) : NaN;
        }
      }
      return NaN;
    };
  }

  function finish(sim, status, reason) {
    sim.status = status;
    sim.reason = reason || '';
  }

  function create(level, fn) {
    const coins = level.coins || [];
    const sim = {
      level,
      fn,
      x: level.start.x,
      y: level.start.y,
      vx: 0,
      vy: 0,
      t: 0,
      hold: 0,
      need: level.hold || C.hold,
      maxTime: level.maxTime || C.maxTime,
      acc: 0,
      status: 'running',
      reason: '',
      on: false,
      swTouch: [],
      springTouch: [],
      got: coins.map(() => false),
      coinsLeft: coins.length,
      warpLock: -1,
      events: []
    };
    const g = groundAt(fn, sim.x);
    if (g && sim.y - g.y < C.r) {
      finish(sim, 'fail', 'スタート地点が地面の下にあります');
    }
    return sim;
  }

  function substep(sim) {
    const dt = C.dt;
    const r = C.r;
    const level = sim.level;
    const t = sim.t;

    sim.vy -= C.g * dt;
    (level.winds || []).forEach((w) => {
      if (inside(w, sim.x, sim.y)) {
        sim.vx += (w.fx || 0) * dt;
        sim.vy += (w.fy || 0) * dt;
      }
    });
    const sp = Math.hypot(sim.vx, sim.vy);
    if (sp > C.maxSpeed) {
      sim.vx *= C.maxSpeed / sp;
      sim.vy *= C.maxSpeed / sp;
    }
    const prevX = sim.x;
    sim.x += sim.vx * dt;
    sim.y += sim.vy * dt;
    let contact = false;

    let g = groundAt(sim.fn, sim.x);
    let len = 1;
    let d = Infinity;
    if (g) {
      len = Math.sqrt(1 + g.s * g.s);
      d = (sim.y - g.y) / len;
      if (d < -C.deep) {
        // 不連続点などで横から地面に入りこんだときは壁としてはね返す
        sim.x = prevX;
        sim.vx = -sim.vx * C.eWall;
        g = groundAt(sim.fn, sim.x);
        if (g) {
          len = Math.sqrt(1 + g.s * g.s);
          d = (sim.y - g.y) / len;
        }
      }
    }
    if (g && d < r && d >= -C.deep) {
      const nx = -g.s / len;
      const ny = 1 / len;
      const pen = r - d;
      sim.x += nx * pen;
      sim.y += ny * pen;
      resolve(sim, nx, ny, C.eGround);
      contact = true;
    }

    (level.walls || []).forEach((w) => {
      if (!isSolid(w, sim.on)) {
        return;
      }
      const R = rectAt(w, t);
      const o = overlap(R, sim.x, sim.y, r);
      if (!o) {
        return;
      }
      sim.x += o.nx * o.pen;
      sim.y += o.ny * o.pen;
      resolve(sim, o.nx, o.ny, C.eWall, R.vx, R.vy);
      if (o.ny > 0.5) {
        contact = true;
        if (w.move) {
          // 動く床に乗っているボールは床と一緒に運ばれる
          sim.vx += (R.vx - sim.vx) * Math.min(1, C.carry * dt);
        }
      }
    });

    (level.springs || []).forEach((s, i) => {
      const o = overlap(s, sim.x, sim.y, r);
      if (o) {
        sim.x += o.nx * o.pen;
        sim.y += o.ny * o.pen;
        const dir = SPRING_DIRS[s.d] || SPRING_DIRS.u;
        sim.vx = dir[0] * C.spring;
        sim.vy = dir[1] * C.spring;
        if (!sim.springTouch[i]) {
          sim.events.push('spring');
        }
      }
      sim.springTouch[i] = !!o;
    });

    if (contact) {
      const f = Math.exp(-C.rolling * dt);
      sim.vx *= f;
      sim.vy *= f;
    }
    sim.t += dt;

    if ((level.hazards || []).some((h) => overlap(rectAt(h, t), sim.x, sim.y, r))) {
      finish(sim, 'fail', 'トゲにふれました');
      return;
    }

    const sws = level.switches || [];
    for (let i = 0; i < sws.length; i++) {
      const touch = Math.hypot(sim.x - sws[i].x, sim.y - sws[i].y) < r + C.switchR;
      if (touch && !sim.swTouch[i]) {
        sim.on = !sim.on;
        sim.events.push('switch');
      }
      sim.swTouch[i] = touch;
    }

    const coins = level.coins || [];
    for (let i = 0; i < coins.length; i++) {
      if (!sim.got[i] && Math.hypot(sim.x - coins[i].x, sim.y - coins[i].y) < r + C.coinR) {
        sim.got[i] = true;
        sim.coinsLeft -= 1;
        sim.events.push('coin');
      }
    }

    const warps = level.warps || [];
    if (sim.warpLock >= 0) {
      const w = warps[sim.warpLock];
      const far = (px, py) => Math.hypot(sim.x - px, sim.y - py) > C.warpR + r;
      if (!w || (far(w.ax, w.ay) && far(w.bx, w.by))) {
        sim.warpLock = -1;
      }
    } else {
      for (let i = 0; i < warps.length; i++) {
        const w = warps[i];
        if (Math.hypot(sim.x - w.ax, sim.y - w.ay) < C.warpR) {
          sim.x = w.bx;
          sim.y = w.by;
        } else if (Math.hypot(sim.x - w.bx, sim.y - w.by) < C.warpR) {
          sim.x = w.ax;
          sim.y = w.ay;
        } else {
          continue;
        }
        sim.warpLock = i;
        sim.events.push('warp');
        break;
      }
    }

    if (sim.x < VIEW.xmin - 1 || sim.x > VIEW.xmax + 1 || sim.y < VIEW.ymin - 1 || sim.y > 40) {
      finish(sim, 'fail', 'ボールが画面の外に出ました');
      return;
    }
    if (sim.coinsLeft === 0 && inside(level.goal, sim.x, sim.y)) {
      sim.hold += dt;
      if (sim.hold >= sim.need - 1e-9) {
        finish(sim, 'clear');
        return;
      }
    } else {
      sim.hold = 0;
    }
    if (sim.t >= sim.maxTime) {
      finish(sim, 'fail', sim.coinsLeft > 0 ? `時間切れです（コインがあと${sim.coinsLeft}枚）` : `時間切れです（${sim.maxTime}秒）`);
    }
  }

  // 実時間 dt だけ進める（描画用）
  function step(sim, dt) {
    sim.acc += clamp(dt, 0, 0.05);
    while (sim.acc >= C.dt && sim.status === 'running') {
      substep(sim);
      sim.acc -= C.dt;
    }
  }

  // 最後まで一気に計算する（テスト用）
  function run(level, fn) {
    const sim = create(level, fn);
    const max = Math.ceil(sim.maxTime / C.dt) + 10;
    for (let i = 0; i < max && sim.status === 'running'; i++) {
      substep(sim);
    }
    return sim;
  }

  // 描画用：時刻と ON/OFF を反映した配置を返す（sim が null なら開始時の状態）
  function view(level, sim) {
    const t = sim ? sim.t : 0;
    const on = sim ? sim.on : false;
    const coins = level.coins || [];
    const left = sim ? sim.coinsLeft : coins.length;
    const pathOf = (r) => {
      if (!r.move) {
        return null;
      }
      const cx = (r.x1 + r.x2) / 2;
      const cy = (r.y1 + r.y2) / 2;
      return { ax: cx, ay: cy, bx: cx + r.move.dx, by: cy + r.move.dy };
    };
    return {
      walls: (level.walls || []).map((w) =>
        Object.assign(rectAt(w, t), { sw: w.sw || null, active: isSolid(w, on), path: pathOf(w) })
      ),
      hazards: (level.hazards || []).map((h) => Object.assign(rectAt(h, t), { path: pathOf(h) })),
      springs: level.springs || [],
      winds: level.winds || [],
      warps: level.warps || [],
      switches: level.switches || [],
      on,
      coins: coins.map((c, i) => ({ x: c.x, y: c.y, got: sim ? !!sim.got[i] : false })),
      goal: level.goal,
      locked: left > 0,
      coinsLeft: left
    };
  }

  // 数式ドロップ：fn を上から落として目標に触れた位置と一致率を返す
  function landCurve(targetFn, fn) {
    const m = M.gapProbe(targetFn)(fn);
    if (m === null) {
      return null;
    }
    const off = -m;
    const landed = (x) => fn(x) + off;
    return { offset: off, fn: landed, match: M.computeMatch(targetFn, landed) };
  }

  global.GMPhysics = {
    C,
    SPRING_DIRS,
    create,
    step,
    run,
    view,
    rectAt,
    isSolid,
    piecewise,
    segmentsFrom,
    landCurve,
    groundAt
  };
})(typeof window !== 'undefined' ? window : globalThis);