# 會議清單的精簡登入讀取

只有 `POST /meetings/review/hub/api`、`application/json`、32 KiB 以內且 JSON `action` 為 `list` 時使用本項。以有上限的 request clone 判斷；原始內容仍按原 bytes 簽名與傳送。其他操作、較大內容、格式不符與公開登入狀態沿原路徑。

清單仍經完整登入 wrapper 鏈，沿既有 `task-read-identity.mjs` 的同次請求私有能力取得已驗證身分。多語 wrapper 對這個內部請求轉交另一個精確 Request 的能力，執行原本的最新語言設定讀取，再把結果交還原請求。只省掉清單未使用的主管資料查詢與完整登入 JSON 組裝；profile、名單、首次登記等待、既有帳號背景登記、CSRF、首次綁定與 LINE 雙向對應核對照原時點保留。沒有跨請求權限快取，也沒有新增 AM 回覆後的遠端核對。

能力由既有模組內 WeakMap 持有，HTTP header、clone 或其他請求不能偽造。每層最後的非成功回應優先，不重試繞過拒絕；最後為 200 時解析該回應，最後為 204 時才採用該精確請求捕捉的資料，沒有捕捉則拒絕。公開 `/api/auth/session` 的內容與主管資訊保持原樣。

`patch-modules.cjs` 提供三個精確且不可重複套用的函式：

- `patchMultilingual(source)` → `multilingual-dailylog.mjs`
- `patchMeetings(source)` → `dailylog-meetings.mjs`
- `patchOperationSpeed(source)` → `operation-speed.mjs`

套在最新完整現場模組，另加入本目錄 `meeting-read-identity.mjs`。本項不變更 worker 內容，不重建或替換其他模組。需已包含 1106.03 的 `task-read-identity.mjs` 與其原始 session capture 接線；來源不符合精確錨點即停止，不能用歷史完整包覆蓋現場。

清單新增固定數字的 `dailylog_meeting_identity`、`dailylog_meeting_binding`、`dailylog_meeting_upstream`、`dailylog_meeting_total`。最後一段涵蓋簽名、AM 往返和文字回覆讀取，並非純網路時間。只轉交固定名稱、有限非負數字的 AM 計時；不轉交任意名稱、描述、帳號或秘密。最外層既有 `operation_total` 另涵蓋真正的 hub API 路徑，包含 proxy 之前的首次綁定檢查；兩個 total 的差是外層處理與選擇器等剩餘時間，不能全部歸因某一次遠端呼叫。其他會議操作只可能多出這個全程計時 header，不改流程或回覆內容。

可攜合成測試：

```sh
node --test versions/AM-IMP-2026.1106.06/dailylog-meeting-read/meeting-read-identity.test.mjs
```

涵蓋有界選擇器與原 bytes、最終拒絕/換身分/登出、缺少 capture、clone/header 偽造、同時不同身分、完成與失敗後能力清除、多語最新設定、公開 session、精確 patch 拒絕與計時欄位。這組測試使用合成 wrapper，不冒稱完整 Worker；完整最新 Worker、D1、首次使用與雙向綁定回歸另以隔離假資料驗證，結果由本次發布證據記錄。正式改善幅度須以相同入口實測，不能把合成延遲或少一次呼叫等同真人速度。
