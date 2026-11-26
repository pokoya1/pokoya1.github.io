"use strict";
/* デモページ配線。アバター本体 (avatar.js) とは分離し、UIは公開APIだけを使う。 */
const canvas = document.getElementById("stage");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const exprSel = document.getElementById("expression");
const KEYS = ["blink", "gaze", "breath", "hair", "tilt", "mouth", "brow"];
const LABELS = ["まばたき", "視線", "呼吸", "髪の揺れ", "首の傾き", "口の開き", "眉の表情"];
const FIX_LABELS = {
  irisOcclusion: "半目の虹彩遮蔽",
  neckFeather: "首・襟接合の軟化",
  browBoost: "眉の表情差を強調",
  mouthCrossfade: "口形のクロスフェード",
  hairLag: "髪の追随遅れ",
};
let avatar = null;
const sliders = {};

function syncSliders() {
  if (!avatar) return;
  const p = avatar.getParameters();
  for (const k of KEYS) {
    sliders[k].range.value = p[k];
    sliders[k].out.value = Number(p[k]).toFixed(2);
  }
}
function setStatus(text) { statusEl.textContent = text; }
const STATUS_TEXT = {
  ready: "素材33枚読み込み完了",
  idle: "自然待機中",
  talk: "模擬発話中（音声なし）",
  stopped: "手動／停止",
  reset: "静止画（通常）",
  destroyed: "破棄済み（再生成できます）",
  "expression-set": "表情設定済み",
};

async function createAvatar() {
  avatar = new PonchanAvatar(canvas, {
    ...(window.PONCHAN_EMBEDDED ? { embedded: window.PONCHAN_EMBEDDED } : {}),
    basePath: "assets/",
    onExpression: (name) => { exprSel.value = name; },
    onStatus: (s) => {
      if (s === "random:stop" || s === "random:start") syncRandomButtons();
      if (s.startsWith("expression:")) {
        const name = s.slice("expression:".length);
        setStatus("表情遷移中：" + name);
      } else if (STATUS_TEXT[s]) setStatus(STATUS_TEXT[s]);
    },
  });
  window.avatar = avatar; // 検証・他アプリ連携用
  try {
    await avatar.load();
  } catch (err) {
    setStatus("素材読み込み失敗: " + err.message);
    console.error(err);
  }
  syncSliders();
}

/* スライダー（手動調整） */
const controls = document.getElementById("controls");
KEYS.forEach((k, i) => {
  const label = document.createElement("label");
  const span = document.createElement("span");
  const r = document.createElement("input");
  const o = document.createElement("output");
  span.textContent = LABELS[i];
  r.type = "range"; r.id = k;
  r.min = (k === "blink" || k === "mouth") ? 0 : -1;
  r.max = 1; r.step = 0.01; r.value = 0;
  o.id = "o" + k; o.value = "0.00";
  r.addEventListener("input", () => {
    if (!avatar) return;
    const values = {};
    for (const kk of KEYS) values[kk] = Number(sliders[kk].range.value);
    values[k] = Number(r.value);
    if (k === "mouth") values.shape = 0;
    avatar.setParameters(values);
    exprSel.value = "custom";
    syncSliders();
  });
  label.append(span, r, o);
  controls.append(label);
  sliders[k] = { range: r, out: o };
});

/* 補正トグル */
const fixesBox = document.getElementById("fixes");
for (const [key, label] of Object.entries(FIX_LABELS)) {
  const lab = document.createElement("label");
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = window.PONCHAN_DEFAULT_FIXES[key];
  cb.addEventListener("change", () => { if (avatar) avatar.setFixes({ [key]: cb.checked }); });
  const span = document.createElement("span");
  span.style.width = "auto";
  span.textContent = label;
  lab.append(cb, span);
  fixesBox.append(lab);
}

document.getElementById("play").addEventListener("click", () => avatar && avatar.setMode("idle"));
document.getElementById("talk").addEventListener("click", () => {
  if (!avatar) return;
  if (["concerned", "surprised", "relaxed"].includes(avatar.getExpression())) exprSel.value = "neutral";
  avatar.setMode("talk");
});
document.getElementById("stop").addEventListener("click", () => avatar && avatar.stop());
document.getElementById("reset").addEventListener("click", () => {
  if (!avatar) return;
  avatar.reset();
  exprSel.value = "neutral";
  syncSliders();
});
document.getElementById("zoom").addEventListener("click", () => avatar && avatar.setZoom(!avatar.zoom));
document.getElementById("bg").addEventListener("change", (e) => { canvas.style.background = e.target.value; });
exprSel.addEventListener("change", (e) => {
  if (avatar && e.target.value !== "custom") avatar.setExpression(e.target.value);
});
document.getElementById("destroy").addEventListener("click", () => { if (avatar) { avatar.destroy(); avatar = null; window.avatar = null; } });
const randToggle = document.getElementById("randToggle");
const randAllToggle = document.getElementById("randAllToggle");
function syncRandomButtons() {
  const active = avatar && avatar.randomActive;
  randToggle.textContent = active && randMode === "pair" ? "ランダム停止" : "ランダム開始";
  randAllToggle.textContent = active && randMode === "all" ? "全表情ランダム停止" : "全表情ランダム開始";
  if (!active) randMode = null;
}
let randMode = null;
randToggle.addEventListener("click", () => {
  if (!avatar) return;
  if (avatar.randomActive) { avatar.stopRandomExpressions(); }
  else {
    const a = document.getElementById("randA").value;
    const b = document.getElementById("randB").value;
    randMode = "pair";
    avatar.startRandomExpressions([a, b], 3.5, 8);
    setStatus("ランダム切替中（3.5〜8秒間隔）");
  }
  syncRandomButtons();
});
randAllToggle.addEventListener("click", () => {
  if (!avatar) return;
  if (avatar.randomActive) { avatar.stopRandomExpressions(); }
  else {
    randMode = "all";
    avatar.startRandomExpressions(["neutral", "happy", "concerned", "surprised", "relaxed"], 3.5, 8);
    setStatus("全表情ランダム切替中（3.5〜8秒間隔）");
  }
  syncRandomButtons();
});
document.getElementById("recreate").addEventListener("click", async () => {
  if (!avatar) await createAvatar();
});

/* 統計表示（約2Hz） */
setInterval(() => {
  if (!avatar) { statsEl.textContent = ""; return; }
  const s = avatar.getStats();
  statsEl.textContent =
    `描画 ${s.frames} 回 / 実効 ${s.fps} fps / 経過 ${s.clockTime.toFixed(1)}s / まばたき ${s.blinkCount} 回 / 視線 ${s.gazeCount} 回`;
}, 500);

createAvatar();
