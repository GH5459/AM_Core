# 驗證

- node tools/test-meeting-host-attention.mjs：本人／成員／來源與服務限制、原主持人指定、固定請求重送、回覆遺失、多人重複、身份變更、未連線與已處理取消；原會議與任務進度保持。
- node tools/test-meeting-host-attention-browser.cjs：登入延續、確認／取消、刷新保存狀態、本人刪除保留、360／390／768／1440 寬度及左右排列。
- node tools/test-meeting-host-attention-worker.cjs <私人完整工作日誌包> <miniflare>：完整原任務服務、真正 Worker 與 D1 合成建立，請求人與原主持人分工、來源及重送保持進度。
- node tools/test-meeting-pending-delete-browser.cjs 與 tools/test-meeting-hub.mjs 回歸通過。
- node tools/check-upgrade-package.js AM-IMP-2026.1027.05。
- 執行 AMCore alignment audit 與 compare-project-manifests；既有跨專案歷史差異另記錄，不能宣稱兩個獨立專案已對齊。
- 正式前後比對原會議資料，確認新表無代建真人請求。正式頁只讀確認，不替使用者發任務。
