// File: js/world.js
(function () {
  'use strict';

  const App = window.GMApp;
  const S = window.GMShare;
  const Z = window.GMPuzzles;
  const { $, store } = App;
  const MAX = S.MAX_WORLD_STAGES;

  if (!Array.isArray(store.worlds)) {
    store.worlds = [];
  }
  if (!store.worldProgress || typeof store.worldProgress !== 'object') {
    store.worldProgress = {};
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const later = (fn) => setTimeout(fn, 0);
  const kindOf = (s) => App.CUSTOM_KIND[s.type];
  const unverified = (s) => s.type === 'ball' && !s.par;

  // ---------- データ ----------
  function cleanStage(s) {
    try {
      const v = S.validate(s);
      delete v.rec;
      v.note = typeof s.note === 'string' ? s.note.slice(0, S.MAX_NOTE) : '';
      return v;
    } catch (e) {
      return null;
    }
  }

  function emptyDraft() {
    return { entryId: null, name: '', desc: '', stages: [] };
  }

  function loadDraft() {
    const d = store.worldDraft;
    if (!d || typeof d !== 'object' || !Array.isArray(d.stages)) {
      return emptyDraft();
    }
    return {
      entryId: typeof d.entryId === 'string' ? d.entryId : null,
      name: typeof d.name === 'string' ? d.name : '',
      desc: typeof d.desc === 'string' ? d.desc : '',
      stages: d.stages.map(cleanStage).filter(Boolean).slice(0, MAX)
    };
  }

  let draft = loadDraft();
  let current = null;
  let session = null;
  let pickList = [];
  let samples = null;

  function saveDraft() {
    store.worldDraft = draft;
    App.saveStore();
  }

  function findEntry(id) {
    return store.worlds.find((e) => e.id === id) || null;
  }

  function newId() {
    return `m${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  // 受け取ったワールドを保存する。同じ内容なら同じ ID になる
  function receive(world) {
    const id = `h${S.worldId(world)}`;
    let e = findEntry(id);
    if (e) {
      e.at = Date.now();
    } else {
      e = { id, world, at: Date.now(), mine: false };
      store.worlds.unshift(e);
    }
    App.saveStore();
    return e;
  }

  function sampleEntries() {
    if (!samples) {
      samples = [];
      (Z.SAMPLE_WORLDS || []).forEach((w) => {
        try {
          const v = S.validateWorld(w);
          samples.push({ id: `s${S.worldId(v)}`, world: v, sample: true });
        } catch (e) {
          // 壊れたサンプルは表示しない（テストで検出する）
        }
      });
    }
    return samples;
  }

  // ---------- 記録 ----------
  function stageKey(stage) {
    try {
      return S.hashCode(S.encode(stage));
    } catch (e) {
      return '';
    }
  }

  function recordOf(entry, stage) {
    const p = store.worldProgress[entry.id];
    const k = stageKey(stage);
    return p && k ? p[k] : undefined;
  }

  function doneCount(entry) {
    return entry.world.stages.filter((s) => recordOf(entry, s)).length;
  }

  function worldUrl(w) {
    const code = S.encodeWorld(w);
    if (code.length > S.MAX_WORLD_CODE) {
      throw new Error('ワールドが大きすぎてリンクにできません。「ファイルに書き出す」で配ってください');
    }
    return `${location.href.replace(/#.*$/, '')}#w=${code}`;
  }

  function shareWorld(w) {
    App.shareText(`📈 グラフ作りmath のワールド「${w.name}」（${w.stages.length}ステージ）\n${worldUrl(w)}`);
  }

  function copyText(text, title) {
    const fallback = () => {
      App.openModal({
        title,
        big: '📋',
        lines: ['コピーできなかったので、下の内容を選んでコピーしてください。'].concat(text.split('\n')),
        actions: [{ label: '閉じる', primary: true, onClick: () => {} }]
      });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => App.toast('記録をコピーしました'), fallback);
    } else {
      fallback();
    }
  }

  function reportText(entry) {
    const w = entry.world;
    const lines = [
      `📈 グラフ作りmath ワールド「${w.name}」（作：${w.by}）の記録`,
      `名前：${App.playerName()}`,
      `日時：${new Date().toLocaleString('ja-JP')}`
    ];
    w.stages.forEach((s, i) => {
      const r = recordOf(entry, s);
      lines.push(`${i + 1}. ${s.name}：${r ? kindOf(s).fmt(r.v) : '未挑戦'}`);
    });
    lines.push(`記録のあるステージ ${doneCount(entry)} / ${w.stages.length}`);
    return lines.join('\n');
  }

  // ---------- 遊ぶ ----------
  function playable(stage) {
    const c = Object.assign({}, stage);
    delete c.note;
    return c;
  }

  function play(entry, i) {
    session = { entry, index: i };
    App.playCustom(playable(entry.world.stages[i]));
  }

  function startStage(entry, i) {
    const stage = entry.world.stages[i];
    if (!stage.note) {
      play(entry, i);
      return;
    }
    const kind = kindOf(stage);
    App.openModal({
      title: `ステージ ${i + 1}「${stage.name}」`,
      big: kind.icon,
      lines: [stage.note, `${kind.label}：${kind.goal}`],
      actions: [
        { label: 'もどる', onClick: () => {} },
        { label: 'はじめる', primary: true, onClick: () => later(() => play(entry, i)) }
      ]
    });
  }

  function openPlay(entry) {
    current = entry;
    App.showScreen('worldplay');
  }

  function renderPlay() {
    session = null;
    const e = current;
    if (!e) {
      return;
    }
    const w = e.world;
    const n = w.stages.length;
    const done = doneCount(e);
    $('#wp-title').textContent = `🌍 ${w.name}${e.test ? '（ためし遊び）' : ''}`;
    $('#wp-by').textContent = `作：${w.by}`;
    $('#wp-desc').textContent = w.desc || '';
    $('#wp-desc').hidden = !w.desc;
    $('#wp-progress').textContent = `記録 ${done} / ${n}`;
    $('#btn-wp-continue').textContent = done === n ? '▶ はじめから' : '▶ つづきから';
    $('#btn-wp-share').hidden = !!e.test;

    const box = $('#wp-list');
    box.innerHTML = '';
    w.stages.forEach((s, i) => {
      const r = recordOf(e, s);
      const kind = kindOf(s);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `wp-row${r ? ' done' : ''}`;
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const name = document.createElement('span');
      name.textContent = `${kind.icon} ${s.name}`;
      const status = document.createElement('span');
      status.className = 'status';
      status.textContent = r ? `✓ ${kind.fmt(r.v)}` : '未挑戦';
      b.append(num, name, status);
      b.addEventListener('click', () => startStage(e, i));
      box.appendChild(b);
    });
  }

  // 自作ステージの結果表示を、ワールドで遊んでいるときだけ横取りする
  const baseResult = App.showCustomResult;
  App.showCustomResult = function (stage, value, opts) {
    const o = opts || {};
    if (!session || o.test) {
      return baseResult.apply(App, arguments);
    }
    return worldResult(value, o);
  };

  function worldResult(value, o) {
    const { entry, index } = session;
    const w = entry.world;
    const st = w.stages[index];
    const kind = kindOf(st);
    const key = stageKey(st);
    if (!store.worldProgress[entry.id]) {
      store.worldProgress[entry.id] = {};
    }
    const prog = store.worldProgress[entry.id];
    const prev = prog[key];
    const best = !prev || kind.better(value, prev.v);
    if (best && key) {
      prog[key] = { v: value, at: Date.now() };
    }
    App.saveStore();

    const n = w.stages.length;
    const lines = [`ステージ ${index + 1} / ${n}「${st.name}」`, `今回：${kind.fmt(value)}`];
    (o.lines || []).forEach((l) => lines.push(l));
    if (prev && best) {
      lines.push(`自己ベスト更新！（前回 ${kind.fmt(prev.v)}）`);
    } else if (prev) {
      lines.push(`自己ベスト：${kind.fmt(prev.v)}`);
    }
    const done = doneCount(entry);
    lines.push(`記録のあるステージ ${done} / ${n}`);
    if (done === n && !prev) {
      lines.push('🎉 このワールドのステージをすべて遊びました');
    }

    const actions = [{ label: 'ワールドへ', onClick: () => later(() => openPlay(entry)) }];
    actions.push({ label: 'もう一度', onClick: () => later(() => play(entry, index)) });
    if (index < n - 1) {
      actions.push({ label: '次のステージへ', primary: true, onClick: () => later(() => startStage(entry, index + 1)) });
    }
    App.openModal({ title: o.title || '結果', big: o.big || kind.icon, lines, actions });
  }

  function introWorld(world) {
    const lines = [`作：${world.by}`, `${world.stages.length} ステージ`];
    if (world.desc) {
      lines.push(world.desc);
    }
    App.openModal({
      title: `「${world.name}」`,
      big: '🌍',
      lines,
      actions: [
        { label: 'メニューへ', onClick: () => {} },
        {
          label: '遊ぶ',
          primary: true,
          onClick: () => {
            const e = receive(world);
            later(() => openPlay(e));
          }
        }
      ]
    });
  }

  function importFile(text) {
    try {
      const e = receive(S.worldFromFile(text));
      App.toast('ワールドを読みこみました');
      openPlay(e);
    } catch (err) {
      App.toast(`ファイルを開けませんでした：${err.message}`);
    }
  }

  // ---------- メニューの一覧 ----------
  function worldCard(entry, buttons) {
    const w = entry.world;
    const row = document.createElement('div');
    row.className = 'my-stage';
    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = `🌍 ${w.name}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    const recv = !entry.mine && !entry.sample ? '・受け取ったワールド' : '';
    meta.textContent = `作：${w.by}・${w.stages.length} ステージ・記録 ${doneCount(entry)}/${w.stages.length}${recv}`;
    info.append(title, meta);
    const btns = document.createElement('div');
    btns.className = 'btn-row';
    buttons.forEach(([text, aria, fn]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute('aria-label', `${w.name} を${aria}`);
      b.addEventListener('click', fn);
      btns.appendChild(b);
    });
    row.append(info, btns);
    return row;
  }

  function renderMenuLists() {
    const my = $('#my-worlds');
    my.innerHTML = '';
    const valid = [];
    store.worlds.forEach((e) => {
      try {
        e.world = S.validateWorld(e.world);
        valid.push(e);
      } catch (err) {
        // 読めないデータは表示しない
      }
    });
    if (!valid.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'まだありません。作ったワールドや、受け取ったワールドがここに表示されます。';
      my.appendChild(p);
    }
    valid.forEach((e) => {
      my.appendChild(
        worldCard(e, [
          ['▶ 遊ぶ', '遊ぶ', () => openPlay(e)],
          [e.mine ? '✏️ 編集' : '✏️ コピーして編集', '編集', () => openEditor(e)],
          [
            '🗑',
            '削除',
            () => {
              if (window.confirm(`「${e.world.name}」を削除しますか？このワールドの記録も消えます。`)) {
                store.worlds = store.worlds.filter((x) => x !== e);
                delete store.worldProgress[e.id];
                App.saveStore();
                renderMenuLists();
              }
            }
          ]
        ])
      );
    });

    const sb = $('#sample-worlds');
    sb.innerHTML = '';
    sampleEntries().forEach((e) => {
      sb.appendChild(
        worldCard(e, [
          ['▶ 遊ぶ', '遊ぶ', () => openPlay(e)],
          ['✏️ コピーして編集', 'コピーして編集', () => openEditor(e)]
        ])
      );
    });
  }

  // ---------- 作る ----------
  function openEditor(entry) {
    if (entry) {
      const same = entry.mine && draft.entryId === entry.id;
      if (
        !same &&
        draft.stages.length &&
        !window.confirm('作りかけのワールドを閉じて、このワールドを開きますか？（保存していない変更は消えます）')
      ) {
        return;
      }
      draft = {
        entryId: entry.mine ? entry.id : null,
        name: entry.world.name,
        desc: entry.world.desc || '',
        stages: entry.world.stages.map(cleanStage).filter(Boolean)
      };
      saveDraft();
    }
    App.showScreen('world');
  }

  function myStageList() {
    const out = [];
    (store.myStages || []).forEach((item) => {
      try {
        out.push(S.validate(item.stage));
      } catch (e) {
        // 読めないステージは出さない
      }
    });
    return out;
  }

  function renderPick() {
    const sel = $('#we-pick');
    sel.innerHTML = '';
    pickList = myStageList();
    $('#btn-we-add').disabled = !pickList.length;
    if (!pickList.length) {
      const o = document.createElement('option');
      o.textContent = 'マイステージがありません';
      o.disabled = true;
      sel.appendChild(o);
      return;
    }
    pickList.forEach((s, i) => {
      const kind = kindOf(s);
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${kind.icon} ${s.name}（${kind.label}）${unverified(s) ? ' ⚠未チェック' : ''}`;
      sel.appendChild(o);
    });
  }

  function moveStage(i, d) {
    const a = draft.stages;
    const j = i + d;
    if (j < 0 || j >= a.length) {
      return;
    }
    [a[i], a[j]] = [a[j], a[i]];
    saveDraft();
    renderStages();
  }

  function renderStages() {
    const box = $('#we-list');
    box.innerHTML = '';
    $('#we-count').textContent = `${draft.stages.length} / ${MAX} ステージ`;
    if (!draft.stages.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'まだステージがありません。「マイステージから追加」で加えてください。';
      box.appendChild(p);
      return;
    }
    draft.stages.forEach((s, i) => {
      const kind = kindOf(s);
      const row = document.createElement('div');
      row.className = 'we-row';

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);

      const body = document.createElement('div');
      body.className = 'body';
      const title = document.createElement('span');
      title.textContent = `${kind.icon} ${s.name}`;
      const meta = document.createElement('span');
      meta.className = `meta${unverified(s) ? ' warn' : ''}`;
      meta.textContent = `${kind.label}・作：${s.by}${unverified(s) ? '・⚠ クリアチェック未完了（配れません）' : ''}`;
      const note = document.createElement('input');
      note.type = 'text';
      note.maxLength = S.MAX_NOTE;
      note.placeholder = `問題文・ヒント（任意、${S.MAX_NOTE}文字まで）`;
      note.value = s.note || '';
      note.setAttribute('aria-label', `ステージ${i + 1}の問題文`);
      note.addEventListener('input', () => {
        s.note = note.value;
        saveDraft();
      });
      body.append(title, meta, note);

      const btns = document.createElement('div');
      btns.className = 'btn-row';
      const mk = (text, aria, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.disabled = !!disabled;
        b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn);
        btns.appendChild(b);
      };
      mk('↑', `ステージ${i + 1}を上へ`, () => moveStage(i, -1), i === 0);
      mk('↓', `ステージ${i + 1}を下へ`, () => moveStage(i, 1), i === draft.stages.length - 1);
      mk('✕', `ステージ${i + 1}を外す`, () => {
        draft.stages.splice(i, 1);
        saveDraft();
        renderStages();
      });

      row.append(num, body, btns);
      box.appendChild(row);
    });
  }

  function renderEditor() {
    $('#we-name').value = draft.name;
    $('#we-desc').value = draft.desc;
    $('#we-author').value = store.name;
    $('#we-error').textContent = '';
    renderPick();
    renderStages();
  }

  function buildWorld() {
    if (!draft.stages.length) {
      throw new Error('ステージを1つ以上追加してください');
    }
    return S.validateWorld({
      name: draft.name.trim() || 'ななしのワールド',
      by: App.playerName(),
      desc: draft.desc,
      stages: draft.stages
    });
  }

  function requireVerified(w) {
    const i = w.stages.findIndex(unverified);
    if (i >= 0) {
      throw new Error(
        `ステージ${i + 1}「${w.stages[i].name}」はクリアチェックが済んでいません。「ステージをつくる」でテストプレイしてクリアし、保存し直してから追加し直してください`
      );
    }
  }

  function withWorld(fn, needVerified) {
    try {
      const w = buildWorld();
      if (needVerified) {
        requireVerified(w);
      }
      $('#we-error').textContent = '';
      fn(w);
    } catch (e) {
      $('#we-error').textContent = e.message;
      App.playTones(App.SFX.bad);
    }
  }

  function saveMine(w) {
    let e = draft.entryId ? findEntry(draft.entryId) : null;
    if (e) {
      e.world = w;
      e.at = Date.now();
    } else {
      e = { id: newId(), world: w, at: Date.now(), mine: true };
      store.worlds.unshift(e);
      draft.entryId = e.id;
    }
    saveDraft();
    return e;
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#we-name').addEventListener('input', (e) => {
    draft.name = e.target.value;
    saveDraft();
  });

  $('#we-desc').addEventListener('input', (e) => {
    draft.desc = e.target.value;
    saveDraft();
  });

  $('#we-author').addEventListener('input', (e) => App.setPlayerName(e.target.value));

  $('#btn-we-add').addEventListener('click', () => {
    const s = pickList[Number($('#we-pick').value)];
    if (!s) {
      return;
    }
    if (draft.stages.length >= MAX) {
      $('#we-error').textContent = `ステージは${MAX}個までです`;
      return;
    }
    const c = clone(s);
    delete c.rec;
    c.note = '';
    draft.stages.push(c);
    $('#we-error').textContent = '';
    saveDraft();
    renderStages();
  });

  $('#btn-we-new-stage').addEventListener('click', () => window.GMEditor.open());

  $('#btn-we-test').addEventListener('click', () =>
    withWorld((w) => {
      delete store.worldProgress.draft;
      openPlay({ id: 'draft', world: w, test: true });
    }, false)
  );

  $('#btn-we-save').addEventListener('click', () =>
    withWorld((w) => {
      saveMine(w);
      App.toast('マイワールドに保存しました');
    }, false)
  );

  $('#btn-we-export').addEventListener('click', () =>
    withWorld((w) => {
      saveMine(w);
      download(`${w.name.replace(/[\\/:*?"<>|]/g, '_')}.json`, S.worldToFile(w));
    }, true)
  );

  $('#btn-we-share').addEventListener('click', () =>
    withWorld((w) => {
      saveMine(w);
      shareWorld(w);
    }, true)
  );

  $('#btn-we-reset').addEventListener('click', () => {
    if (draft.stages.length && !window.confirm('新しいワールドを作りますか？（保存していない変更は消えます）')) {
      return;
    }
    draft = emptyDraft();
    saveDraft();
    renderEditor();
  });

  $('#btn-we-back').addEventListener('click', () => App.showScreen('menu'));
  $('#btn-editor-world').addEventListener('click', () => openEditor());

  $('#btn-wp-continue').addEventListener('click', () => {
    if (!current) {
      return;
    }
    const i = current.world.stages.findIndex((s) => !recordOf(current, s));
    startStage(current, i < 0 ? 0 : i);
  });

  $('#btn-wp-report').addEventListener('click', () => {
    if (current) {
      copyText(reportText(current), '記録');
    }
  });

  $('#btn-wp-share').addEventListener('click', () => {
    if (!current) {
      return;
    }
    try {
      shareWorld(current.world);
    } catch (e) {
      App.toast(e.message);
    }
  });

  $('#btn-wp-back').addEventListener('click', () => App.showScreen('menu'));

  App.onEnter('world', renderEditor);
  App.onEnter('worldplay', renderPlay);

  window.GMWorld = {
    openEditor,
    openPlay,
    introWorld,
    importFile,
    renderMenuLists,
    sampleEntries,
    endSession: () => {
      session = null;
    },
    backTarget: () => (session ? 'worldplay' : null)
  };
})();