"use strict";
/* F-01 デモモード: 固定タイムラインでアバターを自動再生し、
   UIを含まない縦9:16ステージへ描く。通常画面・ランダム切替とは独立。 */
(function () {
  const stage = document.getElementById("stage");
  const sctx = stage.getContext("2d");
  const avatarCanvas = document.getElementById("avatarCanvas");
  const statusEl = document.getElementById("demoStatus");

  // 再現性のためのシード付き乱数（avatar.js の seededRng と同じ算法）
  function seededRng(seed) {
    let x = seed >>> 0;
    return () => { x = (Math.imul(1664525, x) + 1013904223) >>> 0; return x / 4294967296; };
  }

  const BG = "#f7f2e9";
  // 画角: アバター元キャンバス(1024)上の切り出し矩形 [x, y, w, h]
  const FRAME_FACE = [421, 0, 180, 320];   // バストアップ（顔中心）
  const FRAME_FULL = [309, 0, 406, 722];   // 全身（頭と靴を切らない）
  let frameCur = [...FRAME_FACE];
  let frameFrom = [...FRAME_FACE];
  let frameTo = [...FRAME_FACE];
  let frameTrans = null; // {start, dur}

  function setFrame(target, at, dur = 1.6) {
    frameTrans = { at, dur, from: [...frameCur], to: [...target] };
  }
  function frameAt(t) {
    if (!frameTrans) return frameCur;
    const u = Math.min(1, Math.max(0, (t - frameTrans.at) / frameTrans.dur));
    const e = u * u * (3 - 2 * u);
    frameCur = frameTrans.from.map((v, i) => v + (frameTrans.to[i] - v) * e);
    if (u >= 1) frameTrans = null;
    return frameCur;
  }

  // 固定タイムライン（秒）。喜び・大喜びは D-05 案A（未承認候補）。
  const TIMELINE = [
    { t: 0.0,  run: (a) => { a.setMode("idle"); a.setExpression("neutral"); } },
    { t: 6.0,  run: (a) => a.setExpression("happy") },     // 微笑
    { t: 10.0, run: (a) => a.setExpression("joy") },       // 喜び
    { t: 15.0, run: (a) => a.setExpression("excited") },   // 大喜び
    { t: 18.0, run: (a) => a.setExpression("joy") },       // 喜びへ復帰
    { t: 20.0, run: (a) => a.setExpression("surprised") },
    { t: 21.4, run: (a) => a.setExpression("concerned") },
    { t: 22.8, run: (a) => a.setExpression("relaxed") },
    { t: 24.2, run: (a) => { a.setExpression("neutral"); a.setMode("talk"); } }, // 模擬発話
    { t: 27.0, run: (a) => a.setMode("idle") },
    { t: 25.0, frame: FRAME_FULL },
    { t: 30.0, run: () => {} },
  ];
  TIMELINE.sort((a, b) => a.t - b.t);
  const DURATION = 30;
  const TITLE_AT = 27.5;

  let avatar = null;
  let playing = false;
  let startAt = 0;
  let rafId = 0;
  let cueIdx = 0;

  function drawStage(now) {
    const t = playing ? (now - startAt) / 1000 : 0;
    if (playing) {
      while (cueIdx < TIMELINE.length && TIMELINE[cueIdx].t <= t) {
        const cue = TIMELINE[cueIdx++];
        if (cue.run) cue.run(avatar);
        if (cue.frame) setFrame(cue.frame, t);
      }
      if (t >= DURATION) { stopDemo("デモ終了"); }
    }
    const [fx, fy, fw, fh] = frameAt(t);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = BG;
    sctx.fillRect(0, 0, stage.width, stage.height);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(avatarCanvas, fx, fy, fw, fh, 0, 0, stage.width, stage.height);
    if (playing && t >= TITLE_AT) {
      const a = Math.min(1, (t - TITLE_AT) / 1.2);
      sctx.save();
      sctx.globalAlpha = a;
      sctx.fillStyle = "rgba(247,242,233,0.82)";
      sctx.fillRect(0, stage.height - 300, stage.width, 300);
      sctx.fillStyle = "#5a4632";
      sctx.font = "600 64px system-ui, sans-serif";
      sctx.textAlign = "center";
      sctx.fillText("ポーンちゃん", stage.width / 2, stage.height - 190);
      sctx.font = "400 40px system-ui, sans-serif";
      sctx.fillText("L2D風アバター", stage.width / 2, stage.height - 110);
      sctx.restore();
    }
    statusEl.textContent = playing ? `デモ再生中 ${t.toFixed(1)}s / 表情: ${avatar ? avatar.getExpression() : "-"}` : statusEl.textContent;
    rafId = requestAnimationFrame(drawStage);
  }

  async function init() {
    avatar = new PonchanAvatar(avatarCanvas, {
      basePath: "assets/",
      rng: seededRng(20261127),
      onStatus: () => {},
    });
    window.demoAvatar = avatar;
    await avatar.load();
    avatar.setMode("idle");
    statusEl.textContent = "読み込み完了";
    rafId = requestAnimationFrame(drawStage);
  }

  function startDemo() {
    if (!avatar || playing) return;
    avatar.stop();
    avatar.reset();
    avatar.setMode("idle");
    frameCur = [...FRAME_FACE]; frameTrans = null;
    cueIdx = 0;
    playing = true;
    startAt = performance.now();
    statusEl.textContent = "デモ再生中 0.0s";
  }
  function stopDemo(msg) {
    if (!playing) return;
    playing = false;
    if (avatar) { avatar.setMode("idle"); avatar.setExpression("neutral"); }
    statusEl.textContent = msg || "停止";
  }

  document.getElementById("demoStart").addEventListener("click", startDemo);
  document.getElementById("demoStop").addEventListener("click", () => stopDemo("停止"));
  window.demoControl = { start: startDemo, stop: stopDemo, isPlaying: () => playing };
  init().catch((e) => { statusEl.textContent = "読み込み失敗: " + e.message; console.error(e); });
})();
