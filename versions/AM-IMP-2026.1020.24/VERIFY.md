# 驗證

```text
node tools/test-meeting-publication-target.mjs
node tools/test-meeting-publication-client.mjs
node tools/test-meeting-collaboration.mjs
node tools/test-meeting-hub.mjs
node tools/test-meeting-reader-sharing.mjs
node tools/test-meeting-save-version.mjs
node tools/test-meeting-speaker-correction.mjs
node tools/check-upgrade-package.js AM-IMP-2026.1020.24
git diff --check
```

Chrome 額外驗證（使用既有 Playwright 模組，不更動正式套件清單）：

```text
node tools/test-meeting-publication-browser.cjs <playwright-module-path> <synthetic-screenshot-folder>
```

可用 MEETING_PUBLICATION_HTML 指向私下保存的正式 HTML，測試正式畫面程式；所有網路均被攔截，只使用合成資料。

必驗：未儲存記錄保留、選群獨立儲存、同欄版本衝突比較／回應遺失恢復、來源與待辦責任不變、同 OA／單位及即時成員核對、私人來源的明確分享、草稿隔離、發布後群組只讀與音檔、離群／停用連線／改單位拒絕、鎖定目的地與傳送本文／重試鍵，LINE 接受但回覆遺失仍只接受一次，Notion 及原任務沿用原來源。

原錄音整理開關不作為目的群的選取條件，不因發布變更其值。本人會議清單中目的群只讀者只取得正式主題與日期，不讀會前筆記或後續尚未發布的排程變更。
