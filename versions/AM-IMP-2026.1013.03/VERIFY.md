# 驗證

- node --experimental-vm-modules --test tools/test-leaf-groups.mjs tools/test-leaf-calendar.mjs tools/test-leaf-tasks.mjs tools/test-line-work-login.mjs tools/test-central-archive.mjs
- node --experimental-vm-modules tools/verify-private-assistant-pause.mjs
- node --experimental-vm-modules tools/verify-attachment-webhook.mjs
- node --experimental-vm-modules tools/verify-bank-line-reply-intake.mjs
- node tools/check-upgrade-package.js AM-IMP-2026.1013.03
- node tools/audit-alignment.js
- node tools/compare-project-manifests.js

實際 PostgreSQL 相容 SQL：來源證據閘、OA 隔離、租約 fencing、原文回補、多人確認、權限變更、撤回、修訂、未登入／未連線回補、未知 API 結果與通知重試。signed webhook 驗證先落盤再 ACK，不重複舊任務入口，保留群組業務上下文。

生產以帶唯一查詢參數的 health 核對 main SHA、lineGroupMentions enabled 與 organizer-confirmation-per-person，再驗證原始來源待處理／issued 回條。實際手機確認與每人 Google 活動須分別報告；health 本身不能證明已新增。全域 audit 若有既有錯誤需記錄，不得宣稱全部對齊。
