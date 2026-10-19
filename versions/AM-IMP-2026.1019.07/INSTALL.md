# 安裝

1. 從最新正式main整合原會議入口、Calendar週檢視、詞庫、週期與其他功能。
2. 執行tools/test-meeting-share-notices.mjs與tools/test-meeting-shared-inbox.mjs及完整CI。
3. 在原服務，以私有env與管理連線執行tools/disable-meeting-share-push.mjs；只替原OA關閉分享推播並取消其未發通知，不改名單、原內容與其他OA。新政策表／觸發器也會防止舊版本重試或回退後再發分享推播。
4. 從合併後精確提交部署原AM，兩站／本人Rich Menu入口只讀驗證。原Rich Menu網址沿用，不重建選單，不部署DailyLog或UOF，不全量覆蓋原dirty checkout。
