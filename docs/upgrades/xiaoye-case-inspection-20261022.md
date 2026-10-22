# 葉小蝸單案服務身分查核

2026-10-22，E87／ADR-38／AM-IMP-2026.1022.63葉小蝸專用背景入口與單案唯讀查核已Installed／Deployed。PR439來源7dd0787e完整CI39754050835通過並合併fa7f021f；DailyLog由真正最新42ea7302-8627-47d5-b0a6-d7d8c7bfad9f精準延伸adf7af15-a526-421f-94ac-0c8a52a553d3／100%完整70模組，只換secretary後端、新增兩個查核模組，其餘67模組bytes及原Assets／秘密／設定／bindings／兩cron保持。原338工作均保留，並行自然變動不回灌。沿既有ai-xiaoye服務身分，health／單案inspect／inspection-open不使用本人密碼或真人session；查核頁通行證一次性、最長5分鐘，只限當次事件與案件版本，圖片及該案日誌唯讀。每次讀取重核來源、事件、資格與執行事件的本人當版核准；補充／暫緩／撤回／版本改變／到期／服務停用即拒絕後續讀取。查核憑證不能核准或修改、不能讀他案圖片，存取留證且不記明文憑證。6新增完整Worker-D1、21原流程、2本人核准事件、6單元／閒置及六寬通過，正式服務health／匿名邊界已回讀。原事件runner與prompt已更新、無重啟／重播；ai heartbeat保持PAUSED。AM／UOF／LINE選單未重發，無真人LINE或業務測寫；PR436及真人手機登入根因保持獨立，不擴為雲端AI遷移。私人完整包、回退與回執留DailyLog .dailylog-data/xiaoye-case-inspection-20261022，不build dirty根或重發歷史包。

https://github.com/GH5459/AM_Core/pull/439
