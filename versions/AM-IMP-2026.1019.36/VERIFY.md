# 驗證

- `node tools/test-meeting-decision-record.mjs`：議題整合、重複過濾、真實時間／講者及職稱、文字安全、舊格式、工作／分享規則、Notion 回覆遺失與內層依據衝突。
- `node tools/test-meeting-workspace-generation.mjs`：新格式、類型要求之後的固定精簡規則、原錄音串流、姓名、日期、逐字稿與獨立待辦。
- 原 workspace／service／reader-sharing／collaboration／task-dispatch 測試與 `tools/dryrun-meetings.mjs`。
- 合成瀏覽器檢查：收合預設、每題獨立展開、390 寬不溢出、原待辦／錄音／完整逐字稿仍可用。
- `node tools/check-upgrade-package.js AM-IMP-2026.1019.36`、alignment 與 manifest 比較。記錄舊版工具的已知限制，不宣稱跨專案全面對齊。
- 正式：精確提交、兩站格式契約；原本人登入會議確認新版八議題及依據；比對既有待辦內容／負責人／期限、完整逐字稿、原錄音與原 Notion 頁及分享設定。未完成同步時不可宣稱已更新。
