# 驗證

- node tools/test-meeting-hub.mjs
- node tools/test-meeting-external-invitations.mjs
- node tools/test-meeting-hub-worker.cjs <完整合成候選模組路徑> <miniflare路徑>
- 原共同編輯與閱讀分享測試。
- 手機確認外部排程仍鎖時間地點，但可選人、保存內部邀請、查看同步結果；不因輪詢覆寫輸入。
- 合成測試身份／同服務／名單／版本、撤銷、原活動沿用與保留、UID／單次時間核對、重複與失敗重試、相同工作頁回連。
- 正式兩站精確版本、私人API拒絕、原會議／設定／草稿／分享／計畫／同步列保持。只讀真人頁，不代勾人保存或寫真人Google。
