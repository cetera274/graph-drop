// File: js/formula.js
(function () {
  'use strict';

  const App = window.GMApp;
  const L = window.GMLevels;
  const M = window.GMMatch;
  const { parse } = window.GMParser;
  const { $, store } = App;

  const renderer = new window.GMGraph.GraphRenderer($('#formula-canvas'), M.VIEW);
  const input = $('#formula-input');
  const fm = {
    mode: 'challenge',
    dateKey: '',
    seed: 0,
    targets: [],
    round: 0,
    results: [],
    targetFn: null,
    targetText: '',
    player: null,
    submitted: false,
    custom: null,
    test: false,
    rec: null
  };

  function rate(m) {
    if (m >= 99) return { label: 'パーフェクト！', emoji: '🟩', cls: 'good' };
    if (m >= 95) return { label: 'すばらしい！', emoji: '🟩', cls: 'good' };
    if (m >= 80) return { label: 'おしい！', emoji: '🟨', cls: 'warn' };
    return { label: 'がんばろう', emoji: '🟥', cls: 'bad' };
  }

  function rounds() {
    return fm.targets.length;
  }

  function totalScore() {
    return fm.results.reduce((s, r) => s + r.match, 0);
  }

  // mode: 'challenge' | 'daily'。opts.seed と opts.rec で友だちと同じ問題に挑戦できる
  function start(mode, opts = {}) {
    fm.mode = mode;
    fm.custom = null;
    fm.test = false;
    fm.rec = opts.rec || null;
    fm.dateKey = App.todayKey();
    if (mode === 'daily') {
      fm.seed = L.hashString(`daily-${fm.dateKey}`);
    } else if (Number.isInteger(opts.seed)) {
      fm.seed = opts.seed >>> 0;
    } else {
      fm.seed = (Math.random() * 4294967296) >>> 0;
    }
    fm.targets = L.generateSet(fm.seed).map((expr, i) => ({ expr, label: L.TIERS[i].name }));
    const recText = fm.rec ? `${fm.rec.by} さん：${fm.rec.val.toFixed(1)}` : '';
    begin(mode === 'daily' ? `📅 デイリー ${fm.dateKey}` : '✏️ チャレンジ', recText);
    if (mode === 'daily' && store.daily[fm.dateKey]) {
      App.toast('今日の記録は保存済みです。今回は練習として遊べます');
    }
  }

  function startCustom(stage, opts = {}) {
    fm.mode = 'custom';
    fm.custom = stage;
    fm.test = !!opts.test;
    fm.rec = null;
    fm.targets = [{ expr: stage.expr, label: `「${stage.name}」 作：${stage.by}` }];
    const recText = stage.rec && !fm.test ? `${stage.rec.by} さん：${stage.rec.val.toFixed(1)}%` : '';
    begin(fm.test ? '🛠 テストプレイ' : '🎨 自作ステージ', recText);
  }

  function begin(title, recText) {
    fm.round = 0;
    fm.results = [];
    $('#formula-mode').textContent = title;
    $('#formula-rec').textContent = recText;
    App.showScreen('formula');
    loadRound();
  }

  function updateHud() {
    $('#formula-round').textContent = `第 ${fm.round + 1} 問 / ${rounds()}`;
    $('#formula-tier').textContent = fm.targets[fm.round].label;
    $('#formula-score').textContent = fm.mode === 'custom' ? '' : `合計 ${totalScore().toFixed(1)}`;
  }

  function loadRound() {
    fm.targetText = fm.targets[fm.round].expr;
    fm.targetFn = parse(fm.targetText).fn;
    fm.submitted = false;
    fm.player = null;
    input.value = '';
    input.disabled = false;
    $('#btn-submit').disabled = false;
    $('#formula-error').textContent = '';
    $('#formula-result').hidden = true;
    updateHud();
    draw();
    input.focus();
  }

  function draw() {
    renderer.draw({ target: fm.targetFn, player: fm.player, ghost: null, showDiff: fm.submitted });
  }

  function onInput() {
    if (fm.submitted) {
      return;
    }
    const src = input.value;
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
    draw();
  }

  function shakeInput() {
    const box = input.closest('.formula-input');
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  function submit() {
    if (fm.submitted) {
      return;
    }
    if (!fm.player) {
      if (!$('#formula-error').textContent) {
        $('#formula-error').textContent = 'まず式を入力してください';
      }
      shakeInput();
      App.playTones(App.SFX.bad);
      return;
    }
    fm.submitted = true;
    const m = M.computeMatch(fm.targetFn, fm.player);
    fm.results.push({ match: m });
    input.disabled = true;
    $('#btn-submit').disabled = true;

    const r = rate(m);
    const verdict = $('#result-verdict');
    verdict.textContent = r.label;
    verdict.className = `verdict ${r.cls}`;
    $('#result-score').textContent = `一致率 ${m.toFixed(1)}%`;
    let answer = `正解の一例：y = ${fm.targetText}`;
    if (fm.mode === 'custom') {
      answer = fm.test ? `作者の式：y = ${fm.targetText}` : '作者の式はひみつです';
    }
    $('#result-answer').textContent = answer;
    $('#btn-next').textContent = fm.round === rounds() - 1 ? '結果を見る' : '次の問題へ';
    $('#formula-result').hidden = false;

    updateHud();
    draw();
    App.playTones(m >= 95 ? App.SFX.clear : m >= 80 ? App.SFX.good : App.SFX.bad);
    $('#btn-next').focus();
  }

  function next() {
    if (fm.round < rounds() - 1) {
      fm.round++;
      loadRound();
    } else {
      finish();
    }
  }

  function finish() {
    const total = totalScore();

    if (fm.mode === 'custom') {
      App.showCustomResult(fm.custom, total, { test: fm.test, big: rate(total).emoji });
      return;
    }

    const max = rounds() * 100;
    const squares = fm.results.map((r) => rate(r.match).emoji).join('');
    const lines = [`合計スコア ${total.toFixed(1)} / ${max}`];
    let text;

    if (fm.mode === 'challenge') {
      if (total > store.challengeBest) {
        store.challengeBest = total;
        App.saveStore();
        lines.push('自己ベスト更新！');
      } else {
        lines.push(`自己ベスト ${store.challengeBest.toFixed(1)}`);
      }
      if (fm.rec) {
        const v = Math.round(total * 10) / 10;
        lines.push(`${fm.rec.by} さんの記録 ${fm.rec.val.toFixed(1)}`);
        lines.push(v > fm.rec.val ? '勝ち！' : v === fm.rec.val ? '引き分け！' : '負け…');
      }
      const url = `${App.baseUrl()}#c=${fm.seed}&rv=${total.toFixed(1)}&rb=${encodeURIComponent(App.playerName())}`;
      text = `📈 グラフ作りmath チャレンジ\n${squares} ${total.toFixed(1)}/${max}\n同じ5問で勝負しよう！\n${url}`;
    } else {
      if (!store.daily[fm.dateKey]) {
        store.daily[fm.dateKey] = { score: total, squares };
        App.saveStore();
        lines.push('今日の記録を保存しました。また明日！');
      } else {
        lines.push('今日の公式記録は最初のプレイ結果です');
      }
      const streak = App.dailyStreak();
      lines.push(`連続プレイ ${streak} 日`);
      text = `📈 グラフ作りmath デイリー ${fm.dateKey}\n${squares} ${total.toFixed(1)}/${max}　🔥${streak}日連続\n${App.baseUrl()}`;
    }

    const retryOpts = fm.mode === 'challenge' && fm.rec ? { seed: fm.seed, rec: fm.rec } : {};
    App.openModal({
      title: fm.mode === 'daily' ? `デイリー ${fm.dateKey}` : 'チャレンジ結果',
      big: squares,
      lines,
      actions: [
        { label: '結果をシェア', keepOpen: true, onClick: () => App.shareText(text) },
        { label: fm.mode === 'daily' ? 'もう一度（練習）' : 'もう一度', onClick: () => start(fm.mode, retryOpts) },
        { label: 'メニューへ', primary: true, onClick: () => App.showScreen('menu') }
      ]
    });
  }

  function insertAtCursor(text) {
    const startPos = input.selectionStart ?? input.value.length;
    const endPos = input.selectionEnd ?? startPos;
    input.value = input.value.slice(0, startPos) + text + input.value.slice(endPos);
    const pos = startPos + text.length;
    input.focus();
    input.setSelectionRange(pos, pos);
    onInput();
  }

  function backspaceAtCursor() {
    const startPos = input.selectionStart ?? input.value.length;
    const endPos = input.selectionEnd ?? startPos;
    const from = startPos === endPos ? Math.max(0, startPos - 1) : startPos;
    input.value = input.value.slice(0, from) + input.value.slice(endPos);
    input.focus();
    input.setSelectionRange(from, from);
    onInput();
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    submit();
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

  $('#btn-submit').addEventListener('click', submit);
  $('#btn-next').addEventListener('click', next);
  $('#btn-formula-quit').addEventListener('click', () => App.showScreen(fm.test ? 'editor' : 'menu'));

  window.GMFormula = { start, startCustom };
})();