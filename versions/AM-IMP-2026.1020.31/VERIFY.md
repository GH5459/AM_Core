# 驗證

執行 node tools/test-meeting-list-progress.mjs、node tools/test-meeting-task-progress.mjs、node tools/test-meeting-task-progress-client.mjs 與本包檢查。確認未授權、跨服務、撤銷分享及草稿拒絕讀取；清單不傳私人成果；完成、重啟、逾期、讀取失敗與恢復正確。

以合成會議確認手機清單不溢出，再於正式本人登入清單只讀核對每場數量。兩正式網址回讀精確提交與最新清單程式，原會議／任務／分享與通知資料前後核對。真人會議或任務不測寫。

## 正式結果

PR407 最後完整 CI 4分12秒通過；AM 精確提交 7c94f733f11b7e6980ea2fb9ed31cc84fff988c3 兩站核對，Render 1分45秒 Live。本人正式清單 11 列／10 場不同已發布會議的總數及完成數與原任務核對一致；原清單 18 列與原連結保持。原13會議與246任務保留，期間2筆正常任務更新與成果均保留。無新增LINE推播，DailyLog/UOF不重發。完整紀錄：docs/upgrades/meeting-list-progress-20261020.md。
