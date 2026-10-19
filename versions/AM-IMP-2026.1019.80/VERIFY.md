# 驗證

node --experimental-vm-modules --test tools/test-leaf-groups.mjs 與 tools/test-group-quick-create.mjs。涵蓋原本交辦資格、會議確認、逾時、來源取消與租期；新增未連結即停止、後來登入／舊訊息重播／舊按鈕不復活、部分成功行程保留、6800次舊來源首次造訪停止、暫時故障三次上限與新來源仍可處理、回覆遺失同key去重。

正式以read-only health確認retryPolicy及retryLimit=3；再讀指定舊來源的終態、attempts不再增長、原事件與成員及calendarResult相同。不重播真人LINE或建新任務／Google行程測試。
