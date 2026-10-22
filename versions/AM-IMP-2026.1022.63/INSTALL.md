# 安裝

從真正最新main隔離實作與審查，PR附回原本人聊天，完整CI通過再合併。原DailyLog正式完整模組、設定、Assets、bindings、秘密、兩cron及私人回退先保存；只替換xiaoye-secretary-dailylog.mjs，新增xiaoye-inspection.mjs與xiaoye-inspection-ui.mjs，其他模組bytes保持。不build dirty根，不重發歷史包。

正式回讀後，備份並更新原事件處理器runner與prompt；不重啟或重播事件，不恢復heartbeat。不改真人身分、權限、LINE綁定、案件版本、原核准、UOF及日誌內容。實際部署日誌可記真實動作，不虛構工時。
