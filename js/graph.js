// File: js/graph.js
(function (global) {
  'use strict';

  const { safeEval } = global.GMMatch;
  const PH = () => global.GMPhysics;

  const COLORS = {
    bg: '#0f172a',
    minor: 'rgba(148, 163, 184, 0.10)',
    major: 'rgba(148, 163, 184, 0.26)',
    axis: 'rgba(226, 232, 240, 0.60)',
    label: '#94a3b8',
    target: 'rgba(56, 189, 248, 0.55)',
    player: '#f97316',
    ghost: 'rgba(253, 186, 116, 0.8)',
    diff: 'rgba(239, 68, 68, 0.22)',
    good: 'rgba(34, 197, 94, 0.14)',
    bad: 'rgba(239, 68, 68, 0.16)',
    fill: 'rgba(249, 115, 22, 0.10)',
    wall: '#334155',
    wallEdge: '#64748b',
    hazard: 'rgba(239, 68, 68, 0.35)',
    hazardEdge: '#f87171',
    goal: 'rgba(34, 197, 94, 0.12)',
    goalEdge: '#4ade80',
    goalFill: 'rgba(34, 197, 94, 0.35)',
    goalLocked: 'rgba(148, 163, 184, 0.10)',
    ball: '#fde047',
    ballEdge: '#854d0e',
    trail: 'rgba(253, 224, 71, 0.55)',
    range: 'rgba(253, 224, 71, 0.75)',
    path: 'rgba(226, 232, 240, 0.35)',
    swOff: 'rgba(239, 68, 68, 0.45)',
    swOffEdge: '#f87171',
    swOn: 'rgba(59, 130, 246, 0.45)',
    swOnEdge: '#60a5fa',
    spring: 'rgba(163, 230, 53, 0.30)',
    springEdge: '#a3e635',
    wind: 'rgba(125, 211, 252, 0.08)',
    windEdge: 'rgba(125, 211, 252, 0.6)',
    warp: 'rgba(192, 132, 252, 0.25)',
    warpEdge: '#c084fc',
    warpLine: 'rgba(192, 132, 252, 0.25)',
    coin: '#facc15',
    coinEdge: '#a16207',
    cursor: 'rgba(226, 232, 240, 0.9)'
  };

  class GraphRenderer {
    constructor(canvas, view) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.view = view;
      this.layers = {
        target: null,
        player: null,
        ghost: null,
        showDiff: false,
        flash: null,
        fill: null,
        scene: null
      };
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      if ('ResizeObserver' in global) {
        new ResizeObserver(() => this.resize()).observe(canvas);
      }
      global.addEventListener('resize', () => this.resize());
      this.resize();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        return;
      }
      const dpr = global.devicePixelRatio || 1;
      const pw = Math.round(rect.width * dpr);
      const ph = Math.round(rect.height * dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
      this.dpr = dpr;
      this.w = rect.width;
      this.h = rect.height;
      this.render();
    }

    draw(layers) {
      Object.assign(this.layers, layers);
      this.resize();
    }

    // 画面座標（clientX, clientY）を数学座標に変換する
    toWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const v = this.view;
      return {
        x: v.xmin + ((clientX - rect.left) / rect.width) * (v.xmax - v.xmin),
        y: v.ymax - ((clientY - rect.top) / rect.height) * (v.ymax - v.ymin)
      };
    }

    sx(x) {
      const v = this.view;
      return ((x - v.xmin) / (v.xmax - v.xmin)) * this.w;
    }

    sy(y) {
      const v = this.view;
      return this.h - ((y - v.ymin) / (v.ymax - v.ymin)) * this.h;
    }

    // 長さ（マス）をピクセルに変換する
    ux(u) {
      return (u / (this.view.xmax - this.view.xmin)) * this.w;
    }

    rectPx(r) {
      const x = this.sx(r.x1);
      const y = this.sy(r.y2);
      return { x, y, w: this.sx(r.x2) - x, h: this.sy(r.y1) - y };
    }

    render() {
      if (!this.w) {
        return;
      }
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, this.w, this.h);
      this.drawGrid();
      const { target, player, ghost, showDiff, flash, fill, scene } = this.layers;
      if (flash && COLORS[flash]) {
        ctx.fillStyle = COLORS[flash];
        ctx.fillRect(0, 0, this.w, this.h);
      }
      if (fill) {
        this.drawFill(fill);
      }
      if (scene) {
        this.drawSceneBack(scene);
      }
      if (scene && scene.trail) {
        this.drawTrail(scene.trail);
      }
      if (showDiff && target && player) {
        this.drawDiff(target, player);
      }
      if (target) {
        this.drawCurve(target, COLORS.target, 7);
      }
      if (ghost) {
        this.drawCurve(ghost, COLORS.ghost, 2, [8, 6]);
      }
      if (player) {
        this.drawCurve(player, COLORS.player, 3);
      }
      if (scene) {
        this.drawSceneFront(scene);
      }
    }

    drawGrid() {
      const { ctx, view } = this;
      ctx.lineWidth = 1;
      for (let x = Math.ceil(view.xmin); x <= view.xmax; x++) {
        ctx.strokeStyle = x === 0 ? COLORS.axis : x % 5 === 0 ? COLORS.major : COLORS.minor;
        const px = Math.round(this.sx(x)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, this.h);
        ctx.stroke();
      }
      for (let y = Math.ceil(view.ymin); y <= view.ymax; y++) {
        ctx.strokeStyle = y === 0 ? COLORS.axis : y % 5 === 0 ? COLORS.major : COLORS.minor;
        const py = Math.round(this.sy(y)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(this.w, py);
        ctx.stroke();
      }

      const ox = this.sx(0);
      const oy = this.sy(0);
      ctx.fillStyle = COLORS.label;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = Math.ceil(view.xmin) + 2; x <= view.xmax - 2; x += 2) {
        if (x !== 0) {
          ctx.fillText(String(x), this.sx(x), oy + 4);
        }
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = Math.ceil(view.ymin) + 2; y <= view.ymax - 2; y += 2) {
        if (y !== 0) {
          ctx.fillText(String(y), ox - 4, this.sy(y));
        }
      }
      ctx.textBaseline = 'top';
      ctx.fillText('0', ox - 4, oy + 4);
    }

    drawCurve(fn, color, width, dash) {
      const { ctx, view } = this;
      const span = view.ymax - view.ymin;
      const lo = view.ymin - span;
      const hi = view.ymax + span;
      const steps = Math.max(300, Math.round(this.w * 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      let penDown = false;
      let prevY = NaN;
      for (let i = 0; i <= steps; i++) {
        const x = view.xmin + ((view.xmax - view.xmin) * i) / steps;
        const y = safeEval(fn, x);
        if (!Number.isFinite(y)) {
          penDown = false;
          prevY = NaN;
          continue;
        }
        // 漸近線などの不連続点では線をつながない
        const jump = penDown && Math.abs(y - prevY) > span;
        const px = this.sx(x);
        const py = this.sy(Math.min(hi, Math.max(lo, y)));
        if (!penDown || jump) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
        penDown = true;
        prevY = y;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawDiff(ft, fp) {
      const { ctx, view } = this;
      const cols = Math.max(100, Math.round(this.w / 2));
      const dx = (view.xmax - view.xmin) / cols;
      const colW = this.w / cols;
      const clampY = (y) => Math.min(view.ymax, Math.max(view.ymin, y));
      ctx.fillStyle = COLORS.diff;
      for (let i = 0; i < cols; i++) {
        const x = view.xmin + dx * (i + 0.5);
        const a = safeEval(ft, x);
        const b = safeEval(fp, x);
        if (!Number.isFinite(a) || !Number.isFinite(b)) {
          continue;
        }
        const ya = this.sy(clampY(a));
        const yb = this.sy(clampY(b));
        const top = Math.min(ya, yb);
        const bottom = Math.max(ya, yb);
        if (bottom - top > 0.5) {
          ctx.fillRect(i * colW, top, colW + 0.5, bottom - top);
        }
      }
    }

    // グラフより下（地面）を薄く塗る
    drawFill(fn) {
      const { ctx, view } = this;
      const cols = Math.max(100, Math.round(this.w / 2));
      const dx = (view.xmax - view.xmin) / cols;
      const colW = this.w / cols;
      ctx.fillStyle = COLORS.fill;
      for (let i = 0; i < cols; i++) {
        const y = safeEval(fn, view.xmin + dx * (i + 0.5));
        if (!Number.isFinite(y) || y < view.ymin) {
          continue;
        }
        const top = this.sy(Math.min(view.ymax, y));
        ctx.fillRect(i * colW, top, colW + 0.5, this.h - top);
      }
    }

    // 中心 (px, py)、画面上の向き (ux, uy) の矢印
    arrow(px, py, ux, uy, len, color, width) {
      const ctx = this.ctx;
      const hx = px + (ux * len) / 2;
      const hy = py + (uy * len) / 2;
      const tx = px - (ux * len) / 2;
      const ty = py - (uy * len) / 2;
      const h = Math.max(4, len * 0.35);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - h * (ux * 0.8 - uy * 0.6), hy - h * (uy * 0.8 + ux * 0.6));
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - h * (ux * 0.8 + uy * 0.6), hy - h * (uy * 0.8 - ux * 0.6));
      ctx.stroke();
    }

    drawSceneBack(scene) {
      (scene.winds || []).forEach((w) => this.drawWind(w));
      if (scene.goal) {
        this.drawGoal(scene.goal, scene.progress, scene.locked, scene.coinsLeft);
      }
      (scene.walls || []).forEach((w) => this.drawWall(w));
      (scene.hazards || []).forEach((h) => this.drawHazard(h));
      (scene.springs || []).forEach((s) => this.drawSpring(s));
      (scene.warps || []).forEach((w, i) => this.drawWarp(w, i));
      (scene.switches || []).forEach((s) => this.drawSwitch(s, scene.on));
      (scene.coins || []).forEach((c) => {
        if (!c.got) {
          this.drawCoin(c);
        }
      });
    }

    drawGoal(goal, progress, locked, left) {
      const { ctx } = this;
      const g = this.rectPx(goal);
      ctx.fillStyle = locked ? COLORS.goalLocked : COLORS.goal;
      ctx.fillRect(g.x, g.y, g.w, g.h);
      const p = Math.max(0, Math.min(1, progress || 0));
      if (p > 0) {
        ctx.fillStyle = COLORS.goalFill;
        ctx.fillRect(g.x, g.y + g.h * (1 - p), g.w, g.h * p);
      }
      const edge = locked ? COLORS.label : COLORS.goalEdge;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(g.x + 1, g.y + 1, g.w - 2, g.h - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = edge;
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(locked ? `コイン あと${left}` : 'GOAL', g.x + g.w / 2, g.y + 4);
    }

    drawPath(p) {
      const { ctx } = this;
      const ax = this.sx(p.ax);
      const ay = this.sy(p.ay);
      const bx = this.sx(p.bx);
      const by = this.sy(p.by);
      ctx.strokeStyle = COLORS.path;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.path;
      [[ax, ay], [bx, by]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawWall(w) {
      const { ctx } = this;
      if (w.path) {
        this.drawPath(w.path);
      }
      const b = this.rectPx(w);
      if (w.sw) {
        const edge = w.sw === 'off' ? COLORS.swOffEdge : COLORS.swOnEdge;
        if (w.active) {
          ctx.fillStyle = w.sw === 'off' ? COLORS.swOff : COLORS.swOn;
          ctx.fillRect(b.x, b.y, b.w, b.h);
          ctx.strokeStyle = edge;
          ctx.lineWidth = 2;
          ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        } else {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = edge;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        return;
      }
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.wallEdge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
    }

    drawHazard(h) {
      const { ctx } = this;
      if (h.path) {
        this.drawPath(h.path);
      }
      const b = this.rectPx(h);
      ctx.fillStyle = COLORS.hazard;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      const n = Math.max(2, Math.round(b.w / 12));
      const sw = b.w / n;
      ctx.fillStyle = COLORS.hazardEdge;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x0 = b.x + i * sw;
        ctx.moveTo(x0, b.y);
        ctx.lineTo(x0 + sw / 2, b.y - 8);
        ctx.lineTo(x0 + sw, b.y);
        ctx.closePath();
      }
      ctx.fill();
    }

    drawSpring(s) {
      const { ctx } = this;
      const b = this.rectPx(s);
      ctx.fillStyle = COLORS.spring;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.springEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      const n = Math.max(3, Math.round(b.w / 8));
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = b.x + (b.w * i) / n;
        const y = b.y + (i % 2 ? b.h * 0.75 : b.h * 0.25);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      const dirs = PH().SPRING_DIRS;
      const d = dirs[s.d] || dirs.u;
      const len = Math.max(14, this.ux(1));
      this.arrow(b.x + b.w / 2, b.y - len * 0.7, d[0], -d[1], len, COLORS.springEdge, 2.5);
    }

    drawWind(w) {
      const { ctx } = this;
      const b = this.rectPx(w);
      ctx.fillStyle = COLORS.wind;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = COLORS.windEdge;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      ctx.setLineDash([]);
      const fx = w.fx || 0;
      const fy = w.fy || 0;
      const n = Math.hypot(fx, fy) || 1;
      const len = Math.max(10, this.ux(0.9));
      for (let x = w.x1 + 1; x < w.x2; x += 2) {
        for (let y = w.y1 + 1; y < w.y2; y += 2) {
          this.arrow(this.sx(x), this.sy(y), fx / n, -fy / n, len, COLORS.windEdge, 1.5);
        }
      }
    }

    drawWarp(w, i) {
      const { ctx } = this;
      const rr = Math.max(6, this.ux(PH().C.warpR));
      const a = { x: this.sx(w.ax), y: this.sy(w.ay) };
      const b = { x: this.sx(w.bx), y: this.sy(w.by) };
      ctx.strokeStyle = COLORS.warpLine;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      [a, b].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.warp;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = COLORS.warpEdge;
        ctx.stroke();
        ctx.fillStyle = COLORS.warpEdge;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p.x, p.y);
      });
    }

    drawSwitch(s, on) {
      const { ctx } = this;
      const x = this.sx(s.x);
      const y = this.sy(s.y);
      const rr = Math.max(6, this.ux(PH().C.switchR));
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = on ? COLORS.swOn : COLORS.swOff;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = on ? COLORS.swOnEdge : COLORS.swOffEdge;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(on ? 'ON' : 'OFF', x, y);
    }

    drawCoin(c) {
      const { ctx } = this;
      const x = this.sx(c.x);
      const y = this.sy(c.y);
      const rr = Math.max(5, this.ux(PH().C.coinR));
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.coin;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.coinEdge;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, rr * 0.55, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    drawBall(ball) {
      const { ctx, view } = this;
      const px = this.sx(ball.x);
      const py = this.sy(ball.y);
      const pr = Math.max(3, (ball.r / (view.xmax - view.xmin)) * this.w);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ball;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.ballEdge;
      ctx.stroke();
    }

    drawTrail(trail) {
      if (!trail || trail.length < 2) {
        return;
      }
      const { ctx } = this;
      ctx.strokeStyle = COLORS.trail;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      trail.forEach((p, i) => {
        const x = this.sx(p.x);
        const y = this.sy(p.y);
        // ワープで大きく飛んだ所は線をつながない
        if (i === 0 || Math.hypot(p.x - trail[i - 1].x, p.y - trail[i - 1].y) > 2) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawSceneFront(scene) {
      const { ctx } = this;
      if (scene.range) {
        const y = this.sy(scene.range.y);
        const x1 = this.sx(scene.range.x1);
        const x2 = this.sx(scene.range.x2);
        ctx.strokeStyle = COLORS.range;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.setLineDash([]);
        [x1, x2].forEach((x) => {
          ctx.beginPath();
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x, y + 7);
          ctx.stroke();
        });
      }
      if (scene.preview && scene.preview.rect) {
        const b = this.rectPx(scene.preview.rect);
        const color =
          {
            goal: COLORS.goalEdge,
            wall: COLORS.wallEdge,
            hazard: COLORS.hazardEdge,
            swblock: COLORS.swOffEdge,
            spring: COLORS.springEdge,
            wind: COLORS.windEdge
          }[scene.preview.kind] || COLORS.label;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
      }
      if (scene.pending) {
        const x = this.sx(scene.pending.x);
        const y = this.sy(scene.pending.y);
        ctx.strokeStyle = COLORS.warpEdge;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, this.ux(PH().C.warpR)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.warpEdge;
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y);
      }
      if (scene.marker) {
        const x = this.sx(scene.marker.x);
        const y = this.sy(scene.marker.y);
        const s = 8;
        ctx.strokeStyle = COLORS.hazardEdge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - s, y - s);
        ctx.lineTo(x + s, y + s);
        ctx.moveTo(x + s, y - s);
        ctx.lineTo(x - s, y + s);
        ctx.stroke();
      }
      if (scene.ball) {
        this.drawBall(scene.ball);
      }
      if (scene.cursor) {
        const x = this.sx(scene.cursor.x);
        const y = this.sy(scene.cursor.y);
        ctx.strokeStyle = COLORS.cursor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 10, y);
        ctx.lineTo(x - 3, y);
        ctx.moveTo(x + 3, y);
        ctx.lineTo(x + 10, y);
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x, y - 3);
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x, y + 10);
        ctx.stroke();
      }
    }
  }

  global.GMGraph = { GraphRenderer };
})(window);