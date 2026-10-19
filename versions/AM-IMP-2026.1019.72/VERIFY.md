# 驗證

- node tools/test-meeting-topic-hierarchy.mjs：三層文字往返、依據位置、瀏覽器安全輸出、Notion 深度限制、每階段回覆遺失重試與外部修改拒絕。
- node tools/test-meeting-text-access.mjs：以真正受限資料庫角色確認已安裝表可讀，不再每次讀會議都建立索引；原建立資料表權限仍拒絕。
- node tools/test-meeting-decision-record.mjs：來源核對、舊格式、Notion 與原正式修訂路徑不更動任務。
- 原 generation、reader-sharing、collaboration、task-dispatch、glossary 與 dryrun-meetings 測試。
- 合成頁面確認逐層展開／收合、鍵盤操作、輪詢保留展開位置、390 寬不溢出。
- node tools/check-upgrade-package.js AM-IMP-2026.1019.72；執行 alignment、manifest 比較並記錄已知限制。
- 正式兩站精確提交與新契約，原本人登入頁面四大主題及三層內容。單份修訂完成、原 Notion 全部舊內容及新增內層回讀一致；原任務／錄音／逐字稿／分享與其他會議保持。
