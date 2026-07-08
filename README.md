# Hologram AI Face - FaceCap Morph Target Mock v5.1

three.js の `webgl_morphtargets_face.html` に近い構成へ寄せた版です。
`facecap.glb` を読み込み、`mesh_2` の `morphTargetDictionary` / `morphTargetInfluences` を使って、口・目・眉を動かします。

## v5.1の主な変更

- LeePerrySmithからFaceCapモデルへ変更
- 疑似口スリットではなく、`jawOpen` などのmorph targetで口を開閉
- ワイヤー表示なし
- 白基調、薄い影、透明感で表示
- GitHub Pages向けの静的構成

## 反映手順

ZIPの中身をGitHubリポジトリ直下へ上書きしてpushしてください。

```bash
git add .
git commit -m "switch to facecap morph target model"
git push
```

反映後、ブラウザで強制更新してください。

- Windows: Ctrl + Shift + R
- Mac: Cmd + Shift + R

Consoleに以下が出ればv5.1です。

```text
[boot] version 20260708-10
[app] version 20260708-10
```

## 口パク調整

`app.js` の `updateMorphTargets()` 内を調整します。

```js
setMorph(['jawOpen', 'mouthOpen'], open * 0.88);
setMorph(['mouthFunnel'], open * 0.14);
setMorph(['mouthPucker'], open * 0.06);
```

もっと口を開く場合:

```js
setMorph(['jawOpen', 'mouthOpen'], open * 1.00);
```

## 白基調の見た目調整

`app.js` の `faceMaterial` を調整します。

```js
const faceMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xf8fbff,
  transparent: true,
  opacity: 0.56,
  emissive: 0xffffff,
  emissiveIntensity: 0.035
});
```


## v5.1.1

- FaceCapモデル内の眼球・歯・舌・口内などのサブメッシュを非表示にし、頭部のmorph targetメッシュだけを表示。
- 目と口は白い塊ではなく穴として見える構成に変更。
- Console version: 20260708-11


## v5.1 changes
- FaceCapモデルの眼球・歯・口内などのサブメッシュを非表示化。
- 表示するのはmorph targetを持つ顔サーフェスのみ。
- 口はmorph target（jawOpen / mouthOpen）で開閉。歯は表示しないため、開いた部分は穴として見える。
