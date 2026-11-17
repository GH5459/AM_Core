# 驗證

- 使用 `tools/test-meeting-multi-audio-browser.cjs` 驗證實際 Chrome 錄音、錯誤選檔、加入兩個音檔、重開、一次保存，以及三份各自播放。
- 使用 `tools/test-meeting-workspace-service.mjs` 驗證三份錄音來源進入同一場整理及 Notion 頁，並核對舊會議。
- 使用 `tools/test-meeting-transcript-input.mjs` 驗證新上傳遭拒、舊稿勿作新整理來源，以及已開始的歷史整理與已發布結果保持可用。
- 複驗單檔錄音、原續傳、備援辨識和分享權限。
