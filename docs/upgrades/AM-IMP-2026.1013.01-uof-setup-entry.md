# UOF 未綁定者入口

使用者要求新同仁按 UOF 後收到綁定連結；原選單只送「待簽」，未綁定私訊在
一般私人助理暫停與本人傳輸篩選前即消失。新增受 LINE 簽章驗證的公開導覽分流，
新讀有效本人私訊綁定；未綁定／待確認／暫停者收到啟用頁按鈕，已綁定者沿原傳輸。

啟用網址沒有 LINE ID、工號或 token；登入與開通、單次文字配對及本人最後確認由
UOF 原端点執行。新功能不讀待簽、不建核准、不改綁定、權限或 Worker。
資料庫故障回 503 保留 webhook 重送；入口在既有 durable capture 成功並 ACK 後回覆。
十分鐘 bounded event 去重，傳送失敗不轉 push、不補發歷史。

本包僅 Root AM Platform 安裝，原平台最新改進及獨立 OA 保持。測試與實際發布
證據分開記錄；Ready 不代表正式生效或手機驗收。

2026-10-13 本機驗證：63 項入口／本人 binding／I/O／日誌登入與導覽、19 項 Calendar
回歸全通過；三個真 server webhook 模擬（私人助理暫停、附件、銀行回覆）通過。
固定新按鈕 LINE 官方 validate/reply HTTP 200（未送訊息）；公開啟用頁 HTTP 302
導向本人登入，ReturnUrl=/Line/Setup。單包檢查與 syntax／diff 檢查通過。
全域舊 alignment audit 仍有歷史 standalone HOZO_AM／SevenAM 路徑與 manifest
缺漏，未宣稱全專案 alignment 完成，也不藉此改其他系統。
