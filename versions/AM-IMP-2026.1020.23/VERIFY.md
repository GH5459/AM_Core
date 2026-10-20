# 驗證

在本升級包所屬 checkout 執行：

```text
npm ci --ignore-scripts --no-audit --no-fund
node tools/test-meeting-speaker-correction.mjs
node tools/test-meeting-save-version.mjs
node tools/test-meeting-workspace.mjs
node tools/test-meeting-collaboration.mjs
node tools/test-meeting-workspace-generation.mjs
node tools/check-upgrade-package.js AM-IMP-2026.1020.23
git diff --check
```

合成測試涵蓋：A/B同時交換、逐段修正、原文與時間保留、摘要一般人名保持、待辦原負責人與日期保持、復原、未儲存編輯與返回設定、真正資料庫版本保護、主持人權限、禁止第二步重新製作、修改歷程、衝突及回應遺失恢復。

正式驗證需區分本機完成與已部署；不可代用真人會議保存測試、發布、建立任務或傳送 LINE。跨專案一致性僅能在相關專案安裝並完成 alignment audit 後宣稱。

Chrome 額外測試（可提供既有 Playwright 模組路徑；不需變更專案套件清單）：

```text
node tools/test-meeting-speaker-browser.cjs <playwright-module-path> <synthetic-screenshot-folder>
```

已以本機 Chrome 無畫面模式驗證 360／390／768／1024 寬及實際按鈕流程；所有網路要求由測試攔截，只使用合成資料。
