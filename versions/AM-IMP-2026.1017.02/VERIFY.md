# 驗證

- `node tools/test-meeting-workspace.mjs`：真正 PostgreSQL 語意、不同音檔、共同編輯、衝突、主持人、日期、未分派待辦與永久鎖定。
- `node tools/test-meeting-workspace-service.mjs`：LINE 同意、登入及目前成員、來源隔離、製作與發布分離、名單不足標示、Notion／任務回覆遺失復原。
- `node tools/test-meeting-workspace-generation.mjs`：Drive 原檔串流、自訂 Prompt、會議日期、性別提示、署名時間點、零提前發布。
- `node tools/test-meeting-workspace-worker.cjs PRIVATE_PARENT MINIFLARE_PATH`：真正完整 Worker、D1、原任務模型、認證與重試去重。
- 既有 conversation/personnel、錄音、審核、LINE 任務與中央附件回歸，以及 GitHub 完整 CI。
- 內建瀏覽器以合成資料查驗設定、自訂類型、一般成員修改、主持人確認與同連結唯讀，手機無水平溢出。不得以合成測試或健康檢查取代真人錄音驗收。
- 正式核對提交、全部模組、原秘密／Assets／設定／排程、匿名拒絕、任務服務契約及開關前後一致。檢查升級包並執行對齊稽核；歷史缺項獨立說明。

限制：LINE 全體成員 API 有帳號資格限制；無法取得時由已綁定同仁與歷史來源補名單，逐人重新核對目前成員，明示名單尚未確認完整。主要錄音串流處理；直讀備援最大 64 MB，超出時保留來源、提供重試，不假稱成功。私訊只有本人。
