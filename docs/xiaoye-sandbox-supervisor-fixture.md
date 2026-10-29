# 隔離監督排程原型

這是只配合假權威資料、假 sandbox provider 及既有 `SandboxController` 的本機測試原型。排程從同一 SQLite 中發現待查案件，持久記錄下次查核時間、失敗退避與短期領取標記；每次有限量處理，避免故障案件永久卡住其他案件。領取期過後可由重啟程序重新處理；舊領取者不能覆寫新的排程結果。單一程序內重疊 tick 不會重入。

每案核對來源版本、代次、權限狀態與 lease；若查核期間成功續期，以最新紀錄重新查權威，重試四次仍不一致則保守停止。查 sandbox 後再查最新權限與時間，避免等待期間到期或撤銷卻回報 active。已知 sandbox 停止但 broker 撤權未確認、無法讀其狀態、撤銷、斷線、過期、權威不可確認或主控記錄結果不明時，沿既有 `stopRecord` 嘗試撤銷和終止；再由 `inspectRecord` 唯讀核對。未確認的副作用維持 unknown，不重新派送。一般週期不使用 `recover()`，因為它的重啟邏輯會將正在進行中的 creating／starting 標示結果不明。

在 creating／registering／starting 時，假權威必須明確回 ownerAlive=true 才視為在途；ownerAlive=false 也會停止 ready／running。該欄位只是測試資料，正式環境目前沒有驗證中的可信存活證明或簽發者，不能因此宣稱已完成重啟後安全接續。若建立者不明而找到 sandbox，先持久撤權，再在後續查核中終止；沒有查到唯一身分則持續保留結果不明。

測試：

```sh
node --test tools/test-xiaoye-sandbox-supervisor-fixture.cjs tools/test-xiaoye-sandbox-controller.cjs tools/test-xiaoye-sandbox-broker-integration.cjs
```

測試用假時間涵蓋到期、權限撤銷、斷線、跨重啟退避、單案逾時及停止失敗、分批、領取到期、正常建立中的競態與固定生命週期。沒有建立服務或呼叫正式 API。

限制：

- 排程只有在主控程序運作並實際 tick 時才會執行；主控離線、電腦關機、資料庫不可用或所有工作積壓時，不能保證即時撤權／停止。sandbox provider 的固定生命週期是另外一層可能的上限，但真實 provider 的執行、終止及時間上限均未驗證，不能拿來證明已停止。
- 目前 controller 預設 sandbox 最大生命週期為 2 小時，可續 lease 但不能超過該 sandbox 的固定 deadline；因此本原型不能宣稱單個 sandbox 可無限續期。較長任務要另有可信的終止、清冊、對帳及安全接續設計。
- 這不是實際部署的排程服務；持久狀態位於單一 SQLite，尚無跨機持久性、正式 event adapter、身分保護、真實權威查詢、可驗證進程樹終止或監控。領取有效期與外部 API 呼叫並非原子，失聯或時間漂移仍可能重疊處理；不能以領取標記宣稱分散式完全互斥或外部寫入已停止。
- 假 provider 查核和终止回覆並非真實執行證據。外部請求已送出可能晚到，停掉 sandbox 也不會撤回已送請求；原本的 unknown 和同資源防重必須保持，不能自行宣稱案件已完成。
