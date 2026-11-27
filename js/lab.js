// File: js/lab.js
(function () {
  'use strict';

  const App = window.GMApp;
  const M = window.GMMatch;
  const P = window.GMPhysics;
  const Z = window.GMPuzzles;
  const L = window.GMLevels;
  const { parse } = window.GMParser;
  const { $, store } = App;

  const PASS = 95;
  const HOVER = 4;
  const FALL_ACCEL = 30;
  const TRAIL_STEP = 0.15;
  const TRAIL_MAX = 1500;
  const TRACK_LABEL = { drop: '🧪 数式ドロップ', ball: '● ボール', gimmick: '⚙ ギミック' };
  const EVENT_SFX = {
    coin: [[988, 0, 0.08], [1319, 0.07, 0.14]],
    switch: [[440, 0, 0.06], [660, 0.05, 0.1]],
    warp: [[300, 0, 0.12], [600, 0.06, 0.16]],
    spring: [[330, 0, 0.05], [700, 0.04, 0.12]]
  };

  if (!store.labStars || typeof store.labStars !== 'object') {
    store.labStars = {};
  }
  if (!store.labBest || typeof store.labBest !== 'object') {
    store.labBest = {};
  }

  const canvas = $('#lab-canvas');
  const renderer = new window.GMGraph.GraphRenderer(canvas, M.VIEW);
  const goBtn = $('#btn-lab-go');
  const startSlider = $('#lab-start');
  const inputBox = $('#lab-inputs');
  let inputs = [];
  let lastInput = null;

  const lab = {
    kind: 'drop',
    index: -1,
    def: null,
    custom: null,
    test: false,
    targetFn: null,
    player: null,
    phase: 'idle',
    attempts: 0,
    sim: null,
    land: null,
    fall: null,
    flash: null,
    raf: 0,
    last: 0,
    timer: 0,
    startX: 0,
    trail: null,
    lastTrail: null,
    marker: null
  };

  // ボールを転がす種類か（ボールころがし・ギミック・ボールの自作ステージ）
  function isPhys() {
    return lab.kind !== 'drop';
  }

  function count(arr) {
    return Array.isArray(arr) ? arr.length : 0;
  }

  // ---------- 進捗 ----------
  function list(kind) {
    return Z.TRACKS[kind];
  }

  function isUnlocked(kind, i) {
    const arr = list(kind);
    return i === 0 || (store.labStars[arr[i - 1].id] || 0) > 0;
  }

  function continueIndex(kind) {
    const arr = list(kind);
    const i = arr.findIndex((p, j) => isUnlocked(kind, j) && !store.labStars[p.id]);
    return i < 0 ? 0 : i;
  }

  function findById(id) {
    const kinds = Object.keys(Z.TRACKS);
    for (let k = 0; k < kinds.length; k++) {
      const i = Z.TRACKS[kinds[k]].findIndex((p) => p.id === id);
      if (i >= 0) {
        return { kind: kinds[k], index: i };
      }
    }
    return null;
  }

  function formulaLength(src) {
    return String(src).replace(/\s+/g, '').replace(/^y=/i, '').length;
  }

  function totalLength() {
    return inputs.reduce((s, el) => s + (el.value.trim() ? formulaLength(el.value) : 0), 0);
  }

  function formulaText() {
    if (inputs.length === 1) {
      return `y = ${inputs[0].value.trim()}`;
    }
    return inputs.map((el, i) => `式${i + 1}：${el.value.trim() || '（穴）'}`).join('　');
  }

  function answerText(def) {
    if (Array.isArray(def.answers)) {
      return def.answers.map((a, i) => `式${i + 1}：${a || '（空欄）'}`).join('　');
    }
    return def.answer ? `y = ${def.answer}` : '';
  }

  function hasRange() {
    return isPhys() && !!lab.def && Array.isArray(lab.def.startRange);
  }

  // ---------- 式の入力欄（区間ごとに1つ） ----------
  function segLabel(i, bounds) {
    if (!bounds || !bounds.length) {
      return 'y =';
    }
    const n = L.num;
    if (i === 0) {
      return `x < ${n(bounds[0])}：y =`;
    }
    if (i === bounds.length) {
      return `x ≥ ${n(bounds[i - 1])}：y =`;
    }
    return `${n(bounds[i - 1])} ≤ x < ${n(bounds[i])}：y =`;
  }

  function buildInputs(n, bounds) {
    inputBox.innerHTML = '';
    inputs = [];
    let placeholder = '例: 0.5x^2';
    if (isPhys()) {
      placeholder = bounds ? '空欄なら穴' : '例: -x/2 - 2';
    }
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement('label');
      wrap.className = 'formula-input';
      const span = document.createElement('span');
      if (n > 1) {
        span.className = 'seg-label';
      }
      span.textContent = segLabel(i, bounds);
      const el = document.createElement('input');
      el.type = 'text';
      el.id = i === 0 ? 'lab-input' : `lab-input-${i}`;
      el.maxLength = 80;
      el.autocomplete = 'off';
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('autocorrect', 'off');
      el.spellcheck = false;
      el.placeholder = placeholder;
      el.addEventListener('input', onInput);
      el.addEventListener('focus', () => {
        lastInput = el;
      });
      el.addEventListener('keydown', onKey);
      wrap.append(span, el);
      inputBox.appendChild(wrap);
      inputs.push(el);
    }
    lastInput = inputs[0];
  }

  function inputTarget() {
    return lastInput && inputs.includes(lastInput) ? lastInput : inputs[0];
  }

  // ---------- 開始 ----------
  function stop() {
    cancelAnimationFrame(lab.raf);
    lab.raf = 0;
    clearTimeout(lab.timer);
    lab.timer = 0;
  }

  function start(kind, i) {
    lab.custom = null;
    lab.test = false;
    begin(kind, i, list(kind)[i]);
  }

  // 自作ステージ。数式ドロップ型は一発勝負、ボール型はクリアするまで挑戦できる
  function startCustom(stage, opts = {}) {
    lab.custom = stage;
    lab.test = !!opts.test;
    if (stage.type === 'ball') {
      begin('ball', -1, {
        id: '',
        name: stage.name,
        start: stage.start,
        goal: stage.goal,
        walls: stage.walls || [],
        hazards: stage.hazards || [],
        springs: stage.springs || [],
        winds: stage.winds || [],
        warps: stage.warps || [],
        switches: stage.switches || [],
        coins: stage.coins || [],
        segs: stage.segs || null,
        startRange: stage.startRange || null,
        par: stage.par || 0,
        hint: ''
      });
    } else {
      begin('drop', -1, { id: '', name: stage.name, target: stage.expr, preview: true, hint: '' });
    }
  }

  function begin(kind, index, def) {
    stop();
    Object.assign(lab, {
      kind,
      index,
      def,
      phase: 'edit',
      attempts: 0,
      sim: null,
      land: null,
      fall: null,
      flash: null,
      player: null,
      startX: def.start ? def.start.x : 0,
      trail: null,
      lastTrail: null,
      marker: null
    });
    lab.targetFn = kind === 'drop' ? parse(def.target).fn : null;

    if (lab.custom) {
      const testLabel = isPhys() ? '🛠 クリアチェック' : '🛠 テストプレイ';
      $('#lab-title').textContent = lab.test ? testLabel : '🎨 自作ステージ';
      $('#lab-name').textContent = `「${def.name}」 作：${lab.custom.by}`;
    } else {
      $('#lab-title').textContent = `${TRACK_LABEL[kind]} ${index + 1} / ${list(kind).length}`;
      $('#lab-name').textContent = def.name;
    }
    $('#lab-par').textContent = parText();
    $('#lab-goal').textContent = goalText();
    $('#lab-hint').textContent = def.hint || '';
    $('#lab-hint').hidden = !def.hint;

    const bounds = isPhys() && Array.isArray(def.segs) && def.segs.length ? def.segs : null;
    buildInputs(bounds ? bounds.length + 1 : 1, bounds);

    const range = hasRange();
    $('#lab-start-field').hidden = !range;
    canvas.classList.toggle('draggable', range);
    if (range) {
      startSlider.min = String(def.startRange[0]);
      startSlider.max = String(def.startRange[1]);
      startSlider.step = '0.5';
    }
    syncStartUi();

    buildLegend();
    $('#lab-error').textContent = '';
    hideBanner();
    setEditing(true);
    App.showScreen('lab');
    onInput();
    inputs[0].focus();
  }

  function parText() {
    if (lab.custom) {
      if (lab.custom.rec && !lab.test) {
        return `${lab.custom.rec.by} さん：${App.CUSTOM_KIND[lab.custom.type].fmt(lab.custom.rec.val)}`;
      }
      if (isPhys() && lab.def.par) {
        return `作者：${lab.def.par}文字`;
      }
      return '';
    }
    if (isPhys()) {
      const best = store.labBest[lab.def.id];
      return `★3：${lab.def.par}文字以内${best ? `　ベスト ${best}文字` : ''}`;
    }
    return '★3：一致率99%以上';
  }

  function goalText() {
    const d = lab.def;
    if (isPhys()) {
      const hold = d.hold || P.C.hold;
      let s = `式のグラフが地面になります（グラフより下が地面）。ボールが緑のゴールに${hold}秒とどまればクリア。灰色のブロックではね返り、赤いトゲにふれるとミスです。`;
      if (count(d.segs)) {
        s += 'x の区間ごとに別の式を使えます。空欄の区間は穴（地面なし）になり、式の長さは合計で数えます。';
      }
      if (count(d.coins)) {
        s += 'コインをすべて集めるまでゴールは開きません。';
      }
      if (hasRange()) {
        s += 'ボールを落とす位置は、スライダーかグラフのドラッグで選べます。';
      }
      if (lab.custom) {
        s += 'クリアするまで何度でも挑戦できます。クリアした式が短いほど上位です。';
      }
      return s;
    }
    let s = `落としたグラフが目標（青）に触れた瞬間の一致率が${PASS}%以上でクリア。上下の位置は落下で決まるので、定数項は気にしなくて大丈夫です。`;
    if (d.preview === false) {
      s += 'このステージでは、落とすまで自分のグラフが見えません。';
    }
    if (lab.custom) {
      s += '自作ステージは一発勝負です。';
    }
    return s;
  }

  function buildLegend() {
    const box = $('#lab-legend');
    box.innerHTML = '';
    const d = lab.def;
    let items;
    if (!isPhys()) {
      items = [['t', '━ 目標'], ['p', '━ あなた']];
    } else {
      items = [['p', '━ 地面'], ['b', '● ボール'], ['gl', '▢ ゴール']];
      if (count(d.springs)) {
        items.push(['sp', '⇑ バネ']);
      }
      if (count(d.winds)) {
        items.push(['w', '≋ 風']);
      }
      if (count(d.warps)) {
        items.push(['wp', '◎ ワープ']);
      }
      if (count(d.switches)) {
        items.push(['t', '◉ スイッチ']);
      }
      if (count(d.coins)) {
        items.push(['co', '🪙 コイン']);
      }
      items.push(['b', '┈ 前回の軌跡']);
    }
    items.forEach(([cls, text]) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      box.appendChild(s);
    });
  }

  // ---------- 投下位置 ----------
  function syncStartUi() {
    startSlider.value = String(lab.startX);
    $('#lab-start-out').textContent = L.num(lab.startX);
  }

  function setStartX(x) {
    if (!hasRange() || lab.phase !== 'edit') {
      return;
    }
    const [a, b] = lab.def.startRange;
    lab.startX = Math.round(Math.min(b, Math.max(a, x)) * 2) / 2;
    syncStartUi();
    draw();
    updateStatus();
  }

  function levelNow() {
    return Object.assign({}, lab.def, { start: { x: lab.startX, y: lab.def.start.y } });
  }

  function startBlocked() {
    const x = lab.startX;
    const y = lab.def.start.y;
    const v = P.view(levelNow(), null);
    return v.walls
      .filter((w) => w.active)
      .concat(v.hazards)
      .some((b) => {
        const cx = Math.min(b.x2, Math.max(b.x1, x));
        const cy = Math.min(b.y2, Math.max(b.y1, y));
        return Math.hypot(x - cx, y - cy) <= P.C.r;
      });
  }

  // ---------- 表示 ----------
  function setEditing(on) {
    inputs.forEach((el) => {
      el.disabled = !on;
    });
    startSlider.disabled = !on;
    if (isPhys()) {
      goBtn.textContent = on ? '● ボールを落とす（Enter）' : '■ 止める（Esc）';
      goBtn.disabled = false;
    } else {
      goBtn.textContent = '⤓ 落とす（Enter）';
      goBtn.disabled = !on;
    }
  }

  function banner(text, ok) {
    const el = $('#lab-banner');
    el.textContent = text;
    el.className = `banner ${ok ? 'good' : 'bad'}`;
    el.hidden = false;
  }

  function hideBanner() {
    $('#lab-banner').hidden = true;
  }

  function updateStatus() {
    $('#lab-attempts').textContent = lab.attempts ? `挑戦 ${lab.attempts} 回` : '';
    const el = $('#lab-status');
    const d = lab.def;
    if (isPhys()) {
      if (lab.sim && lab.phase !== 'edit') {
        const s = lab.sim;
        const parts = [
          `⏱ ${s.t.toFixed(1)} / ${s.maxTime} 秒`,
          `ゴール ${Math.min(s.hold, s.need).toFixed(1)} / ${s.need} 秒`
        ];
        if (count(d.coins)) {
          parts.push(`🪙 ${d.coins.length - s.coinsLeft} / ${d.coins.length}`);
        }
        if (count(d.switches)) {
          parts.push(s.on ? '🔵 ON' : '🔴 OFF');
        }
        el.textContent = parts.join('　');
        return;
      }
      const parts = [];
      if (hasRange()) {
        parts.push(`投下位置 x = ${L.num(lab.startX)}`);
      }
      if (inputs.some((i) => i.value.trim())) {
        let s = `式の長さ ${totalLength()} 文字`;
        if (!lab.custom) {
          s += `（★3：${d.par}文字以内）`;
        } else if (d.par) {
          s += `（作者：${d.par}文字）`;
        }
        parts.push(s);
      }
      el.textContent = parts.join('　');
      return;
    }
    if (d.preview === false) {
      el.textContent = '🙈 プレビューなし';
    } else if (lab.player && lab.phase === 'edit') {
      el.textContent = `オレンジのグラフは着地位置の${HOVER}マス上に表示されています`;
    } else {
      el.textContent = '';
    }
  }

  function draw() {
    if (!isPhys()) {
      let player = null;
      let showDiff = false;
      if (lab.phase === 'edit') {
        if (lab.player && lab.def.preview !== false) {
          const land = P.landCurve(lab.targetFn, lab.player);
          if (land) {
            const f = land.fn;
            player = (x) => f(x) + HOVER;
          } else {
            player = lab.player;
          }
        }
      } else if (lab.fall) {
        const f = lab.fall.base;
        const off = lab.fall.off;
        player = (x) => f(x) + off;
        showDiff = lab.phase === 'result' && !!lab.land;
      }
      renderer.draw({ target: lab.targetFn, player, ghost: null, showDiff, flash: lab.flash, fill: null, scene: null });
      return;
    }

    const def = lab.def;
    const sim = lab.phase !== 'edit' ? lab.sim : null;
    const r = P.C.r;
    const scene = P.view(levelNow(), sim);
    scene.progress = sim ? Math.min(1, sim.hold / sim.need) : 0;
    scene.ball = sim ? { x: sim.x, y: sim.y, r } : { x: lab.startX, y: def.start.y, r };
    scene.trail = lab.phase === 'edit' ? lab.lastTrail : lab.trail;
    scene.marker = lab.phase === 'anim' ? null : lab.marker;
    scene.range =
      lab.phase === 'edit' && hasRange() ? { x1: def.startRange[0], x2: def.startRange[1], y: def.start.y } : null;
    scene.preview = null;
    scene.pending = null;
    scene.cursor = null;
    renderer.draw({
      target: null,
      player: lab.player,
      ghost: null,
      showDiff: false,
      flash: lab.flash,
      fill: lab.player,
      scene
    });
  }

  // ---------- 入力 ----------
  function readInputs() {
    const fns = [];
    const errs = [];
    let any = false;
    inputs.forEach((el, i) => {
      const src = el.value;
      if (!src.trim()) {
        fns.push(null);
        return;
      }
      any = true;
      try {
        fns.push(parse(src).fn);
      } catch (e) {
        fns.push(null);
        errs.push(inputs.length > 1 ? `式${i + 1}：${e.message}` : e.message);
      }
    });
    return { fns, errs, any };
  }

  function onInput() {
    if (lab.phase !== 'edit') {
      return;
    }
    const r = readInputs();
    if (r.errs.length || !r.any) {
      lab.player = null;
    } else {
      lab.player = isPhys() ? P.piecewise(r.fns, lab.def.segs) : r.fns[0];
    }
    $('#lab-error').textContent = r.errs.join('　');
    draw();
    updateStatus();
  }

  function onKey(e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    submit();
  }

  function shakeInput() {
    inputBox.querySelectorAll('.formula-input').forEach((box) => {
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    });
  }

  function submit() {
    if (lab.phase === 'anim' && isPhys()) {
      abortBall();
      return;
    }
    if (lab.phase !== 'edit') {
      return;
    }
    if (!lab.player) {
      if (!$('#lab-error').textContent) {
        $('#lab-error').textContent = 'まず式を入力してください';
      }
      shakeInput();
      App.playTones(App.SFX.bad);
      return;
    }
    if (isPhys() && startBlocked()) {
      $('#lab-error').textContent = 'その位置には障害物があります。ボールを落とす位置を変えてください';
      shakeInput();
      App.playTones(App.SFX.bad);
      return;
    }
    lab.attempts += 1;
    lab.flash = null;
    if (isPhys()) {
      ballStart();
    } else {
      dropStart();
    }
  }

  // ---------- 数式ドロップ ----------
  function dropStart() {
    const land = P.landCurve(lab.targetFn, lab.player);
    lab.land = land;
    lab.fall = land ? { base: land.fn, off: HOVER, to: 0, v: 0 } : { base: lab.player, off: 0, to: -40, v: 0 };
    lab.phase = 'anim';
    setEditing(false);
    updateStatus();
    runLoop();
  }

  function onDropEnd() {
    lab.phase = 'result';
    const m = lab.land ? lab.land.match : 0;
    const ok = m >= PASS;
    lab.flash = ok ? 'good' : 'bad';
    draw();

    if (lab.custom) {
      App.playTones(m >= 95 ? App.SFX.clear : m >= 80 ? App.SFX.good : App.SFX.bad);
      banner(lab.land ? `一致率 ${m.toFixed(1)}%` : '目標に届きませんでした', ok);
      const stage = lab.custom;
      const test = lab.test;
      lab.timer = setTimeout(() => {
        App.showCustomResult(stage, m, { test, title: lab.land ? '着地！' : 'ざんねん' });
      }, 900);
      return;
    }

    if (ok) {
      const stars = m >= 99 ? 3 : m >= 97 ? 2 : 1;
      banner(`着地！ 一致率 ${m.toFixed(1)}%`, true);
      clearStage(stars, [`一致率 ${m.toFixed(1)}%`, '★3：99%以上　★2：97%以上']);
    } else if (lab.land) {
      failRetry(`一致率 ${m.toFixed(1)}%（${PASS}%以上でクリア）`);
    } else {
      failRetry('目標の上に乗りませんでした（目標と同じ x の範囲でグラフが定義されていません）');
    }
  }

  // ---------- ボール ----------
  function ballStart() {
    lab.sim = P.create(levelNow(), lab.player);
    lab.trail = [{ x: lab.sim.x, y: lab.sim.y }];
    lab.marker = null;
    lab.phase = 'anim';
    setEditing(false);
    if (lab.sim.status !== 'running') {
      onBallEnd();
      return;
    }
    runLoop();
  }

  function pushTrail() {
    const t = lab.trail;
    const s = lab.sim;
    const last = t[t.length - 1];
    if (t.length < TRAIL_MAX && Math.hypot(s.x - last.x, s.y - last.y) >= TRAIL_STEP) {
      t.push({ x: s.x, y: s.y });
    }
  }

  // 物理で起きた出来事（コイン、スイッチ、ワープ、バネ）の効果音
  function playEvents() {
    const ev = lab.sim.events;
    if (!ev.length) {
      return;
    }
    const seen = {};
    ev.forEach((e) => {
      if (!seen[e] && EVENT_SFX[e]) {
        seen[e] = true;
        App.playTones(EVENT_SFX[e]);
      }
    });
    lab.sim.events = [];
  }

  function onBallEnd() {
    lab.phase = 'result';
    goBtn.disabled = true;
    const sim = lab.sim;
    lab.trail.push({ x: sim.x, y: sim.y });
    lab.lastTrail = lab.trail;
    lab.marker = sim.status === 'clear' ? null : { x: sim.x, y: sim.y };
    updateStatus();

    if (sim.status !== 'clear') {
      lab.flash = 'bad';
      draw();
      failRetry(sim.reason);
      return;
    }

    lab.flash = 'good';
    draw();
    const len = totalLength();
    const text = formulaText();
    banner(`ゴール！ ${sim.t.toFixed(1)}秒`, true);

    if (lab.custom) {
      const stage = lab.custom;
      const test = lab.test;
      App.playTones(App.SFX.clear);
      if (test && window.GMEditor && typeof window.GMEditor.markVerified === 'function') {
        window.GMEditor.markVerified(stage, len);
      }
      const lines = [`式：${text}`, `タイム ${sim.t.toFixed(1)} 秒`];
      if (test) {
        lines.push('クリアチェック完了！このステージを共有できます。');
      }
      lab.timer = setTimeout(() => {
        App.showCustomResult(stage, len, { test, title: 'ゴール！', big: '🏁', lines });
      }, 600);
      return;
    }

    const par = lab.def.par;
    const stars = len <= par ? 3 : len <= par + 5 ? 2 : 1;
    const prevBest = store.labBest[lab.def.id];
    const newBest = !(prevBest <= len);
    if (newBest) {
      store.labBest[lab.def.id] = len;
    }
    clearStage(stars, [
      `式：${text}（${len}文字）`,
      `★3：${par}文字以内　★2：${par + 5}文字以内`,
      newBest && prevBest ? `最短記録を更新！（${prevBest} → ${len}文字）` : `最短記録 ${store.labBest[lab.def.id]}文字`,
      `タイム ${sim.t.toFixed(1)} 秒`
    ]);
  }

  function abortBall() {
    stop();
    lab.lastTrail = lab.trail;
    lab.marker = null;
    backToEdit();
  }

  // ---------- 共通の進行 ----------
  function runLoop() {
    lab.last = performance.now();
    draw();
    lab.raf = requestAnimationFrame(loop);
  }

  function loop(ts) {
    lab.raf = 0;
    if (lab.phase !== 'anim') {
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (ts - lab.last) / 1000));
    lab.last = ts;

    if (!isPhys()) {
      const f = lab.fall;
      f.v += FALL_ACCEL * dt;
      f.off -= f.v * dt;
      if (f.off <= f.to) {
        f.off = f.to;
        draw();
        onDropEnd();
        return;
      }
    } else {
      P.step(lab.sim, dt);
      playEvents();
      pushTrail();
      updateStatus();
      if (lab.sim.status !== 'running') {
        draw();
        onBallEnd();
        return;
      }
    }
    draw();
    lab.raf = requestAnimationFrame(loop);
  }

  function failRetry(reason) {
    banner(`ミス… ${reason}`, false);
    App.playTones(App.SFX.bad);
    lab.timer = setTimeout(backToEdit, 1600);
  }

  function backToEdit() {
    lab.timer = 0;
    lab.phase = 'edit';
    lab.sim = null;
    lab.fall = null;
    lab.land = null;
    lab.flash = null;
    hideBanner();
    setEditing(true);
    draw();
    updateStatus();
    inputTarget().focus();
  }

  function clearStage(stars, lines) {
    App.playTones(App.SFX.clear);
    const { def, kind, index } = lab;
    const prev = store.labStars[def.id] || 0;
    if (stars > prev) {
      store.labStars[def.id] = stars;
    }
    App.saveStore();

    const isLast = index === list(kind).length - 1;
    const all = lines.concat([`挑戦回数 ${lab.attempts} 回`]);
    if (stars > prev && prev > 0) {
      all.push('★ベスト更新！');
    }
    const ans = answerText(def);
    if (ans) {
      all.push(`解答の一例：${ans}${def.answerX !== undefined ? `（投下位置 x = ${L.num(def.answerX)}）` : ''}`);
    }
    const actions = [];
    if (!isLast) {
      actions.push({ label: '次へ', primary: true, onClick: () => start(kind, index + 1) });
    }
    actions.push({ label: 'もう一度', onClick: () => start(kind, index) });
    actions.push({ label: 'メニューへ', primary: isLast, onClick: () => App.showScreen('menu') });

    lab.timer = setTimeout(() => {
      App.openModal({ title: 'クリア！', big: App.starStr(stars), lines: all, actions });
    }, 600);
  }

  // ---------- キーパッド・キー操作 ----------
  function insertAtCursor(text) {
    const input = inputTarget();
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + text + input.value.slice(e);
    const pos = s + text.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    onInput();
  }

  function backspaceAtCursor() {
    const input = inputTarget();
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    const from = s === e ? Math.max(0, s - 1) : s;
    input.value = input.value.slice(0, from) + input.value.slice(e);
    input.focus();
    input.setSelectionRange(from, from);
    onInput();
  }

  document.addEventListener('keydown', (e) => {
    if (App.current() === 'lab' && e.key === 'Escape' && lab.phase === 'anim' && isPhys()) {
      abortBall();
    }
  });

  const keypad = $('#lab-keypad');
  keypad.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) {
      e.preventDefault();
    }
  });
  keypad.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || lab.phase !== 'edit' || !inputs.length) {
      return;
    }
    if (b.dataset.back) {
      backspaceAtCursor();
    } else if (b.dataset.insert) {
      insertAtCursor(b.dataset.insert);
    }
  });

  startSlider.addEventListener('input', () => setStartX(parseFloat(startSlider.value)));

  // グラフ上のドラッグで投下位置を動かす
  let dragId = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !hasRange() || lab.phase !== 'edit') {
      return;
    }
    dragId = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // 古いブラウザ向け
    }
    canvas.classList.add('dragging');
    setStartX(renderer.toWorld(e.clientX, e.clientY).x);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragId === null || e.pointerId !== dragId) {
      return;
    }
    setStartX(renderer.toWorld(e.clientX, e.clientY).x);
  });
  const endDrag = () => {
    dragId = null;
    canvas.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  goBtn.addEventListener('click', submit);
 // File: js/lab.js（「やめる」ボタン）
  $('#btn-lab-quit').addEventListener('click', () => {
    if (lab.test) {
      App.showScreen('editor');
      return;
    }
    const W = window.GMWorld;
    const back = W ? W.backTarget() : null;
    App.showScreen(back || 'menu');
  });

  App.onLeave('lab', () => {
    stop();
    lab.phase = 'idle';
  });

  window.GMLab = { start, startCustom, isUnlocked, continueIndex, findById, tracks: Z.TRACKS };
})();