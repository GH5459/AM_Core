# 驗證

- node tools/test-meeting-preparation-markdown.mjs
- node tools/test-meeting-hub.mjs
- 啟動 node tools/serve-meeting-hub-preview.mjs，再執行 node tools/test-meeting-preparation-markdown-browser.cjs <playwright-path> <private-output-dir>
- 合成資料確認原文、編輯／預覽、明確儲存及重新開頁；360／390／768／1024 寬無溢出。
- 實際儲存衝突仍由原版本處理；不寫真人內容、不建立任務或 LINE 通知。
- 本包五項文件與 metadata 檢查，執行原全庫對齊工具並獨立說明歷史缺項。
- 正式部署後才將原 AM 目標改為 Deployed，並只讀核對原會議入口。
