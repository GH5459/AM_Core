# 驗證

執行node --test tools/test-xiaoye-event-bridge.cjs tools/test-xiaoye-visible-chats.cjs。覆蓋五專案精確路由、未分類、錯專案、重複設定、忙碌聊天、聊天移動、事件失效、未知派送防重、失敗不算完成，以及原bridge選新路徑而不啟動隱藏CLI。

官方桌面MCP的send_message_to_thread與read_thread逐一驗證五個專用聊天，只回覆接線完成，不讀案件或修改業務。現有外部MCP的wait_threads不支援，接收器僅在當次事件期間每30秒讀取該聊天狀態，無閒置觀察或AI查件。

安裝後核對模組雜湊、設定差異只有新增路由欄位、原prompt與其餘工具bytes保持及原接收器連線。沒有真人業務或LINE測寫，待自然新事件驗收。不得聲稱舊案件已處理或已獲核准。
