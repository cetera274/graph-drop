// File: js/main.js
(function () {
  'use strict';

  const App = window.GMApp;
  const S = window.GMShare;
  const W = window.GMWorld;
  const { $, store } = App;

  // ---------- メニュー ----------
  function renderMenu() {
    W.endSession();
    $('#menu-name').value = store.name;
    W.renderMenuLists();
  }

  App.onEnter('menu', renderMenu);

  $('#menu-name').addEventListener('input', (e) => App.setPlayerName(e.target.value));

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'editor') {
        window.GMEditor.open();
      } else if (action === 'world') {
        W.openEditor();
      }
    });
  });

  // ---------- ヘッダー ----------
  function updateMuteIcon() {
    $('#btn-mute').textContent = store.muted ? '🔇' : '🔊';
  }

  $('#btn-mute').addEventListener('click', () => {
    store.muted = !store.muted;
    App.saveStore();
    updateMuteIcon();
  });

  $('#btn-home').addEventListener('click', () => {
    App.closeModal();
    App.showScreen('menu');
  });

  // ---------- 1つのステージ ----------
  function introCustom(stage) {
    const kind = App.CUSTOM_KIND[stage.type];
    const lines = [`作：${stage.by}`, `${kind.icon} ${kind.label}：${kind.goal}`];
    if (stage.rec) {
      lines.push(`${stage.rec.by} さんの記録：${kind.fmt(stage.rec.val)}　これに勝てるかな？`);
    }
    App.openModal({
      title: `「${stage.name}」`,
      big: '🎨',
      lines,
      actions: [
        {
          label: '保存',
          keepOpen: true,
          onClick: () => {
            App.saveMyStage(stage);
            App.toast('マイステージに保存しました');
          }
        },
        { label: 'メニューへ', onClick: () => {} },
        { label: '挑戦する', primary: true, onClick: () => App.playCustom(stage) }
      ]
    });
  }

  // ---------- リンク・コード・ファイル ----------
  function applyHash(hash) {
    const q = new URLSearchParams(hash);
    if (q.has('w')) {
      try {
        W.introWorld(S.decodeWorld(q.get('w')));
      } catch (e) {
        App.toast(`ワールドを開けませんでした：${e.message}`);
      }
    } else if (q.has('s')) {
      try {
        introCustom(S.decode(q.get('s')));
      } catch (e) {
        App.toast(`リンクを開けませんでした：${e.message}`);
      }
    } else if (q.has('c') || q.has('stage') || q.has('lab')) {
      App.toast('このリンクの遊び方は、今のバージョンではなくなりました');
    } else {
      App.toast('リンクが壊れています');
    }
  }

  function openText(text) {
    const t = String(text || '').trim();
    if (!t) {
      App.toast('リンクまたはコードを貼りつけてください');
      return;
    }
    const m = t.match(/#(.*)$/);
    if (m) {
      applyHash(m[1]);
      return;
    }
    try {
      W.introWorld(S.decodeWorld(t));
      return;
    } catch (e) {
      // ワールドでなければステージとして試す
    }
    try {
      introCustom(S.decode(t));
    } catch (e) {
      App.toast('リンクまたはコードを読みこめませんでした');
    }
  }

  $('#btn-open').addEventListener('click', () => openText($('#open-input').value));
  $('#open-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      openText($('#open-input').value);
    }
  });

  $('#open-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => W.importFile(String(reader.result));
    reader.onerror = () => App.toast('ファイルを読みこめませんでした');
    reader.readAsText(f);
    e.target.value = '';
  });

  function route() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) {
      return;
    }
    history.replaceState(null, '', location.href.replace(/#.*$/, ''));
    applyHash(hash);
  }

  window.addEventListener('hashchange', route);

  updateMuteIcon();
  App.showScreen('menu');
  route();
})();