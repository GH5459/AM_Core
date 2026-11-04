# 回復

保留部署前 commit 與環境的本機 DPAPI 加密快照。必要時部署原精確 commit；程式沒有 schema 或資料遷移。若需要回復連線設定，只回復原 FOREST_AM_MEMORY_DATABASE_URL，不覆蓋完整環境或並行變更。原外部網址受 IP allowlist 限制，回復可能重現故障。
