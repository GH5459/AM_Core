# 驗證

- node tools/test-meeting-regeneration.mjs
- node tools/test-meeting-transcription-quality.mjs
- node tools/test-meeting-start-operator.mjs
- node tools/test-meeting-workspace.mjs
- node tools/test-meeting-workspace-service.mjs
- node tools/test-meeting-workspace-generation.mjs
- node tools/test-meeting-workspace-response.mjs
- node --test tools/test-meeting-start-feedback.mjs tools/test-dailylog-meeting-start-bundle.cjs
- node tools/test-meeting-regeneration-browser.cjs [Playwright 套件路徑] [私人圖片目錄]
- node tools/check-upgrade-package.js AM-IMP-2026.1106.04

驗證未確認／取消不重做、四人重選、同時修改拒絕、舊版完整保存、失敗仍可比較、來源與發布權限隔離、目前新結果清除舊待辦與舊段落，以及長會議後段議題保留。四種寬度無橫向溢出。

正式讀回精確 AM commit、Render Live、DailyLog 完整模組與設定保存，使用本人頁面返回四人設定。查核前後本場 state/revision/fields/result 與 generation_start 數量一致。
