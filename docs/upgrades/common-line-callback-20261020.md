# 手機三入口 LINE 登入回傳修復

狀態：Installed，正式發布待確認。

2026-10-20 使用者回報手機工作日誌、會議及 UOF 均顯示 Not found；已提供的回傳路徑為原登記 /meetings/review，liff.state 內含 /connect 及 app。不保存或重用一次性 code／state。Chrome 以公開 LIFF URL 重現同一 404。

AM-IMP-2026.1020.01 在最新 main 精準補共用入口：允許登記路徑承接明確 connect 回傳，原地執行 SDK，不自行轉送回傳憑證；SDK 完成還原後才選目的地。原身分、來源及功能權限維持。DailyLog／UOF Worker、LINE 選單與登記設定均不修改。

22 項身分及回傳測試通過，包括三功能初始化前零 API 呼叫、初始化後正確目的地及拒絕權限。正式兩站、完整 CI 與本人手機自然重試待後續記錄。
