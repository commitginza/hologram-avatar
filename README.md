# Hologram AI Face - v5.5 Bust + Real Mouth Motion

FaceCap morph targetモデルを使ったホログラム顔モックです。

## v5.5 の主な変更

- 胸上部まで表示する簡易バストメッシュを追加
- 歯が表示されていた時と同じ方向で `jawOpen` / `mouthOpen` の動きを復活
- 歯・口内メッシュは非表示のまま
- 黒い口穴オーバーレイで歯の表示だけを隠す
- ワイヤーなし、白基調

## 反映

```bash
git add .
git commit -m "add bust and real mouth motion"
git push
```

ブラウザは強制更新してください。

```text
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

Consoleに以下が出ればv5.5です。

```text
[boot] version 20260708-15
[app] version 20260708-15
```

## 口の動き調整

`app.js` の `MOUTH_MORPH` を調整してください。

```js
const MOUTH_MORPH = {
  jawOpenScale: 0.88,
  funnelScale: 0.14,
  puckerScale: 0.06,
  lowerDownScale: 0.18,
  upperUpScale: 0.05,
  overlayScale: 1.00
};
```

## 胸上部の調整

`app.js` の `BUST_CONFIG` を調整してください。
