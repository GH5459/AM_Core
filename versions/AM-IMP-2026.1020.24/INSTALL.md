# 安裝

1. 以最新 origin/main 延伸 publication-target.js、workspace-service.js、workspace-client.js、workspace-ui.js 及 hub-service.js，保留並行修改。
2. 不需新增資料表、環境變數或秘密。先以原專案資料庫擁有者執行 `node tools/install-meeting-publication-target.mjs install <private-release-folder>`，安裝 publication-target.sql 的保護函式與觸發器。此步只有 DDL、不重寫業務列；資料庫擁有者連線與環境檔須沿既有私有資料夾，不得進 Git。再執行相同工具的 verify。使用原 receipt.publicationTarget／publicationDelivery、field_versions.publication_target 與原修改歷程表；不回填歷史會議。
3. 執行 VERIFY。沿原 AM 正式服務與完整 CI 發布精確合併版本；兩正式網址回讀一致後才標示 Deployed。DailyLog／UOF 不重發。
4. 部署前後私下比對原會議、設定、錄音、分享、修訂及任務責任。正式本人頁只讀確認名單及控制；不代選群、儲存真人設定、發布或傳 LINE。
5. 已開啟且有未儲存內容的舊頁先保存或另行保留，再由本人重新整理；不能回蓋輸入。
6. HOZO_AM／SevenAM 若另外採用須各自安裝、驗證及保存紀錄，不能共用業務資料或秘密。

新目的群發布使用 lease_until=infinity 阻擋舊 worker，由新版沿 receipt.publicationLeaseUntil 恢復。觸發器也攔住舊 API 的有限租約寫入；保護未安裝時，選擇新群組會明確失敗。新目的群發布必須由新版確認視窗送出群組 key 與版本；舊頁不能不經確認直接發布。
