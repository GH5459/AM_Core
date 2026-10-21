# 驗證

- `node tools/test-meeting-publishing-reader.mjs`：首次開啟 publishing、review 切換 publishing、等待續作、自動讀取、收合預設、展開狀態保留、安全文字及無業務寫入。
- `node tools/test-meeting-save-version.mjs`：逐段儲存、回應遺失、衝突與未儲存輸入保持。
- `node tools/test-meeting-publication-client.mjs`：原發布群組及開始發布後鎖定保持。
- `node tools/test-meeting-topic-hierarchy.mjs`：原分層、對話依據及安全顯示保持。
- `node tools/test-meeting-task-progress-client.mjs`、`node tools/test-meeting-speaker-correction.mjs`。
- `node tools/check-upgrade-package.js AM-IMP-2026.1021.04`；執行對齊 audit 與版本比較，明示既有跨專案路徑限制。
- 正式兩站 `/health` 回讀精確提交；實際會議 HTML 嵌入的 workspaceClient 必須與受測程式一致。
- 原本人登入頁沒有未儲存輸入時重新讀取，只查看標題與收合，不儲存原文或重按發布。
