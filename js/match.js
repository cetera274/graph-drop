// File: js/match.js
(function (global) {
  'use strict';

  const VIEW = Object.freeze({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 });
  const SAMPLES = 600;
  const MATCH_SCALE = 2;

  function safeEval(fn, x) {
    try {
      const y = fn(x);
      return typeof y === 'number' ? y : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function sampleX(i, n) {
    return VIEW.xmin + ((VIEW.xmax - VIEW.xmin) * i) / n;
  }

  // 2つのグラフの一致率（0〜100）。RMSE を指数関数でスコア化する
  function computeMatch(ft, fp) {
    const H = VIEW.ymax - VIEW.ymin;
    const lo = VIEW.ymin - H / 2;
    const hi = VIEW.ymax + H / 2;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const x = sampleX(i, SAMPLES);
      const a = safeEval(ft, x);
      const b = safeEval(fp, x);
      const fa = Number.isFinite(a);
      const fb = Number.isFinite(b);
      if (!fa && !fb) {
        continue;
      }
      const d = fa !== fb ? H / 2 : Math.abs(clamp(a, lo, hi) - clamp(b, lo, hi));
      sum += d * d;
      count++;
    }
    if (!count) {
      return 0;
    }
    return 100 * Math.exp(-Math.sqrt(sum / count) / MATCH_SCALE);
  }

  // 表示範囲内に描かれる点の割合（0〜1）
  function visibleRatio(fn, n = 200) {
    let c = 0;
    for (let i = 0; i <= n; i++) {
      const y = safeEval(fn, sampleX(i, n));
      if (Number.isFinite(y) && y >= VIEW.ymin && y <= VIEW.ymax) {
        c++;
      }
    }
    return c / (n + 1);
  }

  // ドロップ用：目標が画面内にある点で (fp − ft) の最小値を返す関数を作る。
  // 落下中のグラフは「現在の高さ + この最小値 ≤ 0」になった瞬間に着地する
  function gapProbe(ft, n = 240) {
    const xs = [];
    const ts = [];
    for (let i = 0; i <= n; i++) {
      const x = sampleX(i, n);
      const t = safeEval(ft, x);
      if (Number.isFinite(t) && t >= VIEW.ymin && t <= VIEW.ymax) {
        xs.push(x);
        ts.push(t);
      }
    }
    return function (fp) {
      let m = Infinity;
      for (let i = 0; i < xs.length; i++) {
        const p = safeEval(fp, xs[i]);
        if (Number.isFinite(p)) {
          const d = p - ts[i];
          if (d < m) {
            m = d;
          }
        }
      }
      return m === Infinity ? null : m;
    };
  }

  global.GMMatch = { VIEW, safeEval, computeMatch, visibleRatio, gapProbe };
})(typeof window !== 'undefined' ? window : globalThis);