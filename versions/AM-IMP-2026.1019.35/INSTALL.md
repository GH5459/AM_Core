# 安裝

1. 從最新 origin/main 建立隔離工作區，保存目前完整 DailyLog、設定、資產、秘密及排程的私人快照。
2. 在本專案資料庫執行 modules/meetings/workspace.sql；執行 tools/inspect-meeting-workspace.mjs migrate，授予原 runtime role 新 meeting_task_dispatches 表的 SELECT／INSERT／UPDATE。
3. 使用 tools/build-meeting-task-dispatch-worker.cjs，只替換最新完整 DailyLog 的 meeting-workspace-assignment.mjs；其他模組與設定保持。
4. 完成真正 Worker／D1 及 AM 隔離測試，先發布向後相容的 DailyLog，再發布精確 AM 提交。
5. 更新本專案清單與 docs/upgrades/ 紀錄，執行套件檢查、對齊稽核與版本比較。其他獨立專案須各自安裝。

新派發表不自動匯入已發布歷史會議。已由主持人開始發布、尚在續作的會議沿原發布工作恢復；尚未確認發布的草稿仍由主持人操作。
