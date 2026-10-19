# 安裝

從當前最新 AM 正式來源延伸，保留已發布組織分享、共同編輯及其他並行改善。在原 AM 私人目標保存會議／設定快照，使用原管理連線執行 workspace.sql 的相容新表並授予原runtime必要新表操作。原資料不回灌、不重放。

DailyLog 先以 release-meeting-workspace.cjs prepare 抓取最新完整模組與設定，使用 build-meeting-hub-worker.cjs 精準加入 Calendar 路由與模組；通過完整 Worker/D1 測試及並行版本守衛後發布，保留 Assets、秘密及排程。AM 完整CI合併後核對兩站commit及hub合約。最後使用 tools/meeting-hub-menu.mjs 先備份原OA/default/圖像，validate後切換三格並回讀。不得從dirty checkout全量發布其他目標。
