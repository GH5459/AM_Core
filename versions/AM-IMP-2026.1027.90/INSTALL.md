# 安裝

1. 重新核對兩個原目標目前正式版本，私人下載最新完整 DailyLog 模組與設定；不得使用本機未提交根目錄或歷史包直接發布。
2. AM 從審查及完整 CI 通過的同一個來源發布 `dailylog-embedded.js`、原 `workspace-service.js` 接線及 Calendar 指定活動入口。沿現有機器秘密與原登入 nonce 表，無新增 schema 或真人權限。
3. DailyLog 對最新完整 `worker.mjs` 執行 `build.cjs` 的 `patchWorker`，加入 `dailylog-meetings.mjs`。`client.js` 已由 build 讀入。來源守衛不符須停止重核；其他模組、Assets、秘密、設定、服務連結及排程保持。
4. 跑 VERIFY 所列檢查。AM 先上線及唯讀確認後，才切 DailyLog。兩端分別保存私人回退與回讀證據；本包尚未執行正式切換。
5. 不以真人建檔、Calendar 改寫、LINE 通知或實際錄音作部署測試。本人自然驗收獨立記錄。
