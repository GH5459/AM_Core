# 安裝

1. 下載真正最新 UOF 與 DailyLog 完整版本及配置至部署端私人目錄，核對不可變版本與全部模組。不得全量發布 dirty 專案。
2. 以 `tools/build-meeting-personnel-worker.cjs PRIVATE_DIR` 只替換 UOF 既有管理頁的會議介面附加片段與會議管理模組。保留原登入／管理者／CSRF 檢查。
3. UOF 新增非秘密部署設定 `AMCORE_MEETING_BOT_USER_ID`，值必須來自已核對的中央附件 OA。不可寫進共用包。沒有此設定時，個人設定失敗關閉，群組仍可查詢。
4. 個人帳號對應來自原 UOF 本人綁定與最新有效同仁名單。儲存前再向原綁定服務核對，拒絕已撤銷、重複、停用、其他 OA 或錯帳號。沒有綁定者先由本人使用原 UOF 設定流程，不可代配或更改其他功能。
5. 完成隔離測試與 UI 驗證，將審查通過的 main 對應內容精準部署至 UOF。keep_assets、秘密、DO、排程與其他模組保持。本包不需要重發 AM 或 DailyLog，不部署獨立 HOZO_AM／SevenAM。
6. 更新目標專案改善清單及發布記錄，核對正式管理畫面後才標 Deployed。
