# 驗證

- `node tools/test-meeting-workspace-service.mjs`：跨正式網域轉址、原 ID、無快取、正確入口不循環、正確來源 API、非成員與其他網站拒絕、錯誤入口拒絕；原共同確認與永久鎖定流程保持。
- `node tools/test-meeting-workspace.mjs`、`node tools/test-meeting-workspace-generation.mjs`。
- `node tools/check-upgrade-package.js AM-IMP-2026.1017.03`。
- 正式發布後，從原始 LINE 工作頁網址開啟，核對進入 LINE 正常登入頁，無 error400；本人登入後才確認實際會議內容。不可用合成身分替代正式登入。
- 以只讀設定快照確認對話開關與 Notion／Drive 對應未變；真人辨識、發布及任務建立不由查驗代按。
