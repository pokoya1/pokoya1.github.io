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
  // D-05 正式統合（案A）。大喜びはユーザーの違和感により一旦外した（2026-11-27）。
  // 喜びの頬は元画像の肌に寄せた柔らかい版（52_cheek-joy-soft）に差し替え。
  joy:       { mouth: 0, brow: 0.30, blink: 0.15, shape: 0, closedMouth: 33, cheek: 34 },
};
function extrasOf(name) {
  const p = EXPRESSIONS[name] || {};
  return { closedMouth: p.closedMouth ?? null, cheek: p.cheek ?? null, smileEyes: p.smileEyes ?? null };
}
const DEFAULT_FIXES = { irisOcclusion: true, neckFeather: true, browBoost: true, mouthCrossfade: true, hairLag: true };

function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
// Monotone Hermite timing: continuous velocity at interior knots, zero at ends.
function gestureEase(x, knots) {
  x=clamp(x,0,1); if(!knots||x===0||x===1)return x;
  const slopes=knots.slice(1).map((v,i)=>(v[1]-knots[i][1])/(v[0]-knots[i][0]));
  const tangent=i=>i===0||i===knots.length-1?0:2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]);
  let i=0;while(i<knots.length-2&&x>knots[i+1][0])i++;
  const [a,y0]=knots[i],[b,y1]=knots[i+1],h=b-a,t=(x-a)/h,t2=t*t,t3=t2*t;
  return clamp((2*t3-3*t2+1)*y0+(t3-2*t2+t)*h*tangent(i)+(-2*t3+3*t2)*y1+(t3-t2)*h*tangent(i+1),y0,y1);
}
function lerp(a, b, u) { return a + (b - a) * u; }
function zeroParams() { return Object.fromEntries(AVATAR_KEYS.map((k) => [k, 0])); }
function seededRng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296; }; }

// 09a: one bounded spring per channel, fixed maximum integration step.
class SecondaryMotion {
  constructor(cfg){this.cfg=cfg;this.reset();}
  reset(){this.channels={};for(const key of Object.keys(this.cfg.channels))this.channels[key]={x:0,v:0};this.previous=null;}
  step(dt,input){
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,this.cfg.maxDt);const prev=this.previous||input;this.previous={...input};
    const travel=input.active&&prev.active?clamp((input.progress-prev.progress)/dt/2.5,-1,1):0;
    const wrist=input.active&&prev.active?clamp((input.wrist-prev.wrist)/dt/140,-1,1):0;
    const head=input.active&&prev.active?clamp((input.tilt-prev.tilt)/dt/2,-1,1):0;
    const targets={body:clamp(-.24*travel+.05*wrist,-.34,.34),hair:clamp(.46*travel+.20*head-.09*wrist,-.65,.65),sleeve:clamp(-.30*travel+.14*wrist,-.42,.42),cords:clamp(-2.1*travel+.32*wrist+.20*head,-2.4,2.4),ribbon:clamp(-2.9*travel+.38*wrist+.35*head,-3.4,3.4),pendant:clamp(-2.4*travel+.34*wrist+.55*head,-3,3)};
    for(const [key,ch] of Object.entries(this.channels)){
      const c=this.cfg.channels[key],w=2*Math.PI*c.hz,n=Math.ceil(dt/this.cfg.step),h=dt/n;
      for(let i=0;i<n;i++){
        ch.v+=(w*w*(targets[key]-ch.x)-2*c.damping*w*ch.v)*h;
        ch.x+=ch.v*h;
        if(Math.abs(ch.x)>c.limit){ch.x=clamp(ch.x,-c.limit,c.limit);ch.v=0;}
      }
      if(Math.abs(targets[key])<1e-9&&Math.abs(ch.x)<.0005&&Math.abs(ch.v)<.005){ch.x=0;ch.v=0;}
    }
  }
  values(strength=1){return Object.fromEntries(Object.entries(this.channels).map(([k,c])=>[k,c.x*strength]));}
  get moving(){return Object.values(this.channels).some(c=>c.x!==0||c.v!==0);}
}

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

/* D-06: phrase-based silent performance. Not audio synchronization. Independent from idle motion. */
class SpeechPerformance {
  constructor(rng) { this.rng = rng; this.t = 0; this.start = 0; this.phrase = null; this.phraseCount = 0; }
  rand(a,b) { return lerp(a,b,this.rng()); }
  nextPhrase() {
    const syllables = [], n = 3 + Math.floor(this.rng()*3), accent = 1 + Math.floor(this.rng()*(n-1));
    let t = 0;
    for(let i=0;i<n;i++) {
      const dur = this.rand(.32,.56), peak = i===accent ? this.rand(.52,.72) : this.rand(.20,.50);
      syllables.push({at:t,dur,peak}); t+=dur+this.rand(.06,.15);
    }
    const pause=this.rand(.62,1.35), direction=this.rng()<.5?-1:1;
    this.phrase = {syllables, accent, end:t, total:t+pause, direction, sideGaze:this.rand(.25,.65)*direction, blink: this.rng()<.65};
    this.phraseCount++;
  }
  advance(dt) {
    this.t+=clamp(dt,0,.1);
    if (!this.phrase) { this.start=this.t; this.nextPhrase(); }
    if (this.t-this.start>=this.phrase.total) {this.start+=this.phrase.total; this.nextPhrase();}
    const p=this.phrase, t=this.t-this.start, a=p.syllables[p.accent];
    let mouth=0;
    for(const q of p.syllables) if(t>=q.at && t<q.at+q.dur) {
      const u=(t-q.at)/q.dur;
      mouth=q.peak*(u<.33?smooth(u/.33):u<.62?1:1-smooth((u-.62)/.38));
      break;
    }
    // A small, timed head tilt emphasizes a syllable; gaze returns before the next phrase.
    const pulse=(at,dur)=> {const u=(t-at)/dur;return u<=0||u>=1?0:Math.sin(Math.PI*u)**2;};
    const accent=pulse(a.at-.18,a.dur+.65), pause=t>=p.end;
    const glance=pulse(p.end-.28,Math.min(1.1,p.total-p.end+.28));
    const blink=p.blink?pulse(p.end+.08,.25):0;
    return {mouth,tilt: p.direction*.48*accent,brow:.24*accent,gaze:p.sideGaze*glance,blink,breath:.25*pulse(p.end,.6),pause,accent,phrase:this.phraseCount};
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
    this.scratch.width = this.scratch.height = 2048;
    this.sc = this.scratch.getContext("2d");
    this.frames = 0;
    this.faceHD = true; this.faceMap = {}; this.eyeScratch = document.createElement("canvas");
  }
  pivot(x, y, rot, sy = 1) {
    const c = this.ctx;
    c.translate(x, y); c.rotate(rot); c.scale(1, sy); c.translate(-x, -y);
  }
  static pivotOn(c, x, y, rot, sy = 1) { c.translate(x, y); c.rotate(rot); c.scale(1, sy); c.translate(-x, -y); }
  drawPart(i, dx = 0) { const p = this.parts[this.faceHD ? (this.faceMap[i] ?? i) : i]; if (!p) return; this.ctx.drawImage(p.img, p.x + dx, p.y, p.w, p.h); }
  drawPartOn(c, i, dx = 0) { const p = this.parts[this.faceHD ? (this.faceMap[i] ?? i) : i]; if (!p) return; c.drawImage(p.img, p.x + dx, p.y, p.w, p.h); }

  accessoryFrame(key,value){
    const w=this.accessoryConfig?.warps?.[key];if(!w)return null;
    const k=Math.round(clamp((value||0)/w.limit,-1,1)*8)+8;
    const index=w.frames[k];return this.parts[index]?index:w.base;
  }
  drawAccessory(key,value){
    const w=this.accessoryConfig.warps[key],i=this.accessoryFrame(key,value),base=this.parts[w.base];
    if(i===w.base||!this.parts[i]){this.drawPart(w.base);return;}
    const c=this.accessoryScratch||(this.accessoryScratch=document.createElement('canvas'));
    if(c.width!==base.img.width||c.height!==base.img.height){c.width=base.img.width;c.height=base.img.height;}
    const x=c.getContext('2d'),[a,b,d,e]=w.patchPixels;x.clearRect(0,0,c.width,c.height);x.drawImage(base.img,0,0);x.clearRect(a,b,d-a,e-b);x.drawImage(this.parts[i].img,a,b);
    this.ctx.drawImage(c,base.x,base.y,base.w,base.h);
  }
  render(v, shape, zoom = false, extras = null, secondary = null) {
    const { ctx, sc } = this;
    const b = clamp(v.blink, 0, 1);
    const closed = smooth((b - 0.68) / 0.28);
    const scale = Math.max(0.035, 1 - b * 0.965);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.save();
    if (zoom === "face") { ctx.scale(5.1,5.1); ctx.translate(-411.6,-9); } else if (zoom === "gesture") { ctx.scale(1.55, 1.55); ctx.translate(-(512-512/1.55), -3); } else if (zoom === "upper") { ctx.scale(1.85, 1.85); ctx.translate(-235, -3); } else if (zoom) { ctx.scale(3.2, 3.2); ctx.translate(-352, 0); }
    for (const i of DRAW_ORDER) {
      ctx.save();
      if (UPPER_SET.has(i)) {
        if(secondary?.body) this.pivot(512,410,secondary.body*Math.PI/180);
        this.pivot(512, 410, 0, 1 + v.breath * 0.004);
      }
      if (HEAD_SET.has(i)) this.pivot(512, 159, v.tilt * 2.5 * Math.PI / 180);
      if (i === 20 || i === 21) this.pivot(512, 32, v.hair * Math.PI / 180);
      if (i === 0) this.pivot(512, 32, v.hair * 0.55 * Math.PI / 180);
      if (i === 7 || i === 13) {
        const gain = this.fixes.browBoost ? 1.5 : 1;
        const bx = i === 7 ? 479 : 532, by = i === 7 ? 88 : 83;
        ctx.translate(0, -(v.brow || 0) * 2.2 * gain);
        this.pivot(bx, by, (i === 7 ? -1 : 1) * (v.brow || 0) * 5 * gain * Math.PI / 180);
      }
      if (this.costume?.lower !== undefined && (i === 4 || i === 3)) { if(i === 4) this.drawPart(this.costume.lower); ctx.restore(); continue; }
      if (i === 6 && this.parts[43] && this.parts[44]) {
        const accessory=this.accessoriesEnabled&&secondary&&this.accessoryConfig;
        if (this.costume && !this.costume.legacy) {
          this.drawPart(this.costume.neckline);
          const isCardigan=this.costume.body===111;
          if(accessory&&isCardigan)this.drawAccessory('ribbon',secondary.ribbon*this.accessoryStrength);else this.drawPart(this.costume.body);
          if(this.costume.pendant !== undefined){
            if(accessory&&isCardigan)this.drawAccessory('pendant',secondary.pendant*this.accessoryStrength);
            else{ctx.save();this.pivot(512,207,v.hair*.28*Math.PI/180);this.drawPart(this.costume.pendant);ctx.restore();}
          }
        } else { if(accessory)this.drawAccessory('cords',secondary.cords*this.accessoryStrength);else this.drawPart(43);this.drawPart(44); }
        ctx.restore(); continue;
      }
      if ((i === 1 || i === 2) && this.parts[45] && this.parts[46]) {
        const L = i === 1, side = L ? 1 : -1;
        // Sleeve, skin and hand share one shoulder transform, even in intermediate frames.
        if(!L&&secondary?.sleeve) this.pivot(451,214,secondary.sleeve*Math.PI/180);
        const arm = this.costume?.gesturesSupported===false ? 0 : (this.armTest || 0);
        // BUST-06: dedicated bent-arm assets replace only the character's right arm.
        if (!L && this.transitionFrame != null && this.parts[this.transitionFrame]) {
          this.drawPart(this.transitionFrame); ctx.restore(); continue;
        }
        if (!L && this.gesturePose) {
          const g=this.gesturePose, costume=this.costume?.legacy ? "hoodie" : (this.costume?.gestureKey || (this.costume?.source ? "knit" : "tee"));
          const armIndex=g.costumes[costume];
          if(this.parts[armIndex] && this.parts[g.hand]) {
            this.drawPart(armIndex);
            ctx.save(); this.pivot(g.wrist[0],g.wrist[1],(this.gestureAngle||0)*Math.PI/180); this.drawPart(g.hand); ctx.restore();
            ctx.restore(); continue;
          }
        }
        const sleeve = L ? 38 : 40, skin = L ? 39 : 41;
        const wrist = (L ? this.wristL : this.wristR) || 0, watch = this.watchVisible !== false;
        if (Math.abs(arm) > .001) this.pivot(L?572:451,214,-side*arm*1.6*Math.PI/180);
        if (this.costume && !this.costume.legacy) {
          const a = this.costume.arms[L?'L':'R']; const tex = L && !watch ? a.watchless : a.arm;
          if (Math.abs(wrist) > .001) this.drawWrist(L,wrist,watch,tex); else this.drawPart(tex);
          this.drawPart(a.sleeve); ctx.restore(); continue;
        }
        ctx.save();
        if (Math.abs(arm) > .001) this.pivot(L?636:380,L?383:382,-side*arm*4*Math.PI/180);
        if (Math.abs(wrist) <= .001 && (!L || watch)) {
          this.drawPart(Math.abs(arm) > .001 ? (L?45:46) : skin);
        } else {
          this.drawWrist(L, wrist, watch);
        }
        ctx.restore(); this.drawPart(sleeve);
        ctx.restore(); continue;
      }
      if (i === 5 && this.fixes.neckFeather) { this.drawNeckFeathered(); ctx.restore(); continue; }
      if (i === 20 && zoom && this.parts[35] && this.parts[36] && this.parts[37]) {
        // Side lock rotation around the cut root, at low amplitude to minimize exposed seams.
        for (const [j, px, sign] of [[36,455,-1],[37,561,1]]) {
          ctx.save(); this.pivot(px,110,(v.hair*0.50+v.tilt*0.12*sign)*Math.PI/180); this.drawPart(j); ctx.restore();
        }
        this.drawPart(this.parts[47] && Math.abs(v.hair)+Math.abs(v.tilt)>.001 ? 47 : 35); ctx.restore(); continue;
      }
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
        if (this.faceHD && (i === 18 || i === 19) && (v.gaze !== 0 || (this.fixes.irisOcclusion && b > .001)) && closed < 1) {
          this.drawIrisHD(i,e,v,scale,closed); ctx.restore(); continue;
        }
        if (this.fixes.irisOcclusion && (i === 18 || i === 19) && b > 0.001 && closed < 1) {
          this.drawIrisOccluded(i, e, v, scale, closed);
          ctx.restore(); continue;
        }
        ctx.globalAlpha = 1 - closed;
        this.pivot(e[0], e[1], 0, scale);
        if ((i === 18 || i === 19) && v.gaze !== 0) {
          sc.setTransform(2, 0, 0, 2, 0, 0);
          sc.clearRect(0, 0, 1024, 1024);
          sc.globalCompositeOperation = "source-over";
          sc.globalAlpha = 1;
          this.drawPartOn(sc, i, v.gaze * 2);
          sc.globalCompositeOperation = "destination-in";
          this.drawPartOn(sc, e[2]);
          sc.globalCompositeOperation = "source-over";
          ctx.drawImage(this.scratch, 0, 0, 1024, 1024);
        } else {
          this.drawPart(i);
        }
      } else {
        this.drawPart(i === 8 && this.parts[42] ? 42 : i);
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

  // Smooth local inverse warp at the wrist. Only recompute when user changes angle or watch.
  // Independent source hand/watch layers are kept for later gesture substitution. The preview
  // uses a continuous assembled arm raster to avoid a hard seam during small rotations.
  drawWrist(L, value, watch, override) {
    const i = override ?? (L ? (watch ? 45 : 53) : 46), p = this.parts[i];
    if (!p) return;
    if (!this.wristCache) this.wristCache = {};
    const key = L ? 'L' : 'R', angle = (L ? -1 : 1) * value * 8 * Math.PI / 180;
    const cached = this.wristCache[key];
    if (cached && cached.i === i && cached.angle === angle) { this.ctx.drawImage(cached.canvas,p.x-20,p.y-20,p.w+40,p.h+40); return; }
    if (Math.abs(angle)<.00001) { this.drawPart(i); return; }
    const img=document.createElement('canvas');img.width=p.img.width+80;img.height=p.img.height+80;const input=img.getContext('2d');input.drawImage(p.img,40,40);const w=img.width,h=img.height, source=input.getImageData(0,0,w,h), src=source.data;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const c=canvas.getContext('2d'), result=c.createImageData(w,h), dst=result.data;dst.set(src);
    const anchor=this.costume?.arms?.[L?"L":"R"]?.wrist;
    const cx=((anchor?.[0]??(L?660:358))-p.x)*2+40,cy=((anchor?.[1]??(L?438:442))-p.y)*2+40;
    const slope=L?.32:-.32;
    // Signed distance to the wrist line; for the left wrist keep the watch above the transition.
    // Smoothly turn the hand from 0 to requested angle over about 14 logical pixels.
    for (let y=Math.max(0,Math.floor(cy-80));y<h;y++) for(let x=0;x<w;x++) {
      const dx=x-cx,dy=y-cy,dist=(dy+slope*dx)/2, t=Math.max(0,Math.min(1,(dist+(L&&watch?0:5))/(L&&watch?15:14)));
      if(t<=0)continue;
      const rot=-angle*t*t*(3-2*t), co=Math.cos(rot),si=Math.sin(rot), sx=cx+co*dx-si*dy,sy=cy+si*dx+co*dy;
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,j=(y*w+x)*4;
      let aa=0,rr=0,gg=0,bb=0;
      for(let oy=0;oy<=1;oy++)for(let ox=0;ox<=1;ox++) {const xx=ix+ox,yy=iy+oy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const k=(yy*w+xx)*4, q=(ox?fx:1-fx)*(oy?fy:1-fy)*src[k+3];aa+=q;rr+=src[k]*q;gg+=src[k+1]*q;bb+=src[k+2]*q;}
      dst[j]=aa?rr/aa:0;dst[j+1]=aa?gg/aa:0;dst[j+2]=aa?bb/aa:0;dst[j+3]=aa;
    }
    c.putImageData(result,0,0);this.wristCache[key]={i,angle,canvas};this.ctx.drawImage(canvas,p.x-20,p.y-20,p.w+40,p.h+40);
  }

  drawNeckFeathered() {
    const { ctx, sc } = this;
    sc.setTransform(2, 0, 0, 2, 0, 0);
    sc.clearRect(0, 0, 1024, 1024);
    sc.globalCompositeOperation = "source-over";
    sc.globalAlpha = 1;
    this.drawPartOn(sc, 5);
    // 首下端 (bbox y=125..191) の最下部14pxを徐々に透過させ、下の襟と馴染ませる
    sc.globalCompositeOperation = "destination-out";
    const knit = this.costume?.source === "costume_knit_front.png";
    const start=knit?174:177, end=knit?191:191;
    const g = sc.createLinearGradient(0, start, 0, end);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, knit?"rgba(0,0,0,1)":"rgba(0,0,0,0.85)");
    sc.fillStyle = g;
    sc.fillRect(480, start, 70, knit?32:14);
    sc.globalCompositeOperation = "source-over";
    ctx.drawImage(this.scratch, 0, 0, 1024, 1024);
  }

  drawIrisHD(i,e,v,scale,closed) {
    const c=this.eyeScratch, ox=e[0]-26, oy=e[1]-28, w=52,h=56,S=4;
    if(c.width!==w*S||c.height!==h*S){c.width=w*S;c.height=h*S;}
    const sc=c.getContext('2d'); sc.setTransform(S,0,0,S,-ox*S,-oy*S); sc.clearRect(ox,oy,w,h);sc.globalCompositeOperation='source-over';sc.globalAlpha=1;
    const iscale=this.fixes.irisOcclusion?Math.max(.18,Math.pow(scale,.45)):scale;
    sc.save();Renderer.pivotOn(sc,e[0],e[1],0,iscale);this.drawPartOn(sc,i,v.gaze*2);sc.restore();
    sc.globalCompositeOperation='destination-in';sc.save();Renderer.pivotOn(sc,e[0],e[1],0,scale);this.drawPartOn(sc,e[2]);sc.restore();sc.globalCompositeOperation='source-over';
    this.ctx.globalAlpha=1-closed;this.ctx.drawImage(c,ox,oy,w,h);
  }

  drawIrisOccluded(i, e, v, scale, closed) {
    const { ctx, sc } = this;
    const irisScale = Math.max(0.18, Math.pow(scale, 0.45));
    sc.setTransform(2, 0, 0, 2, 0, 0);
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
    ctx.drawImage(this.scratch, 0, 0, 1024, 1024);
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
    this.direction = null; this.directionResult = null; this._directionInternal = false;
    this._random = null; // {names:[...], minS, maxS, elapsed, nextIn}
    this.state = zeroParams();
    this.shape = 0;
    this.playing = false;
    this.mode = "idle";
    this.zoom = true;
    this.ready = false;
    this.destroyed = false;
    this.hidden = document.hidden;
    this.clock = new MotionClock(options.rng || Math.random);
    this.speech = new SpeechPerformance(options.speechRng || seededRng(82731));
    this.speechHair = 0; this.speechState = null;
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
        if (l.runtimeExcluded) { res(null); return; }
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("failed to load embedded " + l.file));
        img.src = this.options.embedded.parts[idx];
      })));
      return this._finishLoad(images, layers, true);
    }
    const manifest = await (await fetch(this.basePath + "bust-manifest.json?v=bust05")).json();
    this.manifest = manifest;
    const layers = manifest.layers;
    // 1枚の失敗・停滞で全体が止まらないよう、失敗時は null（欠け素材）として続行する。
    const images = await Promise.all(layers.map((l) => new Promise((res) => {
      if (l.runtimeExcluded) { res(null); return; }
      const img = new Image();
      const timer = setTimeout(() => res(null), 20000);
      img.onload = () => { clearTimeout(timer); res(img); };
      img.onerror = () => { clearTimeout(timer); res(null); };
      img.src = this.basePath + "bust/" + encodeURIComponent(l.file);
    })));
    return this._finishLoad(images, layers);
  }

  _finishLoad(images, layers, preTrimmed = false) {
    this.images = images;
    // 描画負荷軽減: manifestのbboxでトリムしたオフスクリーンを作り、元座標へ描く (v0.4検証HTMLと同じ方式)
    // ディスク上の素材PNGはフルサイズのまま無変更。トリムはピクセルの切り取りのみで再描画ではない。
    const parts = layers.map((l, idx) => {
      if (l.runtimeExcluded) return null;
      const [x1, y1, x2, y2] = l.bbox;
      const c = document.createElement("canvas");
      if (!images[idx]) {
        // 読み込み失敗した素材は透明のプレースホルダにする（全体は止めない）
        c.width = 1; c.height = 1;
      } else if (preTrimmed || l.trimmed) {
        // 埋め込みモード: 読み込んだ画像が既にbboxサイズなので、そのまま使う
        c.width = images[idx].naturalWidth; c.height = images[idx].naturalHeight;
        c.getContext("2d").drawImage(images[idx], 0, 0);
      } else {
        c.width = Math.max(1, x2 - x1); c.height = Math.max(1, y2 - y1);
        c.getContext("2d").drawImage(images[idx], -x1, -y1);
      }
      return { img: c, x: x1, y: y1, w: Math.max(1,x2-x1), h: Math.max(1,y2-y1) };
    });
    this.images = parts.map((p,i)=>images[i] && p ? p.img : null);
    this.parts = parts;
    this.renderer = new Renderer(this.canvas, parts, this.fixes);
    this.renderer.accessoryConfig=this.manifest.accessoryMotion;this.renderer.accessoriesEnabled=true;this.renderer.accessoryStrength=1;
    this.renderer.faceMap=this.manifest.faceHD?.mapping || {}; this.renderer.faceHD=Object.values(this.renderer.faceMap).every(i=>!!images[i]);
    this.gestureId="neutral";this.gestureMotion=null;this.gestureTransition=null;this.gestureStyle="expressive";this.gestureCue=null;this.gestureAutoReturn=false;this.costumeId = "hoodie"; this.renderer.costume = this.manifest.costumes?.sets?.hoodie;
    this.secondary=this.manifest.secondaryMotion?new SecondaryMotion(this.manifest.secondaryMotion):null;
    this.secondaryEnabled=true;this.secondaryStrength=1;
    this.ready = true;
    this.renderOnce();
    this.rafId = requestAnimationFrame(this._tick);
    this.onStatus("ready");
    return this;
  }

  renderOnce() {
    if (!this.ready || this.destroyed) return;
    if(this._batchRender){this._renderPending=true;return;}
    const cue=this.gestureCue;
    const v=this.composedPose();
    const secondary=this.secondaryEnabled&&this.secondary&&["hoodie","cardigan"].includes(this.costumeId)?this.secondary.values(this.secondaryStrength):null;
    // Never mutate manual, expression, or speech parameters. Limit total hair displacement.
    const display=secondary?.hair?{...v,hair:clamp(v.hair+secondary.hair,-1,1)}:v;
    this.renderer.render(display, this.shape, this.zoom, this.expression.currentExtras(),secondary);
  }

  // 10b: isolated director; no new images, no wall-clock timers, manual APIs preempt.
  composedPose(){
    const cue=this.gestureCue, s=this.state;
    if(!this.direction){return cue?{...s,tilt:clamp(s.tilt+cue.tilt,-1,1),gaze:clamp(s.gaze+cue.gaze,-1,1)}:s;}
    const b=this.manifest.direction.cueBudget;
    const w=cue?clamp(cue.weight??0,0,1)*b.maxCueWeight:0;
    const profile=cue?.profile;
    const scene=this.manifest.direction.scenes[this.direction.index];
    const release=scene.id==="finish"?smooth((this.direction.elapsed-.5)/.5):0;
    const tilt=lerp(clamp(lerp(s.tilt,profile?.tilt??s.tilt,w),-b.tilt,b.tilt),s.tilt,release);
    const gaze=lerp(clamp(lerp(s.gaze,profile?.gaze??s.gaze,w),-b.gaze,b.gaze),s.gaze,release);
    // Closed-eye expression owns blink. Speech owns mouth only where shape permits.
    const closed=this.expression.name==='relaxed'&&!this.expression.transitioning;
    return {...s,tilt,gaze,blink:closed?1:s.blink};
  }
  withDirection(fn){const prev=this._directionInternal;this._directionInternal=true;try{return fn();}finally{this._directionInternal=prev;}}
  cancelDirection(reason='manual'){
    if(!this.direction)return false;
    this.directionResult={status:reason,elapsed:this.direction.total,scene:this.direction.index};this.direction=null;return true;
  }
  manualDirection(){if(!this._directionInternal)this.cancelDirection('manual');}
  startDirection(){
    const cfg=this.manifest?.direction;if(!this.ready||!cfg||!['hoodie','cardigan'].includes(this.costumeId))return false;
    if(!cfg.scenes.every(x=>!x.gesture||this.manifest.gestureTransition.sequences[this.costumeId]?.[x.gesture]?.frames.every(i=>this.images[i])))return false;
    return this.withDirection(()=>{this.reset();this.setZoom('gesture');this.setGestureStyle('expressive');this.directionResult=null;this.direction={index:0,elapsed:0,total:0,fired:false,events:[]};this.enterDirectionScene();return true;});
  }
  enterDirectionScene(){
    const d=this.direction, scene=this.manifest.direction.scenes[d.index];d.elapsed=0;d.fired=false;
    d.events.push({id:scene.id,at:d.total});this.setExpression(scene.expression,true);this.setMode("idle");
  }
  advanceDirection(dt){
    if(!this.direction||!Number.isFinite(dt)||dt<=0)return;
    this.withDirection(()=>{
      const d=this.direction,c=this.manifest.direction,scene=c.scenes[d.index];d.elapsed+=dt;d.total+=dt;
      if(!d.fired&&d.elapsed>=c.gestureDelay){d.fired=true;if(scene.mode==="talk")this.setMode("talk");if(scene.gesture&&!this.performGesture(scene.gesture)){this.cancelDirection('gesture-failed');return;}}
      if(d.elapsed<scene.seconds)return;
      const busy=!!(this.gestureTransition||this.gestureMotion||this.gestureId!=='neutral'||this.secondary?.moving);
      if(busy){if(d.elapsed>scene.seconds+c.settleTimeout){this.cancelDirection('timeout');this.reset();}return;}
      if(d.index+1<c.scenes.length){d.index++;this.enterDirectionScene();}
      else {this.directionResult={status:'completed',elapsed:d.total,events:d.events.slice()};this.direction=null;}
    });
  }
  stopDirection(){if(!this.direction)return false;this.cancelDirection('stopped');this.reset();return true;}
  getDirection(){const d=this.direction;return d?{active:true,index:d.index,label:this.manifest.direction.scenes[d.index].label,elapsed:d.elapsed,total:d.total}: {active:false,result:this.directionResult};}

  setAccessories(enabled,strength=1){
    if(!this.renderer)return;this.renderer.accessoriesEnabled=!!enabled;this.renderer.accessoryStrength=clamp(Number(strength)||0,0,1);this.renderOnce();
  }
  setSecondary(enabled,strength=this.secondaryStrength){
    this.secondaryEnabled=!!enabled;this.secondaryStrength=clamp(Number(strength)||0,0,1);
    if(!enabled)this.secondary?.reset();this.renderOnce();
  }
  advanceSecondary(dt){
    if(!this.secondary||!this.secondaryEnabled||!["hoodie","cardigan"].includes(this.costumeId))return false;
    const tr=this.gestureTransition,m=this.gestureMotion;
    const active=!!((tr&&!tr.paused)||m);
    const profile=tr?this.gestureProfile(tr.pose,tr.style):null;
    const progress=tr?(profile?gestureEase(tr.progress,profile.knots):smooth(tr.progress)):(this.gestureId==="neutral"?0:1);
    const moving=this.secondary.moving;
    this.secondary.step(dt,{active,progress,wrist:this.renderer.gestureAngle||0,tilt:this.composedPose().tilt});
    return moving||this.secondary.moving;
  }
  setFixes(fixes) {
    Object.assign(this.fixes, fixes);
    if (this.renderer) this.renderer.fixes = this.fixes;
    this.renderOnce();
  }
  setFaceHD(enabled) { if(!this.renderer)return false; if(enabled&&!Object.values(this.renderer.faceMap).every(i=>!!this.images[i]))return false; this.renderer.faceHD=!!enabled;this.renderOnce();return true; }
  setZoom(z) { this.zoom = z === "upper" || z === "face" || z === "gesture" ? z : !!z; this.renderOnce(); }
  setCostume(id) { const set=this.manifest?.costumes?.sets?.[id]; if(!this.renderer||!set)return false; if(!set.legacy){const ids=[set.body,set.neckline,...Object.values(set.arms).flatMap(x=>[x.arm,x.sleeve,x.watchless])];if(!ids.every(i=>this.images[i]))return false;} if(set.gesturesSupported===false || (this.gestureTransition && !this.manifest.gestureTransition?.sequences?.[id]))this.setGesture("neutral"); this.costumeId=id;this.renderer.costume=set;if(!["hoodie","cardigan"].includes(id))this.secondary?.reset();if(this.gestureTransition)this.applyGestureTransitionFrame();this.renderOnce();return true; }
  setGesture(name="neutral") {this.manualDirection();
    if(!this.ready || !this.renderer)return false;
    const g=this.manifest.gestures?.poses?.[name];
    if(name!=="neutral"&&(this.renderer.costume?.gesturesSupported===false||!g||![g.hand,...Object.values(g.costumes)].every(i=>!!this.images[i])))return false;
    this.gestureMotion=null;this.gestureTransition=null;this.gestureAutoReturn=false;this.gestureCue=null;this.renderer.transitionFrame=null;this.gestureId=name;this.renderer.gesturePose=g||null;this.renderer.gestureAngle=0;this.renderOnce();return true;
  }
  playGesture(name="wave") {this.manualDirection();
    if(name==="neutral"||!this.setGesture(name))return false;
    this.gestureMotion={elapsed:0};return true;
  }
  setGestureStyle(style){if(!["classic","expressive"].includes(style))return false;this.gestureStyle=style;return true;}
  gestureProfile(name,style=this.gestureStyle){return style==="expressive"?this.manifest.gesturePerformance?.profiles?.[name]||null:null;}
  setGestureCue(profile,amount){this.gestureCue=profile&&amount>0?{tilt:profile.tilt*amount,gaze:profile.gaze*amount,weight:amount,profile}:null;}
  // One shot: raise -> wrist performance -> hold -> lower. Existing playGesture remains immediate.
  performGesture(name="wave"){this.manualDirection();
    if(!this.ready||!this.manifest.gestureTransition?.sequences?.[this.costumeId]?.[name])return false;
    return this.transitionGesture(name,true,true);
  }
  startGestureMotion(name,style,autoReturn){this.gestureMotion={elapsed:0,profile:this.gestureProfile(name,style),autoReturn:!!autoReturn};}
  // 08a: opt-in continuous arm route; keep setGesture/playGesture immediate for existing clients.
  // Each route has identical endpoints to 07c. Switching two gestures returns via neutral.
  transitionGesture(name="neutral", play=false, autoReturn=false) {this.manualDirection();
    if(!this.ready||!this.renderer)return false;
    const seq=this.manifest.gestureTransition?.sequences?.[this.costumeId];
    if(!seq || this.renderer.costume?.gesturesSupported===false) return play ? this.playGesture(name) : this.setGesture(name);
    if(name!=="neutral" && (!seq[name]||!seq[name].frames.every(i=>this.images[i])))return false;
    this.gestureMotion=null; this.renderer.gestureAngle=0; this.gestureAutoReturn=!!autoReturn;
    // Manual preview offsets are incompatible with the authored route.
    this.renderer.armTest=0;this.renderer.wristR=0;
    let tr=this.gestureTransition;
    if(!tr){
      if(this.gestureId===name){this.gestureCue=null;if(play&&name!=="neutral")this.startGestureMotion(name,this.gestureStyle,autoReturn);this.renderOnce();return true;}
      tr={pose:this.gestureId==="neutral"?name:this.gestureId,progress:this.gestureId==="neutral"?0:1,style:this.gestureStyle};
    }
    tr.paused=false;tr.requested=name;tr.play=!!play;tr.autoReturn=!!autoReturn;
    tr.target=(name===tr.pose)?1:0;
    this.gestureTransition=tr;this.applyGestureTransitionFrame();this.renderOnce();return true;
  }
  applyGestureTransitionFrame(){
    const tr=this.gestureTransition, cfg=this.manifest.gestureTransition;
    if(!tr)return;
    const seq=cfg.sequences[this.costumeId]?.[tr.pose];
    const profile=this.gestureProfile(tr.pose,tr.style);
    const k=Math.round((profile?gestureEase(tr.progress,profile.knots):smooth(tr.progress))*cfg.steps);
    // Small anticipation and follow-through on the head only; no expression/state overwrite.
    const cueAmount=tr.progress===0||tr.progress===1?0:Math.sin(Math.PI*tr.progress)**2;
    this.setGestureCue(profile,cueAmount);
    this.renderer.transitionFrame=(k>0&&k<cfg.steps)?seq?.frames[k-1]??null:null;
    this.renderer.gesturePose=k===cfg.steps?this.manifest.gestures.poses[tr.pose]:null;
    this.renderer.gestureAngle=0;
  }
  advanceGestureTransition(dt){
    const tr=this.gestureTransition,cfg=this.manifest.gestureTransition;if(!tr||tr.paused)return;
    const direction=tr.target===1?1:-1;
    const profile=this.gestureProfile(tr.pose,tr.style);
    const seconds=direction===1?(profile?.raise??cfg.raiseSeconds):(profile?.lower??cfg.lowerSeconds);
    tr.progress=clamp(tr.progress+direction*dt/seconds,0,1);
    this.applyGestureTransitionFrame();
    if(tr.progress===tr.target){
      const {requested,play,pose,style,autoReturn}=tr;
      this.gestureTransition=null;this.renderer.transitionFrame=null;
      this.gestureId=tr.target===1?pose:"neutral";this.renderer.gesturePose=this.manifest.gestures.poses[this.gestureId]||null;
      if(this.gestureId!==requested){this.transitionGesture(requested,play,autoReturn);}
      else if(play&&requested!=="neutral"){this.startGestureMotion(requested,style,autoReturn);}
    }
    this.renderOnce();
  }
  advanceGestureMotion(dt){
    const g=this.renderer.gesturePose,m=this.gestureMotion;if(!m||!g)return;
    m.elapsed+=dt;const p=m.profile;
    const duration=p?.duration??g.duration,hold=m.autoReturn?(p?.hold??.2):0;
    const u=clamp(m.elapsed/duration,0,1),envelope=Math.sin(Math.PI*u)**(p?1:.6);
    const cycles=p?.cycles??(this.gestureId==="wave"?3:1);
    this.renderer.gestureAngle=(p?.amplitude??g.wristAmplitude)*envelope*Math.sin(2*Math.PI*u*cycles);
    this.setGestureCue(p,u===0||u===1?0:Math.sin(Math.PI*u)**2);
    if(m.elapsed>=duration+hold){const auto=m.autoReturn;this.gestureMotion=null;this.gestureCue=null;this.renderer.gestureAngle=0;if(auto)this.transitionGesture("neutral");}
    this.renderOnce();
  }
  stopGesture(){this.manualDirection();this.gestureMotion=null;this.gestureAutoReturn=false;if(this.gestureTransition){this.gestureTransition.paused=true;this.gestureTransition.autoReturn=false;this.gestureTransition.play=false;}if(this.renderer){this.renderer.gestureAngle=0;if(!this.gestureTransition)this.gestureCue=null;this.renderOnce();}}
  setArmTest(v) { if (this.renderer) this.renderer.armTest = clamp(Number(v)||0,-1,1); this.renderOnce(); }

  setWrist(side, v) { if (!this.renderer || !["L","R"].includes(side)) return; this.renderer[side === "L" ? "wristL" : "wristR"] = clamp(Number(v)||0,-1,1); this.renderOnce(); }
  setWatch(visible) { if (this.renderer) this.renderer.watchVisible = !!visible; this.renderOnce(); }

  setExpression(name, internal = false) {
    if(!internal)this.manualDirection();
    if (!internal) this.stopRandomExpressions();
    this.expression.select(name, this.playing || this.expression.transitioning ? null : this.state, this.shape);
    this.onStatus("expression:" + name);
    this.onExpression(name);
  }

  /* ランダム表情切替: 指定した表情リストから、minS〜maxS秒のランダム間隔でランダムに選んで切り替える。
     待機中・発話中・停止中のいずれでも動く。手動の表情変更や stopRandomExpressions() で終了する。 */
  startRandomExpressions(names, minS = 8, maxS = 15) {this.manualDirection();
    const list = [...new Set((names || []).filter((n) => EXPRESSIONS[n]))];
    if (!list.length) throw new Error("no valid expressions");
    this._random = { names: list, bag: [], minS, maxS, elapsed: 0, nextIn: minS + Math.random() * (maxS - minS) };
    this.onStatus("random:start");
    return this._random;
  }
  stopRandomExpressions() {
    if (this._random) { this._random = null; this.onStatus("random:stop"); }
  }
  get randomActive() { return !!this._random; }
  getExpression() { return this.expression.name; }

  setMode(mode) {this.manualDirection();
    if (mode !== "idle" && mode !== "talk") throw new Error("unknown mode: " + mode);
    if ((this.expression.name === "concerned" || this.expression.name === "surprised" || this.expression.name === "relaxed") && mode === "talk" && !this.direction) {
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
    if (mode === "talk" && (!this.playing || this.mode !== "talk")) {
      this.speech = new SpeechPerformance(this.options.speechRng || Math.random); this.speechHair = 0; this.speechState=null;
    }
    this.mode = mode;
    this.playing = true;
    this.onStatus(mode === "talk" ? "talk" : "idle");
  }
  stop() {this.manualDirection();
    this.stopRandomExpressions();
    this.playing = false;
    this.stopGesture();
    this.expression.trans = null;
    this.onStatus("stopped");
  }
  reset() {this.manualDirection();
    this.stop();
    this.secondary?.reset();
    this.setGesture("neutral");
    this.shape = 0;
    this.expression.reset();
    this.state = zeroParams();
    if (this.renderer) { this.renderer.armTest = 0; this.renderer.wristL = 0; this.renderer.wristR = 0; this.renderer.watchVisible = true; }
    this.renderOnce();
    this.onStatus("reset");
  }
  setParameters(values) {this.manualDirection();
    this.stop();
    this.secondary?.reset();
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
    this.cancelDirection("destroyed");
    this.destroyed = true;
    this.stopRandomExpressions();
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener("visibilitychange", this._onVisibility);
    const c = this.canvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ready=false;this.renderer=null;this.parts=[];this.images=[];
    this.onStatus("destroyed");
  }

  _tick(t) {
    if (this.destroyed) return;
    const dt = this.last ? clamp((t - this.last) / 1000, 0, 0.1) : 0;
    this.last = t;
    const previousDirectionInternal=this._directionInternal;this._directionInternal=true;
    this._batchRender=true;this._renderPending=false;
    try{
    if(this.ready&&!this.hidden)this.advanceDirection(dt);
    if (this._random && !this.hidden && dt > 0) {
      const r = this._random;
      r.elapsed += dt;
      if (r.elapsed >= r.nextIn) {
        r.elapsed = 0;
        r.nextIn = r.minS + Math.random() * (r.maxS - r.minS);
        // Shuffle bag: each selected expression once per cycle; avoid repeat at boundary.
        if (!r.bag.length) {
          r.bag = [...r.names];
          for (let i = r.bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [r.bag[i], r.bag[j]] = [r.bag[j], r.bag[i]];
          }
          if (r.bag.length > 1 && r.bag[0] === this.getExpression()) {
            const j = 1 + Math.floor(Math.random() * (r.bag.length - 1));
            [r.bag[0], r.bag[j]] = [r.bag[j], r.bag[0]];
          }
        }
        const name = r.bag.shift();
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
        this.talkGain = clamp(this.talkGain + dt * (this.mode === "talk" ? 2.5 : -2.5), 0, 1);
        const speech = this.mode === "talk" ? this.speech.advance(dt) : (this.speechState || {mouth:0,tilt:0,gaze:0,brow:0,blink:0,breath:0,pause:true});
        this.speechState = speech;
        const sg = smooth(this.talkGain);
        const speechMouth = speech.pause ? base.mouth : Math.max(base.mouth*.18, speech.mouth);
        const mouth = base.shape === 0 ? lerp(base.mouth, speechMouth, sg) : base.mouth;
        this.speechHair += (speech.tilt*.28*sg-this.speechHair)*(1-Math.exp(-dt/.28));
        const e = this.entryState;
        this.state = {
          blink: lerp(e.blink, Math.max(base.blink, m.blink*(1-.45*sg), speech.blink*sg), gain),
          gaze: lerp(e.gaze, clamp(m.gaze*(1-.65*sg)+speech.gaze*sg,-1,1), gain),
          breath: lerp(e.breath, clamp(m.breath+speech.breath*sg,-1,1), gain),
          hair: lerp(e.hair, clamp(m.hair+this.speechHair,-1,1), gain),
          tilt: lerp(e.tilt, clamp(m.tilt*(1-.45*sg)+speech.tilt*sg,-1,1), gain),
          mouth: lerp(e.mouth, mouth, gain),
          brow: lerp(e.brow, clamp(base.brow+speech.brow*sg*(this.direction?(this.manifest.direction.cueBudget.speechBrowGain[this.expression.name]??0):1),-1,1), gain),
        };
      } else {
        this.state = { ...this.state, blink: base.blink, brow: base.brow, mouth: base.mouth };
      }
      this.shape = base.shape;
      this.renderOnce();
      this._fpsWindow.push(t);
      if (wasTransitioning && !this.expression.transitioning) this.onStatus(this.playing ? this.mode : "expression-set");
    }
    if(this.ready && !this.hidden && this.gestureTransition && !this.gestureTransition.paused) this.advanceGestureTransition(dt);
    if(this.ready && !this.hidden && this.gestureMotion) this.advanceGestureMotion(dt);
    if(this.ready&&!this.hidden&&this.advanceSecondary(dt))this.renderOnce();
    }finally{this._directionInternal=previousDirectionInternal;this._batchRender=false;const pending=this._renderPending;this._renderPending=false;if(pending)this.renderOnce();}
    this.rafId = requestAnimationFrame(this._tick);
  }
}

window.PonchanAvatar = PonchanAvatar;
window.PonchanMotionClock = MotionClock;
window.PonchanSpeechPerformance = SpeechPerformance;
window.PONCHAN_EXPRESSIONS = Object.keys(EXPRESSIONS);
window.PONCHAN_DEFAULT_FIXES = { ...DEFAULT_FIXES };
