# 驗證

- node tools/test-task-origins.mjs：真正 PostgreSQL 查詢、服務隔離、已發布來源、精確 ID、最大批量、簽章及過期拒絕，無訊息內文或寫入。
- node tools/test-conversation-meetings.mjs、node tools/test-meeting-workspace-service.mjs：原管理與會議流程保持。
- node tools/check-upgrade-package.js AM-IMP-2026.1019.36，並完成整份 GitHub CI。
- DailyLog 完整 Worker／D1：清單、完整及快速卡片、來源服務中斷、跨 tenant intake、非法連結、轉派與討論、原任務 bytes／version／revision 不變。
- Chrome 320／360／390／430／760／1280：清單與卡片、200 字來源、44px 原會議連結、草稿、重整與重複刷新、零任務寫入。
- 正式以唯讀方式比對原版本與資料，登入畫面只開啟／關閉驗證；不代儲存真人修改、建工作或傳 LINE。
