// File: js/app.js
(function () {
  'use strict';

  const L = window.GMLevels;
  const STORAGE_KEY = 'graph-match:v1';
  const DAILY_KEEP_DAYS = 400;
  const MAX_MY_STAGES = 50;
  const MAX_NAME = 16;

  const $ = (sel) => document.querySelector(sel);

  // ---------- 保存 ----------
  function loadStore() {
    const base = {
      stars: {},
      challengeBest: 0,
      dropBest: 0,
      dropBestLevel: 0,
      daily: {},
      muted: false,
      name: '',
      tutorialDone: false,
      myStages: []
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          return Object.assign(base, data);
        }
      }
    } catch (e) {
      // 保存領域が使えない環境では保存せずに遊べるようにする
    }
    return base;
  }

  const store = loadStore();
  if (!store.stars || typeof store.stars !== 'object') {
    store.stars = {};
  }
  if (!store.daily || typeof store.daily !== 'object') {
    store.daily = {};
  }
  if (!Array.isArray(store.myStages)) {
    store.myStages = [];
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // 無視
    }
  }

  // ---------- 日付・デイリー ----------
  function dateKey(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function cleanupDaily() {
    const cutoff = Date.now() - DAILY_KEEP_DAYS * 86400000;
    let changed = false;
    Object.keys(store.daily).forEach((k) => {
      const t = new Date(`${k}T00:00:00`).getTime();
      if (!(t >= cutoff)) {
        delete store.daily[k];
        changed = true;
      }
    });
    if (changed) {
      saveStore();
    }
  }

  function dailyStreak() {
    const d = new Date();
    if (!store.daily[dateKey(d)]) {
      d.setDate(d.getDate() - 1);
    }
    let n = 0;
    while (store.daily[dateKey(d)]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  cleanupDaily();

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

  // ---------- トースト・モーダル ----------
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

  function isModalOpen() {
    return !$('#modal').classList.contains('hidden');
  }

  // ---------- 画面遷移 ----------
  let current = 'menu';
  const enterHooks = {};
  const leaveHooks = {};

  function onEnter(name, fn) {
    (enterHooks[name] = enterHooks[name] || []).push(fn);
  }

  function onLeave(name, fn) {
    (leaveHooks[name] = leaveHooks[name] || []).push(fn);
  }

  function showScreen(name) {
    if (current !== name) {
      (leaveHooks[current] || []).forEach((fn) => fn());
    }
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === `screen-${name}`);
    });
    current = name;
    (enterHooks[name] || []).forEach((fn) => fn());
    window.scrollTo(0, 0);
  }

  // ---------- 共有・名前 ----------
  function starStr(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
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
      toast('クリップボードにコピーしました');
    } catch (e) {
      window.prompt('以下をコピーしてください', text);
    }
  }

  function playerName() {
    return String(store.name || '').trim() || 'ななし';
  }

  function setPlayerName(v) {
    store.name = String(v).slice(0, MAX_NAME);
    saveStore();
  }

  function baseUrl() {
    return location.href.replace(/#.*$/, '');
  }

  // ---------- スライダー部品 ----------
  // defs: パラメータ定義, get(key): 現在値, set(def, value): 値の変更要求
  function createSliders(container, defs, get, set) {
    container.innerHTML = '';
    const rows = defs.map((p, i) => {
      const row = document.createElement('div');
      row.className = 'slider-row';
      const id = `${container.id}-${p.key}`;

      const label = document.createElement('label');
      label.textContent = p.key;
      label.htmlFor = id;

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', `${p.key} を減らす`);

      const input = document.createElement('input');
      input.type = 'range';
      input.id = id;
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', `${p.key} を増やす`);

      const out = document.createElement('output');

      input.addEventListener('input', () => set(p, parseFloat(input.value)));
      minus.addEventListener('click', () => set(p, get(p.key) - p.step));
      plus.addEventListener('click', () => set(p, get(p.key) + p.step));
      row.addEventListener('pointerdown', () => api.select(i));

      row.append(label, minus, input, plus, out);
      container.appendChild(row);
      return { p, row, input, out };
    });

    const api = {
      selected: 0,
      refresh() {
        rows.forEach((r) => {
          const v = get(r.p.key);
          r.input.value = String(v);
          r.out.textContent = L.num(v);
        });
      },
      select(i) {
        if (!rows.length) {
          return;
        }
        api.selected = ((i % rows.length) + rows.length) % rows.length;
        rows.forEach((r, j) => r.row.classList.toggle('selected', j === api.selected));
      },
      nudge(dir) {
        if (!rows.length) {
          return;
        }
        const { p } = rows[api.selected];
        set(p, get(p.key) + dir * p.step);
      }
    };
    api.refresh();
    return api;
  }

  // ---------- グラフのドラッグ ----------
  // opts: enabled(), family(), get(), set(params), allowY
  function attachDrag(canvas, renderer, opts) {
    let drag = null;

    const end = () => {
      drag = null;
      canvas.classList.remove('dragging');
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !opts.enabled()) {
        return;
      }
      drag = {
        id: e.pointerId,
        from: renderer.toWorld(e.clientX, e.clientY),
        params: Object.assign({}, opts.get())
      };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        // 古いブラウザ向け
      }
      canvas.classList.add('dragging');
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) {
        return;
      }
      if (!opts.enabled()) {
        end();
        return;
      }
      const to = renderer.toWorld(e.clientX, e.clientY);
      const family = opts.family();
      const dx = to.x - drag.from.x;
      const dy = opts.allowY ? to.y - drag.from.y : 0;
      const moved = L.translate(family, drag.params, dx, dy);
      const snapped = {};
      family.params.forEach((p) => {
        snapped[p.key] = L.snap(moved[p.key], p);
      });
      opts.set(snapped);
    });

    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
  }

  // ---------- 自作ステージ ----------
  const CUSTOM_KIND = {
    slider: {
      icon: '🎚',
      label: 'スライダー',
      goal: 'スライダーで一致率99%を目指す。タイムが短いほど上位。',
      better: (a, b) => a < b,
      fmt: (v) => `${v.toFixed(1)} 秒`
    },
    drop: {
      icon: '⤓',
      label: 'ドロップ',
      goal: '落ちてくるグラフの形を変えて着地させる。一致率が高いほど上位。',
      better: (a, b) => a > b,
      fmt: (v) => `一致率 ${v.toFixed(1)}%`
    },

    formula: {
      icon: '✏️',
      label: '数式',
      goal: '式を入力して一発勝負。一致率が高いほど上位。',
      better: (a, b) => a > b,
      fmt: (v) => `一致率 ${v.toFixed(1)}%`
    },
    // File: js/app.js（変更1）
    fdrop: {
      icon: '🧪',
      label: '数式ドロップ',
      goal: '式を書いて落とし、目標に重ねる一発勝負。定数項は落下で決まる。一致率が高いほど上位。',
      better: (a, b) => a > b,
      fmt: (v) => `一致率 ${v.toFixed(1)}%`
    },
    ball: {
      icon: '●',
      label: 'ボール',
      goal: '式のグラフを地面にしてボールをゴールへ。クリアした式が短いほど上位（式ゴルフ）。共有にはクリアチェックが必要。',
      better: (a, b) => a < b,
      fmt: (v) => `式 ${Math.round(v)} 文字`
    }
  };

  function stageUrl(stage) {
    return `${baseUrl()}#s=${window.GMShare.encode(stage)}`;
  }

  function playCustom(stage, opts = {}) {
    // File: js/app.js（変更2）
    const runner = {
      slider: window.GMStage,
      drop: window.GMDrop,
      formula: window.GMFormula,
      fdrop: window.GMLab,
      ball: window.GMLab
    }[stage.type];
    runner.startCustom(stage, opts);
  }

  
  function shareChallenge(stage, value) {
    const kind = CUSTOM_KIND[stage.type];
    const next = Object.assign({}, stage, { rec: { by: playerName(), val: value } });
    shareText(
      `📈 グラフ作りmath 自作ステージ「${stage.name}」（作：${stage.by}）\n` +
        `私の記録：${kind.fmt(value)}　これに勝てる？\n${stageUrl(next)}`
    );
  }

  function showCustomResult(stage, value, opts = {}) {
    const kind = CUSTOM_KIND[stage.type];
    const v = Math.round(value * 10) / 10;
    const lines = (opts.lines || []).concat([`あなたの記録：${kind.fmt(v)}`]);
    let big = opts.big || kind.icon;

    if (stage.rec && !opts.test) {
      lines.push(`${stage.rec.by} さんの記録：${kind.fmt(stage.rec.val)}`);
      if (v === stage.rec.val) {
        lines.push('引き分け！');
        big = '🤝';
      } else if (kind.better(v, stage.rec.val)) {
        lines.push('勝ち！');
        big = '🏆';
      } else {
        lines.push('負け…もう一度挑戦しよう');
      }
    }

    const retry = () => playCustom(stage, { test: opts.test });
    const actions = opts.test
      ? [
          { label: 'もう一度', onClick: retry },
          { label: 'エディタに戻る', primary: true, onClick: () => showScreen('editor') }
        ]
      : [
          { label: '挑戦状を送る', keepOpen: true, onClick: () => shareChallenge(stage, v) },
          { label: 'もう一度', onClick: retry },
          { label: 'メニューへ', primary: true, onClick: () => showScreen('menu') }
        ];
    openModal({ title: opts.title || '結果', big, lines, actions });
  }

  function saveMyStage(stage) {
    const clean = Object.assign({}, stage);
    delete clean.rec;
    const code = window.GMShare.encode(clean);
    const list = store.myStages.filter((item) => {
      try {
        return window.GMShare.encode(item.stage) !== code;
      } catch (e) {
        return false;
      }
    });
    list.unshift({ stage: clean, at: Date.now() });
    store.myStages = list.slice(0, MAX_MY_STAGES);
    saveStore();
  }

  window.GMApp = {
    $,
    store,
    saveStore,
    todayKey,
    dateKey,
    dailyStreak,
    SFX,
    playTones,
    toast,
    openModal,
    closeModal,
    isModalOpen,
    showScreen,
    current: () => current,
    onEnter,
    onLeave,
    starStr,
    shareText,
    playerName,
    setPlayerName,
    baseUrl,
    createSliders,
    attachDrag,
    CUSTOM_KIND,
    stageUrl,
    playCustom,
    showCustomResult,
    saveMyStage
  };
})();