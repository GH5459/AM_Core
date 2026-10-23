# 驗證

執行 node tools/test-engineering-reminders-disabled.mjs 與 node tools/dryrun-engineering-convergence.mjs。正式 health engineering.modulesLoaded 不得包含 reminders，但必須含 collect 與 meetings；確認原 LINE webhook 官方空事件驗證成功。會議回歸使用隔離資料，不在真人群送測試訊息或製造工作。
