# 驗證

1. 開頁確認五區順序，只有 Google Calendar 展開，其餘四區收合。
2. 逐區以滑鼠與鍵盤展開／收起，核對原連結、待辦數、重新讀取、分頁、日／週導覽及歷史閱讀入口。
3. 手動調整收合後重新讀取或切換日期，確認狀態保留；重新開頁恢復預設。未完成為零仍可展開並看到說明。
4. 執行 `node tools/test-meeting-calendar-week-browser.mjs <playwright 路徑>`、`node tools/test-meeting-hub.mjs`、`node tools/test-meeting-shared-inbox.mjs`、`node tools/test-meeting-list-progress.mjs` 與本包檢查。
5. 以合成資料確認 360、390、430、768、1024、1440 寬無橫向溢出。正式兩站須核對提交與完整首頁程式後才標記 Deployed。

不以真人會議保存、任務改動或 LINE 訊息測試版面。
