# 發布確認提示與待辦預設日期

發布失敗的提示原本顯示在確認視窗後方，使用者可能以為按鈕沒有反應。現在視窗內直接顯示進度及失敗原因；送出時停用重複確認，提供檢查發布狀態。缺少 LINE／工作日誌連線時，說明主持人及第幾項負責人需完成本人登入，不繞過身分驗證。

AI 產生及人工新增待辦的截止日，預設為建立當天（台灣時間），仍可修改。既有待辦、已填日期、正式會議與任務不批次改寫。

程式在 `modules/meetings/workspace-{client,ui,service,model}.js`；測試見 `tools/test-meeting-workspace*.mjs`，合成瀏覽器可用 `MEETING_WORKSPACE_PREVIEW_UNLINKED=1` 重現連線未完成的發布提示。
