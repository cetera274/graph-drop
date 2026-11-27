// File: js/drop.js
(function () {
  'use strict';

  const App = window.GMApp;
  const L = window.GMLevels;
  const M = window.GMMatch;
  const { $, store } = App;

  const PASS = 90;
  const PERFECT = 99;
  const LIVES = 3;
  const GAP = 12;
  const GHOST_UNTIL = 5;
  const HARD_FACTOR = 25;
  const MISS_DISTANCE = 30;

  const renderer = new window.GMGraph.GraphRenderer($('#drop-canvas'), M.VIEW);
  const d = {
    mode: 'arcade',
    level: 1,
    lives: LIVES,
    score: 0,
    rng: null,
    family: null,
    target: null,
    targetFn: null,
    params: {},
    probe: null,
    phase: 'idle',
    hard: false,
    raf: 0,
    last: 0,
    startOff: 0,
    timer: 0,
    flash: null,
    custom: null,
    test: false
  };
  let sliders = null;

  function stop() {
    cancelAnimationFrame(d.raf);
    d.raf = 0;
    clearTimeout(d.timer);
    d.timer = 0;
    d.phase = 'idle';
  }

  function speed() {
    if (d.mode === 'custom') {
      return 1.5;
    }
    return Math.min(4.5, 0.9 + 0.18 * (d.level - 1));
  }

  function showGhost() {
    return d.mode === 'custom' || d.level <= GHOST_UNTIL;
  }

  function vkey() {
    return d.family.vkey;
  }

  // 上下のずれを 0 にした「形」だけの関数
  function shapeFn() {
    const p = Object.assign({}, d.params);
    p[vkey()] = 0;
    return d.family.fn(p);
  }

  function startArcade() {
    stop();
    Object.assign(d, {
      mode: 'arcade',
      level: 1,
      lives: LIVES,
      score: 0,
      custom: null,
      test: false,
      rng: L.makeRandom((Math.random() * 4294967296) >>> 0)
    });
    $('#drop-title').textContent = '⤓ ドロップ';
    App.showScreen('drop');
    nextRound();
  }

  function startCustom(stage, opts = {}) {
    stop();
    Object.assign(d, { mode: 'custom', custom: stage, test: !!opts.test, level: 1, lives: LIVES, score: 0 });
    $('#drop-title').textContent = d.test ? '🛠 テストプレイ' : `🎨「${stage.name}」 作：${stage.by}`;
    App.showScreen('drop');
    setupRound(stage.family, stage.target);
  }

  function nextRound() {
    const t = L.generateDropTarget(d.rng, d.level);
    setupRound(t.family, t.target);
  }

  function setupRound(familyKey, target) {
    d.family = L.FAMILIES[familyKey];
    d.target = Object.assign({}, target);
    d.targetFn = d.family.fn(d.target);
    d.probe = M.gapProbe(d.targetFn);
    d.params = L.defaultParams(d.family);

    // 目標のいちばん近い点から GAP だけ上でスタートする
    const m = d.probe(shapeFn());
    d.params[vkey()] = (m === null ? d.target[vkey()] : -m) + GAP;
    d.startOff = d.params[vkey()];
    d.hard = false;
    d.flash = null;
    d.phase = 'falling';

    const controls = d.family.params.filter((p) => p.key !== vkey());
    sliders = App.createSliders($('#drop-sliders'), controls, (k) => d.params[k], (p, v) => {
      if (d.phase !== 'falling') {
        return;
      }
      d.params[p.key] = L.snap(v, p);
      sliders.refresh();
    });
    sliders.select(0);

    $('#drop-template').textContent = `形：${d.family.template}（${vkey()} は落下で決まります）`;
    $('#drop-banner').hidden = true;
    $('#btn-drop-hard').disabled = false;
    updateHud();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    d.last = performance.now();
    render();
    d.raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    d.raf = 0;
    if (d.phase !== 'falling') {
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (ts - d.last) / 1000));
    d.last = ts;

    if (!App.isModalOpen()) {
      const vk = vkey();
      d.params[vk] -= speed() * (d.hard ? HARD_FACTOR : 1) * dt;
      const m = d.probe(shapeFn());
      if (m !== null && d.params[vk] + m <= 0) {
        d.params[vk] = -m;
        land();
        return;
      }
      if (d.startOff - d.params[vk] > GAP + MISS_DISTANCE) {
        miss();
        return;
      }
    }

    render();
    d.raf = requestAnimationFrame(loop);
  }

  function render() {
    const player = d.family.fn(d.params);
    let ghost = null;
    if (d.phase === 'falling' && showGhost()) {
      const f0 = shapeFn();
      const m = d.probe(f0);
      if (m !== null) {
        ghost = (x) => f0(x) - m;
      }
    }
    renderer.draw({ target: d.targetFn, player, ghost, showDiff: d.phase === 'landed', flash: d.flash });
    $('#drop-current').textContent = d.family.pretty(d.params);
  }

  function banner(text, ok) {
    const el = $('#drop-banner');
    el.textContent = text;
    el.className = `banner ${ok ? 'good' : 'bad'}`;
    el.hidden = false;
  }

  function updateHud() {
    const arcade = d.mode === 'arcade';
    $('#drop-level').hidden = !arcade;
    $('#drop-level').textContent = `レベル ${d.level}`;
    $('#drop-lives').textContent = arcade ? '❤️'.repeat(d.lives) + '🖤'.repeat(LIVES - d.lives) : '';
    if (arcade) {
      $('#drop-score').textContent = `スコア ${d.score}`;
    } else {
      $('#drop-score').textContent =
        d.custom.rec && !d.test ? `${d.custom.rec.by} さん：${d.custom.rec.val.toFixed(1)}%` : '';
    }
  }

  function land() {
    d.phase = 'landed';
    $('#btn-drop-hard').disabled = true;
    const m = M.computeMatch(d.targetFn, d.family.fn(d.params));
    resolve(m, false);
  }

  function miss() {
    d.phase = 'landed';
    $('#btn-drop-hard').disabled = true;
    resolve(0, true);
  }

  function resolve(m, missed) {
    const ok = !missed && m >= PASS;
    d.flash = ok ? 'good' : 'bad';
    render();

    if (d.mode === 'custom') {
      App.playTones(m >= 95 ? App.SFX.clear : m >= 80 ? App.SFX.good : App.SFX.bad);
      banner(missed ? '着地できませんでした' : `一致率 ${m.toFixed(1)}%`, ok);
      const stage = d.custom;
      const test = d.test;
      d.timer = setTimeout(() => {
        App.showCustomResult(stage, m, { test, title: missed ? 'ざんねん' : '着地！' });
      }, 900);
      return;
    }

    if (ok) {
      const gain = Math.round(m * (1 + 0.1 * (d.level - 1))) + (m >= PERFECT ? 50 : 0);
      d.score += gain;
      d.level += 1;
      banner(`${m >= PERFECT ? 'PERFECT!' : 'ナイス！'}　一致率 ${m.toFixed(1)}%　+${gain}`, true);
      App.playTones(m >= PERFECT ? App.SFX.clear : App.SFX.good);
    } else {
      d.lives -= 1;
      banner(missed ? 'ミス…着地できませんでした' : `ミス…一致率 ${m.toFixed(1)}%（${PASS}%以上で成功）`, false);
      App.playTones(App.SFX.bad);
    }
    updateHud();

    d.timer = setTimeout(() => {
      if (d.lives <= 0) {
        gameOver();
        return;
      }
      if (ok && d.level === GHOST_UNTIL + 1) {
        App.toast('ここから着地予想（点線）が消えます');
      }
      nextRound();
    }, 1500);
  }

  function gameOver() {
    d.phase = 'over';
    const reached = d.level;
    const isBest = d.score > store.dropBest;
    if (isBest) {
      store.dropBest = d.score;
      store.dropBestLevel = reached;
      App.saveStore();
    }
    const text = `📈 グラフ作りmath ドロップ\nレベル ${reached}　スコア ${d.score}\n${App.baseUrl()}`;
    App.openModal({
      title: 'ゲームオーバー',
      big: String(d.score),
      lines: [`到達レベル ${reached}`, isBest ? '自己ベスト更新！' : `自己ベスト ${store.dropBest}`],
      actions: [
        { label: '結果をシェア', keepOpen: true, onClick: () => App.shareText(text) },
        { label: 'もう一度', onClick: startArcade },
        { label: 'メニューへ', primary: true, onClick: () => App.showScreen('menu') }
      ]
    });
  }

  function hardDrop() {
    if (d.phase === 'falling') {
      d.hard = true;
    }
  }

  // キーボード操作（スライダーの標準の矢印キー動作より先に処理する）
  document.addEventListener(
    'keydown',
    (e) => {
      if (App.current() !== 'drop' || App.isModalOpen() || d.phase !== 'falling') {
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range'))) {
        return;
      }
      let handled = true;
      switch (e.key) {
        case 'ArrowUp':
          sliders.select(sliders.selected - 1);
          break;
        case 'ArrowDown':
          sliders.select(sliders.selected + 1);
          break;
        case 'ArrowLeft':
          sliders.nudge(-1);
          break;
        case 'ArrowRight':
          sliders.nudge(1);
          break;
        case ' ':
        case 'Enter':
          hardDrop();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener(
    'keyup',
    (e) => {
      if (App.current() === 'drop' && e.key === ' ' && !App.isModalOpen()) {
        e.preventDefault();
      }
    },
    true
  );

  App.attachDrag($('#drop-canvas'), renderer, {
    enabled: () => d.phase === 'falling' && !!d.family && !!d.family.hkey,
    family: () => d.family,
    get: () => d.params,
    set: (next) => {
      const hk = d.family.hkey;
      d.params[hk] = next[hk];
      sliders.refresh();
    },
    allowY: false
  });

  $('#btn-drop-hard').addEventListener('click', hardDrop);
  $('#btn-drop-quit').addEventListener('click', () => App.showScreen(d.test ? 'editor' : 'menu'));

  App.onLeave('drop', stop);

  window.GMDrop = { startArcade, startCustom };
})();