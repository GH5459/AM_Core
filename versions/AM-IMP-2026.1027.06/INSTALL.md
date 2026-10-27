# 安裝

只安裝原 AM 與其原工作日誌服務，不套用獨立 HOZO_AM／SevenAM 或 UOF。

1. 從 origin/main 最新隔離工作區修改，秘密與正式資料放 Git 外。
2. 執行 node tools/install-meeting-host-attention.mjs <私人原AM設定資料夾>，為原專用請求表增加固定完成內容、收據與重試欄位；原表與請求保留。
3. 剛回讀原工作日誌完整正式模組、設定、資產與排程，另建候選；只替換 meeting-workspace-assignment.mjs 為本包對應 modules/meetings/dailylog-assignment.mjs。可用 tools/build-meeting-task-dispatch-worker.cjs 核對唯一變更。
4. 完整 Worker／D1 合成驗證後，核對正式版本沒有前進，再沿原設定／秘密／資產／排程發布此唯一模組更新；回讀完整正式包與權威版本。
5. 工作日誌完成介面先上線，再部署原 AM 的精確通過檢查提交。背景同步現有請求時，只能完成有原始來源、原主持人及明確處理事實的清理提醒；不可代建真人測試資料。
