// File: js/puzzles.js
(function (global) {
  'use strict';

  // 数式ドロップ：target を目標にして、式を落として重ねる
  const DROP = [
    {
      id: 'f1',
      name: '放物線を落とす',
      target: '0.5x^2 - 6',
      answer: '0.5x^2',
      hint: '上下の位置は落下で決まるので、定数項は不要です。x² の係数に注目しよう。'
    },
    {
      id: 'f2',
      name: 'V の字',
      target: '2|x + 3| - 7',
      answer: '2|x + 3|',
      hint: '折れ曲がる点の x 座標と、左右の傾きを読み取ろう。'
    },
    {
      id: 'f3',
      name: '波を重ねる',
      target: '3sin(x) - 4',
      answer: '3sin(x)',
      hint: '山と谷の高さの差は振幅の2倍です。'
    },
    {
      id: 'f4',
      name: '上に凸',
      target: '-(x - 3)^2 / 2 + 6',
      answer: '-(x - 3)^2 / 2',
      hint: '頂点の x 座標と開き具合を読み取ろう。'
    },
    {
      id: 'f5',
      name: '平方根',
      target: '2sqrt(x + 6) - 5',
      answer: '2sqrt(x + 6)',
      hint: '始点の x 座標を確認。sqrt(x + 6) のように書けます。'
    },
    {
      id: 'f6',
      name: '傾いた波',
      target: '0.5x + 2sin(2x)',
      answer: '0.5x + 2sin(2x)',
      hint: '直線と波の足し算です。全体の傾きと、波の細かさを分けて考えよう。'
    },
    {
      id: 'f7',
      name: '三次関数',
      target: '0.05x^3 - x - 2',
      answer: '0.05x^3 - x',
      hint: '3次の係数は小さめ。山と谷の位置から考えよう。'
    },
    {
      id: 'f8',
      name: 'ブラインド',
      target: '1.5cos(x / 2) + 0.1x^2 - 6',
      answer: '1.5cos(x / 2) + 0.1x^2',
      preview: false,
      hint: '落とすまで自分のグラフは見えません。cos と放物線の組み合わせです。'
    }
  ];

  // ボールころがし：式のグラフが地面。座標は x1 < x2, y1 < y2
  const BALL = [
    {
      id: 'b1',
      name: '床をつくろう',
      start: { x: 4, y: 8 },
      goal: { x1: 2, y1: -7, x2: 6, y2: -3 },
      walls: [],
      hazards: [],
      par: 2,
      answer: '-5',
      hint: '式のグラフが地面になります。まずは −5 のような水平な床を作ろう。'
    },
    {
      id: 'b2',
      name: '坂とかべ',
      start: { x: -7, y: 8 },
      goal: { x1: 4, y1: -8, x2: 8, y2: -2 },
      walls: [{ x1: 8, y1: -10, x2: 9, y2: 2 }],
      hazards: [],
      par: 6,
      answer: '-x/2-2',
      hint: 'ボールは坂を下ります。右のかべまで転がる坂を作ろう。'
    },
    {
      id: 'b3',
      name: 'かべを越えて',
      start: { x: -7, y: 8 },
      goal: { x1: 4, y1: -4, x2: 8, y2: 2 },
      walls: [
        { x1: -1, y1: -10, x2: 1, y2: 2 },
        { x1: 8, y1: -10, x2: 9, y2: 3 }
      ],
      hazards: [],
      par: 6,
      answer: '-x/2+3',
      hint: '真ん中のかべより高いところを通る坂が必要です。'
    },
    {
      id: 'b4',
      name: 'トゲの谷',
      start: { x: -7, y: 8 },
      goal: { x1: 4, y1: -6, x2: 8, y2: 0 },
      walls: [{ x1: 8, y1: -10, x2: 9, y2: 3 }],
      hazards: [{ x1: -4, y1: -10, x2: 4, y2: -3 }],
      par: 4,
      answer: '-x/3',
      hint: 'トゲより上を通って右まで転がそう。坂が急すぎるとトゲに近づきます。'
    },
    {
      id: 'b5',
      name: 'くぼみで止める',
      start: { x: 0, y: 8 },
      goal: { x1: -7, y1: -8.5, x2: -3, y2: -4.5 },
      walls: [],
      hazards: [],
      par: 7,
      answer: '|x+5|-7',
      hint: 'かべがありません。ゴールでボールが止まる「くぼみ」を作ろう。'
    },
    {
      id: 'b6',
      name: '落とし穴にイン',
      start: { x: -7, y: 8 },
      goal: { x1: 2, y1: -9, x2: 5, y2: -4 },
      walls: [
        { x1: 0, y1: -10, x2: 2, y2: -3 },
        { x1: 5, y1: -10, x2: 7, y2: -1 }
      ],
      hazards: [],
      par: 9,
      answer: '|x-3.5|-6',
      hint: 'ブロックの間の穴に落とし、そこで止めよう。ブロックではね返ります。'
    },
    {
      id: 'b7',
      name: 'トゲに囲まれた谷',
      start: { x: 6, y: 8 },
      goal: { x1: 0, y1: -6, x2: 4, y2: -2 },
      walls: [],
      hazards: [
        { x1: -10, y1: -10, x2: -1, y2: -5 },
        { x1: 5, y1: -10, x2: 10, y2: -5 }
      ],
      par: 9,
      answer: '0.5(x-2)^2-4',
      hint: '谷の底をゴールに。左右の地面がトゲまで下がらないようにしよう。'
    },
    {
      id: 'b8',
      name: '台の上で止まれ',
      start: { x: -7, y: 8 },
      goal: { x1: 3, y1: -2.5, x2: 7, y2: 0.5 },
      walls: [
        { x1: 3, y1: -10, x2: 7, y2: -2 },
        { x1: 7, y1: -10, x2: 8, y2: 2 }
      ],
      hazards: [{ x1: -3, y1: -10, x2: 2, y2: -4 }],
      par: 6,
      answer: '-x/2+1',
      hint: '右の台の上で止めよう。台より高いところから乗り移る坂が必要です。'
    },
    {
      id: 'b9',
      name: '落とす場所を選ぼう',
      start: { x: 0, y: 8 },
      startRange: [-8, 8],
      goal: { x1: -8, y1: -6, x2: -5, y2: -2 },
      walls: [],
      hazards: [{ x1: -4, y1: -10, x2: 10, y2: -3 }],
      par: 2,
      answer: '-5',
      answerX: -6.5,
      hint: 'このステージでは、ボールを落とす位置を選べます。スライダーかグラフのドラッグで動かそう。'
    },
    {
      id: 'b10',
      name: '空中ブロックをよけて',
      start: { x: -5, y: 8 },
      startRange: [-8, -2],
      goal: { x1: 4, y1: -8, x2: 8, y2: -2 },
      walls: [
        { x1: -6, y1: 4, x2: -3, y2: 5 },
        { x1: 8, y1: -10, x2: 9, y2: 2 }
      ],
      hazards: [],
      par: 6,
      answer: '-x/2-2',
      answerX: -7,
      hint: '真上にブロックがあると、ボールはその上で止まってしまいます。落とす位置を選ぼう。'
    }
  ];

  // ギミック：バネ、風、ワープ、スイッチ、動くブロック、コイン、複数の式
  const GIMMICK = [
    {
      id: 'g1',
      name: 'スイッチでとびらを開けよう',
      start: { x: -8, y: 8 },
      goal: { x1: 4, y1: -9, x2: 8, y2: -3 },
      walls: [
        { x1: 3, y1: -10, x2: 3.5, y2: 6, sw: 'off' },
        { x1: 8, y1: -10, x2: 9, y2: 2 }
      ],
      hazards: [],
      switches: [{ x: -4, y: 0.5 }],
      par: 6,
      answer: '-x/2-2',
      hint: 'ボールがスイッチにふれると ON/OFF が切りかわります。赤いブロックは OFF のときだけ出ます。'
    },
    {
      id: 'g2',
      name: 'コインを集めよう',
      start: { x: 8, y: 8 },
      goal: { x1: -8, y1: -9, x2: -4, y2: -3 },
      walls: [{ x1: -9, y1: -10, x2: -8, y2: 2 }],
      hazards: [],
      coins: [
        { x: 4, y: 0.5 },
        { x: 0, y: -1.5 },
        { x: -5, y: -4 }
      ],
      par: 5,
      answer: 'x/2-2',
      hint: 'コインをすべて集めるまでゴールは開きません。コインを通る坂を作ろう。'
    },
    {
      id: 'g3',
      name: 'おいかぜ',
      start: { x: -4, y: -2 },
      goal: { x1: 5, y1: 2, x2: 9, y2: 6 },
      walls: [{ x1: 9, y1: -10, x2: 10, y2: 9 }],
      hazards: [],
      winds: [{ x1: -6, y1: -10, x2: 10, y2: 3, fx: 10, fy: 0 }],
      par: 5,
      answer: 'x/2-2',
      hint: 'ゴールはスタートより高い所にあります。風に押してもらって坂をのぼろう。急すぎる坂はのぼれません。'
    },
    {
      id: 'g4',
      name: 'バネでジャンプ',
      start: { x: -8, y: 1 },
      goal: { x1: 3.5, y1: 2, x2: 9, y2: 6 },
      walls: [
        { x1: 3, y1: 1.5, x2: 9, y2: 2 },
        { x1: 3, y1: 2, x2: 3.5, y2: 4 },
        { x1: 9, y1: -10, x2: 10, y2: 9 }
      ],
      hazards: [],
      springs: [{ x1: -6, y1: -4.5, x2: -4, y2: -3.5, d: 'r' }],
      par: 6,
      answer: '-x/2-7',
      hint: 'バネにふれると矢印の向きに打ち上げられます。坂を作ってボールをバネまで運ぼう。'
    },
    {
      id: 'g5',
      name: 'ワープで向こう側へ',
      start: { x: -8, y: 8 },
      goal: { x1: 0.5, y1: -9, x2: 4, y2: -5 },
      walls: [
        { x1: -0.5, y1: -10, x2: 0.5, y2: 10 },
        { x1: 9, y1: -10, x2: 10, y2: 9 }
      ],
      hazards: [],
      warps: [{ ax: -1, ay: -7.5, bx: 5, by: 7 }],
      par: 7,
      answer: 'x^2/8-8',
      hint: 'ワープの入口に入ると出口から出てきます。速さと向きはそのまま。出口の下でボールを受け止める地面も必要です。'
    },
    {
      id: 'g6',
      name: 'パトロールするトゲ',
      start: { x: -1, y: 8 },
      goal: { x1: 2, y1: -5, x2: 6, y2: -1 },
      walls: [],
      hazards: [{ x1: -9, y1: -8, x2: -7, y2: -6, move: { dx: 14, dy: 0, T: 7 } }],
      par: 7,
      answer: '|x-4|-4',
      hint: 'トゲが点線の通り道を往復しています。トゲより高い所でボールを止めよう。'
    },
    {
      id: 'g7',
      name: 'エレベーター',
      start: { x: -8, y: 0 },
      goal: { x1: 3, y1: 1, x2: 7, y2: 6 },
      walls: [
        { x1: 3, y1: -20, x2: 7, y2: -9, move: { dx: 0, dy: 12, T: 10 } },
        { x1: 7, y1: -10, x2: 8, y2: 8 }
      ],
      hazards: [],
      par: 6,
      answer: '-x/2-5',
      hint: 'ゴールはスタートより高い所にあります。上下に動くブロックに乗って運んでもらおう。'
    },
    {
      id: 'g8',
      name: '2つの式で道をつくる',
      start: { x: -8, y: 8 },
      goal: { x1: 3, y1: -7, x2: 7, y2: -3 },
      walls: [],
      hazards: [],
      coins: [
        { x: -5, y: 3 },
        { x: -2, y: 1.5 }
      ],
      segs: [0],
      par: 12,
      answers: ['-x/2', '|x-5|-5'],
      hint: 'x < 0 と x ≥ 0 で別々の式を使えます。左の式でコインを通り、右の式でボールを止めよう。'
    }
  ];

  // サンプルワールド（教材の例）。ワールドの共有形式で読みこめる形にしてある
  const AUTHOR = 'グラフ作りmath';
  const BALL_KEYS = ['start', 'goal', 'walls', 'hazards', 'springs', 'winds', 'warps', 'switches', 'coins', 'segs', 'startRange', 'par'];

  function ballStage(p) {
    const s = { type: 'ball', name: p.name, by: AUTHOR, note: p.hint || '' };
    BALL_KEYS.forEach((k) => {
      if (p[k] !== undefined) {
        s[k] = p[k];
      }
    });
    return s;
  }

  function dropStage(p) {
    // 自作ステージの数式ドロップには「プレビューなし」がないので、その説明は使わない
    const note = p.preview === false ? 'cos と放物線の組み合わせです。' : p.hint || '';
    return { type: 'fdrop', name: p.name, by: AUTHOR, expr: p.target, note };
  }

  const SAMPLE_WORLDS = [
    {
      name: 'サンプル：数式ドロップ',
      by: AUTHOR,
      desc: '式を書いて落とし、目標のグラフに重ねます。係数がグラフの形にどう効くかを確かめます。',
      stages: DROP.map(dropStage)
    },
    {
      name: 'サンプル：ボールころがし',
      by: AUTHOR,
      desc: '式のグラフを地面にして、ボールをゴールへ運びます。傾き、切片、絶対値、二次関数の形を使います。',
      stages: BALL.map(ballStage)
    },
    {
      name: 'サンプル：ギミック',
      by: AUTHOR,
      desc: 'バネ、風、ワープ、スイッチ、動くブロック、コイン、区間ごとの式を使うステージです。',
      stages: GIMMICK.map(ballStage)
    }
  ];

  global.GMPuzzles = { DROP, BALL, GIMMICK, TRACKS: { drop: DROP, ball: BALL, gimmick: GIMMICK }, SAMPLE_WORLDS };
})(typeof window !== 'undefined' ? window : globalThis);