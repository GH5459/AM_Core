# 安裝

1. 從最新 origin/main 套用 line-record、workspace-service 及舊一般／備援發布呼叫；保留同期其他修改。
2. 執行 VERIFY 與完整 CI，合併並部署受測 main 精確提交。
3. 兩個正式來源 health.conversationMeetings.workspace.lineFormat 應為 meeting-line-indented-outline-v1。
4. 無資料庫遷移，不重發 DailyLog／UOF，不重播錄音或修改已發布記錄。原通知收據與重試鍵保持，不清除 notified 或補送歷史訊息。
5. 私人快照及排版範例僅在庫外保存；真人 LINE 訊息不作為測試寄送。
