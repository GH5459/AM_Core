# Verify

執行 `node --test tools/test-line-task-dates.mjs tools/test-line-activity-agenda.mjs`、`node --experimental-vm-modules --test tools/test-group-quick-create.mjs`、`node --test tools/test-leaf-tasks.mjs` 與 `node --experimental-vm-modules --test tools/test-leaf-calendar.mjs`，並使用最新完整 Worker 的隔離候選執行 `tools/test-group-quick-create-worker.cjs`。另執行 package 檢查、alignment audit 和專案既有 CI。

核對日期、來源、共同負責人、未開通拒絕、回覆原訊息定位、修改與取消權限、重複請求、同時確認、十分鐘到期、部分行事曆失敗及原有流程。正式版本須逐項回讀，真人 LINE 與 Google 自然使用結果不得由隔離測試代稱完成。
