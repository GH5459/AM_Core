# 驗證

- `node tools/test-meeting-personnel.mjs`：同名不同人、其他 OA、重複綁定、停用同仁、綁定撤銷與錯入口寫入均被阻擋；CSRF、原操作識別與設定版本保持。
- `node tools/test-conversation-meetings.mjs` 與 `node tools/test-meeting-proxy-workerd.cjs MINIFLARE_MODULE_PATH`：既有會議與真正 Worker 連線契約保持。
- `node tools/test-meeting-personnel-workerd.cjs MINIFLARE_MODULE_PATH`：真正 Worker 中的 OA 對話鍵、同仁對應及兩種入口寫入範圍通過。
- `node tools/test-meeting-management-workers.cjs PRIVATE_DIR ESBUILD_MODULE_PATH`：完整最新 Worker 的原登入／管理權限與 CSRF 保持；未授權不得查詢會議。
- 以 `tools/serve-meeting-personnel-preview.cjs PRIVATE_DIR` 在完整原管理資產上用假資料測試：個人出現在正確同仁名下、未對應留待確認、群組頁只顯示 group／room、原人員草稿與導覽保持、個人失敗重整後保留草稿且同操作重試不重複。
- 核對 390 寬及桌面畫面，原權限與主要單位操作不受影響。正式只讀確認，不代開真人會議、不送 LINE 或建立任務。
- 正式版本與全模組／設定／排程回讀確認；既有會議開關、模式、Notion／Drive 對應前後保持。
