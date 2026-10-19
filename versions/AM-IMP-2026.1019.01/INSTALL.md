# 安裝

1. 在指定專案備份最新完整正式版本、會議及設定快照。勿使用未整理的舊根目錄重建覆蓋。
2. 安裝 meetings/workspace 系列、workspace-collaboration.js、原 leaf-tasks.js 與 server.js 的分享介面。
3. 以專案私有遷移連線套用 workspace.sql。原欄位不重寫；新增空段落結構與空指定名單，以及修訂 patch。移除「只能一筆待同步修訂」索引，改以基準版本依序處理。
4. 在最新完整 DailyLog 包執行 build-meeting-collaboration-worker.cjs，只改原簽章任務服務中的兩個分享路由並增加 meeting-sharing.mjs。沿用原 syncPersonnel 與組織資料；保留其餘全部模組、設定、資產、秘密及排程。
5. 測試後各自發布 AM 與原任務服務。UOF 及獨立 HOZO／Seven 服務不必因本包重發。正式設定及證據另存，不進 Git。
