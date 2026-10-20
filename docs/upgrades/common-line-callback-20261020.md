# 手機三入口 LINE 登入回傳修復

狀態：Deployed。

2026-10-20 使用者回報手機工作日誌、會議及 UOF 均顯示 Not found；已提供的回傳路徑為原登記 /meetings/review，liff.state 內含 /connect 及 app。不保存或重用一次性 code／state。Chrome 以公開 LIFF URL 重現同一 404。

AM-IMP-2026.1020.01 在最新 main 精準補共用入口：允許登記路徑承接明確 connect 回傳，原地執行 SDK，不自行轉送回傳憑證；SDK 完成還原後才選目的地。原身分、來源及功能權限維持。DailyLog／UOF Worker、LINE 選單與登記設定均不修改。

22 項身分及回傳測試通過，包括三功能初始化前零 API 呼叫、初始化後正確目的地及拒絕權限。PR388 完整 CI 4m17s 通過，合併 4e587f67e6dfecfa489659483099c2a483687eb1。2026-10-20 09:34 Render 原服務指定該 main 提交發布，42.5s succeeded／Live。兩個正式 origin 的 12 個直接／首次回傳入口均 200，與受測頁面（換行正規化後）一致，4 個匿名／外站邊界拒絕通過。

內建瀏覽器以原已登入 LINE 帳號自然確認登入，觀察首次回傳及 SDK 還原：工作日誌至原登入頁，會議至原中心並可只讀載入，UOF 至原待簽核登入頁。不輸入公司密碼、不重新綁定、不儲存業務或傳 LINE。真人手機最終重試由本人確認。私人證據位於 C:/Users/seven/.codex/private/common-line-callback-20261020/；不保存使用者提供的一次性登入網址。
