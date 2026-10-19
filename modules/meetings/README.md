# 正式觀看版與主持人修訂（2026-10-18）

AM-IMP-2026.1018.02 取代下方永久唯讀規則：發布後預設為閱讀內容的觀看版，錄音直接播放，內文、編號待辦及完整逐字稿可收合。原主持人可切換編輯並儲存修訂，保留歷程及原 Notion／Drive／工作任務識別碼。修訂完成同步前顯示上一個正式版本。

主持人可勾選「開放此連結分享到其他群組給其他人觀看」並獨立儲存。預設關閉，開放僅含正式文字、待辦、逐字稿及錄音，不含編輯／歷程／名單權限；關閉後原播放授權失效。不得代替真人開放會議作為測試。

# 新版會議工作頁（歷史規劃）

新流程見 `versions/AM-IMP-2026.1017.02/`。沿用開關，LINE 收音檔先詢問，錄音上傳者確認後才提供工作頁。設定類型／自訂 Prompt／參與者後開始製作，產出後所有來源對話成員共同編輯會議記錄與待辦；只有上傳者能發布。發布後原連結永久唯讀，有負責人與截止日的待辦帶入工作日誌，未分派保留於會議。原三種模式只供舊流程相容；以下舊版敘述不適用新工作頁。

# modules/meetings — 會議記錄

綁定群組收到會議錄音,自動整理成 Notion 會議記錄並發回 LINE。

## 流程
1. 群組收到音檔 → 反問「與會者(含發言順序)/主題」(大檔先回「已收到」再處理)。
2. 使用者回覆與會資訊(或 30 分鐘逾時)→ **AssemblyAI 轉寫 + 講者分離**,依首次發言順序對齊真名。
3. **Gemini** 收斂成:重點摘要 / 主議題結論 / 分區逐條筆記 / checkbox 待辦 / 下次會議提醒(含當日日期換算)。
4. 建 Notion 會議頁(主頁 hub + 三個可展開區段 tab:📄 摘要、📝 筆記、🎧 逐字稿),待辦展開到待辦任務資料庫。
5. LINE 推「重點摘要 + 主議題結論 + 待辦」(不含逐字稿,過長自動分段)。

**韌性**:AssemblyAI 上傳/轉寫失敗會自動重試,再不行則自動改用 **Gemini 直讀音檔備援**(仍產出摘要+筆記+待辦,只是無署名逐字稿);完全無 AssemblyAI key 時也走 Gemini 直轉。

## 會議樣式(工作型 / 分享型)
整理格式分兩種,由 `parseRoster` 判定 `roster.kind`:
- **`work`(工作型,預設)**:工程會議格式——分區逐條記細節(空間/尺寸/材質/決定),類型 `審圖|交底|工地檢討`,摘要含「主議題結論 / 待辦」。
- **`share`(分享型)**:讀書會/心得分享/座談格式——依「分享者或主題」分段記每人觀點/例子/金句,忠實保留個人差異,類型自由(讀書會/分享會…,Notion select 自動建),摘要標題改為「收穫與共識 / 後續行動」。

**怎麼選**:①自動——`parseRoster`(Gemini)看主題/回覆判 work|share,並有關鍵字後備(讀書會/分享會/心得/座談/沙龍/工作坊/讀書);②明講——與會資訊裡把主題註明為「讀書會/分享會…」即可。反問文字已加提示。三分頁(摘要/筆記/逐字稿)結構兩者相同,只有「內容框架 + 摘要標題 + 類型」隨樣式變。

## 行業味設定 `tenant.config.meetings`

模組本身**不含任何行業字眼**。會議類型、術語表、prompt 的領域描述,一律從 `ctx.tenant.config.meetings` 讀(見 `tenants/README.md`)。沒設定的租戶拿到一份中性預設(類型「一般會議」、標題「會議」、無 keyterms),**絕不會退回工程味**。

| 欄位 | 用途 | 通用預設 |
|---|---|---|
| `domain` | 接在 prompt「這是一場」之後的完整名詞片語 | `會議` |
| `transcriptionHint` | 餵 AssemblyAI 的領域/語言提示 | `繁體中文為主的會議錄音。` |
| `keyterms` | 餵 AssemblyAI 的專有名詞表(案場、術語) | `[]` |
| `types` | 允許的會議類型;**空陣列 = 不限制**,採用 AI 判定 | `[]` |
| `defaultType` | AI 給的類型不在 `types` 內(或沒給)時的退路 | `一般會議` |
| `defaultTitle` | AI 沒給標題時的退路 | `會議` |
| `sectionBy` / `sectionExample` | 筆記如何分區、小標題的例子 | `主題` / 無 |
| `detailFocus` | 要求 AI 記錄哪些「具體細節」 | 關鍵事實、數字、決定與負責人… |
| `workKindHint` | 判 work/share 時,拿來當 work 的例子 | `一般工作會議` |
| `projectCodes` | `{代碼:[觸發詞…]}`;**空 = 不做專案歸屬判斷** | `{}` |

型別不對的欄位會靜默退回預設,一個手誤的 json 不會讓整條會議路徑爆掉。分享型(share)格式本來就中性,不受此設定影響。

> ⚠️ **租戶載入器必須把 config 帶進來。** `tenant` 物件若少了 `config`,該租戶就拿到中性預設 —— 對工程租戶而言等於掉了工程詞庫與「工地檢討」類型。唯一源頭是 `tenants/engineering.json`，平台不得另做手抄設定。

## 契約(預設匯出)
```js
export default {
  name: 'meetings',
  init(platform),                 // 注入共用能力
  isAudio(message),               // 此訊息是否為會議音檔
  rosterPrompt(filename),         // 反問與會者/主題的文字
  hasPending(tenant, groupId),    // 此(租戶,群)是否正在等與會資訊
  async onAudio(ctx),             // 綁定群收到音檔 → 暫存並反問
  async onMessage(ctx),           // 每則訊息;若在等與會資訊則收斂,回傳 true=已處理
  async consumeRoster(ctx),       // 直接以與會資訊收斂發布
  async processRecording(ctx),    // 無 AssemblyAI 時的 Gemini 直轉
};
```

### init(platform) — 共用能力
`{ notionRequest, pushLineMessage, llmForTenant, aiForTenant, ensureDriveFolder, uploadToDrive, uploadDriveStream, streamLineContent, publicBaseUrlForTenant, publicLinkSecret, portal }`

`llmForTenant(tenant)` 回傳該租戶自己的 `core/llm.js` 備援鏈；`aiForTenant(tenant)` 提供該租戶的 AssemblyAI/Gemini 設定。摘要用 `profile:'quality'`、`maxTokens:16000`;與會名單走預設鏈。**「聽」音檔不經 llm**(llm.js 不吃音訊),仍直接打該租戶設定的 AssemblyAI / Gemini Files API。

### ctx — 每次呼叫(帶租戶脈絡)
- `tenant`:`{ key, config, ai, dataSources: { meetings, tasks, projects }, driveConfigured, driveRootFolderId, publicBaseUrl }`
- 音檔類:`{ tenant, buffer, filename, contentType, binding, senderName, groupId, ackSent }`
- 訊息類:`{ tenant, groupId, text, senderName }`

## 公開會議頁(免 Notion 帳號)
LINE 訊息尾端同時附**兩條連結**:
- 🌐 **公開連結**(自架,免帳號、可轉傳):`GET /m/<32碼頁id>-<16碼簽章>` → 一頁 HTML,四個 toggle 收合:**📄 摘要 / 📝 筆記 / 📅 待辦事項 / 🎧 逐字稿**(摘要預設展開)。手機友善、支援深色模式、`noindex` 不被搜尋引擎收錄。
- 📄 **Notion 連結**(需帳號):若該頁已在 Notion 手動發佈,自動改用其 `public_url`。

**安全**:連結帶 HMAC 簽章(`platform.publicLinkSecret`),簽章錯 → 404;且只渲染「有『會議』標題欄」的頁面,拿別的 Notion 頁 id 也讀不到 → 不會外洩其他資料。
**設定**:`init(platform)` 需 `publicBaseUrl` + `publicLinkSecret`;沒設就只放 Notion 連結(行為不變)。
**掛載**:core/server 需在任何授權檢查「之前」把 `GET /m/*` 交給 `handlePublicRequest(req,res,pathname)`(回 `true` 表示已處理)。

> ⚠️ 公開頁**包含逐字稿**。連結不可猜(簽章),但**拿到連結的人就看得到全部**——轉傳前請留意。

## 每群一個獨立會議庫(選用,真隔離)
若 `tenant.meetingsParentPageId` 有值(母頁 id),就啟用「**每個 LINE 群一個獨立會議記錄庫**」:
- 某群第一次開會、綁定頁的「會議資料庫」欄還空著 → 在母頁下**自動建一個會議庫**(欄位:會議/類型/日期/參與者/專案),把 data source id **回填該群綁定頁的「會議資料庫」欄**;之後這群的會議都寫進去。
- 沒設 `meetingsParentPageId`(工程租戶目前的設定)→ 一律寫租戶預設庫 `tenant.dataSources.meetings`。
- per-group 時,待辦仍進租戶待辦庫,但**略過「會議記錄」關聯**(Notion 關聯只能指向單一目標庫,per-group 會議頁不在其中)。
- **前置**:綁定庫需有「會議資料庫」rich_text 欄;可用 `mod.provisionMeetingsDb(tenant, groupName)` 手動預建某群的庫。
- ⚠️ **權限隔離靠 Notion 分享**:系統能自動「建庫、分流」,但「只給該組的人看」需管理員在 Notion 手動分享各庫/母頁(API 無法設定分享對象)。
- ⚠️ **與工程儀表板的取捨**:dashboard/reminders 目前讀「單一預設會議庫」;啟用 per-group 後,新會議進各群的庫,**不會出現在讀預設庫的儀表板**,除非後續讓那些功能跨庫彙總。因此 engineering 暫不啟用此選項。

## 狀態隔離
會議「待補 pending」以 **`${tenant.key}::${groupId}`** 為鍵,不同租戶不互相污染(見 `pkey()`)。

## 現行使用者

- **engineering**：由 AM Platform 直接載入，使用工程詞庫與預設工程會議庫。
- **forest**：由同一平台載入，使用自己的租戶設定與資料來源；pending 狀態鍵包含 tenant，不會和 engineering 互相污染。

## 共用會議詞庫（2026-10-19）

會議設定與編輯頁提供詞庫視窗及獨立網頁。正確用詞、常見錯字／同音字與背景說明在同一服務共用，下一次製作由辨識／整理及備援讀取；原始逐字稿保留。未自動匯入各單位舊名詞庫或私人會議內容。詞條可搜尋、修改、停用，保存版本與修改歷程。安裝與權限詳見 versions/AM-IMP-2026.1019.01/。目前 Ready，尚未正式部署。

批次匯入已加入：一行一詞、Excel 複製 Tab 三欄及 UTF-8 CSV／TSV／TXT（1 MB）。每次最多 500 筆、詞庫最多 1,000 筆；先預覽再確認，重複略過並保留原詞條，錯字衝突或錯誤須先修正，預覽過期拒絕寫入，失敗整批回退。已用合成 200 詞驗證，尚未部署。
