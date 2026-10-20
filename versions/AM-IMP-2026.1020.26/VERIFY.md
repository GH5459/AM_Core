# 驗證

- node tools/test-meeting-task-progress.mjs
- node tools/test-meeting-task-progress-client.mjs
- node tools/test-meeting-workspace.mjs
- node tools/test-meeting-reader-sharing.mjs
- node tools/test-meeting-publication-client.mjs
- node tools/test-meeting-speaker-correction.mjs
- node tools/test-meeting-workspace-worker.cjs <私人測試包>：完整 DailyLog 程式、原任務模型與真正 D1 隔離測試，含新增讀取入口。
- node tools/check-upgrade-package.js AM-IMP-2026.1020.26；node tools/audit-alignment.js；node tools/compare-project-manifests.js。

核對重新開啟、改派、改期、無成果、無權讀成果、讀取失敗、撤銷權限、草稿、公開連結及無新 LINE 工作。正式部署後另核對原會議／任務識別、內容與版本，並由本人只讀檢查手機畫面，未做前不得宣稱完成正式或真人驗收。

本機 workerd 最新支援 2026-08-06，完整程式測試以 MEETING_TEST_COMPATIBILITY_DATE=2026-08-06 及 nodejs_compat 執行；未更改正式相容日期。
