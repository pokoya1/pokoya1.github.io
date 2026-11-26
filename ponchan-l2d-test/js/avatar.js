"use strict";
/*
 * PonchanAvatar — ポーンちゃん L2D風アバターコンポーネント (Muse E-02 派生版)
 *
 * v0.4 (Pawn_C03_v04) の描画契約・制御契約を継承し、描画と状態制御を分離した再利用可能構造。
 * - MotionClock : 待機/発話のパラメータ生成（純粋な状態制御。描画を知らない）
 * - ExpressionController : 表情プリセットと0.48秒補間、口形の排他的切替
 * - Renderer : Canvas 2D 描画のみ（状態を知らない。パラメータを受け取って描く）
 * - PonchanAvatar : 統合と公開API
 *
 * 素材は assets/parts/*.png（全1024×1024・共通座標）を manifest.json の契約で読み込む。
 * 元素材は一切再描画・再エンコードしていない。
 *
 * 補正 (fixes) はすべて描画側の局所処理で、ON/OFF可能。全部OFFで v0.4 と同一描画になる。
 *   irisOcclusion : 半目時、虹彩を弱い圧縮＋白目(まぶた)形状で遮蔽し、虹彩の縦潰れを抑える
 *   neckFeather   : 首レイヤー下端をグラデーションで透過し、襟との色境界を柔らかくする
 *   browBoost     : 眉の上下・回転量を1.5倍にし、表情差を読みやすくする（通常 brow=0 では無影響）
 *   mouthCrossfade: 開口差分の段階切替を前後フレームのクロスフェードで滑らかにする
 *   hairLag       : 髪の目標値に一次遅れを与え、呼吸・首への追随を自然にする（静止画無影響）
 */

const AVATAR_KEYS = ["blink", "gaze", "breath", "hair", "tilt", "mouth", "brow"];
const DRAW_ORDER = [0, 1, 2, 4, 3, 6, 5, 11, 12, 8, 7, 13, 9, 10, 14, 15, 18, 19, 16, 17, 20, 21];
const HEAD_SET = new Set([0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
const UPPER_SET = new Set([0, 1, 2, 5, 6, ...HEAD_SET]);
// eye part index -> [anchorX, anchorY, eyewhiteIndex, closedLidIndex]  (v0.4準拠)
const EYE_MAP = {
  14: [484, 114, 14, 22], 18: [484, 114, 14, 22], 16: [484, 114, 14, 22],
  15: [535, 110, 15, 23], 19: [535, 110, 15, 23], 17: [535, 110, 15, 23],
};
const EXPRESSIONS = {
  neutral:   { mouth: 0,    brow: 0,    blink: 0,    shape: 0 },
  happy:     { mouth: 0.55, brow: 0.35, blink: 0.12, shape: 0 },
  concerned: { mouth: 0,    brow: -0.8, blink: 0.13, shape: 1 },
  surprised: { mouth: 0.8,  brow: 0.85, blink: 0,    shape: 2 },
  relaxed:   { mouth: 0,    brow: 0.12, blink: 1,    shape: 0 },
  // D-05 正式統合（ユーザー美術承認済み・案A）
  joy:       { mouth: 0, brow: 0.50, blink: 0, shape: 0, closedMouth: 33, cheek: 37 },
  excited:   { mouth: 0, brow: 0.65, blink: 0, shape: 0, closedMouth: 34, cheek: 38, smileEyes: [35, 36] },
};
function extrasOf(name) {
  const p = EXPRESSIONS[name] || {};
  return { closedMouth: p.closedMouth ?? null, cheek: p.cheek ?? null, smileEyes: p.smileEyes ?? null };
}
const DEFAULT_FIXES = { irisOcclusion: true, neckFeather: true, browBoost: true, mouthCrossfade: true, hairLag: true };

function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
function lerp(a, b, u) { return a + (b - a) * u; }
function zeroParams() { return Object.fromEntries(AVATAR_KEYS.map((k) => [k, 0])); }
function seededRng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296; }; }

/* ---------------- MotionClock: v0.4 advance() の忠実移植 ---------------- */
class MotionClock {
  constructor(rng) {
    const rand = (a, b) => lerp(a, b, rng());
    this.rng = rng;
    this.t = 0;
    this.blinkAt = rand(1.4, 3.8); this.blinkStart = undefined;
    this.blinkClose = 0; this.blinkHold = 0; this.blinkOpen = 0;
    this.gazeAt = rand(0.9, 2.2); this.gazeStart = 0; this.gazeEnd = 0; this.gazeFrom = 0; this.gazeTo = 0; this.gaze = 0;
    this.tiltAt = rand(1.5, 3.0); this.tiltStart = 0; this.tiltEnd = 0; this.tiltFrom = 0; this.tiltTo = 0; this.tilt = 0;
    this.talkAt = 0.25; this.talkStart = 0; this.talkEnd = 0; this.talkPeak = 0; this.talkCount = 0;
    this.blinkTimes = []; this.gazeTimes = []; this.talkTimes = [];
    this.breathPhase = 0;
    this.hairLagValue = 0;
  }
  advance(dt, useHairLag = false) {
    const rand = (a, b) => lerp(a, b, this.rng());
    const t = (this.t += clamp(dt, 0, 0.1)), r = this.rng;
    if (t >= this.blinkAt) {
      this.blinkTimes.push(t); if (this.blinkTimes.length > 4096) this.blinkTimes.shift();
      this.blinkClose = rand(0.075, 0.115); this.blinkHold = rand(0.035, 0.065); this.blinkOpen = rand(0.11, 0.18);
      this.blinkStart = t; this.blinkAt = t + rand(2.4, 6.2);
    }
    let b = 0;
    if (this.blinkStart !== undefined) {
      const d = t - this.blinkStart;
      if (d < this.blinkClose) b = smooth(d / this.blinkClose);
      else if (d < this.blinkClose + this.blinkHold) b = 1;
      else b = 1 - smooth((d - this.blinkClose - this.blinkHold) / this.blinkOpen);
    }
    if (t >= this.gazeAt) {
      this.gazeTimes.push(t); if (this.gazeTimes.length > 4096) this.gazeTimes.shift();
      this.gazeFrom = this.gaze; this.gazeTo = rand(-0.78, 0.78);
      this.gazeStart = t; this.gazeEnd = t + rand(0.17, 0.32); this.gazeAt = t + rand(1.25, 4.5);
    }
    this.gaze = lerp(this.gazeFrom, this.gazeTo, smooth((t - this.gazeStart) / Math.max(0.01, this.gazeEnd - this.gazeStart)));
    if (t >= this.tiltAt) {
      this.tiltFrom = this.tilt; this.tiltTo = rand(-0.6, 0.6);
      this.tiltStart = t; this.tiltEnd = t + rand(1.0, 1.9); this.tiltAt = t + rand(2.8, 6.4);
    }
    this.tilt = lerp(this.tiltFrom, this.tiltTo, smooth((t - this.tiltStart) / Math.max(0.01, this.tiltEnd - this.tiltStart)));
    if (t >= this.talkAt) {
      this.talkTimes.push(t); if (this.talkTimes.length > 4096) this.talkTimes.shift();
      this.talkStart = t;
      const dur = rand(0.16, 0.31);
      this.talkEnd = t + dur; this.talkPeak = rand(0.28, 0.87); this.talkCount++;
      this.talkAt = this.talkEnd + (this.talkCount % 5 === 0 ? rand(0.35, 0.72) : rand(0.015, 0.09));
    }
    const u = clamp((t - this.talkStart) / Math.max(0.01, this.talkEnd - this.talkStart), 0, 1);
    const m = this.talkPeak * Math.sin(Math.PI * u) ** 2;
    this.breathPhase += dt * (2 * Math.PI / (4.7 + 0.35 * Math.sin(t * 0.17)));
    const breath = 0.72 * Math.sin(this.breathPhase);
    let hair = clamp(0.36 * Math.sin(this.breathPhase - 0.62) + 0.19 * this.tilt + 0.11 * Math.sin(t * 0.77), -1, 1);
    if (useHairLag) {
      // 一次遅れ（時定数0.28秒）で髪だけ追随を遅らせ、揺れの余韻を作る
      const k = 1 - Math.exp(-clamp(dt, 0, 0.1) / 0.28);
      this.hairLagValue += (hair - this.hairLagValue) * k;
      hair = this.hairLagValue;
    } else {
      this.hairLagValue = hair;
    }
    return { blink: b, gaze: this.gaze, tilt: this.tilt, breath, hair, mouth: m, brow: 0 };
  }
  /* 数値試験用: v0.4 testSim と同じ決定的シミュレーション */
  static simulate(seed, seconds, useHairLag = false) {
    const c = new MotionClock(seededRng(seed));
    const bounds = {}, peaks = { blink: 0, mouth: 0 };
    let invalid = 0;
    for (let i = 0; i < seconds * 60; i++) {
      const v = c.advance(1 / 60, useHairLag);
      for (const k of AVATAR_KEYS) {
        const n = v[k];
        if (!Number.isFinite(n) || n < (k === "blink" || k === "mouth" ? 0 : -1) || n > 1) invalid++;
        if (!bounds[k]) bounds[k] = [n, n];
        bounds[k] = [Math.min(bounds[k][0], n), Math.max(bounds[k][1], n)];
      }
      peaks.blink = Math.max(peaks.blink, v.blink);
      peaks.mouth = Math.max(peaks.mouth, v.mouth);
    }
    return { seconds, invalid, bounds, peaks, blinkTimes: c.blinkTimes, gazeTimes: c.gazeTimes, talkTimes: c.talkTimes };
  }
}

/* ---------------- ExpressionController: v0.4 の表情遷移の移植 ---------------- */
class ExpressionController {
  constructor() {
    this.name = "neutral";
    this.base = { ...EXPRESSIONS.neutral };
    this.trans = null;
    this.extra = extrasOf("neutral");
  }
  select(name, currentParams, shape) {
    if (!EXPRESSIONS[name]) throw new Error("unknown expression: " + name);
    this.name = name;
    const target = { ...EXPRESSIONS[name] };
    let from;
    if (currentParams) from = { mouth: currentParams.mouth, brow: currentParams.brow, blink: currentParams.blink, shape };
    else from = { ...this.base };
    this.trans = { from, to: target, elapsed: 0, fromExtra: this.extra, toExtra: extrasOf(name) };
  }
  update(dt) {
    if (!this.trans) return false;
    const tr = this.trans;
    tr.elapsed += dt;
    const u = clamp(tr.elapsed / 0.48, 0, 1), e = smooth(u), a = tr.from, b = tr.to;
    let mouth = lerp(a.mouth, b.mouth, e), sh = a.shape;
    if (a.shape !== b.shape) {
      if (u < 0.5) mouth = lerp(a.mouth, 0, smooth(u * 2));
      else { sh = b.shape; mouth = lerp(0, b.mouth, smooth((u - 0.5) * 2)); }
    }
    this.base = { mouth, brow: lerp(a.brow, b.brow, e), blink: lerp(a.blink, b.blink, e), shape: sh };
    const fe = tr.fromExtra, te = tr.toExtra, pick = u < 0.5 ? fe : te;
    this.extra = {
      closedMouth: pick.closedMouth,
      smileEyes: pick.smileEyes,
      cheeks: fe.cheek === te.cheek
        ? (te.cheek != null ? [{ index: te.cheek, alpha: 1 }] : [])
        : [
            ...(fe.cheek != null ? [{ index: fe.cheek, alpha: 1 - e }] : []),
            ...(te.cheek != null ? [{ index: te.cheek, alpha: e }] : []),
          ],
    };
    if (u >= 1) { this.base = { ...b }; this.extra = { ...te, cheeks: te.cheek != null ? [{ index: te.cheek, alpha: 1 }] : [] }; this.trans = null; }
    return true;
  }
  currentExtras() {
    if (this.trans) return this.extra;
    const e = extrasOf(this.name);
    return { closedMouth: e.closedMouth, smileEyes: e.smileEyes, cheeks: e.cheek != null ? [{ index: e.cheek, alpha: 1 }] : [] };
  }
  reset() { this.name = "neutral"; this.base = { ...EXPRESSIONS.neutral }; this.trans = null; this.extra = extrasOf("neutral"); }
  get shape() { return this.base.shape; }
  get transitioning() { return !!this.trans; }
}

/* ---------------- Renderer: v0.4 render() の忠実移植 + 補正 ---------------- */
class Renderer {
  constructor(canvas, parts, fixes) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.parts = parts; // index -> {img: bboxでトリムしたオフスクリーンCanvas, x, y}
    this.fixes = fixes;
    this.scratch = document.createElement("canvas");
    this.scratch.width = this.scratch.height = 1024;
    this.sc = this.scratch.getContext("2d");
    this.frames = 0;
  }
  pivot(x, y, rot, sy = 1) {
    const c = this.ctx;
    c.translate(x, y); c.rotate(rot); c.scale(1, sy); c.translate(-x, -y);
  }
  static pivotOn(c, x, y, rot, sy = 1) { c.translate(x, y); c.rotate(rot); c.scale(1, sy); c.translate(-x, -y); }
  drawPart(i, dx = 0) { const p = this.parts[i]; if (!p) return; this.ctx.drawImage(p.img, p.x + dx, p.y); }
  drawPartOn(c, i, dx = 0) { const p = this.parts[i]; if (!p) return; c.drawImage(p.img, p.x + dx, p.y); }

  render(v, shape, zoom = false, extras = null) {
    const { ctx, sc } = this;
    const b = clamp(v.blink, 0, 1);
    const closed = smooth((b - 0.68) / 0.28);
    const scale = Math.max(0.035, 1 - b * 0.965);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.save();
    if (zoom) { ctx.scale(4, 4); ctx.translate(-384, -2); }
    for (const i of DRAW_ORDER) {
      ctx.save();
      if (UPPER_SET.has(i)) this.pivot(512, 410, 0, 1 + v.breath * 0.004);
      if (HEAD_SET.has(i)) this.pivot(512, 159, v.tilt * 2.5 * Math.PI / 180);
      if (i === 20 || i === 21) this.pivot(512, 32, v.hair * Math.PI / 180);
      if (i === 0) this.pivot(512, 32, v.hair * 0.55 * Math.PI / 180);
      if (i === 7 || i === 13) {
        const gain = this.fixes.browBoost ? 1.5 : 1;
        const bx = i === 7 ? 479 : 532, by = i === 7 ? 88 : 83;
        ctx.translate(0, -(v.brow || 0) * 2.2 * gain);
        this.pivot(bx, by, (i === 7 ? -1 : 1) * (v.brow || 0) * 5 * gain * Math.PI / 180);
      }
      if (i === 5 && this.fixes.neckFeather) { this.drawNeckFeathered(); ctx.restore(); continue; }
      if (i === 10) { this.drawMouth(v, shape, extras); ctx.restore(); continue; }
      if (extras && extras.smileEyes && (i === 14 || i === 15 || i === 18 || i === 19)) { ctx.restore(); continue; }
      if (extras && extras.smileEyes && (i === 16 || i === 17)) {
        this.drawPart(extras.smileEyes[i === 16 ? 0 : 1]);
        ctx.restore(); continue;
      }
      const e = EYE_MAP[i];
      if (e) {
        if (i === 16 || i === 17) {
          if (closed > 0) { ctx.save(); ctx.globalAlpha = closed; this.drawPart(e[3]); ctx.restore(); }
        }
        if (closed >= 1) { ctx.restore(); continue; }
        // 虹彩の遮蔽補正: 半目時のみ、虹彩を弱圧縮で描き白目形状でクリップする
        if (this.fixes.irisOcclusion && (i === 18 || i === 19) && b > 0.001 && closed < 1) {
          this.drawIrisOccluded(i, e, v, scale, closed);
          ctx.restore(); continue;
        }
        ctx.globalAlpha = 1 - closed;
        this.pivot(e[0], e[1], 0, scale);
        if ((i === 18 || i === 19) && v.gaze !== 0) {
          sc.setTransform(1, 0, 0, 1, 0, 0);
          sc.clearRect(0, 0, 1024, 1024);
          sc.globalCompositeOperation = "source-over";
          sc.globalAlpha = 1;
          this.drawPartOn(sc, i, v.gaze * 2);
          sc.globalCompositeOperation = "destination-in";
          this.drawPartOn(sc, e[2]);
          sc.globalCompositeOperation = "source-over";
          ctx.drawImage(this.scratch, 0, 0);
        } else {
          this.drawPart(i);
        }
      } else {
        this.drawPart(i);
      }
      if (i === 8 && extras && extras.cheeks) {
        for (const ch of extras.cheeks) {
          if (ch.alpha > 0.003) { ctx.save(); ctx.globalAlpha = ch.alpha; this.drawPart(ch.index); ctx.restore(); }
        }
      }
      ctx.restore();
    }
    ctx.restore();
    this.frames++;
  }

  drawNeckFeathered() {
    const { ctx, sc } = this;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, 1024, 1024);
    sc.globalCompositeOperation = "source-over";
    sc.globalAlpha = 1;
    this.drawPartOn(sc, 5);
    // 首下端 (bbox y=125..191) の最下部14pxを徐々に透過させ、下の襟と馴染ませる
    sc.globalCompositeOperation = "destination-out";
    const g = sc.createLinearGradient(0, 177, 0, 191);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    sc.fillStyle = g;
    sc.fillRect(480, 177, 70, 14);
    sc.globalCompositeOperation = "source-over";
    ctx.drawImage(this.scratch, 0, 0);
  }

  drawIrisOccluded(i, e, v, scale, closed) {
    const { ctx, sc } = this;
    const irisScale = Math.max(0.18, Math.pow(scale, 0.45));
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, 1024, 1024);
    sc.globalCompositeOperation = "source-over";
    sc.globalAlpha = 1;
    sc.save();
    Renderer.pivotOn(sc, e[0], e[1], 0, irisScale);
    this.drawPartOn(sc, i, v.gaze * 2);
    sc.restore();
    sc.globalCompositeOperation = "destination-in";
    sc.save();
    Renderer.pivotOn(sc, e[0], e[1], 0, scale);
    this.drawPartOn(sc, e[2]);
    sc.restore();
    sc.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1 - closed;
    ctx.drawImage(this.scratch, 0, 0);
  }

  drawMouth(v, shape, extras = null) {
    const { ctx } = this;
    const sh = v.shape ?? shape;
    const op = clamp(v.mouth || 0, 0, 1);
    const closedIdx = extras && extras.closedMouth != null ? extras.closedMouth : 10;
    if (sh === 1) { this.drawPart(31); return; }
    if (sh === 2) {
      this.pivot(511, 141, 0, Math.max(0.18, op));
      this.drawPart(32);
      return;
    }
    if (op < 0.10) { this.drawPart(closedIdx); return; }
    if (!this.fixes.mouthCrossfade) {
      const mi = 24 + Math.max(0, Math.min(6, Math.round((op - 0.18) / 0.82 * 6)));
      this.drawPart(mi);
      return;
    }
    // クロスフェード: 閉口→初段、および隣接フレーム間を補間
    if (op < 0.18) {
      const t = smooth((op - 0.10) / 0.08);
      if (closedIdx !== 10) { ctx.globalAlpha = 1 - t; this.drawPart(closedIdx); ctx.globalAlpha = t; this.drawPart(24); ctx.globalAlpha = 1; return; }
      ctx.globalAlpha = 1 - t; this.drawPart(10);
      ctx.globalAlpha = t; this.drawPart(24);
      ctx.globalAlpha = 1;
      return;
    }
    const p = clamp((op - 0.18) / 0.82 * 6, 0, 6);
    const idx = Math.floor(p), frac = p - idx;
    this.drawPart(24 + idx);
    if (frac > 0.01 && idx < 6) {
      ctx.globalAlpha = frac;
      this.drawPart(24 + idx + 1);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- PonchanAvatar: 統合と公開API ---------------- */
class PonchanAvatar {
  constructor(canvas, options = {}) {
    if (!canvas) throw new Error("canvas is required");
    this.canvas = canvas;
    this.basePath = options.basePath || "assets/";
    this.options = options;
    this.fixes = { ...DEFAULT_FIXES, ...(options.fixes || {}) };
    this.onStatus = options.onStatus || (() => {});
    this.onExpression = options.onExpression || (() => {});
    this._random = null; // {names:[...], minS, maxS, elapsed, nextIn}
    this._excitedTimer = null; // 大喜び→喜び 自動復帰の経過秒（nullで無効）
    this.state = zeroParams();
    this.shape = 0;
    this.playing = false;
    this.mode = "idle";
    this.zoom = false;
    this.ready = false;
    this.destroyed = false;
    this.hidden = document.hidden;
    this.clock = new MotionClock(options.rng || Math.random);
    this.expression = new ExpressionController();
    this.motionGain = 0; this.talkGain = 0;
    this.entryState = zeroParams();
    this.last = 0; this.uiAt = 0;
    this.rafId = 0;
    this.renderer = null;
    this._tick = this._tick.bind(this);
    this._onVisibility = () => { this.hidden = document.hidden; this.last = 0; };
    document.addEventListener("visibilitychange", this._onVisibility);
    this._fpsWindow = [];
  }

  async load() {
    // 埋め込みモード (options.embedded = {manifest, parts: [dataURL,...]}) では通信なしで読み込む。
    // 単一ファイルの試作用。分離ファイル方式が正式形態。
    if (this.options.embedded) {
      this.manifest = this.options.embedded.manifest;
      const layers = this.manifest.layers;
      const images = await Promise.all(layers.map((l, idx) => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("failed to load embedded " + l.file));
        img.src = this.options.embedded.parts[idx];
      })));
      return this._finishLoad(images, layers, true);
    }
    const manifest = await (await fetch(this.basePath + "manifest.json?v=20261127d")).json();
    this.manifest = manifest;
    const layers = manifest.layers;
    const images = await Promise.all(layers.map((l) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("failed to load " + l.file));
      img.src = this.basePath + "parts/" + encodeURIComponent(l.file);
    })));
    return this._finishLoad(images, layers);
  }

  _finishLoad(images, layers, preTrimmed = false) {
    this.images = images;
    // 描画負荷軽減: manifestのbboxでトリムしたオフスクリーンを作り、元座標へ描く (v0.4検証HTMLと同じ方式)
    // ディスク上の素材PNGはフルサイズのまま無変更。トリムはピクセルの切り取りのみで再描画ではない。
    const parts = layers.map((l, idx) => {
      const [x1, y1, x2, y2] = l.bbox;
      const c = document.createElement("canvas");
      if (preTrimmed) {
        // 埋め込みモード: 読み込んだ画像が既にbboxサイズなので、そのまま使う
        c.width = images[idx].naturalWidth; c.height = images[idx].naturalHeight;
        c.getContext("2d").drawImage(images[idx], 0, 0);
      } else {
        c.width = Math.max(1, x2 - x1); c.height = Math.max(1, y2 - y1);
        c.getContext("2d").drawImage(images[idx], -x1, -y1);
      }
      return { img: c, x: x1, y: y1 };
    });
    this.parts = parts;
    this.renderer = new Renderer(this.canvas, parts, this.fixes);
    this.ready = true;
    this.renderOnce();
    this.rafId = requestAnimationFrame(this._tick);
    this.onStatus("ready");
    return this;
  }

  renderOnce() {
    if (!this.ready || this.destroyed) return;
    this.renderer.render(this.state, this.shape, this.zoom, this.expression.currentExtras());
  }

  setFixes(fixes) {
    Object.assign(this.fixes, fixes);
    if (this.renderer) this.renderer.fixes = this.fixes;
    this.renderOnce();
  }
  setZoom(z) { this.zoom = !!z; this.renderOnce(); }

  setExpression(name, internal = false) {
    if (!internal) this.stopRandomExpressions();
    this._excitedTimer = name === "excited" ? 0 : null;
    this.expression.select(name, this.playing || this.expression.transitioning ? null : this.state, this.shape);
    this.onStatus("expression:" + name);
    this.onExpression(name);
  }

  /* ランダム表情切替: 指定した表情リストから、minS〜maxS秒のランダム間隔でランダムに選んで切り替える。
     待機中・発話中・停止中のいずれでも動く。手動の表情変更や stopRandomExpressions() で終了する。 */
  startRandomExpressions(names, minS = 3.5, maxS = 8) {
    const list = (names || []).filter((n) => EXPRESSIONS[n]);
    if (!list.length) throw new Error("no valid expressions");
    this._random = { names: list, minS, maxS, elapsed: 0, nextIn: minS + Math.random() * (maxS - minS) };
    this.onStatus("random:start");
    return this._random;
  }
  stopRandomExpressions() {
    if (this._random) { this._random = null; this.onStatus("random:stop"); }
  }
  get randomActive() { return !!this._random; }
  getExpression() { return this.expression.name; }

  setMode(mode) {
    if (mode !== "idle" && mode !== "talk") throw new Error("unknown mode: " + mode);
    if ((this.expression.name === "concerned" || this.expression.name === "surprised" || this.expression.name === "relaxed") && mode === "talk") {
      this.expression.select("neutral", null, this.shape);
    }
    this.start(mode);
  }
  start(mode = "idle") {
    if (!this.ready || this.destroyed) return;
    if (!this.playing) {
      this.motionGain = 0;
      this.entryState = { ...this.state };
      this.clock = new MotionClock(this.options.rng || Math.random);
      this.last = 0;
      this.talkGain = 0;
    }
    this.mode = mode;
    this.playing = true;
    this.onStatus(mode === "talk" ? "talk" : "idle");
  }
  stop() {
    this._excitedTimer = null;
    this.stopRandomExpressions();
    this.playing = false;
    this.expression.trans = null;
    this.onStatus("stopped");
  }
  reset() {
    this.stop();
    this.shape = 0;
    this.expression.reset();
    this.state = zeroParams();
    this.renderOnce();
    this.onStatus("reset");
  }
  setParameters(values) {
    this.stop();
    for (const k of AVATAR_KEYS) {
      if (values[k] !== undefined) {
        const lo = (k === "blink" || k === "mouth") ? 0 : -1;
        this.state[k] = clamp(Number(values[k]) || 0, lo, 1);
      }
    }
    if (values.shape !== undefined) this.shape = values.shape;
    this.expression.base = { mouth: this.state.mouth, brow: this.state.brow, blink: this.state.blink, shape: this.shape };
    this.renderOnce();
  }
  getParameters() { return { ...this.state, shape: this.shape }; }
  getStats() {
    const now = performance.now();
    this._fpsWindow = this._fpsWindow.filter((t) => now - t < 2000);
    const fps = this._fpsWindow.length >= 2
      ? (this._fpsWindow.length - 1) / ((this._fpsWindow[this._fpsWindow.length - 1] - this._fpsWindow[0]) / 1000)
      : 0;
    return {
      ready: this.ready, destroyed: this.destroyed, playing: this.playing, mode: this.mode,
      expression: this.expression.name, transitioning: this.expression.transitioning,
      random: this._random ? { names: [...this._random.names], nextIn: this._random.nextIn } : null,
      frames: this.renderer ? this.renderer.frames : 0, fps: Math.round(fps * 10) / 10,
      clockTime: this.clock.t, blinkCount: this.clock.blinkTimes.length, gazeCount: this.clock.gazeTimes.length,
      params: this.getParameters(),
    };
  }
  destroy() {
    this.destroyed = true;
    this._random = null;
    this._excitedTimer = null;
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this._onVisibility);
    const c = this.canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onStatus("destroyed");
  }

  _tick(t) {
    if (this.destroyed) return;
    const dt = this.last ? clamp((t - this.last) / 1000, 0, 0.1) : 0;
    this.last = t;
    if (this._excitedTimer != null && !this.hidden && dt > 0) {
      this._excitedTimer += dt;
      if (this._excitedTimer >= 3.0) {
        this._excitedTimer = null;
        this.setExpression("joy", true);
      }
    }
    if (this._random && !this.hidden && dt > 0) {
      const r = this._random;
      r.elapsed += dt;
      if (r.elapsed >= r.nextIn) {
        r.elapsed = 0;
        r.nextIn = r.minS + Math.random() * (r.maxS - r.minS);
        const name = r.names[Math.floor(Math.random() * r.names.length)];
        this.setExpression(name, true);
      }
    }
    if (this.ready && !this.hidden && (this.playing || this.expression.transitioning)) {
      const wasTransitioning = this.expression.transitioning;
      this.expression.update(dt);
      const base = this.expression.base;
      if (this.playing) {
        this.motionGain = clamp(this.motionGain + dt * 2, 0, 1);
        const m = this.clock.advance(dt, this.fixes.hairLag);
        const gain = smooth(this.motionGain);
        this.talkGain = clamp(this.talkGain + dt * (this.mode === "talk" ? 4 : -4), 0, 1);
        const mouth = base.shape === 0
          ? lerp(base.mouth, Math.max(base.mouth * 0.35, m.mouth), smooth(this.talkGain))
          : base.mouth;
        const e = this.entryState;
        this.state = {
          blink: lerp(e.blink, Math.max(base.blink, m.blink), gain),
          gaze: lerp(e.gaze, m.gaze, gain),
          breath: lerp(e.breath, m.breath, gain),
          hair: lerp(e.hair, m.hair, gain),
          tilt: lerp(e.tilt, m.tilt, gain),
          mouth: lerp(e.mouth, mouth, gain),
          brow: lerp(e.brow, base.brow, gain),
        };
      } else {
        this.state = { ...this.state, blink: base.blink, brow: base.brow, mouth: base.mouth };
      }
      this.shape = base.shape;
      this.renderOnce();
      this._fpsWindow.push(t);
      if (wasTransitioning && !this.expression.transitioning) this.onStatus(this.playing ? this.mode : "expression-set");
    }
    this.rafId = requestAnimationFrame(this._tick);
  }
}

window.PonchanAvatar = PonchanAvatar;
window.PonchanMotionClock = MotionClock;
window.PONCHAN_EXPRESSIONS = Object.keys(EXPRESSIONS);
window.PONCHAN_DEFAULT_FIXES = { ...DEFAULT_FIXES };
