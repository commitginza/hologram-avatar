# Hologram AI Face - Three.js Mock v1.1

GitHub Pagesで動かすためのThree.js版ホログラム顔モックです。

## v1.1の修正点

- `importmap`依存をやめて、`boot.js`でThree.jsを動的読み込みします。
- `jsDelivr → unpkg → esm.sh` の順にCDNをフォールバックします。
- 初期化失敗時に、画面中央へエラーを表示します。
- `app.js`をキャッシュバスター付きで読み込みます。

## ファイル構成

```text
index.html
styles.css
boot.js
app.js
.nojekyll
README.md
```

## ローカル確認

```bash
python3 -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080
```

## GitHub Pages反映

既存リポジトリ直下に全ファイルを上書きします。

```bash
git add .
git commit -m "fix threejs boot loader"
git push
```

反映後、ブラウザで強制更新してください。

- macOS: `Cmd + Shift + R`
- Windows: `Ctrl + Shift + R`

## それでも動かない場合

ブラウザのDevToolsを開いて、ConsoleとNetworkを確認してください。

主に見るもの:

- `boot.js` が 200 で読めているか
- `app.js?v=20260708-2` が 200 で読めているか
- `three.module.min.js` が 200 で読めているか
- WebGL related error が出ていないか

CDNが会社ネットワークや広告ブロッカーでブロックされている場合、Three.jsをローカル配置する構成に切り替えてください。
