// File: js/stage.js
(function () {
  'use strict';

  const App = window.GMApp;
  const L = window.GMLevels;
  const M = window.GMMatch;
  const { $, store } = App;

  const CLEAR_THRESHOLD = 99;
  const renderer = new window.GMGraph.GraphRenderer($('#stage-canvas'), M.VIEW);

  const st = {
    index: 0,
    def: null,
    family: null,
    params: {},
    target: null,
    startTime: 0,
    timerId: null,
    cleared: false,
    hintUsed: false,
    custom: null,
    test: false
  };
  let sliders = null;

  function isUnlocked(i) {
    return i < 3 || (store.stars[i - 1] || 0) > 0;
  }

  function continueIndex() {
    const i = L.STAGES.findIndex((_, j) => isUnlocked(j) && !store.stars[j]);
    return i < 0 ? 0 : i;
  }

  function par() {
    return st.def.par || st.family.params.length * 10;
  }

  function setMeter(m) {
    const bar = $('#stage-meter-bar');
    bar.style.width = `${m.toFixed(1)}%`;
    bar.style.backgroundColor = `hsl(${Math.round(m * 1.2)}, 75%, 45%)`;
    $('#stage-meter-text').textContent = `${(Math.floor(m * 10) / 10).toFixed(1)}%`;
  }

  function start(i) {
    st.custom = null;
    st.test = false;
    begin(i, L.STAGES[i]);
  }

  function startCustom(stage, opts = {}) {
    st.custom = stage;
    st.test = !!opts.test;
    begin(-1, { name: stage.name, family: stage.family, target: stage.target });
  }

  function begin(index, def) {
    const family = L.FAMILIES[def.family];
    Object.assign(st, {
      index,
      def,
      family,
      params: L.defaultParams(family),
      target: family.fn(def.target),
      cleared: false,
      hintUsed: false
    });

    if (st.custom) {
      $('#stage-label').textContent = st.test ? '🛠 テストプレイ' : '🎨 自作ステージ';
      $('#stage-name').textContent = `「${def.name}」 作：${st.custom.by}`;
      $('#stage-par').textContent =
        st.custom.rec && !st.test ? `${st.custom.rec.by} さん：${st.custom.rec.val.toFixed(1)}秒` : '';
      $('#btn-stage-back').textContent = 'やめる';
    } else {
      $('#stage-label').textContent = `ステージ ${index + 1} / ${L.STAGES.length}`;
      $('#stage-name').textContent = def.name;
      $('#stage-par').textContent = `★3：${par()}秒以内`;
      $('#btn-stage-back').textContent = '一覧へ';
    }
    $('#stage-template').textContent = `形：${family.template}`;
    $('#stage-hint').textContent = family.hint;
    $('#btn-hint').hidden = !!st.custom;
    $('#stage-coach').hidden = !(index === 0 && !store.tutorialDone);
    $('#stage-time').textContent = '0.0';

    sliders = App.createSliders($('#sliders'), family.params, (k) => st.params[k], (p, v) => {
      if (st.cleared) {
        return;
      }
      st.params[p.key] = L.snap(v, p);
      sliders.refresh();
      update();
    });

    App.showScreen('stage');
    startTimer();
    update();
  }

  function update() {
    const player = st.family.fn(st.params);
    renderer.draw({ target: st.target, player, ghost: null, showDiff: true });
    $('#stage-current').textContent = st.family.pretty(st.params);
    const m = M.computeMatch(st.target, player);
    setMeter(m);
    if (!st.cleared && m >= CLEAR_THRESHOLD) {
      onClear();
    }
  }

  function startTimer() {
    stopTimer();
    st.startTime = performance.now();
    st.timerId = setInterval(() => {
      $('#stage-time').textContent = ((performance.now() - st.startTime) / 1000).toFixed(1);
    }, 100);
  }

  function stopTimer() {
    if (st.timerId) {
      clearInterval(st.timerId);
      st.timerId = null;
    }
  }

  function onClear() {
    st.cleared = true;
    stopTimer();
    const t = (performance.now() - st.startTime) / 1000;
    $('#stage-time').textContent = t.toFixed(1);
    App.playTones(App.SFX.clear);

    if (st.custom) {
      const stage = st.custom;
      const test = st.test;
      setTimeout(() => App.showCustomResult(stage, t, { test, title: 'クリア！' }), 350);
      return;
    }

    store.tutorialDone = true;
    $('#stage-coach').hidden = true;

    const p = par();
    let stars = t <= p ? 3 : t <= p * 2.5 ? 2 : 1;
    if (st.hintUsed) {
      stars = Math.min(stars, 2);
    }
    const prev = store.stars[st.index] || 0;
    const improved = stars > prev;
    if (improved) {
      store.stars[st.index] = stars;
    }
    App.saveStore();

    const index = st.index;
    const isLast = index === L.STAGES.length - 1;
    const lines = [`タイム ${t.toFixed(1)} 秒`, `★3 の条件：${p} 秒以内${st.hintUsed ? '（ヒント使用時は最大★2）' : ''}`];
    if (improved && prev > 0) {
      lines.push('ベスト更新！');
    }
    if (isLast) {
      lines.push('全ステージクリア！ドロップや自作ステージにも挑戦してみよう。');
    }
    const actions = [];
    if (!isLast) {
      actions.push({ label: '次のステージへ', primary: true, onClick: () => start(index + 1) });
    }
    actions.push({ label: 'もう一度', onClick: () => start(index) });
    actions.push({ label: '一覧へ', primary: isLast, onClick: () => App.showScreen('menu') });

    setTimeout(() => {
      App.openModal({ title: 'クリア！', big: App.starStr(stars), lines, actions });
    }, 350);
  }

  App.attachDrag($('#stage-canvas'), renderer, {
    enabled: () => !!st.family && !st.cleared && App.current() === 'stage',
    family: () => st.family,
    get: () => st.params,
    set: (next) => {
      if (st.cleared) {
        return;
      }
      Object.assign(st.params, next);
      sliders.refresh();
      update();
    },
    allowY: true
  });

  $('#btn-hint').addEventListener('click', () => {
    if (st.cleared || st.custom) {
      return;
    }
    const p = st.family.params.find((q) => Math.abs(st.params[q.key] - st.def.target[q.key]) > 1e-9);
    if (!p) {
      return;
    }
    st.hintUsed = true;
    const v = st.def.target[p.key];
    App.toast(`ヒント：${p.key} = ${L.num(v)}（このステージの評価は最高★2になります）`);
    st.params[p.key] = v;
    sliders.refresh();
    update();
  });

  $('#btn-reset').addEventListener('click', () => {
    if (st.cleared) {
      return;
    }
    st.params = L.defaultParams(st.family);
    sliders.refresh();
    update();
  });

  $('#btn-stage-back').addEventListener('click', () => App.showScreen(st.test ? 'editor' : 'menu'));

  App.onLeave('stage', stopTimer);

  window.GMStage = { start, startCustom, isUnlocked, continueIndex };
})();