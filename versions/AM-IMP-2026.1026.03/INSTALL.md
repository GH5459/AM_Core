1. 確認原聊天對本項實作及正式部署的直接授權；不沿舊案件核准或 lease。
2. 取得兩站真正最新 100% 版本、完整模組、runtime、bindings、Assets 設定及排程；私人保存來源與回退參照。
3. 從已審查、完整 CI 通過並合併的 main 以 build-worker.cjs 精準延伸。DailyLog 只變更 worker.mjs 並增加 entry-speed.mjs；UOF 只變更外層 Worker、review UI 並增加同名模組。
4. 保留 UOF 原 DO 類別與所有相關函式 bytes；採 deferred code update，不使用 immediate cutover。先發布兩 Worker，再啟用 AM 原指令的快速入口。
5. 核對來源、模組 hashes、100% 版本、全部原設定及正式功能後，才記錄 Deployed。
