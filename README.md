# Webcam Hologram Live Mock

Webカメラ映像をリアルタイムに白基調のホログラム風で表示する静的Webモックです。

## ローカル確認

```bash
python -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080/
```

`file://` ではなく、必ず `localhost` で開いてください。
Webカメラは `localhost` または HTTPS でないと起動できません。

## GitHub Pages

リポジトリ直下に以下を置きます。

```text
index.html
styles.css
app.js
favicon.svg
README.md
.nojekyll
```

その後、GitHub Pages の公開元を `main / root` にしてください。

## 調整箇所

`app.js` の `fragmentShader` 内で、白基調・影・スキャンライン・背景フェードを制御しています。
UIのスライダーからも調整できます。

## 注意

このモックはブラウザ内だけでカメラ映像を加工します。録画やサーバー送信はしていません。
