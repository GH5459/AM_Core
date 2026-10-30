# AM 工程合約控制中心：單一 Section × 多 Agent 端到端執行計畫

| 項目 | 內容 |
| --- | --- |
| Section ID | SEC-ENG-CONTRACT-CONTROL-2026-0903 |
| 文件日期 | 2026-09-03（Asia/Taipei） |
| 文件狀態 | 規劃完成；尚未開始實作或正式資料操作 |
| 規劃基準 | origin/main@743ac54bd947afd3ed1cf7d3c279f8bfd4ad3120 |
| 執行模式 | 1 個主控 Section（Control Tower）＋最多 3 個並行 Agent |
| 目標範圍 | AM Platform 的 Engineering 工程合約管理 |
| 完成原則 | P0 到付款、驗收、任務同步及 production proof 全部通過，Section 才可結案 |

## 0. 一句話決策

本案採用一個持續到最終驗收的主執行 Section，底下由多個 Agent 依檔案所有權分波協作；技術上拆成五個可獨立驗證與回復的 Upgrade Package，但共用同一個最終完成 Gate，不能修好資料顯示或完成 P0 後就停止。

本文件沿用使用者所稱的「Section」；其意義是一個持續負責規劃、整合、驗證與交付的主控執行單位，可視為一個不中途換掉責任人的主控 Session。

## 1. 這個 Section 要交付的結果

完成後，工程合約控制頁對每一份合約都必須在同一個畫面回答：

1. 合約現在位於哪一個真實階段。
2. 甲方與乙方各自進行到哪裡。
3. 合約現在在誰手上，可能同時等待哪些人。
4. 下一步是什麼、由誰負責、何時到期。
5. 送出、開啟、簽署、確認與歸檔分別在何時發生。
6. 付款目前執行到哪一期、是否缺件、逾期或有爭議。
7. 驗收是否已排程、有哪些缺失、誰要改善、何時複驗。
8. 每一個判斷是由哪一筆不可變證據推導，資料目前是否可信。

成功不是「四個按鈕可以點」，而是四個工作佇列確實可以用來完成工作：

- 待簽署。
- 待我方確認。
- 付款管理。
- 驗收管理。

## 2. 執行授權邊界

### 2.1 本文件目前只做規劃

本次工作只建立這份 Markdown 規劃文件，不修改正式功能、不遷移資料庫、不重送 LINE、不改變任何合約、付款或驗收狀態。

使用者之後明確說「依這份計畫開始執行」時，主控 Section 才進入 Wave 0。

### 2.2 開始執行後仍需保留的人工作業 Gate

即使使用者授權開始實作，下列外部或敏感行為仍不能由 Agent 自動代替權責人決定：

- 指定真實簽署人、正式簽發、重送、撤銷、作廢或法律結案。
- 代替任何人簽署，或在測試時送出真實簽署邀請。
- 核准請款、標示已付款、執行銀行付款、免除款項或承認爭議。
- 判定正式驗收通過、免驗、接受缺失或關閉複驗。
- 刪除、改寫或回填推測的簽署證據、事件、PDF、收據與 hash。
- 未經 production owner 同意直接開啟正式 mutation feature flag。

系統可以準備資料、顯示建議、建立候選任務及驗證條件，但敏感動作必須記錄 authorized actor、理由、證據、時間與 idempotency key。

## 3. 已確認的現況與根因

以下是依規劃基準 commit 的程式、升級紀錄與 manifest 交叉檢查後可確認的現況。兩份真實合約的逐筆內容尚未做 production 只讀查核，因此不得在本文件中虛構其實際簽署時間或證據。

| 問題 | 已確認根因 | 影響 |
| --- | --- | --- |
| 實際已簽，控制頁仍像未完成 | production 升級紀錄顯示 schema 已到 v9，但 core/contract-store.js 只接受 v3 至 v8；schemaReady 因而可能為 false | PostgreSQL 真實簽署資料不會進 overview，頁面退回較舊的 Notion 投影 |
| Notion 狀態沒有跟上 | Engineering outbox 在 schemaReady 為 false 時停止處理 | 簽署事件可能已成功寫入 PostgreSQL，但 Notion 摘要持續停在舊狀態 |
| 兩份合約看起來進度相同 | 目前 aggregate session 的 signed 主要由乙方簽署推動；個人甲方簽署放在 state_snapshot 與 party_a_* event 中，未形成獨立 aggregate 欄位 | 只有乙方簽與甲乙雙方都簽，可能同樣顯示 signed |
| 看不到送到誰、何時送、何時簽 | overview 只帶 workflow state、signing status、session id、version；完整 timestamps 與 events 雖已存在，但沒有進控制清單 | 使用者無法判斷目前等誰及下一步 |
| 狀態文字過度簡化 | UI 優先顯示 workflowState 或 signingStatus，只有一個「電子簽署」狀態 | 文件、甲方、乙方、內部確認、付款、驗收被壓成同一欄 |
| 四個功能尚未完成 | 待簽署、待我方確認、付款管理、驗收管理目前是 disabled placeholder | 目前不是可操作的工作佇列 |
| 付款與驗收不能追蹤執行 | payment_milestones 與 acceptance_criteria 只是凍結合約版本的條款資料 | 沒有請款、審核、付款證據、驗收批次、缺失、改善與複驗紀錄 |
| 畫面不會即時反映簽署 | 合約頁只在初次載入 overview，沒有 polling、focus refresh 或 SSE | 外部簽署完成後，已開啟的控制頁仍可能保持舊畫面 |
| Notion 可能寫出錯誤語意 | 現有 projection 把 signed、confirmed、completed 壓成「已簽署」，並可能只憑 session signed 寫入「已簽約」 | 個人甲方未簽時也可能顯得已完成 |
| 治理紀錄不一致 | Engineering manifest 仍保留早期 Ready／disabled 描述，後續升級又記錄功能已啟用 | 文件狀態與 production 現況難以稽核 |

主要程式證據位置：

- core/contract-store.js
- modules/construction/contracts.js
- modules/construction/contract-signing.js
- modules/construction/contract-outbox.js
- modules/construction/contract-workflow-api.js
- versions/AM-IMP-2026.0828.01/schema/engineering-contract-evidence.sql
- versions/AM-IMP-2026.0828.01/notion-schemas/engineering-contract-projection.json
- docs/tenants/engineering/project-improvement-manifest.md
- docs/tenants/engineering/upgrades/

## 4. 不可違反的架構原則

1. PostgreSQL 的合約版本、簽署事件、簽名與 artifact 是 authoritative source。
2. Notion 只做 projection，不得反向覆寫簽署、付款或驗收真實狀態。
3. Drive 或其他檔案系統只保存／承載證據檔；資料庫保存受保護的 reference、hash 與 metadata。
4. 已簽合約版本、簽署事件與 artifact 不可變；新功能只能 additive。
5. UI 不得自行推測狀態、目前持有人或下一步，只能顯示伺服器端 read model。
6. 「LINE API 已接受發送」不等於「已送達」或「已讀」；畫面要使用正確事件語意。
7. 個人甲方與公司甲方的簽署規則不同，不得以同一個「已簽」文字混用。
8. 任何狀態改變都要有 source evidence、actor、occurred_at、idempotency 與 audit event。
9. 每份 AM 正式任務都要連到 project goal 並保留來源證據；目標不明時只能成為 candidate。
10. 合約、付款、驗收與法律性結案，即使證據齊全，仍需 project owner 確認。
11. tenant、project、RBAC、CSRF、PII masking 與敏感 capability 必須由 server 重新檢查。
12. 任何資料衝突都要 fail closed：顯示「狀態不可判定」，不能退回一個看似正常的預設狀態。

## 5. 目標產品：一個工程合約控制中心

### 5.1 畫面資訊架構

入口維持 /contracts?tenant=engineering。原本四個 disabled 項目改為同一個 Section 內的篩選器與工作佇列，不建立四套彼此各算狀態的頁面。

~~~text
工程合約控制中心                         最後成功同步 14:32:08  ● 健康

[需我處理 3] [待簽署 2] [待我方確認 1]
[付款到期 2] [待驗收 1] [資料異常 1] [全部合約]

搜尋｜工程｜承辦人｜狀態｜只看逾期｜自動更新中

合約       甲方             乙方             目前在誰手上
拆除合約   已簽 09/03       已簽 09/03       工程 AM／確認人
泥作合約   公司章已凍結     待開啟           乙方／指定簽署人

下一步                         付款           驗收           健康
驗證證據並產生最終歸檔         尚未觸發       尚未排程       ●
等待乙方開啟；09/08 到期        第一期未到期   尚未排程       ▲

點擊合約後在同一 Section 開啟詳情
├─ 狀態摘要：真實事實／目前等誰／唯一主要下一步
├─ 版本與簽署軌：甲方、乙方、我方確認、歸檔分開
├─ 付款軌：每期條件、請款、核准、付款與證據
├─ 驗收軌：排程、逐項結果、缺失、改善與複驗
├─ 完整時間軸
├─ 對應 AM 任務
└─ 資料健康度與安全修復建議
~~~

### 5.2 每列必須固定顯示的資訊

- 合約名稱、編號、專案、最新版本。
- 文件生命週期。
- 甲方類型、簽署／用印方式、指定人、開啟與完成時間。
- 乙方指定人、LINE 接受發送、開啟與簽署時間。
- 目前等待對象，可為一人、多人、內部角色、系統或資料管理者。
- 唯一主要下一步、owner、due date、逾期與 blocker。
- 付款摘要與下一筆待辦。
- 驗收摘要與下一筆待辦。
- 最後權威事件時間、最後成功 projection 時間與資料健康度。

### 5.3 更新與錯誤體驗

- 預設每 15 秒背景更新。
- 使用者切回瀏覽器頁籤時立即更新。
- 保留搜尋、篩選、捲動位置及已打開的合約詳情。
- 距最後成功同步超過 45 秒時顯示資料過期。
- PostgreSQL 或 read model 不可用時顯示「狀態不可判定」，不使用舊 Notion 值偽裝成正常。
- 手機版改為卡片，但不得省略目前持有人、下一步、關鍵時間與健康度。
- 鍵盤操作、focus order、色彩對比、loading、empty、error、retry 均納入驗收。

## 6. 狀態模型：不用單一進度百分比

每份合約至少同時維護五個軸：

| 狀態軸 | 說明 |
| --- | --- |
| 文件版本 | 草稿、內審、核准、凍結、簽發 |
| 甲方 | 不適用線上簽、未指定、已指定、已開啟、已簽署 |
| 乙方 | 未指定、已邀請、已開啟、已簽署 |
| 我方確認／歸檔 | 等待、確認中、已確認、歸檔中、已完成、失敗 |
| 履約 | 付款與驗收各自的執行狀態 |

公司甲方的顯示預設為：

- 公司章已隨凍結版本封存。
- 不需要線上簽署。
- 不得偽裝成「甲方已線上簽署」。

個人甲方則必須有獨立指定、開啟、簽署時間與證據。

### 6.1 統一 read model

新增 engineering-contract-control-read-model.v1，讓 API、UI、Notion projection 與 AM task bridge 共用：

~~~text
contract
  id / notionPageId / project / number / title / amount / currency
version
  id / number / lifecycleStatus / bundleHash
partyA
  type / signingMethod / signerRefMasked
  status / assignedAt / lineAcceptedAt / openedAt / signedAt
partyB
  signerRefMasked
  status / assignedAt / lineAcceptedAt / openedAt / signedAt
internal
  status / ownerRef / confirmedAt / completedAt
control
  stage / stageReason / waitingOn[]
  primaryNextAction / availableActions[]
  blockerCodes[] / lastChangedAt
paymentSummary
acceptanceSummary
taskSummary
evidenceHealth
sourceRevision / reducerVersion / projectedAt
~~~

control.stage 使用可操作的語意：

- draft
- internal_review
- ready_to_issue
- issued_pending_send
- waiting_both_parties
- waiting_party_a
- waiting_party_b
- waiting_internal_confirmation
- archiving
- active_execution
- payment_action_required
- acceptance_action_required
- completed
- revoked
- expired
- declined
- data_conflict

primaryNextAction 至少包含：

~~~text
code
label
ownerRole
ownerRef
dueAt
requiredCapability
method
endpoint
entityVersion
blockers[]
taskBridgeKey
~~~

### 6.2 下一步推導優先順序

1. 證據矛盾、schema 不相容或安全問題優先，並停止敏感 mutation。
2. 已撤銷、拒絕、逾期與完成等 terminal 狀態。
3. 雙方已完成但尚未我方確認。
4. 只差甲方或乙方簽署。
5. 尚未簽發、尚未成功交付到 LINE API 或邀請已失效。
6. 會阻擋付款的驗收缺失。
7. 已逾期或即將到期的付款。
8. 一般付款、驗收與履約待辦。

同時有多個待辦時，系統保留 availableActions，但只指定一個 primaryNextAction；不得讓 UI 自行挑選。

## 7. 四個工作佇列的完整需求

### 7.1 待簽署

收錄已簽發、但尚未完成所有必要簽署的合約。

必須顯示：

- 甲方是公司或個人，以及其適用的完成條件。
- 甲乙雙方的指定人、LINE 接受時間、開啟時間、簽署時間。
- 邀請到期日、剩餘時間、目前等待對象。
- 是否可重送、撤銷或需重新指定。
- 每個動作所需 capability 與不可變事件。

重送是新的外部動作，不可由修復 projection 的腳本觸發。

### 7.2 待我方確認

只收錄必要簽署證據已完整的合約：

- 公司甲方：凍結版本內的公司用印證據完整，且乙方已簽。
- 個人甲方：甲方與乙方均已簽。

必須顯示：

- 雙方完成時間。
- 文件 bundle hash、簽名證據、artifact 與 receipt 健康度。
- 確認人與主要動作「驗證並產生最終歸檔」。
- 歸檔 worker 狀態、失敗原因與安全重試。
- final PDF、證據收據與完成時間。

對拆除合約的顯示規則是：若 production 只讀稽核真的證明甲乙均已簽，但尚未完成內部確認，才顯示「甲方已簽／乙方已簽／目前在我方確認／下一步驗證證據並產生最終歸檔」。若證據缺失或衝突，只能顯示「待人工核對」。

### 7.3 付款管理

已簽版本中的 payment_milestones 保持不可變，另建立付款執行層。

主流程：

~~~text
not_due
→ eligible
→ claim_submitted
→ under_review
→ approved
→ scheduled
→ partially_paid
→ paid
~~~

分支狀態：

- returned
- rejected
- held
- disputed
- cancelled

每期必須包含：

- 對應 contract、version 與 milestone。
- 約定金額、比例、觸發條件 snapshot。
- claimed、approved、paid amount。
- due、claimed、approved、scheduled、paid timestamps。
- 承辦人、財務審核人、收款對象受保護 reference。
- 請款單、發票、照片、匯款證明等 evidence reference 與 hash。
- 所有 append-only payment events。

「已付款」需要付款 capability、人工確認、實際金額、時間與證據。系統不得執行銀行付款。

### 7.4 驗收管理

已簽版本中的 acceptance_criteria 保持不可變，另建立實際驗收紀錄。

主流程：

~~~text
planned
→ in_progress
→ partially_passed 或 failed
→ correction_required
→ reinspection_required
→ passed
→ owner_confirmed_closed
~~~

每一次驗收必須包含：

- run number、預定／開始／完成時間與驗收人。
- 每一項 criterion 的 snapshot。
- pending、pass、fail、not_applicable 結果。
- 照片、文件、驗收單等受保護證據與 hash。
- 缺失內容、改善 owner、期限、改善時間與複驗結果。
- append-only acceptance events。

所有必要項目通過後只能進入「待 owner 結案確認」，不得自動法律結案。若付款釋放條件依賴驗收，應由明確規則引用驗收結果，不能修改原合約付款條款。

### 7.5 資料異常佇列

每份合約要檢查：

- Notion 是否唯一對應 PostgreSQL contract。
- contract aggregate、current version 與 signing session 是否一致。
- 甲乙指定人、開啟與簽署事件是否完整。
- timestamps 是否缺失、倒序或互相矛盾。
- completed 是否具有 final PDF、receipt 與 hash。
- outbox 是否 failed／dead-letter，Notion projection 是否落後。
- 付款總額是否超過或無法對應合約總價。
- 驗收標準、必要結果與證據是否缺漏。

健康度只有三層：

- 綠：證據完整且 projection 正常。
- 黃：可繼續，但有可復原缺漏或 projection 落後。
- 紅：狀態不可判定，所有敏感按鈕停用。

## 8. 後端與資料設計

### 8.1 P0：schema v9 相容與 projection recovery

第一個 production 修復必須先完成：

1. runtime 接受 production v9。
2. schemaReady 改成「版本相容＋必要 table／column／constraint capability 存在」，不再只靠 exact version whitelist。
3. archiveSchemaReady 改查實際 archive capability。
4. 建立 v8、v9、未來較新且不相容版本的測試。
5. 讓 read model 明確回報 schema mismatch 或 unavailable，不能靜默退回 Notion。
6. 建立 idempotent reprojection／outbox recovery 工具。
7. 工具必須支援 dry-run、tenant、contract 範圍、dead-letter 報告與重跑。
8. recovery 只從 PostgreSQL 權威資料重建 projection，絕不重送 LINE 或建立新簽署 session。

建議 projection key：

~~~text
contract-control-projection:v2:{contractId}:{sourceRevision}
~~~

### 8.2 雙方簽署正規化索引

規劃新增下一個未被占用的 additive schema 版本；依目前基準預計為 v10，執行 Wave 0 時必須再次確認版本未衝突。

新增 signing_participants：

- session_id。
- party_role：party_a 或 party_b。
- signing_method：line_online 或 frozen_company_seal。
- expected signer 的受保護 reference 與 masked display name。
- assigned_at、line_accepted_at、opened_at、signed_at。
- current_status。
- signature evidence reference、source event/hash、row_version。

歷史資料回填：

- 乙方由 signing_sessions、signatures 與 sent／opened／signed events 推導。
- 個人甲方由 state_snapshot.partyASignerLineUserId、partyAFirstOpenedAt、partyASubmission、party_a_* events 與 artifact 推導。
- 公司甲方建立 frozen_company_seal／not_required_for_online participant。
- 每筆回填記錄 source event id/hash。
- 不更新或刪除原 signing_events、signatures、snapshot 或 artifact。

signing_participants 是可重建索引，不取代法律證據。

### 8.3 可重建的控制投影

新增 contract_control_state：

- contract_id、source_revision。
- 可篩選的 scalar 欄位。
- projected JSON。
- projected_at、projection_error、reducer_version。

新增 contract_control_event_index：

- contract_id、domain、event_type。
- source_table、source_id、source_hash。
- occurred_at、actor_kind、masked actor、safe summary。
- protected evidence reference。

migration 可以建立標示為 migration_snapshot 的索引事件，但不得偽造不存在的歷史簽署事件或時間。

新增 contract_task_links，保存 contract／payment／acceptance entity 與 AM task 的冪等連結；正式任務內容仍留在 Engineering project-local task database。

付款執行層建議表：

- contract_payment_items。
- contract_payment_events。
- contract_payment_evidence。

驗收執行層建議表：

- contract_acceptance_runs。
- contract_acceptance_results。
- contract_defects。
- contract_acceptance_events。
- contract_acceptance_evidence。

### 8.4 API 契約

保留既有 /contracts/api/v2，新增 backward-compatible endpoint；read model 自身另外以 engineering-contract-control-read-model.v1 版本化：

- GET /contracts/api/v2/control-center
- GET /contracts/api/v2/contracts/:contractId/control
- GET /contracts/api/v2/contracts/:contractId/timeline?cursor=...
- GET /contracts/api/v2/contracts/:contractId/actions
- POST /contracts/api/v2/contracts/:contractId/actions/:actionCode

付款與驗收命令使用同一 action envelope，domain handler 分開。每個 mutation 都必須：

- 從 Portal server session 取得 actor。
- 重新檢查 tenant、project scope 與 capability。
- 驗證 CSRF、idempotency key 與 expected source／row version。
- 在 transaction 內重讀實際關聯。
- 寫入 append-only event 與 outbox。
- 回傳安全、遮罩後的 response。
- 失敗時不得留下半套狀態。

清單 API 一次回傳 UI 需要的 read model，不能讓前端逐列拼接 Notion、PostgreSQL 與 signing snapshot。

### 8.5 Notion projection v2

Notion 只投影摘要：

- 控制階段。
- 目前等候。
- 下一步。
- 甲方狀態／時間。
- 乙方狀態／時間。
- 我方確認／歸檔時間。
- 付款摘要。
- 驗收摘要。
- source revision、最後同步時間與投影警示。

不得投影完整 LINE user ID、完整 IP、證件資料、簽名原圖或 raw private Drive reference。

保守預設：legacy「已簽約」只在必要簽署完成且最終歸檔 completed 後寫入；若產品 owner 決定另保留「雙方已簽妥」，必須使用不同欄位，不能混成同一狀態。

## 9. AM project goal／task／evidence bridge

每份合約建立或連結一筆合約控制主任務，不為每一個 signing event 重複建新任務。

主任務：

- 對應 contract UUID。
- 連到 project goal。
- 顯示 control stage、waitingOn、primaryNextAction、owner、dueAt 與 blocker。
- 附 contract、version、session、event、artifact 或來源頁的受保護 reference。

子任務：

- 每一期付款可以有一筆執行子任務。
- 每一次驗收或缺失改善可以有一筆執行子任務。
- 後續事件優先更新既有任務，而不是建立「完成通知」任務。

建議冪等 key：

~~~text
contract:{contractId}:{actionCode}:{entityId}:{actionGeneration}
~~~

bridge 規則：

1. 沒有 project goal 或 source evidence 時只能建立 candidate／pending confirmation。
2. blocker、owner、due date 或 next action 改變時更新原任務並追加新 evidence。
3. 付款、驗收與法律敏感任務不得只因系統判定而最終關閉。
4. bridge 使用 outbox；bridge 失敗不能回滾已成立的權威合約事件。
5. 啟用順序為 dry-run suggestion、人工 compare、project allowlist、正式開啟。
6. 所有 task records、真實 evidence 與 automation logs 留在 Engineering tenant，不寫入 AMCore。

## 10. Upgrade Package release train

以下 ID 是本次規劃預留值。Wave 0 需先檢查 origin/main 是否已占用；若有衝突，由主控改用下一組連續編號，並同步更新本文件與所有交接契約。

| Package | 目的 | 主要內容 | 前置條件 |
| --- | --- | --- | --- |
| AM-IMP-2026.0903.01 | Schema Compatibility & Projection Recovery | v9 capability readiness、錯誤顯示、outbox recovery、reprojection、P0 production proof | 無 |
| AM-IMP-2026.0903.02 | Dual-Party Contract Control Plane | signing participants、control state、timeline、next-action API、Notion v2、統一控制中心與兩個簽署佇列 | .01 |
| AM-IMP-2026.0903.03 | Contract-to-AM Task Bridge | goal linkage、task dedupe/update、evidence、dry-run／compare／allowlist、dead-letter | .02 |
| AM-IMP-2026.0903.04 | Contract Payment Operations | 付款執行 schema、events、evidence、RBAC、API、UI、task integration | .02、.03 interface |
| AM-IMP-2026.0903.05 | Contract Acceptance & Integrated Closeout | 驗收／缺失／複驗、付款 release interface、UI、整合 rollout、production audit 與最終 closeout | .02、.03、.04 interface |

每一個 package 都必須包含：

- README.md
- upgrade.json
- INSTALL.md
- VERIFY.md
- ROLLBACK.md
- 必要的 config、schema、scripts、tests 與非敏感 fixtures

每個 package 可以依規定分別進入 Proposed、Ready、Installed 或 Deployed，但 SEC-ENG-CONTRACT-CONTROL-2026-0903 只有在五個 package 與 Section Definition of Done 全部通過後才算完成。

P0 的 .01 應在安全驗證後提早部署，避免 production 持續顯示錯誤；這不代表主 Section 可以在 .01 後結案。

## 11. 多 Agent 編組與檔案所有權

同時最多四個執行槽：主控 Section 加三個 Agent。Agent 是工作角色，可以在下一波重新指派，但同一時間不得有兩個 Agent 修改同一檔案。

### 11.1 主控 Section：Control Tower

唯一負責：

- 讀取 AGENTS.md、建立 clean worktree、固定 baseline。
- 凍結 read model、API、event、schema、RBAC 與 error contract。
- 預留 Upgrade Package 編號與管理 package metadata。
- 管理 Agent 工作卡、檔案 ownership、相依關係與 integration queue。
- 修改共用整合熱點。
- 合併、回歸測試、migration ordering、部署、manifest 與最終驗收。

主控專屬檔案／熱點：

- modules/construction/contracts.js
- modules/construction/index.js
- modules/construction/contract-workflow-api.js
- 各 package 的 README.md、upgrade.json、INSTALL.md、VERIFY.md、ROLLBACK.md
- tenant upgrade record 與 project-improvement-manifest.md

其他 Agent 不直接修改以上熱點；只交付新模組、明確介面或建議 patch，由主控掛接。

### 11.2 Wave 1 Agent

| Agent | 工作卡 | 專屬範圍 | 不可碰觸 |
| --- | --- | --- | --- |
| Agent A | Foundation & Recovery | core/contract-store.js、schema capability probe、additive migration、backfill／reprojection、store tests | UI 與 task bridge |
| Agent B | Control Read Model & API Core | 新 contract-control-center.js、contract-control-status.js、contract-timeline.js、JSON contract、API fixtures、reducer tests | Notion 直接寫入與現有路由熱點 |
| Agent C | Unified UI | 新 contract-control-center-web.js、UI fixtures、styles、polling、responsive、accessibility tests | core store、schema 與現有 contracts.js |

Agent B 可先使用 mock store，Agent C 可先使用凍結的 JSON fixtures，因此不必等待 Agent A 寫完才開始。

### 11.3 Wave 2 Agent

Wave 1 整合通過後，三個工作槽重新分配：

| Agent | 工作卡 | 專屬範圍 |
| --- | --- | --- |
| Agent A | Payment Domain | 新 contract-payments.js、contract-payment-api.js、付款 SQL、events、evidence、tests、dry-run |
| Agent B | Acceptance Domain | 新 contract-acceptance.js、contract-acceptance-api.js、驗收 SQL、defects／reinspection、tests、dry-run |
| Agent C | AM Task Bridge | 新 contract-task-bridge.js、task outbox、dedupe、dry-run／compare、dead-letter、tests |

三個 Agent 只能透過 Wave 0 凍結的 control event、action envelope 與 evidence contract 互動，不得各自重新判斷簽署狀態。

### 11.4 Wave 3 Agent

產品整合後，把三個 Agent 改為獨立驗證者：

- Agent A：migration、backfill、event chain、artifact hash、row count 與 rollback drill。
- Agent B：桌面／手機、鍵盤、無障礙、refresh、stale、empty／error 與完整業務矩陣。
- Agent C：tenant isolation、RBAC、CSRF、PII masking、idempotency、concurrency、outbox／dead-letter 與 production runbook review。

任何 Agent 都不能單獨宣告整個 Section 完成；最終判定只由主控依 Gate evidence 作成。

## 12. Agent 強制交接格式

每張工作卡回傳時必須包含：

~~~text
Baseline:
  origin/main SHA
Owned files:
  實際修改範圍
Inputs:
  使用的 schema / API / event / fixture version
Outputs:
  新增與修改檔案
Migration:
  from / to / forward-only 說明
Public contract:
  exports / API / events / DB methods
Evidence rules:
  authority / hash / PII / idempotency
Verification:
  執行命令與結果
Dependencies:
  已滿足與待整合項目
Rollback:
  feature flag / 停止寫入 / 資料保留方式
Risks:
  已知限制
~~~

衝突規則：

1. 發現需修改別人的 owned file 時，先交 interface request 給主控。
2. 只暫停衝突檔案，不停止其他可獨立工作。
3. 不允許用大範圍 copy、reset 或覆寫解決衝突。
4. 主控合併後回傳新的 source revision 與 fixtures，再開始下一個 Gate。

## 13. 執行波次與 Gate

~~~mermaid
flowchart LR
    W0["Wave 0<br/>Clean baseline<br/>契約凍結<br/>兩份合約只讀稽核"] --> G0{"Gate 0"}
    G0 --> P0["Wave 1A<br/>schema v9 recovery"]
    G0 --> RM["Wave 1B<br/>read model / API"]
    G0 --> UI["Wave 1C<br/>UI with fixtures"]
    P0 --> G1{"Gate 1"}
    RM --> G2{"Gate 2"}
    UI --> G2
    G1 --> G2
    G2 --> PAY["Wave 2A<br/>付款"]
    G2 --> ACC["Wave 2B<br/>驗收"]
    G2 --> TASK["Wave 2C<br/>AM task bridge"]
    PAY --> G3{"Gate 3"}
    ACC --> G3
    TASK --> G3
    G3 --> QA["Wave 3<br/>整合／安全／回復／E2E"]
    QA --> G4{"Gate 4"}
    G4 --> PROD["分階段 production rollout"]
    PROD --> G5{"Gate 5<br/>Owner acceptance<br/>Section complete"}
~~~

### Wave 0：Preflight 與契約凍結

1. 不動目前 dirty checkout。
2. git fetch 後，從執行當下最新 origin/main 建立獨立 clean worktree。
3. 建議分支：codex/engineering-contract-control-center。
4. 建議 worktree：D:\CodexWorktrees\AM_Core-engineering-contract-control-center；建立前先確認路徑不存在。
5. 記錄 baseline SHA、現存 package ID 與 migration version。
6. 凍結 read model、action envelope、events、error codes、capabilities 與 fixtures。
7. 以只讀方式逐份稽核目前兩份合約。
8. 私有稽核記錄留在 Engineering 環境；AMCore 只保存去識別化結果與測試模板。

兩份合約只讀稽核至少核對：

- contract 與 current version。
- latest signing session 與 state_snapshot。
- 甲方 submission、乙方 signature。
- signing events 與 occurred_at。
- final／staged artifacts、receipt 與 hashes。
- outbox 與 dead-letter。
- Notion projection 與 source revision。

若 production 權限暫時不可用，程式工作可先用 fixtures 繼續，但 Gate 5 不得通過。

Gate 0 通過條件：

- clean baseline、編號、ownership 與共用契約已固定。
- 真實資料的查核方式與保護規則已確認。
- 所有 Agent 可在不碰同一檔案的情況下開始。

### Wave 1：P0 Recovery、Read Model、UI 平行開發

Agent A 修復 schema readiness 與 projection recovery；Agent B 實作 reducer／timeline／API core；Agent C 依 fixtures 完成單一 Section UI。主控負責現有路由與頁面熱點整合。

Gate 1：P0 Recovery

- v8、v9、缺 capability、較新未知 schema 測試通過。
- schema mismatch 不再靜默顯示舊 Notion 狀態。
- reprojection dry-run 與重跑結果一致。
- recovery 不會重送 LINE、不建 session、不改 signing evidence。
- production 若獲授權，先部署 .01 並驗證 outbox 恢復。

Gate 2：Signing Control Plane

- 甲方-only、乙方-only、雙方、公司甲方與歸檔中都能正確區分。
- control center、detail、timeline、actions 使用同一 read model。
- 「目前在誰手上」與「下一步」由 server 決定。
- 待簽署與待我方確認已成為真實佇列。
- refresh、stale 與資料異常體驗通過。
- Notion 只做可重建 projection。

### Wave 2：付款、驗收、Task Bridge 平行開發

Agent A、B、C 分別在新模組實作，主控只在介面穩定後掛接 route 與 UI。

Gate 3 通過條件：

- 付款條款與付款執行紀錄完全分離。
- 驗收條款與驗收 run／result／defect 完全分離。
- 付款與驗收敏感 mutation 有獨立 capability 和人工確認。
- task bridge 的 dry-run、dedupe、update、candidate 與 dead-letter 通過。
- 付款／驗收事件可進 timeline、next action 與 AM task。
- 四個工作佇列都不再是 disabled 或假資料。

### Wave 3：整合、回復與 E2E

Gate 4 通過條件：

- 全部自動測試與 dry-run 通過。
- migration、backfill 與 rollback drill 有可稽核報告。
- event chain、artifact hash 與不可變性未被破壞。
- tenant isolation、RBAC、CSRF、PII、concurrency、idempotency 通過。
- 手機、鍵盤、錯誤、離線、慢速與 projection lag 通過。
- Upgrade Packages 必備檔案完整。

### Production Rollout

1. 建立資料庫 backup／restore checkpoint。
2. 先部署 .01；只修 schema capability 與 projection，不做外部 mutation。
3. 套用 additive schema，先 dry-run backfill，再執行並 shadow compare。
4. 部署 control API 與 UI，mutation flags 先關閉。
5. 用 disposable 或明確核准的 pilot 合約驗證完整流程。
6. task bridge 先 suggestion，再 compare，再 project allowlist。
7. 付款與驗收先唯讀，再由各自 owner 核准開啟 mutation。
8. 對原有兩份真實合約執行部署後只讀驗證，不重送、不補簽、不自動結案。
9. 更新 Engineering tenant upgrade records 與 manifest，並修正既有狀態漂移。
10. 執行 package、manifest、alignment 與 production health checks。
11. Engineering owner、財務 owner、合約／法律 owner 分別完成驗收。

Gate 5 通過後才能：

- 把 Engineering 對應 package 狀態標示為 Deployed。
- 將本 Section 標示為完成。

## 14. 驗收矩陣

| 情境 | 真實狀態 | 目前等待 | 主要下一步 | 必須驗證 |
| --- | --- | --- | --- | --- |
| 已簽發，無人開啟 | 待甲乙雙方 | 甲方與乙方 | 開啟並簽署 | LINE 接受時間與到期，不宣稱已讀 |
| 僅甲方已簽 | waiting_party_b | 乙方 | 乙方簽署 | 甲方 signedAt 可見 |
| 僅乙方已簽 | waiting_party_a | 甲方 | 甲方簽署 | 乙方 signedAt 可見 |
| 個人甲乙均簽 | waiting_internal_confirmation | 我方確認人 | 驗證並歸檔 | 雙方證據、時間與 hash |
| 公司甲方＋乙方已簽 | waiting_internal_confirmation | 我方確認人 | 驗證並歸檔 | 顯示公司章已凍結，不假稱線上簽署 |
| 已確認、歸檔中 | archiving | 系統 | 等待或安全重試 | confirmedAt、worker 與冪等 |
| 已完成 | active_execution 或 completed | 履約 owner 或無 | 付款／驗收或無動作 | final PDF、receipt、completedAt |
| 逾期／拒絕／撤銷 | terminal | 簽發人或無 | 依法重送／重建／停止 | 不覆寫舊 session |
| schema v9 | 正常可讀 | 依證據 | 依證據 | schemaReady 與 archive capability |
| DB 不可用 | data_conflict | 系統管理者 | 修復資料 | 不回退成舊 Notion 假狀態 |
| outbox 落後 | 黃色警示 | 系統 | 重投影 | 不重送 LINE |
| Notion 與 DB 衝突 | 以 DB 為準 | projection worker | 重建 Notion | Notion 不得覆寫 DB |
| 付款部分支付 | partially_paid | 財務 | 完成餘額或處理差異 | 金額、證據、不可超付 |
| 付款爭議 | disputed | 指定 owner | 解決爭議 | 敏感按鈕與 audit |
| 驗收失敗 | correction_required | 缺失 owner | 改善並申請複驗 | criterion、證據、期限 |
| 複驗通過 | pending owner close | project owner | 確認結案 | 不自動法律結案 |
| 目標不明 | candidate task | project owner | 補 project goal | 不建立正式總控任務 |
| 同一事件重試 | 狀態不變 | 原 owner | 原下一步 | 不重複 task／event／projection |
| 跨 tenant 請求 | 拒絕 | 無 | 無 | fail closed、無資料洩漏 |
| 唯讀角色 | 完整可見 | 正常顯示 | 無可執行動作 | capability 說明清楚 |
| 手機／鍵盤 | 與桌面一致 | 不省略 | 主動作可達 | 無橫向截斷、focus 正確 |

## 15. 預定驗證命令

實作時應新增專用 dry-run／verification scripts；以下檔名是規劃名稱，Wave 0 凍結後由 package 提供：

~~~powershell
node tools/dryrun-engineering-contract-control-center.mjs
node tools/reproject-engineering-contract-control.mjs --dry-run
node tools/verify-engineering-contract-control-center.mjs
~~~

每個 package：

~~~powershell
node tools/check-upgrade-package.js AM-IMP-2026.0903.01
node tools/check-upgrade-package.js AM-IMP-2026.0903.02
node tools/check-upgrade-package.js AM-IMP-2026.0903.03
node tools/check-upgrade-package.js AM-IMP-2026.0903.04
node tools/check-upgrade-package.js AM-IMP-2026.0903.05
~~~

整體：

~~~powershell
node tools/compare-project-manifests.js
node tools/audit-alignment.js
~~~

若 Wave 0 因編號衝突改號，上述命令也必須同步更新。

## 16. Rollback 與失敗復原

### 16.1 第一層：feature flag

- 關閉 control-center mutation。
- 將 task bridge 切回 off 或 dry-run。
- 關閉 payment／acceptance mutation。
- 暫停對應 outbox worker。
- 新控制頁退回唯讀，保留狀態與錯誤顯示。

### 16.2 第二層：runtime rollback

- 回到前一個已知良好 runtime。
- 舊頁面只做必要唯讀，不把 Notion 當作權威。
- contract_control_state 與 Notion projection 可由權威事件重建。

### 16.3 資料原則

- migration 一律 additive、forward-only。
- production rollback 不 drop table、不 truncate、不刪 migration。
- 已有 signing、payment、acceptance events、artifacts 與 hashes 全部保留。
- 未簽 session 只能由授權人追加 revoke event。
- 已簽／已確認資料進 legal hold，不得刪除或改寫。
- 重新啟用前要完成原因分析、event/hash 驗證、outbox reconciliation、權限測試與 owner 核准。

## 17. 風險與處置

| 風險 | 處置 |
| --- | --- |
| 目前 checkout 落後 origin/main 199 commits 且有大量既有變更 | 不 reset、不 stash、不沿用；從最新 origin/main 建 clean worktree |
| 執行時 schema 或 package ID 已前進 | Wave 0 重新 fetch、probe 與 reserve，不硬套本文件預留值 |
| 歷史甲方資料只在 snapshot，可能不完整 | 依 event、artifact、hash 交叉回填；無證據即標人工核對 |
| recovery 意外造成重送 | projection script 完全不呼叫 issuance／LINE path，並以測試證明 |
| Notion 被誤當 authority | 所有 reducer 與 backfill 僅從 PostgreSQL／受保護 evidence 讀取 |
| 多 Agent 同改核心檔案 | 明確 owned files；現有熱點只由主控修改 |
| payment 與 acceptance 更改已簽條款 | 條款 immutable，執行層用獨立 table／event |
| 過度自動化敏感結案 | server capability＋人工確認＋append-only audit |
| read model 看似正常但已過期 | last successful sync、stale threshold、紅黃綠 health |
| production 權限或 owner 驗收未取得 | 其他工作繼續；最後依規定標示 Blocked，不虛報 Deployed |
| manifest 舊狀態漂移 | rollout 時逐筆以 production proof 修正，不用推測批次覆寫 |

## 18. Definition of Done

以下項目必須全部成立，主控 Section 才能結案：

- schema v9 與必要 capability 可被 runtime 正確辨識。
- outbox／Notion projection 已安全恢復，且 recovery 沒有任何外部簽署副作用。
- 每份合約的文件、甲方、乙方、我方確認、付款與驗收狀態分開顯示。
- 頁面能顯示目前等待誰、主要下一步、owner、時間、blocker 與資料健康度。
- 原有兩份合約均依各自證據獨立顯示；拆除合約的雙方簽署狀態經 production 只讀稽核確認。
- 待簽署、待我方確認、付款管理、驗收管理全部是可用工作佇列。
- 付款具有請款、審核、核准、排程、部分／完成付款、爭議與證據流程。
- 驗收具有排程、逐項結果、缺失、改善、複驗、通過與 owner 結案流程。
- AM 主任務與付款／驗收子任務有 project goal、source evidence、冪等更新與敏感關閉 Gate。
- 甲方-only、乙方-only、雙方完成、公司甲方、歸檔失敗、terminal 與資料衝突均有自動測試。
- tenant isolation、RBAC、CSRF、PII masking、idempotency、concurrency 與 immutable evidence 測試通過。
- refresh、stale、mobile、keyboard、loading、empty、error 與 retry 驗收通過。
- migration dry-run、backfill report、reprojection、failure recovery 與 rollback drill 通過。
- 五個 Upgrade Package 的必要檔案、tenant upgrade record、manifest 與 alignment checks 完整。
- Engineering owner、財務 owner、合約／法律 owner 完成各自的 production acceptance。
- 只有取得實際 production proof 的 package 才能標示 Deployed。

Section 不得因下列任一情況提早結案：

- 只修好 schemaReady。
- 只讓拆除合約顯示正確。
- 只新增畫面或四個頁籤。
- 只完成 read API。
- 付款與驗收仍只是合約條款。
- 尚未完成真實兩份合約的只讀驗證。
- 尚未更新 manifest、upgrade record 或執行 alignment audit。

## 19. 預估與關鍵路徑

| 工作 | 工程人日 |
| --- | ---: |
| Wave 0：baseline、真實資料只讀稽核、契約凍結 | 1 |
| P0 schema／projection recovery | 1–2 |
| 簽署 control read model、API、UI、Notion v2 | 3–4 |
| AM task bridge | 2–3 |
| 付款執行層 | 2–3 |
| 驗收執行層 | 2–3 |
| 整合、E2E、security、rollback、production proof | 2–3 |
| 合計 | 13–19 工程人日 |

在主控加三個 Agent 的情況下，預估可壓縮為約 6–9 個實際工作天；production 權限、真實 owner 驗收與外部系統等待時間不計入。

關鍵路徑：

~~~text
clean baseline
→ 契約凍結
→ schema v9 recovery
→ dual-party read model
→ API／UI 整合
→ payment／acceptance／task bridge
→ migration＋E2E＋rollback
→ production read-only proof
→ owners acceptance
~~~

## 20. AMCore 與 Engineering 資料邊界

AMCore 可以保存：

- 共用架構規則。
- runtime pattern。
- schema／migration template。
- read model、event、API 與 adapter contract。
- UI pattern、測試、dry-run、安裝、驗證與 rollback 文件。
- 去識別化 fixtures 與 pass／fail 報告格式。

Engineering tenant 才能保存：

- ENG_* 設定與 production IDs。
- 真實合約、簽署人、LINE、Notion、Drive 與 PDF 資料。
- 簽名、證件、IP、事件、付款、驗收與稽核紀錄。
- project goal、task records、人工核准與 deployment proof。

本 Section 不自動把 Engineering 的資料或設定複製到 HOZO_AM、SevenAM。未來若要採用共用能力，必須各自在自己的 project folder 安裝、驗證、更新 manifest 與 production service，不得混用資料。

## 21. 下一次執行的啟動清單

使用者明確授權開始後，主控 Section 第一則工作更新應說明：

1. 已讀取本文件與 AGENTS.md。
2. 將建立 clean worktree，不碰目前 dirty checkout。
3. 將先完成 Wave 0 契約凍結與兩份合約只讀稽核。
4. 將同時啟動三個 Agent 工作卡。
5. 將持續執行到 Definition of Done，只有遇到需要新權限、真實敏感操作或無法安全隔離的 blocker 才停下請示。

建議啟動指令：

> 依 SEC-ENG-CONTRACT-CONTROL-2026-0903 開始執行。先完成 Wave 0，建立乾淨 worktree，啟動三個 Agent，並依 Gate 持續做到整體 Definition of Done；不要對真實合約做未授權 mutation。
