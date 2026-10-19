# 驗證

- node tools/test-meeting-task-dispatch.mjs：部分未連線、改期改文、重新啟動、回覆遺失、取消、不同帳號與跨服務拒絕。
- node tools/test-meeting-workspace-service.mjs：主持人和負責人都未連線仍能發布，連線後補派，Notion 與群組發布不重複。
- node tools/test-meeting-reader-sharing.mjs、tools/test-meeting-collaboration.mjs：保留原頁、逐段修訂與分享隔離。
- 真正完整 DailyLog／workerd／D1：相同會議版本的不同派發批次、固定編號、重試、進度／改派／撤回歷程與併發更新保護。
- 網頁確認「待派發／已派發」及發布提示，390 寬不溢出。正式只讀確認，不代主持人發布真人草稿或建立測試任務。
- 比對原會議、對話設定、準備資料、排程及任務；私人快照與收據不進 Git。
