# Hologram AI Face v4.2.1

- v4.2のJavaScript構文エラーを修正。
- 顔の奥行きを抑え、口パクを強めた版。

# Hologram AI Face - Human GLB Mock v4.2.1

Three.jsで人型GLB顔モデルを読み込み、ホログラム風に表示するWebモックです。

## v4.2.1 修正内容

- GLB全体ではなく、頭部のメインメッシュだけを使用
- 眼球・歯・口内などのサブメッシュによる多重発光を回避
- 背景の回転リングを削除
- 追加の目・口オーバーレイを削除
- のど元に見えていた疑似口パク用オブジェクトを削除
- 口パクはシェーダーで本来の口周辺の頂点を変形
- 顔テクスチャの暗部を強く発光させる処理を弱め、目・口の異常な強調を抑制

## 反映方法

リポジトリ直下に全ファイルを上書きしてpushしてください。

```bash
git add .
git commit -m "fix hologram face mesh selection and mouth movement"
git push
```

ブラウザ側では強制更新してください。

- Windows: Ctrl + Shift + R
- Mac: Cmd + Shift + R

GitHub Pagesのキャッシュが残る場合は、URL末尾に `?v=20260708-7` を付けて確認してください。


## v4.2.1 修正内容

- app.js内の余分なテンプレートリテラルを削除し、`Unexpected identifier 'attribute'` を修正
- boot.js / index.html のキャッシュバスターを `20260708-7` に更新
- 顔の立体感スライダー初期値を 0.62 に設定
