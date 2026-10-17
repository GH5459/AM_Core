# 修正會議工作頁 LINE 登入入口

工作頁的公開網域與 LINE 已登記入口不同時，LINE 會拒絕登入並顯示 400。新增每個部署／單位的 `MEETINGS_LIFF_ENDPOINT_URL` 設定，原工作頁連結先導向已登記網域的同一場工作頁；不重建會議、不改工作頁識別碼。合法登入入口可呼叫原 API，其他網站仍拒絕，成員及主持人驗證保持。

程式：`core/tenants.js`、`modules/meetings/workspace-service.js`。測試：`tools/test-meeting-workspace-service.mjs`。正式入口值由部署端設定，不放在共用常數。
