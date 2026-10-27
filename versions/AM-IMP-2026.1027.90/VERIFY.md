# 驗證

- `node --test tools/test-dailylog-meetings.mjs`：登入、CSRF、身分雙向、簽名、二進位、過期／重播／錯人拒絕與同來源畫面。
- `node tools/test-dailylog-meeting-service.mjs`：原 PostgreSQL 會議服務、原清單／來源／工作頁與權限；包含原完整 hub 建檔、固定識別、防重、Calendar 與錄音回歸。
- `node tools/test-meeting-workspace-service.mjs`：原會議登入、成員、主持人、發布與回應遺失回歸。
- `node tools/test-meeting-calendar-week-browser.mjs <playwright 路徑>`：原 Calendar 日週清單、明確建檔、失敗保留與指定活動帶入。
- 私人完整 Worker-D1／Chrome：320、390、768、1280 寬度，四分頁、保留未儲存筆記、個人 Calendar 按鈕；來源需選時不自動公開至群組。正式資料零測寫。

正式缺口：目前 Cloudflare 授權過期，尚無最新正式版本回讀；未正式部署、未真人手機或錄音驗收。
