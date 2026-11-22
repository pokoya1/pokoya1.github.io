# H5.6 Muse 適用メモ（2026-11-22、Muse）

## 検出事項：r1 修正の未継承（退行）
H5.6 の src/core.mjs は ChatGPT の H5.5 原本と同一で、公開中の H5.5 Muse 派生 r1 の修正2件（経路クリアランス radius=18 の適用、walkClock 二重加算の修正）が含まれていなかった。第22節で r1 公開版が「現行ベースライン」として凍結されているため、このまま公開すると公開版より制御品質が下がる退行になる。

## 適用した修正（H5.6 内に限定）
r1 と同じ2件を H5.6 の core.mjs に再適用し、build.py で再生成した。
- route() の接続判定・辺判定・最終区間検証に scene.floor.effectiveCharacterRadius(=18) を適用
- walkClock の加算をティックごとに1回へ統一
- 再適用後の core.mjs は r1 のものと完全一致。scene.json・遮蔽実装・素材・UI には変更なし。
- 検証：単体テスト10件全通過、verify_build 通過（再生成後も scene ハッシュ不変）。

## 公開
/dollhouse-h56/ へ配置。/dollhouse-h55/ と既存プロジェクトは無変更。
