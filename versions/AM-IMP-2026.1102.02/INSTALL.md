# 安裝

1. 對照最新正式 AM 來源及工作日誌完整模組，將完整設定、模組和回退資料留在原私人目錄。
2. 由本套件 `build.cjs` 從完整最新包建立候選，只替換 `line-self-task.mjs` 與 `line-task-dates.mjs`。原模組雜湊不同時停止並重新核對。
3. 通過受影響的 AM 與完整 Worker/D1 隔離測試；PR 審查合併至 main，核對合併後程式與受測版本一致。
4. 先發布工作日誌日期處理，再發布 AM Platform 指令入口。沿用原秘密、Assets、bindings、排程與版本快取 binding；保留並行版本。
5. 回讀完整模組與正式健康資訊。不得以真人 LINE、Google 或任務測寫代替隔離測試。
