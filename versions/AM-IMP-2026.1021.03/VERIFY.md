# 驗證

- `node tools/test-meeting-audio-receipt.mjs`：先保存後回覆；背景卡住、姓名／單位／附件不可用仍先回覆；重送與失敗恢復使用同一工作頁及重試鍵；停用、私人預設及舊事件不變。
- `node tools/test-conversation-meetings.mjs`
- `node tools/test-meeting-workspace-service.mjs`
- `node --check server.js`
- `node tools/check-upgrade-package.js AM-IMP-2026.1021.03`
- 執行 alignment audit 與 manifest comparison，區分現有跨專案缺漏及本次變更。
- 正式兩站 `/health` 須回讀經檢查的 main 提交及 `conversationMeetings.audioReceipt=persisted-intake-before-background-v1`。
- 真人手機的自然新錄音另行確認；合成耗時不作為正式秒數承諾。不以測試代送真人 LINE。
