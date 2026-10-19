# 驗證

- node tools/test-meeting-glossary.mjs：實際 PostgreSQL 相容資料庫、登入與成員、跨會議共用／跨服務隔離、版本衝突、衝突詞／輸入上限／停用／歷程、詞庫網頁及 LIFF 回跳、辨識／整理／備援詞庫提示、讀取失敗明確阻擋。AI 與外部服務採合成回應，此項驗證提示內容，不宣稱實際聲音辨識品質。
- node tools/test-meeting-workspace-generation.mjs
- node tools/test-meeting-reader-sharing.mjs
- node tools/test-meeting-workspace.mjs
- node tools/test-conversation-meetings.mjs
- node tools/dryrun-meetings.mjs
- Browser：node tools/preview-meeting-glossary.mjs，僅在 127.0.0.1:43129 提供全合成資料，測試開啟、新增、修改、搜尋、停用及另開網頁；測試結束停止程序。
- 生產環境後續：核對實際提交、資料表與帳號權限、本人登入可開啟詞庫及新錄音的校字結果；未執行不得稱 Deployed 或真人驗收完成。

- node tools/test-meeting-glossary-import.mjs：200 筆真實資料表寫入、無寫入預覽、TXT／TSV／帶引號 CSV、標題／BOM／編碼、重複與錯字衝突、預覽過期、超量、整批及歷程回退、登入與原對話成員與指定觀看者隔離。
- 詞庫整理測試以 200 詞確認最後一詞也帶入摘要與音檔備援。瀏覽器合成資料確認 200 筆預覽與一次匯入成功，無真人詞庫匯入。

正式安裝後可執行 node tools/verify-meeting-glossary-database.mjs <private-folder>：使用原執行帳號及唯一隔離的合成服務範圍驗證 200 詞預覽／匯入／去重／歷程，核對真實詞庫保持，並在 finally 清理自己建立的合成列。這不是以真人會議匯入或錄音重播代測。
