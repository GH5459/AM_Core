# 工程 AM 提醒停用部署記錄

狀態：Deployed，2026-10-23。

已核對葉小蝸 OA @643doynp 的現行 webhook 為 https://am.hozorental.com/webhook/line，承接者是 AM Platform engineering 租戶；舊獨立 BuildAM 是另一支服務。

- AM Platform：由正式 be132040 精準延伸至 ecfe1b91443109cc28fcdd5eecc8aa43c6448325，Render Live。PR #446 已合併；完整 CI 39912138758 通過。正式網域與 Render 原網址均回讀同一 commit。
- engineering 不再載入 reminders；collect、meetings、tasks、construction 保留；Notion、群組分流、Drive 與會議 AI 設定正常。其他租戶的 reminders 清單保持。
- LINE Developers 官方 Verify 回傳 Success，僅空事件，未在真人群傳訊息或上傳錄音。
- 舊 BuildAM：fe299e8 已正式部署；dueRemindersEnabled=false，/cron/reminders GET／POST 都是404；daily-reminders workflow 狀態 deleted，無排隊或執行中的該 workflow。
- 本機：工程收斂18/18、核心路由與資料隔離19/19、會議對話／音訊接收回歸與新增工程停用檢查通過。

驗證限制：此輪確認正式連線、載入狀態及隔離測試，未以真人新訊息／新錄音跑完整收集與會議產出。既有 Notion 任務及記錄未刪除。

回復請指定部署前 AM Platform commit be132040，勿把目前主分支全部功能當作舊版。BuildAM 舊服務回復點 f7ab455；重新啟用排程前應確認本人需求。
