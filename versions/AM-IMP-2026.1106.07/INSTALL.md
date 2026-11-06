# 安裝

1. 核對目前 main 與正式 AM 版本。沿當下最新 main 安裝本包的清單讀取與來源排程，不修改資料表、設定、秘密或任何真人紀錄。
2. 執行 `node tools/check-upgrade-package.js AM-IMP-2026.1106.07` 與 `node tools/test-meeting-list-projection.mjs`，以及原會議回歸與獨立權限檢查。
3. 完整 CI 通過、程式審查完成且合併後程式樹一致，才從 GitHub main 的精確 commit 發布至原 AM 服務。
4. 核對 Render Live、兩個正式來源的 commit 與會議功能，確認 DailyLog 保持前輪完整 129 模組及原設定。不要為此重發舊 Worker 包或其他服務。
5. 回讀選定會議資料並保留並行變更，不回灌舊快照；用同帳號、獨立頁面、初頁載入完成後再按會議的三次測試比較。

舊獨立 HOZO_AM、SevenAM 沒有此內嵌清單路徑；本包的實際部署目標是原 AM 多租戶服務。不可混用專案資料與憑證。
