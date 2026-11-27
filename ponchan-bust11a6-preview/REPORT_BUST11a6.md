# BUST-11a-6 v0.1 本編接続・統合試験（2026-11-27）

## 判定
技術的暫定合格。BUST-11a-5の動作制御を既存本編の描画器へ選択式で接続した独立派生版。BUST-10c現行正本、公開版、原画、親アーカイブは変更しない。新規切り出し素材なし。

## 差分と設計
- `integrated.html`：本編UIを基に新旧制御切替、専用の操作パネルを追加。録画パネルは両モードで使用可能。既存 `bust.html` は変更なし。
- `js/integrated-avatar.js`：PonchanAvatarを継承するIntegratedAvatar。従来時は親の描画/時間管理を使用。新制御時はIdleMixerを1/120秒固定刻みで更新し、同じRAFコールバック・Renderer・素材キャッシュにPoseLab経由で渡す。非表示時は更新停止。過大なdtは0.1秒に制限。
- `js/main-integrated.js`：従来UIの複製で生成クラスのみ変更。`js/integrated-ui.js`：モード別UI。再生・連続模擬発話・表情・身振り・キャンセル・衣装・画角・瞬き・視線・コマ送り。
- 新制御と旧制御の切替は通常姿勢へ明示的に初期化。衣装は維持。録画中はモード切替不可。新制御での衣装切替は時間を維持。
- 共通API：setCostume, setZoom, setExpression, start/setMode, stop, reset, performGesture, getExpression, getParameters, getStats, destroy。新規 enableIntegrated(seed), disableIntegrated(), cancelIntegrated(), advanceIntegrated(dt)（QA用）。新制御時に旧式の startDirection, startRandomExpressions, setGesture, transitionGesture, playGesture, setParameters, setArmTest, setWrist は false を返す。旧制御では従来通り。stopGestureは新制御でキャンセルへマップ。新制御の発話は2.8秒の模擬発話反復、音声非連動。表情による発話制限あり。新制御時に旧式の手動・ランダム表情・8場面演出は提供しない。将来外部クライアント接続にはAPI契約の確定が必要。

## 検証（今回実施）
- Chromiumで単一HTMLを読み込み、252素材ロード、UI切替、両衣装3種の動作と割り込み、発話と表情競合、復帰を検証。6シナリオ×1,440状態=8,640状態、腕素材参照3,694件。これは仮想時間での状態検証で、全フレームの画像比較ではない。
- 新旧切替後も同じRendererと素材キャッシュ。衣装変更で時間不変。一時停止、1/30秒コマ送り、RAF再生、旧制御復帰時の静止画ピクセル一致（同一試験版の旧制御開始時との比較）、旧制御再生、破棄・再生成を確認。JavaScript例外0件。
- 前工程11a-4の回帰試験：129,600状態、130,440素材参照、54割り込みシナリオ合格、例外0件。
- SHA-256で親11a-5の252 PNG・13 JS・manifest・bust.html（267ファイル）を照合し全一致。16 JSのnode --check合格。
- 分離型HTMLはlocalhostへのアクセスがERR_BLOCKED_BY_ADMINISTRATORとなり起動未確認。単一HTMLで検証した。録画ファイル生成、iPhone実機、実時間の長時間負荷、外部クライアント、連続動作の美術的評価は未検証。袖と手の一体PNG問題は残存。新制御で旧機能をすべて互換にしたわけではない。

## 再現
`python make_integrated_single.py` → `integrated-single.html` を開く。`python qa/test_integrated.py`。ChromiumとPlaywrightが必要。結果 `qa/integrated_qa.json`、画面 `qa/integrated_hoodie.png` / `qa/integrated_cardigan.png`。回帰 `python make_mixer_single.py && python qa/test_mixer.py`。分離版はHTTPサーバーで `integrated.html` を開く（今回の環境は未確認）。

## 次工程
新旧素材の受入・座標/アルファ/描画順の比較と候補評価。新素材確定まで、既存252枚に依存する中間姿勢の大規模作り直しを保留。統合試験版を維持し、素材候補との比較後に採用を決める。現行正本の更新は承認後。
