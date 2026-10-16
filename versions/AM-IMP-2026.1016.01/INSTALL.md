# 安裝

1. 核對最新 AM main／正式 health 和 DailyLog 不可變版本、全部模組及配置，原目標保存私人備份。
2. DailyLog 只替換現行完整 Worker 的 assignmentMachine 新入口並加 line-task-photos.mjs；使用原 createAttachmentStore，不做 schema 遷移，keep_assets 保留真正最新全部資產與全部 bindings／cron。reference 中的發布工具須在 DailyLog 原目標使用。
3. 經 CI 的 AM PR 合併 main，等待原平台正式 commit；不得由 feature branch 或 dirty 主目錄部署。
4. 操作者以原 task admin key 呼叫 /portal/admin/leaf-tasks/configure-photos，指定精確 tenantKey／groupId／enabled=true。只保存群組 hash 的 pilot policy；不用顯示名稱猜 groupId。
5. 讀回兩站與該群 enabled 狀態後才標 Deployed。
