# 驗證

node tools/test-meeting-audio-stream.mjs；node tools/test-meeting-audio-fast-browser.cjs <playwrightPath>；node tools/test-meeting-upload-browser.cjs <playwrightPath>；node tools/test-meeting-hub.mjs；node tools/test-multilingual-meetings.mjs；原工作頁／分享／修訂測試。

必測：回覆遺失、部分接受、過期session同檔ID續作、內容摘要衝突、非主持人／失效／外站／不同服務拒絕、舊片段保持、晚到上傳不覆蓋新錄音、沒有音檔bytes資料庫寫入。Drive session只留後端。語言變更的翻譯前後查驗保持，不做跨請求身分快取。

同檔比較使用tools/benchmark-meeting-upload.mjs <privateConfig>：舊來源及輸出均為私人絕對路徑，合成WAV相同bytes，隔離PostgreSQL schema與Drive資料夾、真實傳輸；LINE及人員以合成身分處理且不加入人工延遲。比較檔案及10秒錄音分段兩種模式，保存時間、請求／資料量／SQL／身分查詢數及雲端MD5。測試資料夾完成後移入垃圾桶、隔離schema清除，不觸碰原會議或錄音。
