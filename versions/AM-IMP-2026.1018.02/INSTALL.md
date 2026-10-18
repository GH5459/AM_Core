# 安裝

1. 從最新已審查的 AM main 安裝工作頁 UI、client、service、store、access、revisions 與 leaf-tasks 轉接；保留機密及各對話資料。
2. 在原專案資料庫執行 `modules/meetings/workspace.sql`，新增兩個分享欄位（預設 false）及修訂表，授予原執行角色原範圍的 SELECT／INSERT／UPDATE；不刪改既有會議內容。
3. 先取得真正最新完整 DailyLog Worker，使用 `tools/build-meeting-reader-worker.cjs <private-release-folder>`，只更新會議指派模組及原呼叫點傳入既有任務模型。D1 沿用既有 meeting_task_receipts，不需改原工作資料表。
4. 完成測試與程式審查後，先部署並驗證 DailyLog，再部署精確 AM commit；UOF 及獨立 HOZO_AM／SevenAM 不需重發。
5. 更新專案自己的 manifest、升級紀錄與模組指南。正式版本、連線及私人收據由各專案部署設定提供。
