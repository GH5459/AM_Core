# LINE 群組統一指令

AM-IMP-2026.1102.02：Installed／Deployed。本人在本聊天授權修改、受影響程式測試及正式部署。

以同一 native mention gate 處理任務、活動及會議；多人與 @小葉本人規則一致。無日期任務採原訊息時間加48小時，有日期任務沿原執行日後兩天。活動資料不足由原發起人補齊，未寫長度一小時。工作日誌只換日期和本人／群組建卡兩模組，AM 保留原傳輸、來源、權限與佇列。

原51項群組回歸中的37項失敗已逐項改為新入口預期或明確的歷史佇列案例，未刪除權限、錯群、撤回、逾時、重送和重新啟動的檢查。fixture 與 test 註冊分離，合成 mention 補上 UTF-16 位置，避免使用與 LINE 不符的輸入。另驗證補工作內容不重算截止時間、錄音等待名單不吞新指令、目前完整 Worker/workerd/D1 原子收據與撤權。

正式目前版本、完整來源／設定、回退和後續發布回執留在本機私人目錄；本文件不保存真人訊息、身分或憑證。只發布 AM Platform 與原工作日誌，不重發其他服務、不回灌資料、不真人 LINE 或 Google 測寫。

## 正式回讀

PR547來源 f5640b516953589b2b558756578c9fc1db308d47，CI41435614136 受影響121項全部通過；原51項群組回歸中的37項失敗全部處理，另保留新增日期及缺資料案例。合併 f0b44429da34dd70e7dde2b4070a89a84aab3038 的樹與受測來源一致。

DailyLog 由最新58d20e0f完整100模組延伸6fd48ece-aed2-4255-8bc8-194ce9b359b7／100%，只換 line-self-task 與 line-task-dates，其餘98模組及原Assets、秘密、設定、bindings、排程與版本快取binding保持。完整最新Worker／真正workerd-D1的建卡、協作、修改、取消、跨日48小時、併發收據及撤權測試通過。

Render dep-dbk74ls9v7es73btdi0g 已Live，實際commit為f0b44429；AM兩入口相同提交、commandPolicy與新的Calendar模式回讀通過。匿名建卡與錯誤LINE簽名均拒絕。原635任務內容／revision一致，87附件／145分塊及身分設定保持。19筆原背景Google續期、同步與鎖定狀態自然更新及2筆新增文件保留，不回灌。

完整現場來源、回退及證據留 C:/Users/seven/.codex/private/line-group-commands-release-20261102/result.json。未真人LINE／Google／任務測寫；實體手機自然使用確認仍獨立。後續部署須沿最新完整模組，不重發此歷史包。
