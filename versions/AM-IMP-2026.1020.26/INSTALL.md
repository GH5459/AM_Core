# 安裝

1. 由最新 main 合入本包的 AM 來源、server.js 原服務連接與測試。
2. 重新匯出原 DailyLog 最新完整程式、設定、模組及部署版本到私人資料夾；不能使用測試快照部署。
3. 私人資料夾須有 dailylog/baseline，執行 node tools/build-meeting-task-progress-worker.cjs <私人絕對路徑>。它保留原全部模組，僅增加認證後的 meeting-progress 讀取入口、meeting-task-progress.mjs。原 assignment 與任務寫入邏輯沿最新 baseline 原樣保留。
4. 驗證 candidate 差異，保留設定、資產、秘密、排程及其他模組；先安裝 DailyLog 讀取介面，再更新原 AM。無新增資料表或環境設定。
5. 正式驗證前保持 Ready。此次未部署，UOF 與獨立 HOZO_AM／SevenAM 不在本輪範圍。
