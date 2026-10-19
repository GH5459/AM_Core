# 驗證

node --experimental-vm-modules --test tools/test-group-quick-create.mjs
node --test tools/test-leaf-tasks.mjs tools/test-leaf-task-edit.mjs tools/test-calendar-recurrence.mjs
node --experimental-vm-modules tools/verify-private-assistant-pause.mjs
node tools/test-group-quick-create-worker.cjs <私人完整包> <miniflare路徑>
node tools/verify-group-quick-create-synthetic.mjs <私人回執目錄> <原AM環境檔>
node tools/check-upgrade-package.js AM-IMP-2026.1019.02

檢查bot-only／真mention／非建立討論／否定／缺內容與日期／本人及群限制／舊revision／10分鐘逾時／取消與來源撤回／身份變更／重啟／同事件防重。完整Worker用真正現行任務model驗建卡、dueDate與dueAt、source與self來源、無交辦提醒、並行收據同交易、遺失回應重試不覆蓋進度、撤權及失敗回滾。LINE只validate格式，不推真人訊息。正式兩origin quickCreateContract、原Calendar／task及私人target-health；DailyLog全模組hash與完整設定排程保持。真人自然操作驗收另列。
