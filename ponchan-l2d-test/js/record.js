"use strict";
/* Capture canvas only. MP4 with AVC when available. Explicit WebM fallback, never disguise it. */
(function(){
  window.attachPawnRecorder = function({source, background, ready, startDemo, stopDemo, demo=false, direct=false, onState=null}) {
    const start=document.getElementById('recStart'), stop=document.getElementById('recStop'), status=document.getElementById('recStatus'), save=document.getElementById('recSave'), format=document.getElementById('recFormat'), seconds=document.getElementById('recSeconds');
    const mp4=['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1.42001f','video/mp4'];
    const webm=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    let active=null, url=null;
    function supported(list){return typeof MediaRecorder!=='undefined' && typeof source.captureStream==='function' ? list.filter(t=>MediaRecorder.isTypeSupported(t)):[];}
    function clearOutput(){if(url)URL.revokeObjectURL(url);url=null;save.hidden=true;save.removeAttribute('href');}
    function note(t){status.textContent=t;}
    if(!supported(mp4).length){format.options[0].disabled=true;format.value='webm';note('この環境ではMP4直接出力非対応。WebMを保存し、FFmpegでMP4へ変換してください。');}
    if(!supported(webm).length)format.options[1].disabled=true;
    if(!supported(mp4).length&&!supported(webm).length){start.disabled=true;note('この環境ではCanvas録画に非対応です。');return;}
    function finish(reason){if(!active||active.finishing)return;active.finishing=true;active.reason=reason;cancelAnimationFrame(active.raf);clearTimeout(active.timer);if(active.rec.state!=='inactive')active.rec.stop();stop.disabled=true;note('動画を確定中…');}
    function cleanup(a){cancelAnimationFrame(a.raf);clearTimeout(a.timer);a.stream.getTracks().forEach(t=>t.stop());if(active===a)active=null;start.disabled=false;stop.disabled=true;format.disabled=false;if(seconds)seconds.disabled=false;if(demo&&stopDemo)stopDemo();if(onState)onState(false);}
    function begin(){
      if(active)return;if(!ready()){note('素材読み込み完了後に録画してください。');return;}
      if(document.hidden){note('画面を表示した状態で録画してください。');return;}
      const kind=format.value, choices=supported(kind==='mp4'?mp4:webm);if(!choices.length){note('選択形式は非対応です。');return;}
      const duration=demo?30:Number(seconds.value);if(![10,20,30,45,60].includes(duration)){note('録画秒数が無効です。');return;}
      // direct時はソースCanvasから直接取り込む（毎フレームのコピー描画を省き、実効fpsを上げる）。
      let stream,rec,draw=null;
      try{
        if(direct){stream=source.captureStream(30);}
        else{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d',{alpha:false});draw=()=>{ctx.fillStyle=background();ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(source,0,0);};draw();stream=c.captureStream(30);}
        for(const mimeType of choices){try{rec=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:demo?6500000:4200000});break;}catch(e){}}if(!rec)throw Error('エンコーダー初期化失敗');
      }catch(e){if(stream)stream.getTracks().forEach(t=>t.stop());note(e.message);return;}
      clearOutput();const a={rec,stream,raf:0,timer:0,chunks:[],finishing:false,failed:false,reason:'完了',startAt:performance.now()};active=a;
      start.disabled=true;stop.disabled=false;format.disabled=true;if(seconds)seconds.disabled=true;
      rec.ondataavailable=e=>{if(e.data.size)a.chunks.push(e.data);};
      rec.onerror=e=>{a.failed=true;note('録画エラー: '+(e.error?.message||'エンコード失敗'));cleanup(a);};
      rec.onstop=()=>{if(a.failed)return;const mime=rec.mimeType||a.chunks[0]?.type||'';const actual=mime.includes('mp4')?'mp4':mime.includes('webm')?'webm':null;const blob=new Blob(a.chunks,{type:mime});cleanup(a);if(!actual||!blob.size){note('録画データが空、または形式を判定できません。');return;}url=URL.createObjectURL(blob);save.href=url;save.download=`Pawn_D06_v04_${demo?'demo':'capture'}_${Date.now()}.${actual}`;save.textContent=actual.toUpperCase()+'を保存';save.hidden=false;note(`${a.reason}：${actual.toUpperCase()} ${(blob.size/1048576).toFixed(2)} MB${actual==='webm'?'（MP4変換が必要）':''}`);};
      try{if(demo&&startDemo)startDemo();rec.start(1000);if(onState)onState(true);}catch(e){a.failed=true;cleanup(a);note('開始失敗: '+e.message);return;}
      a.startAt=performance.now();function tick(t){if(active!==a||a.finishing)return;try{if(draw)draw();}catch(e){a.failed=true;finish('描画失敗');cleanup(a);note(e.message);return;}const elapsed=(t-a.startAt)/1000;note(`録画中 ${Math.max(0,elapsed).toFixed(1)} / ${duration}秒`);if(elapsed>=duration)finish('録画完了');else a.raf=requestAnimationFrame(tick);}
      a.raf=requestAnimationFrame(tick);a.timer=setTimeout(()=>finish('録画完了'),duration*1000+250);
    }
    start.addEventListener('click',begin);stop.addEventListener('click',()=>finish('途中停止・保存可能'));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)finish('画面非表示のため途中終了');});
    window.addEventListener('pagehide',()=>{if(active){active.failed=true;finish('終了');cleanup(active);}clearOutput();});
    window.pawnRecorder={isRecording:()=>!!active,stop:()=>finish('途中停止・保存可能')};
  };
})();
