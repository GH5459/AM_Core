# 驗證

- 執行 test-meeting-workspace.mjs、test-meeting-workspace-service.mjs、test-meeting-reader-sharing.mjs、test-meeting-collaboration.mjs、test-meeting-workspace-generation.mjs。
- 在最新完整 Worker 與真正 workerd/D1 執行 test-meeting-workspace-worker.cjs 及 test-meeting-sharing-worker.cjs。
- 瀏覽器使用合成資料測試原成員發布後逐段／逐項儲存、顏色及新增刪除、同處衝突、不同處保留、取消、失敗重試、觀看／編輯切換、組織複選與撤銷。涵蓋手機／桌機，確認不溢出。
- 目錄僅主持人可讀；指定夥伴不能讀草稿、名單、歷程或寫入。當前有效人員、實際 LINE 綁定與專案服務一致，不依姓名猜配。
- 正式發布比對精確提交及 Worker 100% 版本；保留原會議／設定／分享／任務／頁面及錄音。真人設定不代儲存，不代傳 LINE。
- 執行套件檢查與 AMCore 對齊稽核，保留未指定專案的既有缺項，不宣稱全面對齊。
