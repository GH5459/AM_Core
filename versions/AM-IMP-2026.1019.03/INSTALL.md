# 安裝

1. 從最新正式主線建立隔離分支；保留同時進行的會議編輯、分享與詞彙功能。
2. 套用本包對五個 workspace 檔案的變更，包含新的 `workspace-schedule.js`，及 `tools/test-meeting-schedule.mjs`。不要整份覆蓋舊 checkout。
3. 無資料遷移、無新環境變數。禁止批次改舊會議或舊任務日期。
4. 執行 VERIFY.md。正式發布須經主線審查及檢查，再從合併的精確提交部署 AM Platform，另行核對正式服務版本。
5. 本次未指定部署 HOZO_AM／SevenAM，不修改這兩個專案的資料、清單或服務；如另行採用則分別安裝、驗證、記錄。
