# 驗證

- node --test tools/test-dailylog-native-meetings.mjs
- node --test tools/test-dailylog-meetings.mjs
- node tools/test-dailylog-meeting-service.mjs：正式 fallback 設定、原資料及權限拒絕。
- 原會議完整服務、Calendar、錄音與 Markdown 回歸及完整 CI。
- 私人完整 Worker-D1／PostgreSQL／Chrome：四分頁、沒有 iframe、個人 Calendar 建檔、議程暫存、錄音工具、窄版與一般寬度。
- 正式來源、模組逐項、登入邊界、有效簽名唯讀回讀及資料保留；真人手機驗收須分別記錄。
