# 驗證

- node tools/test-meeting-share-notices.mjs：新加入才通知、草稿延後、重複儲存、重啟、逾時同鍵、撤銷、連線補齊、身分變動、時限停止及歷史不補發。
- node tools/test-meeting-share-recipient.mjs：原 UOF／工作 LINE、服務隔離、正反向帳號核對、重複與失效拒絕。
- node tools/test-line-bindings.mjs：本人來源即時核對及不寫原綁定。
- 原會議讀取、共同編輯、週期、入口及發布測試須通過。
- tools/test-meeting-sharing-worker.cjs 在最新完整 Worker 與真正 workerd/D1 驗證服務／單位／OA／帳號，正反綁定均需一致。原任務／Calendar 測試保持。
- 合成瀏覽器儲存兩人名單顯示不同狀態及手機無溢出；正式頁只讀查驗，不替真人勾選分享或送測試通知。
- tools/verify-meeting-share-notices.mjs 前後核對原工作頁、設定、編輯／分享／修訂／Calendar 歷程；部署不建立真人通知工作。
