'use strict';
/* キャラクター画像生成プロンプトビルダー
   純粋な合成ロジック（buildPrompt）は DOM から分離し、Node でも検証できる構造にする。 */

function pickText(item, ai) {
  if (!item) return '';
  if (ai && item[ai]) return item[ai];
  return item.common || '';
}
function findItem(list, id) {
  return (list || []).find(function (x) { return x.id === id; }) || null;
}

function buildPrompt(data, state) {
  var ai = state.ai || 'gemini';
  var cats = data.categories || {};
  function sel(cat) { return findItem((cats[cat] || {}).items, state[cat]); }

  var character = findItem(data.characters, state.character) || (data.characters || [])[0];
  var outfit = sel('outfits');
  var outfitChanged = outfit && outfit.id !== 'outfit_ref';

  /* [Character] */
  var charLines = [];
  if (state.useReference) {
    var anchors = data.referenceAnchors || {};
    charLines.push(ai === 'muse' && anchors.muse ? anchors.muse : (anchors.common || ''));
    if (outfitChanged) {
      charLines.push(anchors.outfitChange || 'Change only the outfit to the specified clothes below.');
      if (ai === 'gpt' && anchors.gptOutfitChange) charLines.push(anchors.gptOutfitChange);
    }
  } else if (character) {
    charLines.push(pickText(character, ai));
  }

  /* [Scene & Composition] : 距離→角度→表情→ポーズ→仕草→服装→背景→ぼかし→アスペクト比 */
  var scene = [];
  ['distances', 'angles', 'expressions', 'poses', 'gestures'].forEach(function (cat) {
    var t = pickText(sel(cat), ai);
    if (t) scene.push(t);
  });
  if (outfit) {
    if (!(state.useReference && !outfitChanged)) {
      var ot = pickText(outfit, ai);
      if (ot && !( !state.useReference && outfit.id === 'outfit_ref')) scene.push(ot);
      if (!state.useReference && outfit.id === 'outfit_ref') { /* 参照なしでは衣装指定なし */ }
    }
  }
  var bg = pickText(sel('backgrounds'), ai);
  if (bg) scene.push(bg);
  if (state.bokeh) {
    var bk = pickText((data.options || {}).bokeh, ai);
    if (bk) scene.push(bk);
  }
  var ar = pickText(sel('aspectRatios'), ai);
  if (ar) scene.push(ar);

  var out = [];
  out.push('[Character]');
  out.push(charLines.filter(Boolean).join('\n'));
  out.push('');
  out.push('[Scene & Composition]');
  out.push(scene.join(', '));

  var theme = (state.theme || '').trim();
  if (theme) {
    out.push('');
    out.push('[Theme / Additional Instruction]');
    out.push('以下のテーマ・シチュエーションをイラスト全体の雰囲気や小物に反映させてください：');
    out.push('「' + theme + '」');
  }

  var constraints = [];
  if (state.noText) { var nt = pickText((data.options || {}).noText, ai); if (nt) constraints.push(nt); }
  if (state.noSnow) { var ns = pickText((data.options || {}).noSnow, ai); if (ns) constraints.push(ns); }
  if (constraints.length) {
    out.push('');
    out.push('[Constraints]');
    out.push(constraints.join(', '));
  }
  return out.join('\n');
}

/* ===== ブラウザ側 ===== */
if (typeof document !== 'undefined') {
  var DATA = null;
  var manualEdit = false;

  function $(id) { return document.getElementById(id); }

  function currentState() {
    function v(id) { var el = $(id); return el ? el.value : ''; }
    function c(id) { var el = $(id); return el ? el.checked : false; }
    return {
      ai: (document.querySelector('input[name="ai"]:checked') || {}).value || 'gemini',
      character: v('character'),
      useReference: c('useReference'),
      expressions: v('expressions'), poses: v('poses'), gestures: v('gestures'), outfits: v('outfits'),
      angles: v('angles'), distances: v('distances'), aspectRatios: v('aspectRatios'), backgrounds: v('backgrounds'),
      bokeh: c('bokeh'), noText: c('noText'), noSnow: c('noSnow'),
      theme: v('theme')
    };
  }

  function refresh() {
    if (!DATA || manualEdit) return;
    $('preview').value = buildPrompt(DATA, currentState());
  }

  function addSelect(cat, labelText) {
    var wrap = document.createElement('label');
    wrap.className = 'field';
    var span = document.createElement('span'); span.textContent = labelText;
    var select = document.createElement('select'); select.id = cat;
    (DATA.categories[cat].items || []).forEach(function (item) {
      var o = document.createElement('option'); o.value = item.id; o.textContent = item.label; select.appendChild(o);
    });
    select.addEventListener('change', function () { manualEdit = false; refresh(); });
    wrap.appendChild(span); wrap.appendChild(select);
    $('selects').appendChild(wrap);
  }

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function init(data) {
    DATA = data;
    var cs = $('character');
    data.characters.forEach(function (ch) {
      var o = document.createElement('option'); o.value = ch.id; o.textContent = ch.label; cs.appendChild(o);
    });
    if (data.characters[0] && data.characters[0].note) $('charNote').textContent = data.characters[0].note;
    cs.addEventListener('change', function () {
      var ch = findItem(data.characters, cs.value);
      $('charNote').textContent = ch && ch.note ? ch.note : '';
      manualEdit = false; refresh();
    });

    Object.keys(data.categories).forEach(function (cat) { addSelect(cat, data.categories[cat].label || cat); });

    var d = data.defaults || {};
    function setVal(id, val) { var el = $(id); if (el && val) el.value = val; }
    function setChk(id, val) { var el = $(id); if (el && typeof val === 'boolean') el.checked = val; }
    setVal('character', d.character);
    ['expressions','poses','gestures','outfits','angles','distances','aspectRatios','backgrounds'].forEach(function (cat) { setVal(cat, d[cat]); });
    setChk('useReference', d.useReference); setChk('bokeh', d.bokeh); setChk('noText', d.noText); setChk('noSnow', d.noSnow);
    if (d.ai) { var r = document.querySelector('input[name="ai"][value="' + d.ai + '"]'); if (r) r.checked = true; }
    var ch0 = findItem(data.characters, cs.value); if (ch0 && ch0.note) $('charNote').textContent = ch0.note;

    ['useReference','bokeh','noText','noSnow'].forEach(function (id) { $(id).addEventListener('change', function () { manualEdit = false; refresh(); }); });
    $('cornerIconToggle').addEventListener('change', function () {
      $('cornerIcon').hidden = !$('cornerIconToggle').checked;
    });
    document.querySelectorAll('input[name="ai"]').forEach(function (r) { r.addEventListener('change', function () { manualEdit = false; refresh(); }); });
    $('theme').addEventListener('input', function () { manualEdit = false; refresh(); });
    $('preview').addEventListener('input', function () { manualEdit = true; });

    $('copyBtn').addEventListener('click', function () {
      var text = $('preview').value;
      function done() { toast('コピーしました'); }
      function fallback() {
        $('preview').select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('コピーできませんでした。長押しで選択してください'); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
    });

    $('resetBtn').addEventListener('click', function () {
      manualEdit = false;
      init2(d); refresh(); toast('リセットしました');
    });
    function init2(def) {
      setVal('character', def.character);
      ['expressions','poses','gestures','outfits','angles','distances','aspectRatios','backgrounds'].forEach(function (cat) { setVal(cat, def[cat]); });
      setChk('useReference', def.useReference); setChk('bokeh', def.bokeh); setChk('noText', def.noText); setChk('noSnow', def.noSnow);
      $('theme').value = def.theme || '';
      $('cornerIconToggle').checked = false; $('cornerIcon').hidden = true;
      if (def.ai) { var r = document.querySelector('input[name="ai"][value="' + def.ai + '"]'); if (r) r.checked = true; }
    }

    refresh();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
  }

  fetch('./prompts.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('prompts.json ' + r.status); return r.json(); })
    .then(init)
    .catch(function (e) {
      $('charNote').textContent = 'prompts.json を読み込めませんでした。HTTPサーバー（GitHub Pages等）経由で開いてください。';
      console.error(e);
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildPrompt: buildPrompt, pickText: pickText, findItem: findItem };
}
