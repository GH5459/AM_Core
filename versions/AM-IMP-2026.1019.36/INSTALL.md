# 安裝

1. 從最新正式主線建立獨立工作區，不從舊的未提交目錄發布。
2. 套用 decision-record 模組，以及原產生、工作頁、Notion 發布／修訂的呼叫調整。無資料庫結構變更，不重發 DailyLog 或 UOF。
3. 執行 VERIFY 的檢查，完成原專案完整 CI，再部署該專案精確提交。
4. 回讀兩個原正式來源的 `health.conversationMeetings.workspace.recordFormat`，應為 `meeting-decisions-with-evidence-v1`。
5. 若主持人明確指定更新既有記錄，先以 `tools/update-meeting-record.mjs snapshot` 保存單份私人快照，逐字稿與核准內容均放在庫外。`apply` 須使用相同原會議版本，僅經原修訂佇列替換記錄；`verify` 回查正式結果與所有受保護欄位。
6. 新會議使用新格式。不要批次重新辨識或改寫歷史會議，不改待辦／分享／來源。

工具參數為：`phase envFile connectionFile workspaceId privateFolder [recordFile]`。正式值不可寫入套件。
