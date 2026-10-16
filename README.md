# 建物外周メモ v16

建物の外周入力、案件・建物・階管理、Bosch GLM 150 C Bluetooth連携（試験対応）、DXF/PDF出力、GPS地図表示を行うWebアプリです。

## 公開
GitHub Pagesで公開する場合はリポジトリの Settings → Pages → Deploy from a branch → main / (root) を指定します。

## 注意
- 案件データはブラウザのローカルストレージに保存されます。作業後はJSONを書き出してバックアップしてください。
- Bluetoothは対応するブラウザとHTTPSが必要です。
- 登記・測量の正式成果に使う前に寸法と計算を確認してください。
- 元のChatGPT公開サイトとGitHub Pagesは別の公開先です。

## テスト
`node tests/cases.test.cjs`
`node tests/bosch-ble.test.cjs`
## Googleドライブのバックアップ／復元（手動）
- 端末内の自動保存は従来どおり継続します。全案件を Google Drive の `building-survey-backup.json` に保存・復元できます。
- 初回のみ Google Cloud Console でプロジェクトを作り、Google Drive API を有効化し、OAuth 同意画面と**ウェブアプリケーション**用 OAuth クライアントIDを設定してください。Google アカウントがテストユーザーの場合はテストユーザーとして追加してください。
- **承認済みの JavaScript 生成元**に GitHub Pages の origin（例：`https://matushin1976.github.io`）を追加します。クライアントシークレットをページに記入してはいけません。
- アプリの入力欄に OAuth クライアントIDを入力し、Googleに接続 → 全案件をDriveに保存、または Driveから全案件を復元します。Driveのアクセス許可はアプリが作成したファイルに限定されます。
- **自動同期・差分マージではありません。** Driveへの保存は既存バックアップを上書きし、復元は端末内の全案件を置き換えます。重要な作業では端末のJSONも保存してください。復元直前のローカルデータはブラウザ内 `building-survey-before-drive-restore` に控えます。
- このページは公開GitHub Pages上にあるため、OAuthクライアントIDのみ公開可能です。Googleのアクセストークンや秘密鍵をGitHubへコミットしないでください。
