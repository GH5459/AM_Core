# 安裝

1. 使用經完整 CI 與審查後合併的本版本來源。
2. 在原 DailyLog 私人目錄保存真正最新完整模組、部署版本及設定回退；只將 `modules/meetings/dailylog-assignment.mjs` 安裝為 `meeting-workspace-assignment.mjs`。
3. 完整 Worker 與真正 workerd/D1 驗證後精準發布，其他模組、Assets、秘密、bindings、cron 不變。
4. 原派發器沿既有凍結請求與回執接續，不改派發資料、不重建會議、不重播葉小蝸舊失敗事件。
