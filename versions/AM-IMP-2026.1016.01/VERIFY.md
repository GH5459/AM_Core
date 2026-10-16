# 驗證

node --test tools/test-leaf-task-photos.mjs tools/test-leaf-tasks.mjs tools/test-archive-file-lookup.mjs
node --experimental-vm-modules --test tools/test-leaf-groups.mjs
node --experimental-vm-modules tools/verify-private-assistant-pause.mjs
node tools/check-upgrade-package.js AM-IMP-2026.1016.01

DailyLog 執行 reference 的完整 Worker+D1 測試：目的金鑰、pilot、原交辦人、群組／任務範圍、選擇版本、原圖 bytes、重試去重、既有附件閱覽權限及撤權。LINE validate API 驗證 Flex 結構且不發訊。最新公開入口／模組 hash／原全部 bindings、資產命名空間與 cron 均需回讀。真人手機／Windows LINE 端到端由使用者自然測試，不能以合成通過代稱。
