# 驗證

使用假 token、假群組與假訊息，本地測試不呼叫 LINE 或 Notion 正式 API。

```powershell
node --check server.js
node --check core/line-io/index.js
node --check core/line-io/store.js
node --test tools/test-line-io.mjs
node tools/dryrun-core.mjs
node tools/verify-line-push-timeout.mjs
node tools/check-upgrade-package.js AM-IMP-2026.0928.01
node tools/audit-alignment.js
```

SQL 測試在記憶體 PostgreSQL（PGlite）執行正式 schema 與 adapter，測試 runtime 放作業系統暫存區，不改套件正式 dependencies：

```powershell
$testRuntime = Join-Path $env:TEMP 'am-line-io-test-runtime'
npm install --prefix $testRuntime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
node tools/test-line-io-sql.mjs "$testRuntime\node_modules\@electric-sql\pglite\dist\index.js"
```

涵蓋：驗簽、讀写 scopes、跨群／跨租戶拒絕、綁定撤銷、影子群不推播、來源內容、postback、事件去重、cursor 分頁、失敗不 ACK、先 commit 再 ACK、發送衝突、併發保留、逾時重用 UUID、SQL 原子回退、重啟、23 小時重試期限與 unsend 先後順序。

PGlite 不等於正式 PostgreSQL 多連線環境。部署驗證需在專案測試資料庫額外確認：兩個同時進入的 webhook transaction 按 advisory lock 順序提交；多個服務實例對相同發送 key 只有一個取得 lease。正式端到端還需：OA 的 webhook Verify 200、已授權測試群收進訊息與 postback、未授權 key 拒絕、指定測試報告出群、重試不重發。完成前不可標成 Deployed。

工作指南的舊位置檢查命令也可在該 checkout 執行：`node D:\Codex_project\AMCore\tools\audit-alignment.js`。此工作目錄是 `D:\CodexWork\AM_Core`；不同 checkout 的稽核不能互相取代。既有專案路徑或套件缺失需分開記錄，不修改其他未相關套件以製造通過。

## 2026-09-28 本地結果

- HTTP 行為測試：8/8 通過，包含驗簽、權限、輸入大小與非同步 commit 順序。
- SQL schema／adapter：PGlite 真實 SQL 測試通過；不宣稱已驗證正式多連線 PostgreSQL。
- 既有核心 dry run：15/15 通過；既有 LINE push timeout／retry 驗證通過。
- 本套件完整性檢查通過。
- 目前 `D:\CodexWork\AM_Core` alignment：90 個套件，0 errors、23 warnings；warning 為既有回退專案與腳本差異等。
- 指南指定的舊 `D:\Codex_project\AMCore` checkout：84 個套件，113 errors、34 warnings，主要為舊 HOZO_AM／SevenAM 路徑與 manifest 缺失；與此 checkout 分開記錄，沒有更改舊專案。
- 未安裝到正式專案、未部署、未呼叫正式群組推播。
