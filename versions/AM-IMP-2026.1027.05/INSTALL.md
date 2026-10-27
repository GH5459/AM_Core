# 安裝

只安裝至原 AM 平台；獨立 HOZO_AM／SevenAM 尚未要求安裝。

1. 核對 origin/main 最新程式，在隔離工作區修改。
2. 在 Git 外的私人資料夾準備原 AM 的 am-production.env 與 database-migration.private.txt；不得提交秘密或真人資料。
3. 執行 node tools/install-meeting-host-attention.mjs <私人資料夾>，僅新增 meeting_host_attention 表與原受限執行帳號的資料存取權，不授予建表權。
4. 從原 AM 專案部署通過檢查的精確提交。沿用現有工作日誌 meeting-publish 介面，不重發 DailyLog 或 UOF。
5. 回讀兩個正式網址的版本、本人清單與按鈕。部署不建立請求、任務或傳送通知。
