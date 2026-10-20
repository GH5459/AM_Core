# 驗證

- node tools/test-meeting-save-version.mjs：真實工作頁HTML／client的DOM測試；涵蓋三種焦點中連續儲存、lost／503／409同值恢復、送出中新輸入、真正他人衝突、物件欄位順序、讀取失敗及舊輪詢。
- 原版本須在相同測試中失敗，修正版通過。
- node tools/test-meeting-workspace.mjs
- node tools/test-meeting-workspace-service.mjs
- node tools/test-meeting-collaboration.mjs
- node --experimental-vm-modules tools/verify-private-assistant-pause.mjs
- node tools/check-upgrade-package.js AM-IMP-2026.1020.22
- 完整GitHub CI通過；兩origin精確合併commit及HTML client回讀；原會議／設定與其他部署保留。

合成驗證不使用真人LINE、任務或會議保存測寫。
