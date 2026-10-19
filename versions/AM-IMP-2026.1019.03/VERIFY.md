# 驗證

- `node tools/check-upgrade-package.js AM-IMP-2026.1019.03`
- `node tools/test-meeting-schedule.mjs`
- `node tools/test-meeting-workspace.mjs`
- `node tools/test-meeting-collaboration.mjs`
- `node tools/test-meeting-workspace-generation.mjs`
- `node tools/test-meeting-reader-sharing.mjs`
- `node tools/audit-alignment.js`：檢查既有專案清單；若舊路徑不存在或歷史缺列，須分開記錄，不得宣稱全面對齊。

瀏覽器以合成資料確認：四個內建類型、切換工作週期、日／週／月／自訂預覽、設定保存、製作後待辦日期、手動新增預填與手動改期儲存。不能以此宣稱真人錄音完整驗收或正式部署。

日期樣本：2026-10-19 週會 → 10-25；月會 → 11-18；每 14 天 → 11-01；指定下次 10-29 → 10-28。2026-01-31 月會 → 02-27，2028-01-31 → 02-28。
