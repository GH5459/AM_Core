# 安裝

1. 從最新正式 main 整合本包；保留其他進行中的共同編輯變更。
2. 使用具備建表權限的專案本地連線執行 modules/meetings/workspace.sql，或 tools/inspect-meeting-workspace.mjs migrate <private-env-file> <private-admin-file>；新版工具會授予原執行帳號兩張詞庫表的讀寫權限。不得把參數檔、帳密或實際詞條放進 Git。
3. 部署 modules/meetings/glossary.js、index.js、workspace-service.js、workspace-client.js、workspace-ui.js。無新增機密設定，不需修改 DailyLog 或 UOF Worker。
4. 新增資料表採 IF NOT EXISTS，可重跑；不遷移、不公開既有私人內容，也不自動匯入各單位舊名詞庫。
5. 正式部署依原審查、完整 CI、main 合併與指定 Render 提交流程。HOZO_AM／SevenAM 未指定安裝，不修改其服務或資料。
