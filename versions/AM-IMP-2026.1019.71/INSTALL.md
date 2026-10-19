# 安裝

1. 從最新正式主線套用 decision-record、產生 schema、原觀看版與 Notion 呼叫調整；不使用舊 dirty checkout 全量發布。
2. 執行 VERIFY 及完整 CI，部署該精確提交。不重發 DailyLog／UOF。原多語回覆安裝若尚未給執行帳號存取兩張專用表，以庫外私人設定目錄執行 `node tools/install-meeting-text-access.mjs PRIVATE_FOLDER`；工具只補這兩表的 SELECT／INSERT／UPDATE，不開放建立資料表或其他資料。
3. 兩個原正式來源 health 的 workspace.recordFormat 應為 meeting-topic-hierarchy-v2。
4. 新製作套用三層主題規則。只更新主持人本次明確指定的單份正式記錄，透過 tools/update-meeting-record.mjs 原修訂佇列，先 snapshot、再 apply、最後 verify。
5. 快照及核准內容在庫外保存。套用前核對原版本與所有受保護欄位；遇正常後續修改先重新核對，不強制覆蓋。其他歷史會議不批次重寫。
