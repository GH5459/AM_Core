# 安裝

先從最新正式版下載完整 DailyLog 模組、設定與排程，核對上傳 etag 等於正在使用的版本。複製 baseline 至 candidate。設定 DAILYLOG_SHARE_PACKAGE 為該獨立資料夾後執行 node patch-worker.cjs。只改 worker.mjs、line-personal-completion-response.mjs，新增兩個分享模組，保留其他內容及 Assets、秘密、設定、排程。

先發布審查通過並合併 main 的 AM recipient resolver，再上線經完整 Worker 與瀏覽器測試的 DailyLog 候選；發布前若正式版本前進，重新下載、套用、測試，不重發舊包。未包含業務資料、秘密或新權限。
