# 投資ドールハウス H5.6 / 家具前景遮蔽

H5.5の家具3点だけ「背景家具＋下部透過前景」に分離した、H5.6の独立試作です。既存のH5.5公開版は変更しません。

- 編集正本: `scene.json`
- 描画: `src/ui.mjs`
- 制御: `src/core.mjs`（H5.5から無変更）
- 自動生成: `python build.py`（`template.html`、`scene.json`から `index.html` と `standalone.html` を作る）
- テスト: `node tests/test.mjs`, `python tests/verify_build.py`, `python check_occlusion.py`
- 代表的な表示: `qa/furniture_occlusion_mobile.png`, `qa/furniture_occlusion_desktop.png`
- Muse向け: `H56_HANDOFF.md`

**現状:** 家具の前景遮蔽の技術試作。実機視覚の承認は未取得。新しいペンギン歩行やフェイスリグは未導入。
