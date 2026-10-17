# 安裝

1. 核對目前正式提交與 LINE LIFF SDK 所回報的登記入口。
2. 部署端設定 `AMCORE_MEETINGS_LIFF_ENDPOINT_URL`，或單位的 `<PREFIX>_MEETINGS_LIFF_ENDPOINT_URL`；必須為 HTTPS，路徑 `/meetings/review`，不可含帳密、查詢或片段。沿用同一 LIFF ID，不改 LINE 權限。
3. 通過 VERIFY 後，只從乾淨隔離工作區的精確提交發布 AM。UOF／DailyLog 不需重發，資料庫不需遷移。
4. 保留原錄音、工作頁與連結；不要重播真人事件或重新建立會議。
