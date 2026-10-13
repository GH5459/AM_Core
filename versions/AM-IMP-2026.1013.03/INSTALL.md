# 安裝

安裝 upgrade.json 所列 runtime 與測試差異到 root AM Platform；使用既有 central_archive schema 與租戶服務配置，無新秘密、資料表、OAuth scope 或 DailyLog 部署。保留全部生產設定。

執行 VERIFY、審查 PR 與 CI，僅部署合併 main 的 commit。未配置服務的 OA／租戶不可宣稱可寫行事曆或待辦。HOZO_AM、SevenAM 獨立安裝與驗證，這次不部署那些專案。

AMCORE_LEAF_GROUPS_ENABLED=0 停用新群組入口與 worker；中央來源資料仍保留。不可自動重播全群組歷史，單則人工回補須保留原 sender、time、message id、native mention，會議仍需新卡片確認。
