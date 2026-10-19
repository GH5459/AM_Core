# 安裝

1. 核對最新 main 與各目標實際生效的完整模組、設定、排程及 Assets，私人備份留原目標庫外。
2. tools/build-multilingual-management.cjs 精準延伸當前共用人員 bundle，保留其餘模組與開通／身份；不得從 dirty UOF 根目錄重建。
3. tools/build-multilingual-dailylog.cjs 延伸當前完整 DailyLog，新增三個文字模組與原 worker 入口，保留其他模組和 Assets。
4. 按 VERIFY 通過隔離測試與完整 AM CI，經檢查 PR 合併 main 後發布。CF 上傳及切流量前重新檢查版本和設定，發現並行更新先重取基底與驗證。
5. AM 會議使用原 PostgreSQL，僅相容新增翻譯快取及回覆兩表與索引，不改舊表。每日翻譯快取使用既有 documents 的獨立 namespace。
6. 以固定虛構文字驗證翻譯供應端，再回讀兩個 AM 正式來源、DailyLog 全模組與共用管理 DOM。不得改真人語言、任務、會議、LINE、Calendar 或日誌作測試。
