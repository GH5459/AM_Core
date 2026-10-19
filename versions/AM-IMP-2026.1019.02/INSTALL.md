# 安裝

1. 核對最新 AM origin/main、正式 health commit 與 DailyLog 真正最新100%完整模組。
2. 隔離 worktree套用 core/group-quick-create.js、leaf-groups及store、leaf-tasks及只讀quick-create-health路由；保留原OA及task key。
3. tools/release-meeting-workspace.cjs prepare 私人DailyLog固定包；tools/build-group-quick-create-worker.cjs精確加入同原任務驗證之self-create及新line-self-task.mjs，其他模組bytes／Assets／設定排程保持。
4. 完成 PostgreSQL／完整Worker-D1／LINE validate及CI，再先DailyLog正式版本上傳／切流／回讀，AM PR檢查合併／原正式服務回讀。
5. 不新增schema、不改grants／bindings，不全量build dirty checkout，私人回退與原資料證據留目標。
