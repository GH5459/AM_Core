# 安裝

只發布已審查、CI 通過並合併 main 的精確 commit 至原 am-platform。既有下游已共用平台，無需複製或發布其他服務（VENDORED.md）。

先加密備份完整服務環境。核實 Forest 與原資料庫同一帳號及區域後，僅將 FOREST_AM_MEMORY_DATABASE_URL 主機切為該資料庫內部主機，保留帳號、密碼、資料庫、連接參數及 FOREST_AM_MEMORY_DATABASE_SSL=true。不要放寬外部 IP allowlist。服務下次部署載入設定。
