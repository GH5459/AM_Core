# 驗證

| 指令 | 驗證內容 |
| --- | --- |
| `node tools/test-meeting-audio-manifest.mjs` | 檔案數量、容量、重複檔案及各檔講者與時間 |
| `node tools/test-meeting-audio-stream.mjs` | 舊有續傳、多檔保存與排序、主持人與跨版本限制、公開及指定分享的播放和撤銷 |
| `node tools/test-meeting-workspace-generation.mjs` | 各檔辨識、限流後接續、整場決議整合與音檔來源 |
| `node tools/test-meeting-workspace-service.mjs` | 同一 Notion 頁保存所有錄音、發布重試防重及既有會議保留 |
| `node tools/test-meeting-multi-audio-browser.cjs <Playwright 模組路徑>` | Chrome 多選、分次加入、重新排序、中斷後接續、逐字稿與決議指定音檔播放、分享撤銷與手機寬度 |
| `node tools/test-meeting-audio-fast-browser.cjs <Playwright 模組路徑>` | 原單檔、大檔、瀏覽器麥克風及重新開頁續傳 |

動態服務均使用合成資料。正式上線時應獨立驗證實際手機、外部辨識服務、Drive 與 Notion，以及一場既有單檔會議的原入口。
