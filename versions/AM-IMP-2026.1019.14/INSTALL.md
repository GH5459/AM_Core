# 安裝

先核對真正最新 DailyLog 完整正式模組與配置；精準新增 completion-report 核心與受保護 UI 回應，不 build dirty 根或上傳測試 public。原全部模組、Assets、秘密、bindings 和 cron 保持。AM 只新增專用 endpoint 與原 leafTasks 的入口，完整 CI 通過後由已審閱 main 正式部署。兩端共用原 task-service key，無須新 LINE token。只用隔離資料測試，禁止真人 LINE 測寫。
