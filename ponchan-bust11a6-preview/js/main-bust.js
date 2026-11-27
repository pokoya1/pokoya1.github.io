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
  ready: "バストアップ素材読み込み完了",
  idle: "自然待機中",
  talk: "自然発話演出中（音声なし）",
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
    await avatar.load(); syncAccessories(); document.getElementById("gesture").value="neutral"; avatar.setGestureStyle(document.getElementById("gestureStyle").value); avatar.setSecondary(document.getElementById("secondaryEnabled").checked,document.getElementById("secondaryStrength").value); document.getElementById("faceHD").checked=avatar.renderer.faceHD; document.getElementById("costume").value="hoodie";
    document.getElementById("armTest").value=0; document.getElementById("armValue").value="0.00"; syncWristUI();
  } catch (err) {
    setStatus("素材読み込み失敗: " + err.message);
    console.error(err);
  }
  syncSliders();
  syncRandomButtons();
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
  avatar.reset(); document.getElementById("gesture").value="neutral";
  document.getElementById("armTest").value=0; document.getElementById("armValue").value="0.00"; syncWristUI();
  exprSel.value = "neutral";
  syncSliders();
});
document.getElementById("costume").addEventListener("change",e=>{ if(!avatar?.setCostume(e.target.value)){e.target.value=avatar?.costumeId||"hoodie";} const blocked=avatar?.renderer?.costume?.gesturesSupported===false; for(const id of ["gesture","gesturePlay","gestureOnce","gestureReset","armTest","watchVisible"]) document.getElementById(id).disabled=blocked; if(blocked){document.getElementById("gesture").value="neutral"; avatar.setArmTest(0); document.getElementById("armTest").value=0; document.getElementById("armValue").value="0.00";} });
document.getElementById("gestureView").addEventListener("click",()=>avatar&&avatar.setZoom("gesture"));
document.getElementById("upperView").addEventListener("click",()=>avatar && avatar.setZoom("upper"));
document.getElementById("armTest").addEventListener("input",e=>{if(!avatar)return; avatar.setArmTest(e.target.value);document.getElementById("armValue").value=Number(e.target.value).toFixed(2);});
function syncWristUI() { for(const side of ["L","R"]) { document.getElementById("wrist"+side).value=0; document.getElementById("wrist"+side+"Val").value="0°"; } document.getElementById("watchVisible").checked=true; }
for (const side of ["L","R"]) { const el=document.getElementById("wrist"+side); el.addEventListener("input",()=>{if(!avatar)return; avatar.setWrist(side,el.value);document.getElementById("wrist"+side+"Val").value=(Number(el.value)*8).toFixed(1)+"°";}); }
document.getElementById("watchVisible").addEventListener("change",e=>avatar?.setWatch(e.target.checked));
document.getElementById("wristNeutral").addEventListener("click",()=>{if(!avatar)return;for(const side of ["L","R"]) {avatar.setWrist(side,0);document.getElementById("wrist"+side).value=0;document.getElementById("wrist"+side+"Val").value="0°";}});
document.getElementById("zoom").addEventListener("click", () => avatar && avatar.setZoom(!avatar.zoom));
document.getElementById("bg").addEventListener("change", (e) => { canvas.style.background = e.target.value; });
exprSel.addEventListener("change", (e) => {
  if (avatar && e.target.value !== "custom") avatar.setExpression(e.target.value);
});
document.getElementById("destroy").addEventListener("click", () => { if (avatar) { avatar.destroy(); avatar = null; window.avatar = null; syncRandomButtons(); } });
const randToggle = document.getElementById("randToggle");
const randChoices = document.getElementById("randChoices");
const randInterval = document.getElementById("randInterval");
const randInfo = document.getElementById("randInfo");
const randAll = document.getElementById("randAll");
const randClear = document.getElementById("randClear");
const randOptions = Array.from(exprSel.options).filter(o => !o.disabled && window.PONCHAN_EXPRESSIONS.includes(o.value));
const randChecks = randOptions.map(o => {
  const label = document.createElement("label"), cb = document.createElement("input");
  cb.type = "checkbox"; cb.value = o.value; cb.checked = true;
  cb.addEventListener("change", syncRandomButtons);
  label.append(cb, document.createTextNode(o.textContent)); randChoices.append(label); return cb;
});
function selectedRandom() { return randChecks.filter(c => c.checked).map(c => c.value); }
function syncRandomButtons() {
  const active = !!(avatar && avatar.randomActive);
  const names = selectedRandom();
  randToggle.disabled = !avatar || !avatar.ready || (!active && names.length < 2);
  randToggle.textContent = active ? "ランダム停止" : `ランダム開始（${names.length}種類）`;
  randChecks.forEach(c => c.disabled = active); randAll.disabled = active; randClear.disabled = active; randInterval.disabled = active;
  randInfo.textContent = active ? `切替中：${names.length}種類・${randInterval.selectedOptions[0].textContent}間隔` : names.length < 2 ? "2種類以上を選択してください。" : "選択した表情を順不同で一巡します。同じ表情は連続しません。";
}
randAll.addEventListener("click", () => { randChecks.forEach(c => c.checked = true); syncRandomButtons(); });
randClear.addEventListener("click", () => { randChecks.forEach(c => c.checked = false); syncRandomButtons(); });
randToggle.addEventListener("click", () => {
  if (!avatar || !avatar.ready) return;
  if (avatar.randomActive) avatar.stopRandomExpressions();
  else {
    const names = selectedRandom(); if (names.length < 2) return;
    const [lo,hi] = randInterval.value.split(",").map(Number);
    avatar.startRandomExpressions(names, lo, hi);
  }
  syncRandomButtons();
});
syncRandomButtons();
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

attachPawnRecorder({source:canvas,background:()=>document.getElementById('bg').value,ready:()=>!!(avatar?.ready && avatar.manifest.layers.every((l,i)=>l.runtimeExcluded||!!avatar.images[i]))});
document.getElementById('destroy').addEventListener('click',()=>window.pawnRecorder?.stop(),{capture:true});

document.getElementById("faceView").addEventListener("click",()=>avatar&&avatar.setZoom("face"));
document.getElementById("faceHD").addEventListener("change",e=>{if(avatar&&!avatar.setFaceHD(e.target.checked))e.target.checked=false;});

const gestureSelect=document.getElementById("gesture");
const smoothGesture=document.getElementById("smoothGesture");
function requestGesture(name,play=false){
  if(!avatar)return false;
  let ok;
  if(smoothGesture.checked){
    ok=avatar.transitionGesture(name,play);
    if(ok){document.getElementById("armTest").value=0;document.getElementById("armValue").value="0.00";document.getElementById("wristR").value=0;document.getElementById("wristRVal").value="0°";}
  }else ok=play?avatar.playGesture(name):avatar.setGesture(name);
  if(ok){gestureSelect.value=name;if(name!=="neutral")avatar.setZoom(smoothGesture.checked?"gesture":"upper");}
  return ok;
}
gestureSelect.addEventListener("change",()=>requestGesture(gestureSelect.value));
document.getElementById("gesturePlay").addEventListener("click",()=>requestGesture(gestureSelect.value==="neutral"?"wave":gestureSelect.value,true));
document.getElementById("gestureReset").addEventListener("click",()=>requestGesture("neutral"));

document.getElementById("gestureStyle").addEventListener("change",e=>avatar?.setGestureStyle(e.target.value));
document.getElementById("gestureOnce").addEventListener("click",()=>{
  if(!avatar)return;const name=gestureSelect.value==="neutral"?"wave":gestureSelect.value;
  if(avatar.performGesture(name)){avatar.setZoom("gesture");gestureSelect.value=name;document.getElementById("armTest").value=0;document.getElementById("armValue").value="0.00";document.getElementById("wristR").value=0;document.getElementById("wristRVal").value="0°";}
});

function syncSecondary(){const v=Number(document.getElementById("secondaryStrength").value);document.getElementById("secondaryValue").value=Math.round(v*100)+"%";avatar?.setSecondary(document.getElementById("secondaryEnabled").checked,v);}
document.getElementById("secondaryEnabled").addEventListener("change",syncSecondary);
document.getElementById("secondaryStrength").addEventListener("input",syncSecondary);

function syncAccessories(){const v=Number(document.getElementById("accessoryStrength").value);document.getElementById("accessoryValue").value=Math.round(v*100)+"%";avatar?.setAccessories(document.getElementById("accessoriesEnabled").checked,v);}
document.getElementById("accessoriesEnabled").addEventListener("change",syncAccessories);
document.getElementById("accessoryStrength").addEventListener("input",syncAccessories);

// 10b UI: one animation clock; no scheduling by setTimeout.
const directionStart=document.getElementById('directionStart'),directionStop=document.getElementById('directionStop'),directionStatus=document.getElementById('directionStatus');
directionStart.addEventListener('click',()=>{if(avatar?.startDirection()){gestureSelect.value='neutral';document.getElementById('gestureStyle').value='expressive';syncWristUI();document.getElementById('armTest').value=0;document.getElementById('armValue').value='0.00';syncDirectionUI();}});
directionStop.addEventListener('click',()=>{if(avatar?.stopDirection()){gestureSelect.value='neutral';exprSel.value='neutral';syncSliders();syncWristUI();syncDirectionUI();}});
function syncDirectionUI(){const d=avatar?.getDirection();directionStart.disabled=!avatar?.ready||!!d?.active;directionStop.disabled=!d?.active;directionStatus.textContent=d?.active?`${d.index+1}/8 ${d.label} ｜ ${d.total.toFixed(1)}秒`:d?.result?.status==='completed'?'演出終了・通常待機':d?.result?'自動演出解除':'約23秒・無音・8場面';}
setInterval(syncDirectionUI,200);
