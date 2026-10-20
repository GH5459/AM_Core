# 驗證

1. 開頁確認五區順序，只有 Google Calendar 展開，其餘四區收合。
2. 逐區以滑鼠與鍵盤展開／收起，核對原連結、待辦數、重新讀取、分頁、日／週導覽及歷史閱讀入口。
3. 手動調整收合後重新讀取或切換日期，確認狀態保留；重新開頁恢復預設。未完成為零仍可展開並看到說明。
4. 執行 `node tools/test-meeting-calendar-week-browser.mjs <playwright 路徑>`、`node tools/test-meeting-hub.mjs`、`node tools/test-meeting-shared-inbox.mjs`、`node tools/test-meeting-list-progress.mjs` 與本包檢查。
5. 以合成資料確認 360、390、430、768、1024、1440 寬無橫向溢出。正式兩站須核對提交與完整首頁程式後才標記 Deployed。

不以真人會議保存、任務改動或 LINE 訊息測試版面。

## 正式結果

PR410 受測程式完整CI 5分21秒通過；後續只合併新文件，程式內容一致。AM 精確提交 0f7fbce51c745a07088d8253ab93bb1b5253d4ed 已在兩個正式網址核對，Render 43.2秒 Live。本人正式首頁確認五區順序與只有 Google Calendar 展開；原18列與原會議連結保留，未完成3場、已結束10場。六種寬度、鍵盤、收合與重新讀取／日期切換、空清單、歷史入口及原會議／分享／清單進度檢查通過。沒有真人內容保存或LINE測寫，DailyLog／UOF／Rich Menu未重發。

全域對齊仍有既有 HOZO／Seven 舊路徑與 manifest 缺項，未宣稱這兩個獨立專案已對齊或部署。私人畫面及證據不進 Git。
