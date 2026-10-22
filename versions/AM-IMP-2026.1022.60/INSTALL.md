# 安裝

沿真正最新正式完整DailyLog包精準延伸。保存所有原模組、設定、兩cron及原工作／權限的私人快照；不build dirty根、不回灌資料。新增xiaoye_event_outbox與專用SQLite Durable Object類別XiaoyeEvents／XIAOYE_EVENTS binding，原Assets、秘密與其他bindings保持。

完整隔離驗證、PR審核及CI通過後，精準發布完整包並回讀。依原登入Codex CLI安裝私人本機處理器，用加密連線接收原API的事件指標；機密只留原DailyLog私人目錄。接收器啟動與登入啟動均隱藏，不另開真人LINE／UOF帳號，不用定時AI輪詢作備援。

事件處理器只有收到事件才啟動codex exec，沿現有本機登入，不另開通API或新模型。指定事件租期、原本人核准及工作租期每次操作重驗。處理器重啟不得重做結果不明的已啟動工作；保留證據、通知本人查核。
