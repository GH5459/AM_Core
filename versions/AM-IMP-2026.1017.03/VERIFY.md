# 驗證

- `node tools/test-meeting-workspace-service.mjs`：跨正式網域轉址、原 ID、無快取、正確入口不循環、正確來源 API、非成員與其他網站拒絕、錯誤入口拒絕；原共同確認與永久鎖定流程保持。
- 登入回傳的共用入口 `?liff.state=/work/{id}` 也回傳同一工作頁，保留 SDK 的第一段初始化；API／錄音固定使用該場 ID 的路徑，不誤打共用入口；外站或 API 形式的 state 不當成工作頁。
- 尚未指定單位的對話亦使用部署端的登記入口。工作頁帶入驗證過的登入網址，瀏覽器在初始化 SDK 前再次核對實際網域，涵蓋前方代理改寫 Host 的情形。
- `node tools/test-meeting-workspace.mjs`、`node tools/test-meeting-workspace-generation.mjs`。
- `node tools/check-upgrade-package.js AM-IMP-2026.1017.03`。
- 正式發布後，從原始 LINE 工作頁網址開啟，核對進入 LINE 正常登入頁，無 error400；本人登入後才確認實際會議內容。不可用合成身分替代正式登入。
- 以只讀設定快照確認對話開關與 Notion／Drive 對應未變；真人辨識、發布及任務建立不由查驗代按。
