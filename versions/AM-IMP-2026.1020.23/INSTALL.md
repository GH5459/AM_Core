# 安裝

1. 以最新 origin/main 為基準，保留其他並行改善，套用 workspace-speakers.js、workspace-client.js、workspace-ui.js、workspace-store.js、workspace-access.js 與 workspace-service.js。
2. 執行 VERIFY.md 的檢查。無資料表遷移、秘密或環境變數變更，不重發 DailyLog 或 UOF。
3. 如要正式發布，沿原 AM 專案部署流程驗證精確版本及兩個正式網址；未驗證前保持 Ready。既有會議內容不需遷移或自動改寫。
4. 舊網頁仍執行原程式；有未儲存內容先保存或另行保留，確認後再重新載入新版。不可直接重新整理使用者正在編輯的頁面。
5. HOZO_AM、SevenAM 若另行採用，須分別安裝、測試及記錄，不能混用身分、會議或資料。
