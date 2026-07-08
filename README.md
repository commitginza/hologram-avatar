# Hologram AI Face - Human GLB Mock v2

Three.jsで人型GLB顔モデルを読み込み、青白いホログラムシェーダー、ワイヤーフレーム、粒子、スキャンライン、口パク風オーバーレイを重ねたWebモックです。

## 変更点

- 手続き型の自作顔メッシュを廃止
- Three.js公式サンプルの LeePerrySmith GLB を読み込み
- 顔テクスチャをシェーダーに渡して、目・鼻・口のディテールをホログラム化
- 既存の会話モック再生、字幕、ブラウザ読み上げ、JSONプレビューは維持
- WebGL不可環境では Canvas 2D フォールバック

## ファイル構成

```text
index.html
styles.css
boot.js
app.js
fallback.js
webgl-check.html
README.md
.nojekyll
```

## ローカル確認

```bash
python3 -m http.server 8080
```

```text
http://localhost:8080
```

## GitHub Pages

リポジトリ直下に上記ファイルを置き、Settings → Pages で main / root を公開元にしてください。

## 顔モデルについて

このモックでは検証用にThree.js examplesの LeePerrySmith モデルをCDNから読み込んでいます。商用・本番用途では、権利が明確なオリジナルまたは購入済みGLBモデルへ差し替えてください。

差し替え箇所は `app.js` の以下です。

```js
const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/LeePerrySmith/';
const MODEL_URL = `${ASSET_BASE}LeePerrySmith.glb`;
const FACE_MAP_URL = `${ASSET_BASE}Map-COL.jpg`;
```

## 口パクについて

LeePerrySmithモデルには口のBlendShapeがないため、今回は口元にホログラムの口パク用オーバーレイを重ねています。本格的なリップシンクを行う場合は、A/I/U/E/O または jawOpen などのモーフターゲットを持つGLB/VRMモデルに置き換えてください。
