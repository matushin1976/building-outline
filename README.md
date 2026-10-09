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