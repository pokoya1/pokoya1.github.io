# H5.5 Muse 派生版 r1 変更履歴（2026-11-22、Muse）

H5.5 原本（ChatGPT）は無変更。本派生は工程文書第17節レビューと H5.5 実装依頼に基づく修正のみ。

1. 経路のクリアランス復活（src/core.mjs）
   - H5.5 の collision() は radius 引数を持つが全呼び出しが 0 で、scene.floor.effectiveCharacterRadius=18 が実質無効だった。route() の接続判定・辺判定・最終区間検証に 18 を適用。H1設計時の「足元18pxクリアランス」を復活。
   - 検証：既存単体テスト10件は変更後も全件通過。
2. walkClock の二重加算修正（src/core.mjs）
   - step() の移動処理で、1ティック内に複数ウェイポイントを消化すると walkClock が区間ごとに加算されていた。ティックごとに1回だけ加算するよう修正（歩行アニメーションの位相ずれ防止）。
3. ビルドの自己完結化（build.py / template.html 追加）
   - build.py がパッケージ外の絶対パス（/mnt/data/dollhouse_h5/index.html）から HTML テンプレートを読んでおり、配布ZIPだけでは再ビルド不能だった。現行 index.html から生成済み部分を除いた template.html を同梱し、build.py はそれを読むよう変更。
   - 検証：再ビルド後の index.html は ChatGPT 生成物とバイト一致。standalone.html は上記 core 修正分のみ差異。

追加検証（Muse 独立実施）：
- 単体テスト10件 全通過、verify_build.py 通過（scene SHA-256: 9791691da06363c7f0b3b86c16be707ab4a380f648d393550ac9cfeffa5f3a9d）
- ランダムファズ：シード固定 RNG で手動/自律切替を含む約3,000操作＋模擬1,500秒。内蔵 verify() の不変条件違反ゼロ、活動回数 ハムスター111／ペンギン86。

未変更：scene.json（正本）、素材、UI、キャラ設定、旧版③。
既知の残課題：前景遮蔽なし（z は接地点Yの単一尺度まで）、移動中同士の衝突回避なし、模様替えUIなし、家具ON/OFFは見た目のみ（障害物・席は残る）、スリープ復帰時は自動で一時停止し手動再開が必要（ui.mjs の visibilitychange 仕様）。
