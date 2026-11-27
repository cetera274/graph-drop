// File: js/game.js
(function () {
  'use strict';

  const { parse } = window.GMParser;
  const { GraphRenderer, safeEval } = window.GMGraph;
  const L = window.GMLevels;

  const VIEW = Object.freeze({ xmin: -10, xmax: 10, ymin: -10, ymax: 10 });
  const STORAGE_KEY = 'graph-match:v1';
  const CLEAR_THRESHOLD = 99;
  const ROUNDS = L.TIERS.length;
  const SAMPLES = 600;
  const MATCH_SCALE = 2;

  const $ = (sel) => document.querySelector(sel);

  // ---------- 保存 ----------
  const store = loadStore();

  function loadStore() {
    const base = { stars: {}, challengeBest: 0, daily: {}, muted: false };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return Object.assign(base, JSON.parse(raw));
      }
    } catch (e) {
      // 保存領域が使えない環境では保存せずに遊べるようにする
    }
    return base;
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // 無視
    }
  }

  // ---------- サウンド ----------
  let audioCtx = null;
  const SFX = {
    clear: [[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.24, 0.35]],
    good: [[660, 0, 0.15], [880, 0.1, 0.25]],
    bad: [[220, 0, 0.3]]
  };

  function playTones(notes) {
    if (store.muted) {
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = audioCtx || new Ctx();
      const t0 = audioCtx.currentTime;
      notes.forEach(([freq, start, dur]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(0.2, t0 + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.05);
      });
    } catch (e) {
      // 音が出せない環境では無音で続行
    }
  }

  // ---------- 共通UI ----------
  let toastTimer = null;

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function openModal({ title, big, lines, actions }) {
    $('#modal-title').textContent = title;
    const body = $('#modal-body');
    body.innerHTML = '';
    if (big) {
      const d = document.createElement('div');
      d.className = 'modal-big';
      d.textContent = big;
      body.appendChild(d);
    }
    (lines || []).forEach((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      body.appendChild(p);
    });
    const act = $('#modal-actions');
    act.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      if (a.primary) {
        b.className = 'primary';
      }
      b.addEventListener('click', () => {
        if (!a.keepOpen) {
          closeModal();
        }
        a.onClick();
      });
      act.appendChild(b);
    });
    $('#modal').classList.remove('hidden');
    const focusTarget = act.querySelector('button.primary') || act.querySelector('button');
    if (focusTarget) {
      focusTarget.focus();
    }
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === `screen-${name}`);
    });
    if (name !== 'stage') {
      stopTimer();
    }
    if (name === 'menu') {
      renderMenu();
    }
    window.scrollTo(0, 0);
  }

  function starStr(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function todayKey() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  async function shareText(text) {
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('結果をクリップボードにコピーしました');
    } catch (e) {
      window.prompt('以下をコピーしてください', text);
    }
  }

  // ---------- 一致率 ----------
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function computeMatch(ft, fp) {
    const H = VIEW.ymax - VIEW.ymin;
    const lo = VIEW.ymin - H / 2;
    const hi = VIEW.ymax + H / 2;
    let sum = 0;
    let count = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const x = VIEW.xmin + ((VIEW.xmax - VIEW.xmin) * i) / SAMPLES;
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

  function setMeter(m) {
    const bar = $('#stage-meter-bar');
    bar.style.width = `${m.toFixed(1)}%`;
    bar.style.backgroundColor = `hsl(${Math.round(m * 1.2)}, 75%, 45%)`;
    $('#stage-meter-text').textContent = `${(Math.floor(m * 10) / 10).toFixed(1)}%`;
  }

  // ---------- メニュー ----------
  function isUnlocked(i) {
    return i < 3 || (store.stars[i - 1] || 0) > 0;
  }

  function renderMenu() {
    const grid = $('#stage-grid');
    grid.innerHTML = '';
    L.STAGES.forEach((st, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stage-btn';
      const unlocked = isUnlocked(i);
      const stars = store.stars[i] || 0;
      btn.disabled = !unlocked;
      btn.title = unlocked ? st.name : 'ひとつ前のステージをクリアすると解放されます';
      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = unlocked ? String(i + 1) : '🔒';
      const s = document.createElement('span');
      s.className = 'stars';
      s.textContent = starStr(stars);
      btn.append(n, s);
      if (stars) {
        btn.classList.add('cleared');
      }
      btn.addEventListener('click', () => startStage(i));
      grid.appendChild(btn);
    });

    const total = Object.values(store.stars).reduce((a, b) => a + b, 0);
    const daily = store.daily[todayKey()];
    $('#stats').textContent =
      `★ ${total} / ${L.STAGES.length * 3}　｜　チャレンジ最高 ${store.challengeBest.toFixed(1)} / ${ROUNDS * 100}` +
      `　｜　今日のデイリー ${daily ? `${daily.squares} ${daily.score.toFixed(1)}` : '未プレイ'}`;
  }

  // ---------- ステージモード ----------
  const stageRenderer = new GraphRenderer($('#stage-canvas'), VIEW);
  const stage = {
    index: 0,
    def: null,
    family: null,
    params: {},
    target: null,
    startTime: 0,
    timerId: null,
    cleared: false,
    hintUsed: false
  };
  let sliderSetters = {};

  function stagePar() {
    return stage.def.par || stage.family.params.length * 10;
  }

  function startStage(i) {
    const def = L.STAGES[i];
    const family = L.FAMILIES[def.family];
    Object.assign(stage, {
      index: i,
      def,
      family,
      params: L.defaultParams(family),
      target: family.fn(def.target),
      cleared: false,
      hintUsed: false
    });
    $('#stage-label').textContent = `ステージ ${i + 1} / ${L.STAGES.length}`;
    $('#stage-name').textContent = def.name;
    $('#stage-template').textContent = `形：${family.template}`;
    $('#stage-hint').textContent = family.hint;
    $('#stage-par').textContent = `★3：${stagePar()}秒以内`;
    $('#stage-time').textContent = '0.0';
    buildSliders();
    showScreen('stage');
    startTimer();
    updateStage();
  }

  function buildSliders() {
    const wrap = $('#sliders');
    wrap.innerHTML = '';
    sliderSetters = {};
    stage.family.params.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'slider-row';

      const label = document.createElement('label');
      label.textContent = p.key;
      label.htmlFor = `slider-${p.key}`;

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', `${p.key} を減らす`);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `slider-${p.key}`;
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(stage.params[p.key]);

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', `${p.key} を増やす`);

      const out = document.createElement('output');
      out.textContent = L.num(stage.params[p.key]);

      const set = (v) => {
        if (stage.cleared) {
          return;
        }
        const snapped = L.snap(v, p);
        stage.params[p.key] = snapped;
        input.value = String(snapped);
        out.textContent = L.num(snapped);
        updateStage();
      };

      input.addEventListener('input', () => set(parseFloat(input.value)));
      minus.addEventListener('click', () => set(stage.params[p.key] - p.step));
      plus.addEventListener('click', () => set(stage.params[p.key] + p.step));

      row.append(label, minus, input, plus, out);
      wrap.appendChild(row);
      sliderSetters[p.key] = set;
    });
  }

  function updateStage() {
    const player = stage.family.fn(stage.params);
    stageRenderer.draw({ target: stage.target, player, showDiff: true });
    $('#stage-current').textContent = stage.family.pretty(stage.params);
    const m = computeMatch(stage.target, player);
    setMeter(m);
    if (!stage.cleared && m >= CLEAR_THRESHOLD) {
      onStageClear();
    }
  }

  function startTimer() {
    stopTimer();
    stage.startTime = performance.now();
    stage.timerId = setInterval(() => {
      $('#stage-time').textContent = ((performance.now() - stage.startTime) / 1000).toFixed(1);
    }, 100);
  }

  function stopTimer() {
    if (stage.timerId) {
      clearInterval(stage.timerId);
      stage.timerId = null;
    }
  }

  function onStageClear() {
    stage.cleared = true;
    stopTimer();
    const t = (performance.now() - stage.startTime) / 1000;
    $('#stage-time').textContent = t.toFixed(1);
    const par = stagePar();
    let stars = t <= par ? 3 : t <= par * 2.5 ? 2 : 1;
    if (stage.hintUsed) {
      stars = Math.min(stars, 2);
    }
    const prev = store.stars[stage.index] || 0;
    const improved = stars > prev;
    if (improved) {
      store.stars[stage.index] = stars;
      saveStore();
    }
    playTones(SFX.clear);

    const index = stage.index;
    const isLast = index === L.STAGES.length - 1;
    const lines = [`タイム ${t.toFixed(1)} 秒`, `★3 の条件：${par} 秒以内${stage.hintUsed ? '（ヒント使用時は最大★2）' : ''}`];
    if (improved && prev > 0) {
      lines.push('ベスト更新！');
    }
    if (isLast) {
      lines.push('全ステージクリア！チャレンジやデイリーにも挑戦してみよう。');
    }
    const actions = [];
    if (!isLast) {
      actions.push({ label: '次のステージへ', primary: true, onClick: () => startStage(index + 1) });
    }
    actions.push({ label: 'もう一度', onClick: () => startStage(index) });
    actions.push({ label: '一覧へ', primary: isLast, onClick: () => showScreen('menu') });

    setTimeout(() => {
      openModal({ title: 'クリア！', big: starStr(stars), lines, actions });
    }, 350);
  }

  $('#btn-hint').addEventListener('click', () => {
    if (stage.cleared) {
      return;
    }
    const p = stage.family.params.find((q) => Math.abs(stage.params[q.key] - stage.def.target[q.key]) > 1e-9);
    if (!p) {
      return;
    }
    stage.hintUsed = true;
    const v = stage.def.target[p.key];
    toast(`ヒント：${p.key} = ${L.num(v)}（このステージの評価は最高★2になります）`);
    sliderSetters[p.key](v);
  });

  $('#btn-reset').addEventListener('click', () => {
    if (stage.cleared) {
      return;
    }
    stage.params = L.defaultParams(stage.family);
    buildSliders();
    updateStage();
  });

  $('#btn-stage-back').addEventListener('click', () => showScreen('menu'));

  // ---------- 数式モード（チャレンジ／デイリー） ----------
  const formulaRenderer = new GraphRenderer($('#formula-canvas'), VIEW);
  const formulaInput = $('#formula-input');
  const fm = {
    mode: 'challenge',
    dateKey: '',
    targets: [],
    round: 0,
    results: [],
    targetFn: null,
    targetText: '',
    player: null,
    submitted: false
  };

  function rate(m) {
    if (m >= 99) return { label: 'パーフェクト！', emoji: '🟩', cls: 'good' };
    if (m >= 95) return { label: 'すばらしい！', emoji: '🟩', cls: 'good' };
    if (m >= 80) return { label: 'おしい！', emoji: '🟨', cls: 'warn' };
    return { label: 'がんばろう', emoji: '🟥', cls: 'bad' };
  }

  function startFormula(mode) {
    fm.mode = mode;
    fm.dateKey = todayKey();
    const seed = mode === 'daily' ? L.hashString(`daily-${fm.dateKey}`) : (Math.random() * 4294967296) >>> 0;
    fm.targets = L.generateSet(seed);
    fm.round = 0;
    fm.results = [];
    $('#formula-mode').textContent = mode === 'daily' ? `📅 デイリー ${fm.dateKey}` : '✏️ チャレンジ';
    showScreen('formula');
    if (mode === 'daily' && store.daily[fm.dateKey]) {
      toast('今日の記録は保存済みです。今回は練習として遊べます');
    }
    loadRound();
  }

  function totalScore() {
    return fm.results.reduce((s, r) => s + r.match, 0);
  }

  function updateFormulaHud() {
    $('#formula-round').textContent = `第 ${fm.round + 1} 問 / ${ROUNDS}`;
    $('#formula-tier').textContent = L.TIERS[fm.round].name;
    $('#formula-score').textContent = `合計 ${totalScore().toFixed(1)}`;
  }

  function loadRound() {
    fm.targetText = fm.targets[fm.round];
    fm.targetFn = parse(fm.targetText).fn;
    fm.submitted = false;
    fm.player = null;
    formulaInput.value = '';
    formulaInput.disabled = false;
    $('#btn-submit').disabled = false;
    $('#formula-error').textContent = '';
    $('#formula-result').hidden = true;
    updateFormulaHud();
    drawFormula();
    formulaInput.focus();
  }

  function drawFormula() {
    formulaRenderer.draw({ target: fm.targetFn, player: fm.player, showDiff: fm.submitted });
  }

  function onFormulaInput() {
    if (fm.submitted) {
      return;
    }
    const src = formulaInput.value;
    if (!src.trim()) {
      fm.player = null;
      $('#formula-error').textContent = '';
    } else {
      try {
        fm.player = parse(src).fn;
        $('#formula-error').textContent = '';
      } catch (e) {
        fm.player = null;
        $('#formula-error').textContent = e.message;
      }
    }
    drawFormula();
  }

  function shakeInput() {
    const box = formulaInput.closest('.formula-input');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function submitFormula() {
    if (fm.submitted) {
      return;
    }
    if (!fm.player) {
      if (!$('#formula-error').textContent) {
        $('#formula-error').textContent = 'まず式を入力してください';
      }
      shakeInput();
      playTones(SFX.bad);
      return;
    }
    fm.submitted = true;
    const m = computeMatch(fm.targetFn, fm.player);
    fm.results.push({ match: m });
    formulaInput.disabled = true;
    $('#btn-submit').disabled = true;

    const r = rate(m);
    const verdict = $('#result-verdict');
    verdict.textContent = r.label;
    verdict.className = `verdict ${r.cls}`;
    $('#result-score').textContent = `一致率 ${m.toFixed(1)}%`;
    $('#result-answer').textContent = `正解の一例：y = ${fm.targetText}`;
    $('#btn-next').textContent = fm.round === ROUNDS - 1 ? '結果を見る' : '次の問題へ';
    $('#formula-result').hidden = false;

    updateFormulaHud();
    drawFormula();
    playTones(m >= 95 ? SFX.clear : m >= 80 ? SFX.good : SFX.bad);
    $('#btn-next').focus();
  }

  function nextRound() {
    if (fm.round < ROUNDS - 1) {
      fm.round++;
      loadRound();
    } else {
      finishFormula();
    }
  }

  function finishFormula() {
    const total = totalScore();
    const squares = fm.results.map((r) => rate(r.match).emoji).join('');
    const lines = [`合計スコア ${total.toFixed(1)} / ${ROUNDS * 100}`];

    if (fm.mode === 'challenge') {
      if (total > store.challengeBest) {
        store.challengeBest = total;
        saveStore();
        lines.push('自己ベスト更新！');
      } else {
        lines.push(`自己ベスト ${store.challengeBest.toFixed(1)}`);
      }
    } else if (!store.daily[fm.dateKey]) {
      store.daily[fm.dateKey] = { score: total, squares };
      saveStore();
      lines.push('今日の記録を保存しました。また明日！');
    } else {
      lines.push('今日の公式記録は最初のプレイ結果です');
    }

    const label = fm.mode === 'daily' ? `デイリー ${fm.dateKey}` : 'チャレンジ';
    const url = `${location.origin}${location.pathname}`;
    const text = `📈 グラフ・マッチ ${label}\n${squares} ${total.toFixed(1)}/${ROUNDS * 100}\n${url}`;

    openModal({
      title: fm.mode === 'daily' ? `デイリー ${fm.dateKey}` : 'チャレンジ結果',
      big: squares,
      lines,
      actions: [
        { label: '結果をシェア', keepOpen: true, onClick: () => shareText(text) },
        { label: fm.mode === 'daily' ? 'もう一度（練習）' : 'もう一度', onClick: () => startFormula(fm.mode) },
        { label: 'メニューへ', primary: true, onClick: () => showScreen('menu') }
      ]
    });
  }

  function insertAtCursor(text) {
    const start = formulaInput.selectionStart ?? formulaInput.value.length;
    const end = formulaInput.selectionEnd ?? start;
    formulaInput.value = formulaInput.value.slice(0, start) + text + formulaInput.value.slice(end);
    const pos = start + text.length;
    formulaInput.focus();
    formulaInput.setSelectionRange(pos, pos);
    onFormulaInput();
  }

  function backspaceAtCursor() {
    const start = formulaInput.selectionStart ?? formulaInput.value.length;
    const end = formulaInput.selectionEnd ?? start;
    let from = start;
    if (start === end) {
      from = Math.max(0, start - 1);
    }
    formulaInput.value = formulaInput.value.slice(0, from) + formulaInput.value.slice(end);
    formulaInput.focus();
    formulaInput.setSelectionRange(from, from);
    onFormulaInput();
  }

  formulaInput.addEventListener('input', onFormulaInput);
  formulaInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    submitFormula();
  });

  const keypad = $('#keypad');
  keypad.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) {
      e.preventDefault();
    }
  });
  keypad.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || fm.submitted) {
      return;
    }
    if (b.dataset.back) {
      backspaceAtCursor();
    } else if (b.dataset.insert) {
      insertAtCursor(b.dataset.insert);
    }
  });

  $('#btn-submit').addEventListener('click', submitFormula);
  $('#btn-next').addEventListener('click', nextRound);
  $('#btn-formula-quit').addEventListener('click', () => showScreen('menu'));

  // ---------- ヘッダー・メニュー操作 ----------
  function updateMuteIcon() {
    $('#btn-mute').textContent = store.muted ? '🔇' : '🔊';
  }

  $('#btn-mute').addEventListener('click', () => {
    store.muted = !store.muted;
    saveStore();
    updateMuteIcon();
  });

  $('#btn-home').addEventListener('click', () => {
    closeModal();
    showScreen('menu');
  });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'stage-continue') {
        let idx = L.STAGES.findIndex((_, i) => isUnlocked(i) && !store.stars[i]);
        if (idx < 0) {
          idx = 0;
        }
        startStage(idx);
      } else if (action === 'challenge') {
        startFormula('challenge');
      } else if (action === 'daily') {
        startFormula('daily');
      }
    });
  });

  updateMuteIcon();
  showScreen('menu');
})();