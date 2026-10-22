# 驗證

執行 `node --test tools/test-common-line-direct-entry.mjs tools/test-common-line-identity.mjs`，檢查三入口已連結自動開啟、未開通拒絕、未知身分登入、過期 LINE 登入、衝突及網路錯誤、跳轉失敗後原連結與首次確認保持。

執行 `node tools/check-upgrade-package.js AM-IMP-2026.1022.62` 及完整 CI。發布前核對本人當版核准與 PR 已附回原聊天，發布後唯讀核對兩站 commit 和入口 HTML。真人手機與外部 Chrome 的實際跳轉仍待本人自然使用，合成測試不替代實機確認。禁止真人身分、業務或 LINE 測寫。
