# 驗證

執行 node --test tools/test-background-backoff.mjs tools/test-outbound-traffic.mjs tools/test-llm-cooldown.mjs tools/test-leaf-tasks.mjs tools/test-leaf-task-photos.mjs tools/test-leaf-task-edit.mjs；node scripts/check-llm.mjs --offline；完整既有 CI。

確認正式 health commit 及流量 contract；管理者 endpoint 匿名 403，有效原管理身分可讀；環境前後只有 Forest 連線主機改動。觀察日誌背景重試、森林資料庫斷線與 outbound-traffic，正常業務自然執行，不人工送 LINE 或建立業務測試資料。
