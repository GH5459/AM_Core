# 驗證

- node tools/test-meeting-attention-completion.mjs：只有正式發布／主持人刪除、已保存的完成內容、回覆遺失／重啟、身份改變／未連線重試、會議與任務保持。
- node tools/test-meeting-attention-completion-worker.cjs <私人完整包> <miniflare>：原模型／真正 Worker 及 D1、原主持人、來源限制、版本競爭原子拒絕、重送、原成果與連結保留、刪除／發布證據、人工重開不回蓋。
- 原 test-meeting-host-attention.mjs、test-meeting-host-attention-browser.cjs 與完整 test-meeting-workspace-worker.cjs 回歸。
- node tools/check-upgrade-package.js AM-IMP-2026.1027.06。
- 執行指定 alignment audit 與 compare-project-manifests，記錄既有跨專案歷史差異，不宣稱獨立兩案已安裝或對齊。
- 正式原AM兩站精確提交／完整清單程式回讀，工作日誌唯一模組差異與其餘設定／資產／秘密／排程保持，原會議及任務資料前後核對。
