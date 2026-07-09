# S3 GLB Hologram Viewer

GitHubにはGLBを入れず、S3上のGLBをThree.jsで読み込む版です。

```js
const MODEL_URL = 'https://watchimg.s3.ap-northeast-1.amazonaws.com/glb/humanoid+character+allien+3d+model.glb';
```

## ローカル確認

```bash
cd s3_glb_hologram_viewer
python -m http.server 8080
```

ブラウザで開きます。

```text
http://localhost:8080/
```

`file://` で直接開かないでください。

## GitHub Pagesに上げる場合

このフォルダの中身をリポジトリ直下に配置します。GLBファイルは不要です。

```text
YOUR_REPO/
├─ index.html
├─ app.js
├─ styles.css
├─ favicon.svg
├─ model-info.json
└─ .nojekyll
```

```bash
git add .
git commit -m "load glb from s3"
git push
```

## S3側で必要なCORS設定

S3バケットの Permissions → CORS に以下を設定してください。

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "https://YOUR_NAME.github.io"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

`YOUR_NAME` はGitHubのユーザー名またはOrganization名に変えてください。
CORSのOriginには `/リポジトリ名/` のようなパスは含めません。

## 注意

このGLBには以前の確認ではmorph targetが無かったため、自然な口パクはできません。
会話モック再生では、morph targetがある場合のみ口パクを試し、無い場合は発光演出だけになります。

## 404/403/CORSが出る場合

1. S3オブジェクトが公開読み取り可能か確認
2. S3 CORSに `http://localhost:8080` と `https://YOUR_NAME.github.io` が入っているか確認
3. `app.js` の `MODEL_URL` が正しいか確認
4. ファイル名の `+` が実際のS3キーと一致しているか確認
   - S3キーがスペースの場合は `%20` 版のURLも試してください。
