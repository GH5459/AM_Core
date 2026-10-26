# 安裝

1. 完整 CI 通過並合併本版，使用乾淨的最新 main。
2. 保存 AM 原正式 commit、兩個 Worker 的當前 100% 版本、完整模組與原 Assets／bindings／設定／排程。若正式版已前進，重取最新完整包再比對，不能重發舊包。
3. DailyLog 從完整包以 build-worker.cjs 轉換兩個唯一保存點及已知回應入口，增加 journal-recovery.mjs；兩個 Worker 均使用已審的接續模組。其他模組逐項比對相同。先完成隔離整合測試。
4. AM 發布精確合併 commit；確認正式後發布 DailyLog 與 UOF 已驗完整包。UOF 原 Durable Object 切換前唯讀確認沒有執行中的簽核工作。
5. 不清除手機資料，不改資料庫紀錄、身分、權限、秘密、排程或 LINE 原選單。
