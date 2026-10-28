# 驗證

執行 `node --test tools/test-xiaoye-case-chat-registry.cjs tools/test-xiaoye-case-events.cjs tools/test-xiaoye-visible-chats.cjs tools/test-xiaoye-event-bridge.cjs tools/test-xiaoye-result.mjs tools/test-xiaoye-result-ui.cjs`。使用隔離完整工作日誌與虛構資料，執行案件建立、雙向連結、追問、補充照片、直接說明、分類、核准、結果和確認；驗證失效與重送不重複建立。

以實際桌面檢查每個目標專案的聊天建立、分類變更與同案接續。以正式服務版本、原模組、設定及資料只讀回讀確認；真人 LINE 實收另以自然新案件驗收。
