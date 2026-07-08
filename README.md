# Hologram AI Face - Three.js Mock

Three.jsで作る、顔型ホログラムAIのWebモックです。
CSSだけの球体・平面顔ではなく、以下を使っています。

- 手続き型の3D顔メッシュ
- 鼻筋、鼻先、頬、顎の立体形状
- 半透明ホログラムシェーダー
- 顔面グリッド
- 顔面ドット
- 目、眉、鼻、口の3Dライン
- 口パク風アニメーション
- ブラウザ音声読み上げ
- モック会話JSON

## ローカル確認

```bash
python3 -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080
```

`会話モック再生` を押すと、発話・字幕・口パク・表情変更が動きます。

## GitHub Pages

このフォルダの中身をGitHubリポジトリのrootに置きます。

```bash
git add .
git commit -m "add threejs hologram face mock"
git push
```

GitHubで以下を設定します。

```text
Settings → Pages → Deploy from a branch → main → /(root)
```

## 変更ポイント

### 会話文

`app.js` の `mockLines` を編集してください。

```js
const mockLines = [
  {
    display_text: '画面に表示する文',
    speak_text: '読み上げる文',
    intent: 'greeting',
    expression: 'soft_smile',
    risk_level: 'low'
  }
];
```

### 顔の形

`app.js` の `widthAt()` と `surfaceAtUV()` が顔の形を作っています。

- `widthAt()`：輪郭、頬、顎、額の幅
- `surfaceAtUV()`：鼻、頬、唇、顎などの凹凸

### AI API接続

将来的には `playLine()` に渡すJSONをAIバックエンドから取得すれば、同じ表示レイヤーを使えます。

```json
{
  "display_text": "126500LNは、現行世代のロレックス コスモグラフ デイトナです。",
  "speak_text": "いちにーろくごーぜろぜろえるえぬは、現行世代のロレックス コスモグラフ デイトナです。",
  "intent": "watch_model_explanation",
  "expression": "neutral",
  "visual_effect": "normal_hologram",
  "risk_level": "low",
  "need_human_check": false
}
```

## 注意

このモックは外部CDNからThree.jsを読み込みます。GitHub Pagesではそのまま動きますが、完全オフライン運用をする場合はThree.jsをローカルに同梱してください。
