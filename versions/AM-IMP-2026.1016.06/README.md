# LINE 對話會議管理

將每個 LINE 個人、群組及多人對話列入既有共用後台，會議開關與待辦模式分開。新對話預設關閉會議，已啟用的設定保留。會議庫集中到部署指定的 Meetings 母頁，每對話一庫；逐字稿及結論保存 Notion，原始錄音引用中央附件保存的 Drive 原檔。

共享實作在 `modules/meetings/conversation-*`、`management-*`，安裝及精準 Worker 合併工具在 `tools/meetings-install.mjs`、`tools/build-meeting-management-workers.cjs`。所有帳號、識別碼、登入與私人收據均由部署端提供，不隨此包複製。

既有影子狀態改為啟用，原先未開放的私人助理身分及外部對話輸出保留為獨立關閉設定；停用及離開事實保留。此包不啟用其他任務、提醒或簽核功能，不重播歷史訊息。
