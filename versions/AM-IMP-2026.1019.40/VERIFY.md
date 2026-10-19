# 驗證

- node --test tools/test-multilingual-policy.mjs
- node tools/test-multilingual-meetings.mjs
- 於 DailyLog 原測試環境，指定私有完整包執行 tools/test-multilingual-dailylog.cjs；原任務轉派及多人完成回歸。
- 指定私有共用管理包執行 tools/test-multilingual-management.cjs；預設中文、切換、無權管理、過期 revision、原開通保持。
- 已安裝 Playwright 環境執行 tools/test-multilingual-client.mjs，三語草稿／原文切換、值不改、六種寬度與實際會議入口注入。
- 原會議工作頁／分享／會議中心回歸、pause 檢查及完整 CI。
- 正式回讀 health.multilingualText、各完整模組 hash、設定及排程，固定合成翻譯確認房號、否定及日期沒有改義。

合成驗證與正式程式回讀不等於已代同仁完成真人登入或業務操作。
