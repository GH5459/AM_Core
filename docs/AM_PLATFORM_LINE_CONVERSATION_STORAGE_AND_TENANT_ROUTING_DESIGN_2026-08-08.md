# AM Platform LINE 對話分區儲存與租戶路由設計

日期：2026-08-08
狀態：Implemented as `AM-IMP-2026.0808.01`（專案本地契約已安裝；production flags 尚未啟用）
文件用途：交由 AMCore 製作共享 Upgrade Package，之後分別安裝到各 AM 專案
適用範圍：AM Platform、HOZO AM 2.0、SevenAM，以及後續 AM-style 租戶

## 1. 決策摘要

AM Platform 應恢復並標準化「一個 LINE 個人、群組或聊天室，就是一個獨立 Conversation 對話實體」的設計。

這裡的「分開」是邏輯上的對話分區，不是為每個 LINE 個人或群組建立一個新的 Notion Database。

標準結構如下：

- 每個租戶有自己的 `LINE 對話主檔` Database，一個 Conversation 對應其中一頁。
- 每個租戶有自己的 `訊息` Database，一則 LINE 訊息對應其中一筆，並且必須 relation 到一個 Conversation。
- 同一租戶內的訊息可以集中於同一個 `訊息` Database，方便去重、查詢、自動化及稽核。
- 不同租戶的 live 訊息、對話、任務及附件必須實體隔離，不得集中到 AMCore，也不得因共用 AM Platform 而互相可見。
- 個人、群組與聊天室使用同一套 Conversation 契約，但分別透過個人身分綁定或群組綁定決定租戶路由。
- AI 任務判讀、User UI 證據、報告線索與長期記憶，應讀取 Conversation 對話脈絡；`訊息` Database 保留原始事件、附件、去重及稽核用途。

核心判斷：

> 問題不在於一個租戶使用同一個 `訊息` Database，而在於每則訊息是否都有穩定的 Conversation 歸屬，以及系統是否能用 Conversation 為單位讀取完整脈絡。

## 2. 設計理由

如果所有訊息只有一個平面的訊息清單，即使資料中帶有 Group ID，仍會產生以下問題：

- 個人對話、LINE 群組與 room 沒有共同的對話抽象。
- 一對一私人助理訊息可能走身分或 Calendar 路由，卻沒有進入對話歷史。
- AI 必須臨時用 Group ID、User ID、時間及名稱拼湊上下文。
- 任務判讀容易只看到單一訊息，而不是同一議題的前因後果。
- 後續訊息究竟是新任務、進度更新、回答、阻礙或結案，較難可靠判斷。
- User UI、任務證據及報告無法穩定連回一個完整的對話來源。
- 個人切換租戶或群組重新綁定時，歷史資料的權限邊界不清楚。

建立 Conversation 主檔後，系統可以直接以對話為單位取得近期訊息、摘要、參與者、專案、目標、未完成事項及任務判斷狀態。

## 3. 與現有 AMCore 規格的關係

本設計不取代既有規格，而是把既有規格串成可實作的完整資料管線。

### 3.1 延續 `AM-IMP-2026.0610.05`

既有規格已規定：

- `LINE 對話主檔` 是任務判讀、User UI 證據及報告對話線索的主要來源。
- `訊息` Database 保留原始訊息、外送訊息、附件、Webhook 重送追蹤及除錯用途。
- 任務判讀預設讀取同一個 Conversation 最近 20 則訊息。
- 群組成員使用專案本地 member index，不以訊息庫臨時推測。

本設計補上 Conversation 如何建立、如何與訊息關聯、私人對話如何收集，以及 Conversation 如何經租戶路由後落入專案本地資料庫。

### 3.2 延續 `AM-IMP-2026.0807.03`

既有身分與 LINE Connection 規格已規定：

- LINE 外部身分必須 namespaced by provider and LINE connection。
- 個人對話依 person、membership 及 active workspace 路由。
- 群組對話只依 group binding 路由，不受個人 active workspace 影響。
- 綁定、撤銷、衝突及失敗都必須保留稽核紀錄。

本設計將這個路由結果寫入每則訊息及租戶本地 Conversation，形成可追溯的資料邊界。

### 3.3 延續 LINE 對話呈現標準

Conversation 頁面內文及 User UI 引用仍應遵守：

```text
docs/LINE_CONVERSATION_RENDERING_STANDARD.md
```

任務頁不得使用自行改寫的摘要取代原始 LINE 對話證據。

## 4. 名詞定義

### 4.1 LINE Connection

一個 LINE Official Account 的連線命名空間。相同的 LINE User ID 或 Group ID 在不同 LINE Connection 下，不得被視為相同外部識別。

### 4.2 Platform Conversation

AM Platform 用來識別「這是 LINE 上哪一個對話來源」的 metadata 實體，不保存跨租戶共用的 live 對話內容。

建議唯一鍵：

```text
(line_connection_id, conversation_type, external_conversation_key_hash)
```

`conversation_type` 僅允許：

- `direct`：`source.userId`
- `group`：`source.groupId`
- `room`：`source.roomId`

### 4.3 Tenant Conversation

某一個租戶本地的 Conversation 對話主檔。一個 Platform Conversation 在不同的租戶綁定期間，必須建立不同的 Tenant Conversation，不得讓不同租戶共用同一個 Notion page。

### 4.4 Message

Webhook 收到或 AM 主動送出的單一 LINE 訊息事件。每筆可供租戶使用的 Message 都必須 relation 到一個 Tenant Conversation。

### 4.5 Binding Period

Platform Conversation 與租戶之間有起訖時間的綁定紀錄。重新綁定不得覆寫舊紀錄，必須結束舊 binding period 並建立新紀錄。

## 5. 儲存邊界

### 5.1 AMCore

AMCore 只保存：

- 共用契約與 schema template。
- Upgrade Package。
- 遷移、驗證及 rollback 工具。
- 不含真實 LINE ID、Notion ID、訊息內容或租戶 live data 的範例。

AMCore 不保存任何正式對話、訊息、附件、成員或任務資料。

### 5.2 AM Platform

AM Platform 可保存必要的跨租戶路由 metadata：

- Platform Conversation ID。
- LINE Connection ID。
- conversation type。
- 外部 conversation key 的 hash。
- 必要時以受控加密形式保存回覆或 push 所需的原始外部識別。
- binding period、binding status 與路由稽核。
- first seen、last seen 及最近事件類型等非內容 metadata。

AM Platform 不應建立一個可由所有租戶共同讀取的全域 LINE 訊息內容庫。

### 5.3 各租戶專案

每個租戶必須使用自己的資料來源保存：

- LINE 對話主檔。
- 訊息。
- 附件。
- LINE 對話成員索引。
- 任務、會議、報告及判斷紀錄。

HOZO AM、SevenAM 與其他租戶的 live data 不得共用同一組 Notion data source。

## 6. 目標架構

```text
LINE Webhook
    │
    ├─ 驗證 LINE signature
    │
    ├─ Conversation Resolver
    │    ├─ direct → connection + userId
    │    ├─ group  → connection + groupId
    │    └─ room   → connection + roomId
    │
    ├─ Platform Conversation Registry（只保存路由 metadata）
    │
    ├─ Tenant Router
    │    ├─ direct → external identity + membership + active workspace
    │    └─ group/room → group binding
    │
    ├─ Tenant Guard（鎖定單一 tenant）
    │
    └─ Project-local storage
         ├─ LINE 對話主檔（一個 Conversation 一頁）
         ├─ 訊息（一則 Message 一筆，relation 到 Conversation）
         ├─ 附件（relation 到 Message 與 Conversation）
         └─ 成員索引（relation 到 Conversation）
```

## 7. 租戶本地資料模型

以下為跨專案契約。各專案可沿用既有中文欄位名稱，但 AMCore 的 schema mapper 必須能對應到同一語意。

### 7.1 `LINE 對話主檔`

一個租戶使用一個 Conversation Database；每個 LINE 個人、群組或 room 在其中各自一頁。

最低必要欄位：

| 欄位 | 建議型別 | 必要 | 說明 |
| --- | --- | --- | --- |
| 對話名稱 | title | 是 | 個人、群組或 room 的顯示名稱 |
| Tenant Conversation ID | rich_text | 是 | 租戶內穩定且唯一的 opaque ID |
| Platform Conversation ID | rich_text | 是 | 只供路由與稽核，不得用來跨租戶讀取內容 |
| 對話類型 | select | 是 | `個人`、`群組`、`聊天室` |
| LINE Connection ID | rich_text | 是 | OA connection namespace；不得放 secret |
| 綁定狀態 | select | 是 | `啟用`、`待綁定`、`已解除`、`封存` |
| 綁定開始時間 | date | 是 | 本租戶可開始接收此對話的時間 |
| 綁定結束時間 | date | 否 | 解除或改綁時寫入 |
| 個人身分 | relation | 個人必填 | relation 到租戶可見 person/membership 投影 |
| 群組綁定 | relation | 群組/room 必填 | relation 到租戶本地群組綁定 |
| 所屬專案 | relation | 否 | 若對話已指定專案則關聯 |
| 所屬目標 | relation 或 rich_text | 否 | 任務判讀使用的專案目標脈絡 |
| 最近訊息時間 | date | 是 | Conversation 的最新活動時間 |
| 最近訊息 ID | rich_text | 否 | 投影檢查及冪等追蹤 |
| 對話摘要 | rich_text | 否 | 可重建的近期摘要，不取代原始內容 |
| 任務判斷狀態 | select | 是 | `待判斷`、`已判斷`、`判斷失敗` 等 |
| 最後任務判斷時間 | date | 否 | Conversation-level reconciliation cursor |
| 最後任務判斷訊息時間 | date | 否 | 防止漏判或重判 |
| 隱私級別 | select | 是 | 至少區分私人、租戶群組及敏感對話 |

Conversation page body 必須依 `LINE_CONVERSATION_RENDERING_STANDARD.md` 追加可讀的訊息內容，作為 AI、User UI 與人工稽核的 conversation-level read model。

### 7.2 `訊息`

一個租戶使用一個 Messages Database，不為每個 Conversation 另建 Database。

最低必要欄位：

| 欄位 | 建議型別 | 必要 | 說明 |
| --- | --- | --- | --- |
| 訊息 | title | 是 | 安全截斷後的顯示標題 |
| Tenant Conversation | relation | 是 | 必須且只能關聯一個租戶本地 Conversation |
| LINE 訊息 ID | rich_text | 是 | 用於冪等；可保存 hash 或受控識別 |
| 方向 | select | 是 | `incoming` 或 `outgoing` |
| 時間 | date | 是 | LINE 事件或送出時間 |
| 發送者 | rich_text | 是 | 顯示名稱；不作授權依據 |
| 發送者身分 | relation 或 rich_text | 否 | 可解析時關聯租戶本地身分 |
| 訊息類型 | select | 是 | 文字、圖片、檔案、語音、貼圖、位置等 |
| 內容 | rich_text | 否 | 原始文字或媒體描述 |
| 附件 | relation | 否 | relation 到租戶本地附件 |
| 群組綁定 | relation | 群組/room 建議 | 為既有模組相容保留，可由 Conversation 推導 |
| 專案 | relation | 否 | 可由 Conversation 推導，不應作為唯一來源 |
| 掛載狀態 | select | 否 | 延續既有 collect/queue 流程 |
| 路由稽核 ID | rich_text | 是 | 可追查當時使用的 binding period/request |
| 系統操作指令 | checkbox | 是 | Rich Menu、查待辦、身份設定等指令應標記 |

唯一性最低要求：

```text
(line_connection_id, LINE message id, direction)
```

若 LINE 主動推播沒有原始 LINE message ID，必須由平台產生 idempotency key。

### 7.3 `LINE 對話成員索引`

群組與 room 必須維護專案本地成員索引，最低包含：

- Tenant Conversation relation。
- Platform Conversation ID。
- 外部 member identity hash。
- 可用時的租戶 person/membership relation。
- 成員顯示名稱。
- 成員狀態。
- 第一次出現、最後出現及最後同步時間。
- 資料來源：Webhook observed、LINE member API 或人工確認。

顯示名稱不可作為授權、請款送件人或任務 owner 的唯一判斷依據。

## 8. Webhook 標準流程

每個 LINE event 必須依以下順序處理：

1. 驗證 LINE signature；失敗時不得寫入任何對話內容。
2. 取得 LINE Connection namespace。
3. 從 `source.type` 與 `userId`、`groupId` 或 `roomId` 推導 Platform Conversation key。
4. 以 hash key upsert Platform Conversation metadata。
5. 先處理必要的 pre-route command，例如六位綁定碼、workspace switch 或 revoke command。
6. 解析租戶路由：
   - direct：external identity → person → active membership/workspace。
   - group/room：active group binding。
7. 找不到有效租戶時 fail closed，不得把內容寫入任一租戶資料庫。
8. 找到租戶後建立 tenant-locked Notion client，後續不可再切換租戶。
9. 依 Platform Conversation 與 active binding period，find-or-create Tenant Conversation。
10. 以 LINE message ID 或 idempotency key 檢查重複事件。
11. 寫入租戶本地 `訊息`，relation 到 Tenant Conversation。
12. 將相同訊息追加到 Conversation page body；失敗時建立可重試的 projection repair 紀錄。
13. 更新 Conversation 最近訊息時間、最近訊息 ID 及任務判斷狀態。
14. 群組或 room 發言者存在時，非阻塞式 upsert 成員索引。
15. 附件寫入租戶本地附件資料源，並 relation 到 Message 與 Conversation。
16. 把 `ctx.conversation`、`ctx.messagePageId`、`ctx.binding`、`ctx.actorContext` 交給後續 modules。
17. AI triage、meeting、queue、tasks 及 hourly reconciliation 以 Conversation 為脈絡繼續處理。

Webhook 不得因 Conversation page body 暫時追加失敗而重複建立 Message；應保留原始 Message，並由 repair job 重建 Conversation read model。

## 9. 個人、群組與 room 的路由規則

### 9.1 個人對話 `direct`

- 綁定碼及身分設定命令必須在租戶路由前處理。
- 身分綁定成功後，普通私人訊息必須進入所選 active workspace 的 Tenant Conversation。
- 只有一個有效 membership 時可自動選擇該租戶。
- 有多個有效 membership 時，必須使用 active workspace；沒有 active workspace 時 fail closed 並要求使用者選擇。
- 同一個人在不同租戶的對話內容必須落到不同 Tenant Conversation，不得跨租戶合併私人記憶。
- Calendar 身分、LINE 身分及 AM person/membership 可以互相關聯，但不得把「進入私人助理」誤當成「Rental Calendar 已綁定」。

### 9.2 群組對話 `group`

- 只依 LINE Connection + Group ID 對應的 active group binding 路由。
- 不使用發言者的 active workspace 覆蓋群組租戶。
- 同一群組在同一時間只能有一個有效 tenant binding，除非另有明確的 shadow/mirror 契約。
- 每則訊息都 relation 到 Tenant Conversation；既有 `群組綁定` relation 可保留供模組授權。

### 9.3 多人聊天室 `room`

- 路由及隔離原則比照 group。
- 外部 key 使用 Room ID，不得與 Group ID 混用。

## 10. 尚未綁定的對話

AM Platform 只能處理 LINE OA Webhook 實際收到的事件，不能讀取 Bot 加入以前或 Webhook 未收到的 LINE 歷史。

尚未綁定時的預設政策：

- 建立或更新 Platform Conversation metadata，供 Portal 顯示「偵測到新對話」。
- 可以保存 message id hash、事件時間、事件類型及 sender hash 等最小稽核 metadata。
- 不得把訊息內容寫入任一租戶。
- 綁定碼、workspace switch、群組 onboarding 等必要命令可以處理。
- 綁定成功後，從成功時間起把新事件寫入該租戶。

如果業務需要保留綁定前內容，必須另開明確 feature flag，使用加密 quarantine、固定保存期限及綁定後授權匯入流程。預設不得開啟，且不得在租戶間自動搬移。

## 11. 重新綁定與歷史資料

當個人 active workspace 改變、群組解除綁定或改綁到另一租戶時：

- 結束舊 binding period，不覆寫舊紀錄。
- 舊 Tenant Conversation 與舊訊息留在原租戶，依原租戶資料保留政策處理。
- 新租戶建立新的 Tenant Conversation。
- 預設不把舊內容複製、移動或揭露給新租戶。
- 只有在資料擁有者明確授權且留下稽核紀錄時，才可執行受控移轉。
- 路由稽核必須能回答每則訊息在當時為何被寫入該租戶。

## 12. AI 判讀與長期記憶

### 12.1 Conversation 是判讀單位

AI 不應直接把整個 Messages Database 當成未分區的提示內容。每次判讀必須先鎖定 Tenant Conversation，再取得：

- 同一 Conversation 最近 20 則訊息，或依 token budget 動態調整的連續窗口。
- Conversation 摘要。
- 同一 Conversation 的相關 active tasks。
- 所屬專案與專案目標。
- 最近一次任務判斷 cursor。
- 相關 meeting、report、attachment 及 status evidence。
- 最新專案本地 judgment rules 與 AMCore shared rules。

### 12.2 指令仍保存，但不建立任務

Rich Menu 及私人助理操作指令，例如：

- 我的今日。
- 我的行事曆。
- 新增待辦。
- 昨日未完成。
- 我要請款。
- 身份設定。
- 查待辦、列出今天待辦、打開第 2 個任務。

仍應保存於 Conversation 供稽核與連續對話使用，但要標記為 `系統操作指令=true`。除非同一則訊息另外包含具體交付、責任人、期限或外部承諾，否則不得把操作指令建立成真實工作任務。

### 12.3 儲存不等於理解

只有把訊息分到 Conversation 還不夠。系統還必須：

- 依話題切分 topic threads。
- 優先搜尋既有任務，再判斷是否建立新任務。
- 把後續答覆、進度、阻礙及完成證據更新到既有任務。
- 保存造成任務建立或狀態改變的來源訊息與 Conversation 連結。
- 讓摘要可由原始訊息重建，不以摘要取代證據。

## 13. 對現有 runtime 的預期變更

AMCore 實作 Upgrade Package 時，至少應評估並修改以下範圍：

### 13.1 `core/router.js`

- 從只有 `resolveGroupBinding(groupId)` 擴充成共用 conversation route resolver。
- 保留 group binding 邏輯，但加入 direct identity/workspace route。
- 回傳 tenant、binding period、Platform Conversation、Tenant Conversation lookup key 及 actor context。

### 13.2 LINE webhook dispatcher / `server.js`

- 在模組執行前建立標準 `ctx.conversation`。
- direct、group、room 都走相同的 Conversation storage contract。
- pre-route binding commands 仍可在身分尚未完成前運作。

### 13.3 `modules/collect`

- 不再只依 `ctx.binding` 理解對話。
- 每筆 Message 必須 relation 到 `ctx.conversation.pageId`。
- 支援已授權 direct message 落庫。
- 保留 group binding relation 以相容現有 queue、construction、claims 及 access guard。
- incoming 與 outgoing 都應進入同一 Conversation 的歷史。

### 13.4 `core/tenants.js` 與 tenant config

新增通用租戶資料來源鍵：

```text
dataSources.conversations
dataSources.messages
dataSources.attachments
dataSources.conversationMembers
```

未啟用新 feature flag 時維持 legacy 行為；啟用後若 conversations 缺失，必須 fail closed 或回報明確 health warning，不得靜默寫成無 Conversation 的訊息。

### 13.5 runtime template

舊版 `findOrCreateConversation`、`createMessagePage` 及 `appendConversationContentFirst` 可作為行為參考，但必須移除 HOZO 專屬命名，改成 tenant-safe contract，不能直接把舊版專案值搬進共用核心。

### 13.6 User UI、reports 與 task reconciliation

- 所有 LINE 來源證據改由 Tenant Conversation 取得。
- Messages Database 不得作為跨 Conversation 的任務判讀輸入。
- 每小時 LINE task reconciliation 先按 Tenant Conversation 分組，再處理 topic thread 與既有任務。

## 14. Feature flags

共享實作必須預設關閉。建議旗標：

```text
lineConversationRegistry.enabled=false
lineConversationStorage.enabled=false
lineConversationDirectCapture.enabled=false
lineConversationDualWrite.enabled=false
lineConversationReadSource=legacy
lineConversationProjectionRepair.enabled=false
```

建議切換順序：

1. 建立 schema，flags 保持關閉。
2. 開啟 registry metadata，不改變租戶落庫。
3. 開啟 dual write，比對 legacy 與 Conversation 新投影。
4. 開啟 direct capture，只對已綁定且已路由的私人對話生效。
5. 將 task judgement / User UI read source 切為 Conversation。
6. 驗證穩定後停止不再需要的 legacy projection，但保留 raw Message audit。

## 15. 遷移方案

### Phase 0：盤點

- 盤點每個專案的 Conversations、Messages、Attachments、Group Bindings、Members、Tasks data source。
- 確認哪些現有 Message 已有 Group ID、Room ID、User ID、群組綁定或專案 relation。
- 確認 direct messages 目前是否實際寫入；不得假設歷史存在。

### Phase 1：加欄位，不改舊資料

- 建立或補齊 `LINE 對話主檔`。
- 在 Messages 增加必要的 Conversation relation、direction、route audit id 及 system command 欄位。
- 所有 schema patch 只補缺漏，不自動覆寫型別不符欄位。

### Phase 2：歷史回填

- 依同一 LINE Connection + source type + external key 將既有訊息分組。
- 每組建立一個租戶本地 Conversation。
- 回填 Message → Conversation relation。
- 依時間順序重建 Conversation page body。
- 若資料缺少可驗證的 source key，標記 `待人工確認`，不得用顯示名稱猜測合併。
- 無法取得的舊 direct chat 不可假裝已回填；LINE API 也不能補取 Bot 未收到的歷史。

### Phase 3：雙寫驗證

- 新事件同時保留既有欄位並寫入 Conversation relation/read model。
- 比對 Message 數量、去重結果、附件關聯、最後訊息時間及 Conversation body。
- 驗證同一事件不會因 LINE retry 產生重複 Message 或重複 block。

### Phase 4：讀取切換

- task reconciliation 改讀 Conversation。
- User UI 及 reports 改讀 Conversation。
- direct assistant 在授權後使用同一 Conversation 讀取自己的歷史。

### Phase 5：逐專案部署

- 先在單一測試租戶驗證。
- HOZO AM 與 SevenAM 必須從各自專案 folder 分別安裝、測試及部署。
- 每個專案各自更新 improvement manifest 與 upgrade record。
- 未完成正式 production 驗證前，狀態不得標為 `Deployed`。

## 16. 驗收標準

以下條件全部成立才算完成：

### Conversation 建立與分區

- 同一個 direct 使用者的連續訊息落入同一個 Tenant Conversation。
- 不同 direct 使用者不會共用 Conversation。
- 不同 Group ID 不會共用 Conversation。
- Group ID 與 Room ID 即使字串相同，也不會共用 Conversation。
- 同一外部 ID 在不同 LINE Connection 下不會共用 Platform Conversation。

### 租戶隔離

- 已綁定群組只寫入其 active tenant。
- 已綁定 direct 只寫入 active workspace tenant。
- 沒有有效綁定時不寫入任何租戶內容庫。
- 群組改綁後，新訊息只寫入新租戶，舊租戶歷史保持不變。
- 任一租戶的 Notion client 無法 query、create、update 其他租戶 data source。

### 訊息完整性

- incoming 與 outgoing 訊息都能在同一 Conversation 中依時間顯示。
- LINE retry 不產生重複 Message。
- Message 寫入成功但 Conversation body 追加失敗時，可以由 repair job 補回。
- 圖片、檔案、語音及貼圖能追溯到 Message 與 Conversation。

### AI 與任務判讀

- AI 判讀只讀取目標 Conversation 的連續脈絡，不混入其他對話。
- 任務建立前先搜尋同一專案的相關 active tasks。
- 後續答覆可以更新既有任務，而不是重複開新任務。
- 操作指令會被保存，但不會被誤判成真實工作任務。
- 任務證據能回到正確 Conversation page 與原始訊息。

### 身分與隱私

- private route success 與 Calendar binding success 使用不同狀態，不互相誤認。
- raw LINE ID、channel secret、Notion token 及正式訊息不會進入 AMCore 或 Git。
- hash、加密、稽核及 retention 符合 `AM-IMP-2026.0807.03`。

## 17. 最低測試案例

AMCore Upgrade Package 至少應提供以下 dry-run 或 integration test：

1. 已綁定 direct，只有一個 membership。
2. 已綁定 direct，有多個 membership 且已有 active workspace。
3. 已綁定 direct，有多個 membership 但沒有 active workspace。
4. 未綁定 direct 輸入六位綁定碼。
5. 未綁定 direct 輸入普通訊息。
6. 已綁定 group 接收文字、圖片及檔案。
7. 已綁定 room 接收訊息。
8. 未綁定 group 觸發 onboarding。
9. 相同 webhook event 重送兩次。
10. 同一 Platform Conversation 解除後改綁另一租戶。
11. Conversation page append 失敗後 repair。
12. 租戶 A 嘗試讀寫租戶 B Conversation 時被拒絕。
13. incoming user message 與 outgoing assistant reply 顯示於同一 Conversation。
14. Rich Menu 指令保存但不建立任務。
15. Conversation 最近 20 則訊息能供 hourly task reconciliation 使用。

## 18. Rollback 原則

- 所有 schema 變更採 additive，不刪除舊欄位或舊資料。
- 將 `lineConversationReadSource` 切回 `legacy` 即可停止使用新 read model。
- 關閉 direct capture 後，已建立的私人 Conversation 仍保留於原租戶，不自動刪除。
- dual write 可獨立關閉，不影響既有 collect 流程。
- rollback 不得解除身分綁定、群組綁定或搬移歷史資料。
- 若需要刪除或合併 Conversation，必須另走人工確認及可稽核資料修復流程。

## 19. AMCore 交付要求

AMCore 應把本設計製作為新的 `AM-IMP-YYYY.MMDD.NN` Upgrade Package，至少包含：

- `README.md`
- `upgrade.json`
- `INSTALL.md`
- `VERIFY.md`
- `ROLLBACK.md`
- Conversation schema contract
- Messages relation schema patch
- Platform Conversation / binding period contract
- tenant-safe conversation resolver reference implementation
- direct/group/room dry-run fixtures
- backfill 與 projection repair 工具
- 不含任何正式 ID、token、訊息或租戶資料的範例設定

完成套件後，依 AMCore 標準分別安裝至 HOZO AM 與 SevenAM，更新各專案 manifest，並執行：

```text
node D:\Codex_project\AMCore\tools\check-upgrade-package.js AM-IMP-YYYY.MMDD.NN
node D:\Codex_project\AMCore\tools\audit-alignment.js
node D:\Codex_project\AMCore\tools\compare-project-manifests.js
```

## 20. 最終原則

本設計採用以下一句話作為實作判斷標準：

> Conversation 分開、Messages 集中於各自租戶、租戶資料實體隔離、所有判讀與證據都能回到正確的 Conversation。

這個設計保留集中 Messages Database 的維護優勢，同時恢復第一版 HOZOAM 能以個人或群組掌握完整對話脈絡的能力，並補上 AM Platform 所需要的身分、租戶、隱私與重新綁定邊界。

## 21. 實作紀錄

本設計已於 2026-08-08 實作為：

```text
versions/AM-IMP-2026.0808.01/
```

套件包含 Conversation／Messages／成員索引 schema contract、Platform Conversation 與 binding-period contract、tenant-safe resolver 與 storage 參考實作、15 個最低案例、歷史回填 dry-run 工具及 projection repair 工具。

HOZO_AM 與 SevenAM 已分別安裝專案本地 contract、驗證腳本、manifest row 與 upgrade record。為避免未經盤點即影響正式資料，所有新 feature flags 保持關閉，尚未執行正式 Notion schema migration、歷史訊息回填、Render 部署或 production cutover，因此不得標示為 `Deployed`。

## 22. AM-IMP-2026.0808.02 Activation Readiness Record

Follow-up implementation on 2026-08-08:

```text
versions/AM-IMP-2026.0808.02/
```

This package installs the project-local activation readiness layer for HOZO_AM
and SevenAM:

- `src/line-conversation-readiness.js`
- `scripts/verify-line-conversation-readiness.mjs`
- `npm run line:conversation-readiness`
- `npm run line:conversation-readiness:strict`
- `/health.lineConversationStorage`

Local readiness now reports feature flags, missing environment variable names,
and whether live Notion schema checks can run. Strict readiness intentionally
fails closed until the project runtime contains its own production Notion token,
data source IDs, LINE connection ID, conversation hash secret, Render deployment
proof, canary routing proof, dual-write comparison, tenant-isolation proof, and
owner approval.

The package is `Installed` in HOZO_AM and SevenAM. It is not `Deployed`.
