# 驗證

- node tools/test-meeting-hub.mjs：已過時間且沒有錄音的設定中工作頁仍可列出，重開使用同一識別碼，原權限與準備資料最小化保持。
- node tools/test-meeting-external-invitations.mjs
- node tools/test-meeting-shared-inbox.mjs
- 合成瀏覽器確認待完成區塊可見、工作頁原連結、歷史不重複及手機無溢出。
- 正式服務兩站核對指定提交；登入後只讀清單確認原兩場會議，不保存、邀請、錄音、重建行程或傳送 LINE。正式前後比對會議、準備資料、排程、Calendar連結與對話設定，私人證據不進 Git。
