# 安裝

1. 沿最新 main 隔離實作，完整 CI 通過同來源後合併並發布 AM。兩站回讀精確來源及有效簽名唯讀入口。
2. 私人下載 DailyLog 當前完整模組、設定及原資料核對。對現行已安裝會議的 worker 執行本包 build.cjs.patchWorker，只替換內建會議前端。原代理、其他模組及 Assets／秘密／bindings／排程保持。
3. 先以完整 Worker-D1、原 PostgreSQL 會議服務及 Chrome 驗證，再沿原目標發布；不得 build dirty 根、重發歷史包或回灌資料快照。
4. 不建立真人會議、Google 活動、LINE 訊息或實際錄音作測試。不得更改真人身分或權限。
