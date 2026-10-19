# 安裝

1. 從最新完整正式 AM 來源套用本版，保留會議入口、詞庫、週期及其他功能。
2. 以專案私有管理連線執行 tools/inspect-meeting-workspace.mjs migrate，僅新增通知表及原執行角色權限，不改原名單或業務記錄。
3. 用 tools/release-meeting-workspace.cjs prepare 取得最新完整 DailyLog，再由 tools/build-meeting-share-notices-worker.cjs 精確延伸原分享路由及模組。不要從舊本機 Worker 重建。
4. 完成真正 Worker/D1 測試及來源比對，保留全部其他模組、資產、設定、秘密、排程，再部署該原服務。
5. 完整 CI 通過後，以指定提交部署原 AM；兩站回讀及本人畫面確認後才能標示 Deployed。不部署未指定的獨立 HOZO_AM/SevenAM。
