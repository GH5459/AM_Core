# 驗證

執行 node tools/test-meeting-hub.mjs 及 node tools/test-meeting-upload-browser.cjs <playwright模組絕對路徑>。涵蓋95段、前54段不重送、短暫失敗自動重試、持續失敗保留96筆本機記錄、重新載入、保存收據遺失與摘要不符。核對匿名及非主持人不可上傳；不測寫真人錄音、分享、LINE或任務。正式版本與原上傳片段另行只讀核對。
