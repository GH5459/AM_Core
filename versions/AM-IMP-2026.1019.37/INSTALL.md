# 安裝

1. 由最新 origin/main 精準合併 modules/meetings/task-origins.js、conversation-service.js 原簽章驗證後的讀取入口，以及測試與套件文件。
2. 沿原 AMCORE_MEETING_MANAGEMENT_SECRET 與原服務 OA 範圍；不建立新秘密、資料表、索引或排程。
3. 完整 CI 通過並合併到 main 後，發布精確受測提交；先驗證來源服務，再發布工作日誌。
4. DailyLog 重新核對真正最新完整 Worker、設定與排程，只精準包原授權回應及新增 task-origins 兩模組；keep_assets，不全量 build dirty 根或上傳測試 public。
5. 在原任務權限通過後，以任務主紀錄／原 intake 取得來源識別，只向 AM 查詢精確名稱；來源服務不可用時維持原任務可用。

不重建真人任務、修改會議分享或傳送 LINE，不自動安裝其他獨立服務。
