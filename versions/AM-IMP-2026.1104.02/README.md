# 背景重試與對外流量統計

狀態：Ready，正式結果以部署回讀為準。

每個專案的任務／照片佇列獨立退避 30、60、120、240、300 秒；成功恢復正常。保留持久佇列、租期、身分檢查、防重與正常即時喚醒。失敗的工作本次不再領取十二次。AI HTTP 429 共用供應商冷卻至少 60 秒並遵守 Retry-After，沿既有模型鏈接手，不修改 prompt、模型或 token 上限。

node:diagnostics_channel 被動統計 fetch 的目的地主機、固定功能分類、傳送本文／HTTP 標頭位元組、錯誤與 429；每分鐘彙總至 Render logs。管理者可 GET /portal/admin/outbound-traffic，以既有 taskAdminKey Bearer 驗證。無新權限、秘密、資料表或外部收集服務。

只量測 Node fetch HTTP，非 Render 帳單計量：不含 pg、node:https、TLS/TCP 或回應給使用者的資料。舊 Node 無 chunk 事件時用成功送出後的 contentLength，未知串流另列 unknownBodies；部分失敗傳輸可能低估。totals 為程序啟動後累計，destinations 為本分鐘。重啟歸零；歷史使用 Render 日誌。
