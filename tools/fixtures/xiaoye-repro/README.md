# 可重現的小葉 Worker／D1 測試資料

`xiaoye-d1-schema.json` 只包含 DailyLog 正式 Worker `e3bed555-613e-4897-ac7b-4affed8b81f1` 的資料表、索引與 trigger 定義；不包含員工、案件、附件、LINE 身分或其他正式紀錄。合成 fixture 在記憶體 D1 中建立獨立結構，插入固定的虛構帳號及登入 session，所有案件與 LINE 事件也由測試建立。

以 `npm ci --prefix tools/fixtures/xiaoye-repro --ignore-scripts` 安裝此 fixture 專用的鎖定依賴，與正式服務依賴分開。CI 測試 `test-xiaoye-repro-fixture.cjs` 只驗證假 Worker 與假 D1 的建立；它不代表真實 Worker、真人 LINE、正式帳號或發布已通過驗收。

完整小葉 Worker 測試另需由操作者從當前正式版本取得完整 Worker 模組，在隔離目錄將受審來源的三個小葉模組替換後打包至 `dry-run/worker.js`。指定 `DAILYLOG_XIAOYE_PACKAGE` 指向該隔離目錄，並指定 `DAILYLOG_XIAOYE_FIXTURE` 為本 commit 的 `tools/xiaoye-repro-fixture.cjs`，即可執行 `tools/test-xiaoye-finding-question-worker.cjs`。不得將正式 secrets、bindings 或資料內容放入 fixture。
