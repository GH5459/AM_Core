# 安裝

1. 使用目標正式服務的最新設定與最新已部署完整版本建立私人備份。不要使用 dirty 工作目錄作為發布來源。
2. 私人設定提供 Meetings 母頁，與現有中央附件保存共用同一 OA 及 Drive。啟用 `AMCORE_CONVERSATION_MEETINGS_ENABLED=1`。
3. 執行 `node tools/meetings-install.mjs inspect ENV_FILE PRIVATE_DIR`，再執行 `plan`；盤點保存在 PRIVATE_DIR。核對每個舊庫只屬於一個對話，預設單位總庫不可當作單一對話搬移。
4. 執行 `migrate`：增加 PostgreSQL 表、保留既有會議開關及有效模式、建立新庫、搬移專用舊庫並核對原頁面 ID。Drive 不搬移、不複製原檔、不重分析歷史錄音。原共用庫留在原位，遇到不明歸屬一律停止。
5. UOF 與 DailyLog 各自下載真正最新完整 Worker 及不可變版本，使用 `tools/build-meeting-management-workers.cjs PRIVATE_DIR` 精準合併。UOF 仍沿既有登入、最新管理權限及 CSRF；DailyLog 沿既有管理服務的最新權限及有效人員檢查，再簽章呼叫 AM。
6. DailyLog 的部署私有 `AMCORE_MEETING_MANAGEMENT_SECRET` 與 AM 端相同。AM 可沿用既有 `AMCORE_LINE_DIRECTORY_OWNER_API_KEY`，不將其放入程式或前端。
   `AMCORE_MEETING_MANAGEMENT_ORIGIN` 可指定已核對的 AM 正式 HTTPS 原站；只接受無帳密、路徑及查詢的來源網址，仍維持相同簽章、管理權限及禁止轉址。用於自訂網域無法從 Worker 直連時，不把網頁登入資料轉送給 AM。失敗紀錄只含狀態或錯誤類別，不含原始回應、簽章或人員資料。
7. 使用 keep_assets 保留完整正式資產，所有既有秘密、服務、DO、排程及設定保持。僅增加本包需要的服務連線，不更改簽核或任務資料。
8. 經審查的 GitHub main 部署至 AM Platform；逐端驗證後才能標記 Deployed。HOZO_AM 與 SevenAM 獨立服務不在本次部署目標。
