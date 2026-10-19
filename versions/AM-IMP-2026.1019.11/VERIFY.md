# 驗證

執行 `tools/test-meeting-workspace-service.mjs`、`tools/test-meeting-collaboration.mjs`、`tools/test-meeting-reader-sharing.mjs`、`tools/test-meeting-share-notices.mjs` 及套件檢查。

使用合成預覽（可設定 `MEETING_READER_PREVIEW_PORT`，避免中斷其他預覽）：發布後切編輯顯示固定儲存鈕；修改多段可計數、依序儲存並於同步後出現在觀看版，重開仍保留；同段衝突時停止、保留自己與尚未儲存的輸入。分享的未儲存選擇不隨內容儲存送出，三角形收合可恢復選擇；修改紀錄折疊無雙層留白。檢查手機寬度與原一般成員編輯／只讀分享規則。

正式發布前後只讀比對原會議、分享、版本與對話設定；不透過真人寫入驗證按鈕。具體某段是否儲存，需由原會議連結與修改文字比對，不以分享已儲存推斷內容已儲存。
