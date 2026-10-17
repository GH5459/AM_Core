# 安裝

1. 從最新 main 建隔離工作區。另下載真正最新 AM 設定、UOF 與 DailyLog 完整不可變版本、所有模組及排程到私人目錄。不得用 dirty 根目錄覆蓋正式服務。
2. 執行 `node tools/inspect-meeting-workspace.mjs inspect PRIVATE_ENV PRIVATE_ADMIN_CONNECTION`。以經授權遷移連線執行 `migrate`，新增五張工作頁資料表並只授予原執行角色必要權限。切換時間持久記錄，不重放舊音檔。
3. 用 `tools/release-meeting-workspace.cjs prepare PRIVATE_RELEASE PRIVATE_CONFIG dailylog` 取得完整最新版本，以 `migrate` 新增 D1 發布收據表。其他任務表不改結構。
4. UOF 也以 prepare 取得最新完整快照。`tools/build-meeting-workspace-workers.cjs PRIVATE_PARENT` 只改 UOF 會議 UI 附加片段，以及 DailyLog 既有經認證任務入口，新增會議指派模組。原 Assets、其他模組、秘密、bindings 與 cron 保持。
5. 通過 VERIFY，保留來源雜湊與測試收據，依序 upload/deploy/verify。DailyLog 任務服務先發布，再部署 AM 精確審核提交，最後更新 UOF 模式介面。原共用管理權限與 CSRF 保持。
6. 核對兩個 AM 正式入口、Worker 全模組雜湊／設定／排程與既有 108 對話開關、保存對應。更新各目標自己的發布紀錄。不部署獨立 HOZO_AM 或 SevenAM。
