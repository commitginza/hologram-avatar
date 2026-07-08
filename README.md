# Hologram AI Face Mock v2

HTML/CSS/JavaScriptだけで動く、ホログラムAIフェイスのWebモックです。

## v2の変更点

- 左下に出ていた端末風オブジェクトを削除
- 顔を丸い球体ではなく、人の顔型シルエットに変更
- 顔の輪郭、鼻、顎、スキャンライン、ドットパターンを追加
- 顔の真下に薄い投影ベースを追加

## ローカル起動

```bash
python3 -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080
```

## GitHub Pages

1. GitHubにリポジトリを作成
2. このフォルダの中身をpush
3. Settings > Pages > Deploy from a branch
4. Branch: main / Folder: /(root)
5. Save

## 会話テキストの変更

`app.js` の `lines` 配列を編集してください。

## 見た目の変更

`styles.css` の以下を主に調整してください。

- `--head-path`: 顔の輪郭
- `.hologram-head`: 顔型ホログラム本体
- `.brow`, `.eye`, `.nose`, `.mouth`: 顔パーツ
- `.projection-base`: 投影ベース
