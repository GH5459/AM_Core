# 驗證

- 執行 `node tools/test-meeting-workspace.mjs`、`node tools/test-meeting-reader-sharing.mjs`、`node tools/test-meeting-workspace-generation.mjs`。
- 完整最新 DailyLog 候選使用 `tools/test-meeting-workspace-worker.cjs` 在真正 workerd／D1 測試：舊任務識別碼、負責人與截止日、進度保存、新負責人重新開始、重試去重、版本衝突不部分寫入及撤回來源。
- 合成瀏覽器驗證觀看／編輯切換、未儲存草稿不公開、主持人儲存、分享開關及外部只讀、實際播放器與 Range、完整逐字稿。確認 320／360／390／430／760 及桌面無水平溢出。
- 正式回讀精確 commit／Worker 版本、原模組及設定、原對話及會議內容、預設分享關閉。只讀開啟已授權會議驗證交付；不代替主持人公開、修改或發布真人會議。
- 執行套件檢查及適用對齊稽核；既有其他專案警告另列，不宣稱全面對齊。
