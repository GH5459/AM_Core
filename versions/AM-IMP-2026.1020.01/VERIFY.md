# 驗證

執行 node --test tools/test-common-line-identity.mjs。覆蓋三入口首次回傳、初始化前零 API 呼叫、初始化後目的地及各功能拒絕、錯誤路徑與方法拒絕、原身分衝突與權限。

正式兩站均測三個直接入口與三個 /meetings/review?liff.state= 回傳入口，再確認匿名 API 拒絕。Chrome 從 LINE LIFF URL 開啟，確認不再出現 Not found；不能把桌面確認當作真人手機完整登入驗收。不代建身分或業務資料。
