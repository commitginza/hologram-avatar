# Custom GLB Hologram Viewer

アップロードされた `humanoid character allien 3d model.glb` を `models/avatar.glb` として同梱した、ローカル確認用のThree.jsホログラムビューアです。

## ローカル確認

```bash
cd staff_glb_hologram_viewer_v1
python -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080/
```

`index.html` を直接ダブルクリックして `file://` で開くのは避けてください。

## GitHub Pagesに上げる場合

このフォルダの中身をリポジトリ直下に配置します。

```text
YOUR_REPO/
├─ index.html
├─ app.js
├─ styles.css
├─ favicon.svg
├─ model-info.json
├─ models/
│  └─ avatar.glb
└─ .nojekyll
```

その後、通常どおりpushします。

```bash
git add .
git commit -m "add custom glb hologram viewer"
git push
```

## このGLBについて

簡易解析では以下の状態です。

- Mesh: 1
- Material: 1
- Animation: 0
- Skin: 0
- Morph target: 0
- Generator: Tripo

つまり、このGLBには `jawOpen` / `mouthOpen` などのmorph targetが入っていません。
そのため、自然な口パクやまばたきはこのモデル単体ではできません。

このビューアでは、morph targetが存在するモデルなら自動検出して口パクを試します。
このGLBの場合は、会話モック再生中に発光・揺らぎのみが動きます。

## モデルを差し替える場合

`models/avatar.glb` を別のGLBに差し替えれば、そのまま読み込みます。

```js
const MODEL_URL = './models/avatar.glb';
```

口パクを自然にしたい場合は、以下のようなmorph target入りGLBを用意してください。

- jawOpen
- mouthOpen
- mouthSmile
- eyeBlinkLeft
- eyeBlinkRight
- mouthA / mouthI / mouthU / mouthE / mouthO
