# 安裝

1. 從真正最新origin/main精準延伸workspace-client.js；保留其他並行改善。
2. npm ci --ignore-scripts，執行VERIFY及完整CI，合併PR。
3. 保存原正式commit、私有設定與會議唯讀快照；發布受測合併main的精確commit。
4. 在原兩origin核對health及實際HTML內嵌client與受測版本相同。本人頁面只讀檢查，不代發布或建卡。
5. 無schema遷移、秘密／設定變更或DailyLog／UOF部署。舊頁無未儲存差異時重新讀取載入新client；有未儲存文字先保留並比較。
