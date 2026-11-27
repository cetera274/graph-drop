// File: js/editor.js
(function () {
  'use strict';

  const App = window.GMApp;
  const L = window.GMLevels;
  const M = window.GMMatch;
  const S = window.GMShare;
  const Z = window.GMPuzzles;
  const P = window.GMPhysics;
  const { parse } = window.GMParser;
  const { $, store } = App;

  const LIMITS = S.LIMITS;
  const RANGE_HALF = 4;
  const POINT_TOOLS = ['start', 'switch', 'coin', 'warp'];
  const TOOL_DESC = {
    start: 'クリック／ドラッグでボールのスタート地点を置きます。',
    goal: 'ドラッグでゴールの範囲を描きます（クリックで1マス）。ゴールは1つです。',
    wall: 'ドラッグでブロックを描きます（クリックで1マス）。ボールがはね返ります。動きも選べます。',
    hazard: 'ドラッグでトゲを描きます（クリックで1マス）。ふれるとミスです。動きも選べます。',
    swblock: 'ON/OFF ブロック。赤は OFF のとき、青は ON のときだけ出ます（ブロックの個数に含まれます）。',
    switch: 'クリックでスイッチを置きます。ボールがふれるたびに ON/OFF が切りかわります。',
    spring: 'ドラッグでバネを描きます。ふれたボールを選んだ向きに打ち上げます。',
    wind: 'ドラッグで風のエリアを描きます。中にいる間、ボールを押し続けます。',
    warp: '1回目のクリックで入口、2回目で出口を置きます。どちらに入っても反対側から出てきます。',
    coin: 'クリックでコインを置きます。すべて集めるまでゴールは開きません。',
    erase: 'クリックした物を消します（スタートとゴールは消せません）。'
  };
  const MOVE_ITEMS = [
    ['none', '動かない'],
    ['h4', '左右に4マス往復'],
    ['v4', '上下に4マス往復'],
    ['h8', '左右に8マス往復'],
    ['v8', '上下に8マス往復']
  ];
  const OPT_DEFS = {
    wall: { label: '動き', items: MOVE_ITEMS },
    hazard: { label: '動き', items: MOVE_ITEMS },
    swblock: { label: '種類', items: [['off', '赤：OFF のときに出る'], ['on', '青：ON のときに出る']] },
    spring: { label: '向き', items: [['u', '上'], ['r', '右上'], ['l', '左上']] },
    wind: { label: '向き', items: [['r', '右向き'], ['l', '左向き'], ['u', '上向き（重力より強い）'], ['d', '下向き']] }
  };
  const MOVES = {
    h4: { dx: 4, dy: 0, T: 4 },
    v4: { dx: 0, dy: 4, T: 4 },
    h8: { dx: 8, dy: 0, T: 6 },
    v8: { dx: 0, dy: 8, T: 6 }
  };
  const WINDS = { r: [10, 0], l: [-10, 0], u: [0, 20], d: [0, -10] };
  const SEG_PRESETS = { 1: null, 2: [0], 3: [-3, 3] };
  const LAYOUT_KEYS = ['start', 'goal', 'walls', 'hazards', 'springs', 'winds', 'warps', 'switches', 'coins', 'segs', 'startRange'];

  const canvas = $('#editor-canvas');
  canvas.tabIndex = 0;
  const renderer = new window.GMGraph.GraphRenderer(canvas, M.VIEW);
  const ed = {
    type: 'slider',
    familyKey: 'quadratic',
    params: null,
    expr: '',
    exprFn: null,
    ball: defaultBall(),
    tool: 'goal',
    opts: { wall: 'none', hazard: 'none', swblock: 'off', spring: 'u', wind: 'r' },
    preview: null,
    pending: null,
    anchor: null,
    cursor: { x: 0, y: 0 },
    focus: false,
    verified: null
  };
  let sliders = null;

  function defaultBall() {
    return {
      start: { x: -6, y: 8 },
      goal: { x1: 3, y1: -8, x2: 7, y2: -4 },
      walls: [],
      hazards: [],
      springs: [],
      winds: [],
      warps: [],
      switches: [],
      coins: [],
      rangeOn: false,
      segs: null
    };
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const rng = () => L.makeRandom((Math.random() * 4294967296) >>> 0);
  const isExpr = () => S.isExprType(ed.type);
  const isBall = () => ed.type === 'ball';

  function family() {
    return L.FAMILIES[ed.familyKey];
  }

  function allowedFamilies() {
    return Object.keys(L.FAMILIES).filter((k) => ed.type !== 'drop' || L.FAMILIES[k].drop);
  }

  function randomize() {
    ed.params = L.randomTarget(ed.familyKey, rng(), { forDrop: ed.type === 'drop' });
  }

  // ---------- ボール配置 ----------
  function ballData() {
    const b = ed.ball;
    const out = {
      start: clone(b.start),
      goal: clone(b.goal),
      walls: clone(b.walls),
      hazards: clone(b.hazards),
      springs: clone(b.springs),
      winds: clone(b.winds),
      warps: clone(b.warps),
      switches: clone(b.switches),
      coins: clone(b.coins)
    };
    if (b.segs) {
      out.segs = b.segs.slice();
    }
    if (b.rangeOn) {
      out.startRange = [Math.max(-9.5, b.start.x - RANGE_HALF), Math.min(9.5, b.start.x + RANGE_HALF)];
    }
    return out;
  }

  // 配置を比べるためのキー。共有形式に変換して比べるので、表記の違いに左右されない
  function layoutKey(s) {
    try {
      const o = { type: 'ball', name: 'k', by: 'k' };
      LAYOUT_KEYS.forEach((k) => {
        if (s[k] !== undefined && s[k] !== null) {
          o[k] = s[k];
        }
      });
      return S.encode(o);
    } catch (e) {
      return '';
    }
  }

  function currentVerified() {
    const key = layoutKey(ballData());
    return key && ed.verified && ed.verified.key === key ? ed.verified.len : 0;
  }

  // テストプレイでクリアしたときに lab.js から呼ばれる
  function markVerified(stage, len) {
    if (!stage || stage.type !== 'ball') {
      return;
    }
    const key = layoutKey(stage);
    if (!key || key !== layoutKey(ballData())) {
      return;
    }
    const prev = ed.verified && ed.verified.key === key ? ed.verified.len : Infinity;
    ed.verified = { key, len: Math.min(prev, len) };
  }

  function loadBall(src) {
    ed.ball = {
      start: clone(src.start),
      goal: clone(src.goal),
      walls: clone(src.walls || []),
      hazards: clone(src.hazards || []),
      springs: clone(src.springs || []),
      winds: clone(src.winds || []),
      warps: clone(src.warps || []),
      switches: clone(src.switches || []),
      coins: clone(src.coins || []),
      rangeOn: !!src.startRange,
      segs: Array.isArray(src.segs) && src.segs.length ? src.segs.slice() : null
    };
    ed.anchor = null;
    ed.preview = null;
    ed.pending = null;
  }

  // ---------- 画面 ----------
  function open(stage) {
    if (stage) {
      ed.type = stage.type;
      if (S.isExprType(stage.type)) {
        ed.expr = stage.expr;
      } else if (stage.type === 'ball') {
        loadBall(stage);
        ed.verified = stage.par ? { key: layoutKey(stage), len: stage.par } : null;
      } else {
        ed.familyKey = stage.family;
        ed.params = Object.assign({}, stage.target);
      }
      $('#editor-name').value = stage.name;
    }
    if (!ed.params) {
      randomize();
    }
    App.showScreen('editor');
  }

  function sync() {
    document.querySelectorAll('#editor-type button').forEach((b) => {
      const on = b.dataset.type === ed.type;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const exprType = isExpr();
    const ball = isBall();
    $('#editor-family-field').hidden = exprType || ball;
    $('#editor-sliders').hidden = exprType || ball;
    $('#editor-formula-field').hidden = !exprType;
    $('#editor-ball-field').hidden = !ball;
    $('#editor-legend').textContent = ball ? '● スタート　▢ ゴール　■ ブロック　▲ トゲ　ほか仕掛け' : '━ 目標（ドラッグで移動）';
    $('#editor-type-desc').textContent = App.CUSTOM_KIND[ed.type].goal;
    $('#editor-error').textContent = '';

    if (exprType) {
      $('#editor-formula').value = ed.expr;
      parseExpr();
    } else if (ball) {
      syncTools();
      $('#editor-range').checked = ed.ball.rangeOn;
      $('#editor-segs').value = String((ed.ball.segs || []).length + 1);
    } else {
      const allowed = allowedFamilies();
      if (!allowed.includes(ed.familyKey)) {
        ed.familyKey = allowed[0];
        randomize();
      }
      const sel = $('#editor-family');
      sel.innerHTML = '';
      allowed.forEach((k) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = `${L.FAMILIES[k].label}　${L.FAMILIES[k].template}`;
        sel.appendChild(o);
      });
      sel.value = ed.familyKey;
      buildSliders();
    }
    $('#editor-author').value = store.name;
    draw();
    updateBallInfo();
    renderList();
  }

  function syncTools() {
    document.querySelectorAll('#editor-tool button').forEach((b) => {
      const on = b.dataset.tool === ed.tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#editor-tool-desc').textContent = TOOL_DESC[ed.tool];
    const def = OPT_DEFS[ed.tool];
    $('#editor-opt-field').hidden = !def;
    if (def) {
      $('#editor-opt-label').textContent = def.label;
      const sel = $('#editor-opt');
      sel.innerHTML = '';
      def.items.forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        sel.appendChild(o);
      });
      sel.value = ed.opts[ed.tool];
    }
  }

  function updateBallInfo() {
    if (!isBall()) {
      return;
    }
    const b = ed.ball;
    const parts = [
      `ブロック ${b.walls.length}/${LIMITS.walls}`,
      `トゲ ${b.hazards.length}/${LIMITS.hazards}`,
      `バネ ${b.springs.length}/${LIMITS.springs}`,
      `風 ${b.winds.length}/${LIMITS.winds}`,
      `ワープ ${b.warps.length}/${LIMITS.warps}`,
      `スイッチ ${b.switches.length}/${LIMITS.switches}`,
      `コイン ${b.coins.length}/${LIMITS.coins}`
    ];
    const v = currentVerified();
    const el = $('#editor-ball-info');
    el.textContent =
      `${parts.join('・')}　` +
      (v ? `✅ クリアチェック済み（作者の式 ${v} 文字）` : '⚠ 共有するには、テストプレイで自分でクリアしてください（クリアチェック）');
    el.classList.toggle('verified', !!v);
  }

  function buildSliders() {
    sliders = App.createSliders($('#editor-sliders'), family().params, (k) => ed.params[k], (p, v) => {
      ed.params[p.key] = L.snap(v, p);
      sliders.refresh();
      draw();
    });
  }

  function parseExpr() {
    const src = $('#editor-formula').value;
    ed.expr = src;
    ed.exprFn = null;
    if (!src.trim()) {
      $('#editor-error').textContent = '';
      return;
    }
    try {
      ed.exprFn = parse(src).fn;
      $('#editor-error').textContent = '';
    } catch (e) {
      $('#editor-error').textContent = e.message;
    }
  }

  function targetFn() {
    return isExpr() ? ed.exprFn : family().fn(ed.params);
  }

  function draw() {
    if (isBall()) {
      const data = ballData();
      const scene = P.view(data, null);
      scene.progress = 0;
      scene.ball = { x: data.start.x, y: data.start.y, r: P.C.r };
      scene.trail = null;
      scene.marker = null;
      scene.range = data.startRange ? { x1: data.startRange[0], x2: data.startRange[1], y: data.start.y } : null;
      scene.preview = ed.preview;
      scene.pending = ed.pending;
      scene.cursor = ed.focus ? ed.cursor : null;
      renderer.draw({ target: null, player: null, ghost: null, showDiff: false, flash: null, fill: null, scene });
      return;
    }
    renderer.draw({ target: targetFn(), player: null, ghost: null, showDiff: false, flash: null, fill: null, scene: null });
  }

  function changed() {
    $('#editor-error').textContent = '';
    draw();
    updateBallInfo();
  }

  // ---------- ステージの組み立て ----------
  function buildStage() {
    const base = {
      type: ed.type,
      name: $('#editor-name').value.trim() || 'ななしのステージ',
      by: App.playerName()
    };
    if (isBall()) {
      Object.assign(base, ballData());
      const v = currentVerified();
      if (v) {
        base.par = v;
      }
      return S.validate(base);
    }
    if (isExpr()) {
      if (!ed.exprFn) {
        throw new Error('目標にする式を正しく入力してください');
      }
      base.expr = ed.expr.trim();
    } else {
      const fam = family();
      if (L.startMatch(fam, ed.params, ed.type === 'drop') >= 99) {
        throw new Error(
          ed.type === 'drop'
            ? `スタート時の形と同じです。${fam.vkey} 以外のパラメータを変えてください`
            : 'スタート時と同じグラフです。パラメータを変えてください'
        );
      }
      base.family = ed.familyKey;
      base.target = Object.assign({}, ed.params);
    }
    if (M.visibleRatio(targetFn()) < 0.05) {
      throw new Error('グラフが表示範囲にほとんど入っていません');
    }
    return S.validate(base);
  }

  function withStage(action) {
    try {
      const stage = buildStage();
      $('#editor-error').textContent = '';
      action(stage);
    } catch (e) {
      $('#editor-error').textContent = e.message;
      App.playTones(App.SFX.bad);
    }
  }

  function shareStage(stage) {
    let extra = '';
    if (stage.type === 'ball' && stage.par) {
      extra = `\n私の式は ${stage.par} 文字。もっと短い式でクリアできる？`;
    }
    App.shareText(
      `📈 グラフ作りmathで自作ステージ「${stage.name}」を作ったよ！挑戦してみて${extra}\n${App.stageUrl(stage)}`
    );
  }

  function formatDate(t) {
    const d = new Date(t);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderList() {
    const box = $('#my-stages');
    box.innerHTML = '';
    if (!store.myStages.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'まだありません。作ったステージを保存するか共有すると、ここに表示されます。';
      box.appendChild(p);
      return;
    }
    store.myStages.forEach((item, i) => {
      let stage;
      try {
        stage = S.validate(item.stage);
      } catch (e) {
        return;
      }
      const kind = App.CUSTOM_KIND[stage.type];
      const row = document.createElement('div');
      row.className = 'my-stage';

      const info = document.createElement('div');
      info.className = 'info';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = `${kind.icon} ${stage.name}`;
      const meta = document.createElement('span');
      meta.className = 'meta';
      const check = stage.type === 'ball' ? (stage.par ? `・✅ ${stage.par}文字` : '・未チェック') : '';
      meta.textContent = `${kind.label}・作：${stage.by}・${formatDate(item.at)}${check}`;
      info.append(title, meta);

      const btns = document.createElement('div');
      btns.className = 'btn-row';
      const mk = (label, aria, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn);
        btns.appendChild(b);
      };
      mk('▶', `${stage.name} を遊ぶ`, () => App.playCustom(stage));
      if (stage.type !== 'ball' || stage.par) {
        mk('🔗', `${stage.name} を共有`, () => shareStage(stage));
      }
      mk('✏️', `${stage.name} を編集`, () => open(stage));
      mk('🗑', `${stage.name} を削除`, () => {
        if (window.confirm(`「${stage.name}」を削除しますか？`)) {
          store.myStages.splice(i, 1);
          App.saveStore();
          renderList();
        }
      });

      row.append(info, btns);
      box.appendChild(row);
    });
  }

  // ---------- 配置の操作（マウス・キーボード共通） ----------
  const snapHalf = (v) => Math.round(v * 2) / 2;
  const lim = (v, m) => Math.min(m, Math.max(-m, v));

  function snapPoint(p) {
    return { x: lim(snapHalf(p.x), 10), y: lim(snapHalf(p.y), 10) };
  }

  function setStart(p) {
    ed.ball.start = { x: lim(snapHalf(p.x), 9.5), y: lim(snapHalf(p.y), 9.5) };
  }

  function rectFrom(a, b) {
    let x1;
    let x2;
    let y1;
    let y2;
    if (Math.abs(a.x - b.x) < 0.3 && Math.abs(a.y - b.y) < 0.3) {
      x1 = Math.floor(a.x);
      y1 = Math.floor(a.y);
      x2 = x1 + 1;
      y2 = y1 + 1;
    } else {
      x1 = snapHalf(Math.min(a.x, b.x));
      x2 = snapHalf(Math.max(a.x, b.x));
      y1 = snapHalf(Math.min(a.y, b.y));
      y2 = snapHalf(Math.max(a.y, b.y));
      if (x2 - x1 < 0.5) {
        x2 = x1 + 0.5;
      }
      if (y2 - y1 < 0.5) {
        y2 = y1 + 0.5;
      }
    }
    const fit = (lo, hi) => {
      if (lo < -10) {
        hi += -10 - lo;
        lo = -10;
      }
      if (hi > 10) {
        lo -= hi - 10;
        hi = 10;
      }
      return [lo, hi];
    };
    [x1, x2] = fit(x1, x2);
    [y1, y2] = fit(y1, y2);
    return { x1, y1, x2, y2 };
  }

  function isFull(arr, max, label) {
    if (arr.length >= max) {
      App.toast(`${label}は${max}個までです`);
      return true;
    }
    return false;
  }

  function commitRect(kind, rect) {
    const b = ed.ball;
    if (kind === 'goal') {
      b.goal = rect;
      return;
    }
    if (kind === 'wall' || kind === 'swblock') {
      if (isFull(b.walls, LIMITS.walls, 'ブロック（ON/OFF を含む）')) {
        return;
      }
      const w = Object.assign({}, rect);
      if (kind === 'swblock') {
        w.sw = ed.opts.swblock;
      } else if (MOVES[ed.opts.wall]) {
        w.move = Object.assign({}, MOVES[ed.opts.wall]);
      }
      b.walls.push(w);
    } else if (kind === 'hazard') {
      if (isFull(b.hazards, LIMITS.hazards, 'トゲ')) {
        return;
      }
      const h = Object.assign({}, rect);
      if (MOVES[ed.opts.hazard]) {
        h.move = Object.assign({}, MOVES[ed.opts.hazard]);
      }
      b.hazards.push(h);
    } else if (kind === 'spring') {
      if (isFull(b.springs, LIMITS.springs, 'バネ')) {
        return;
      }
      b.springs.push(Object.assign({}, rect, { d: ed.opts.spring }));
    } else if (kind === 'wind') {
      if (isFull(b.winds, LIMITS.winds, '風')) {
        return;
      }
      const [fx, fy] = WINDS[ed.opts.wind];
      b.winds.push(Object.assign({}, rect, { fx, fy }));
    }
  }

  function placePoint(tool, p) {
    const b = ed.ball;
    if (tool === 'start') {
      setStart(p);
      return;
    }
    const q = snapPoint(p);
    if (tool === 'switch') {
      if (!isFull(b.switches, LIMITS.switches, 'スイッチ')) {
        b.switches.push(q);
      }
    } else if (tool === 'coin') {
      if (!isFull(b.coins, LIMITS.coins, 'コイン')) {
        b.coins.push(q);
      }
    } else if (tool === 'warp') {
      if (!ed.pending) {
        if (isFull(b.warps, LIMITS.warps, 'ワープ')) {
          return;
        }
        ed.pending = q;
        App.toast('出口の位置を選んでください');
        return;
      }
      if (ed.pending.x === q.x && ed.pending.y === q.y) {
        App.toast('入口と出口は別の場所にしてください');
        return;
      }
      b.warps.push({ ax: ed.pending.x, ay: ed.pending.y, bx: q.x, by: q.y });
      ed.pending = null;
    }
  }

  function eraseAt(p) {
    const b = ed.ball;
    const near = (x, y, rr) => Math.hypot(p.x - x, p.y - y) <= rr;
    const inRect = (r) => p.x >= r.x1 - 0.2 && p.x <= r.x2 + 0.2 && p.y >= r.y1 - 0.2 && p.y <= r.y2 + 0.2;
    const tries = [
      [b.coins, (c) => near(c.x, c.y, 0.7)],
      [b.switches, (s) => near(s.x, s.y, 0.8)],
      [b.warps, (w) => near(w.ax, w.ay, 0.9) || near(w.bx, w.by, 0.9)],
      [b.springs, inRect],
      [b.hazards, inRect],
      [b.walls, inRect],
      [b.winds, inRect]
    ];
    for (let k = 0; k < tries.length; k++) {
      const [arr, hit] = tries[k];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (hit(arr[i])) {
          arr.splice(i, 1);
          changed();
          return;
        }
      }
    }
    App.toast('そこには消せる物がありません');
  }

  function resetPending() {
    ed.anchor = null;
    ed.preview = null;
    ed.pending = null;
  }

  // ---------- マウス・タッチ ----------
  let bdrag = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!isBall() || e.button !== 0 || App.current() !== 'editor') {
      return;
    }
    e.preventDefault();
    try {
      canvas.focus({ preventScroll: true });
    } catch (err) {
      canvas.focus();
    }
    const p = renderer.toWorld(e.clientX, e.clientY);
    ed.cursor = snapPoint(p);
    ed.anchor = null;
    if (ed.tool === 'erase') {
      eraseAt(p);
      return;
    }
    if (ed.tool === 'switch' || ed.tool === 'coin' || ed.tool === 'warp') {
      placePoint(ed.tool, p);
      changed();
      return;
    }
    bdrag = { id: e.pointerId, from: p };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // 古いブラウザ向け
    }
    canvas.classList.add('dragging');
    if (ed.tool === 'start') {
      setStart(p);
    } else {
      ed.preview = { rect: rectFrom(p, p), kind: ed.tool };
    }
    changed();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!bdrag || e.pointerId !== bdrag.id) {
      return;
    }
    const p = renderer.toWorld(e.clientX, e.clientY);
    ed.cursor = snapPoint(p);
    if (ed.tool === 'start') {
      setStart(p);
    } else {
      ed.preview = { rect: rectFrom(bdrag.from, p), kind: ed.tool };
    }
    changed();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!bdrag || e.pointerId !== bdrag.id) {
      return;
    }
    const preview = ed.preview;
    bdrag = null;
    ed.preview = null;
    canvas.classList.remove('dragging');
    if (preview) {
      commitRect(preview.kind, preview.rect);
    }
    changed();
  });

  canvas.addEventListener('pointercancel', () => {
    if (!bdrag) {
      return;
    }
    bdrag = null;
    ed.preview = null;
    canvas.classList.remove('dragging');
    draw();
  });

  // ---------- キーボード ----------
  function moveCursor(dx, dy) {
    ed.cursor = { x: lim(ed.cursor.x + dx, 10), y: lim(ed.cursor.y + dy, 10) };
    if (ed.anchor) {
      ed.preview = { rect: rectFrom(ed.anchor, ed.cursor), kind: ed.tool };
    }
    draw();
  }

  function keyPlace() {
    const t = ed.tool;
    if (t === 'erase') {
      eraseAt(ed.cursor);
      return;
    }
    if (POINT_TOOLS.includes(t)) {
      placePoint(t, ed.cursor);
      changed();
      return;
    }
    if (!ed.anchor) {
      ed.anchor = { x: ed.cursor.x, y: ed.cursor.y };
      ed.preview = { rect: rectFrom(ed.anchor, ed.cursor), kind: t };
      App.toast('矢印キーで反対側の角まで動かして、もう一度 Enter');
      changed();
      return;
    }
    commitRect(t, rectFrom(ed.anchor, ed.cursor));
    ed.anchor = null;
    ed.preview = null;
    changed();
  }

  canvas.addEventListener('focus', () => {
    ed.focus = true;
    draw();
  });

  canvas.addEventListener('blur', () => {
    ed.focus = false;
    ed.anchor = null;
    if (!bdrag) {
      ed.preview = null;
    }
    draw();
  });

  canvas.addEventListener('keydown', (e) => {
    if (!isBall()) {
      return;
    }
    const step = e.shiftKey ? 2 : 0.5;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        moveCursor(-step, 0);
        break;
      case 'ArrowRight':
        moveCursor(step, 0);
        break;
      case 'ArrowUp':
        moveCursor(0, step);
        break;
      case 'ArrowDown':
        moveCursor(0, -step);
        break;
      case 'Enter':
      case ' ':
        keyPlace();
        break;
      case 'Delete':
      case 'Backspace':
        eraseAt(ed.cursor);
        break;
      case 'Escape':
        resetPending();
        changed();
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
    }
  });

  // ---------- イベント ----------
  document.querySelectorAll('#editor-type button').forEach((b) => {
    b.addEventListener('click', () => {
      ed.type = b.dataset.type;
      resetPending();
      sync();
    });
  });

  document.querySelectorAll('#editor-tool button').forEach((b) => {
    b.addEventListener('click', () => {
      ed.tool = b.dataset.tool;
      resetPending();
      syncTools();
      draw();
    });
  });

  $('#editor-opt').addEventListener('change', (e) => {
    if (OPT_DEFS[ed.tool]) {
      ed.opts[ed.tool] = e.target.value;
    }
  });

  $('#editor-segs').addEventListener('change', (e) => {
    const preset = SEG_PRESETS[e.target.value];
    ed.ball.segs = preset ? preset.slice() : null;
    changed();
  });

  $('#editor-range').addEventListener('change', (e) => {
    ed.ball.rangeOn = e.target.checked;
    changed();
  });

  $('#btn-editor-clear-ball').addEventListener('click', () => {
    const b = ed.ball;
    const total =
      b.walls.length + b.hazards.length + b.springs.length + b.winds.length + b.warps.length + b.switches.length + b.coins.length;
    if (!total) {
      return;
    }
    if (window.confirm('スタートとゴール以外の配置をすべて消しますか？')) {
      Object.assign(b, { walls: [], hazards: [], springs: [], winds: [], warps: [], switches: [], coins: [] });
      resetPending();
      changed();
    }
  });

  $('#editor-family').addEventListener('change', (e) => {
    ed.familyKey = e.target.value;
    randomize();
    buildSliders();
    $('#editor-error').textContent = '';
    draw();
  });

  $('#editor-formula').addEventListener('input', () => {
    parseExpr();
    draw();
  });

  $('#editor-author').addEventListener('input', (e) => App.setPlayerName(e.target.value));

  App.attachDrag(canvas, renderer, {
    enabled: () => !isExpr() && !isBall() && App.current() === 'editor',
    family: () => family(),
    get: () => ed.params,
    set: (next) => {
      ed.params = next;
      sliders.refresh();
      draw();
    },
    allowY: true
  });

  $('#btn-editor-random').addEventListener('click', () => {
    if (isBall()) {
      // 組み込みパズルの配置をもとにする（解けることが確認されている配置）
      loadBall(rng().pick(Z.BALL.concat(Z.GIMMICK)));
      $('#editor-range').checked = ed.ball.rangeOn;
      $('#editor-segs').value = String((ed.ball.segs || []).length + 1);
      changed();
      return;
    }
    if (isExpr()) {
      const r = rng();
      const set = L.generateSet((r.next() * 4294967296) >>> 0);
      ed.expr = r.pick(set);
      $('#editor-formula').value = ed.expr;
      parseExpr();
    } else {
      randomize();
      sliders.refresh();
    }
    $('#editor-error').textContent = '';
    draw();
  });

  $('#btn-editor-test').addEventListener('click', () => withStage((s) => App.playCustom(s, { test: true })));

  $('#btn-editor-save').addEventListener('click', () =>
    withStage((s) => {
      App.saveMyStage(s);
      renderList();
      App.toast(s.type === 'ball' && !s.par ? '保存しました（共有にはクリアチェックが必要です）' : 'マイステージに保存しました');
    })
  );

  $('#btn-editor-share').addEventListener('click', () =>
    withStage((s) => {
      if (s.type === 'ball' && !s.par) {
        throw new Error('共有する前に、テストプレイで自分でクリアしてください（クリアチェック）');
      }
      App.saveMyStage(s);
      renderList();
      shareStage(s);
    })
  );

  $('#btn-editor-back').addEventListener('click', () => App.showScreen('menu'));

  App.onEnter('editor', sync);

  window.GMEditor = { open, markVerified };
})();