# 安裝

從最新 origin/main 的隔離 worktree 安裝 core/uof-setup-entry.js、
core/line-io/conversation.js、core/line-io/index.js 與 server.js 的精確差異。
以既有本人綁定資料庫的每次新讀決定入口，不匯入快照、不修改 secret、Rich Menu、
權限、UOF Worker 或簽核。資料庫不可讀時 webhook 回 503，不能猜測已綁定者為未綁定。

先執行 VERIFY，再建 PR、檢查差異及 CI；只發布經核對並合併到 main 的 commit。
Render 原服務保留全部配置。新回覆只用當次 LINE reply token，不補發歷史訊息。
