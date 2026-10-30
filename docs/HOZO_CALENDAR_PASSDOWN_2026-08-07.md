# HOZO Unified Calendar 完整 Pass Down

更新時間：2026-08-07 15:30（Asia/Taipei）
交接目的：讓下一個 Codex session 不必重做身分綁定除錯，可直接從 Google Calendar Phase 2-G 繼續。

## 1. 一句話狀態

Seven 的 LINE 身分綁定、Rental Calendar 個人行程 machine API、葉小蝸私人 LINE 查詢／新增／改期／完成／取消，以及具日期、負責人與來源證據的 HOZO AM 任務投影，都已部署並通過正式環境測試。

尚未完成的是 `hozosince2026@gmail.com` 的 Google Calendar OAuth、公司／個人 secondary calendars、ACL 與 Rental Calendar → Google Calendar event projection。因此目前資料已進入 Rental Calendar 個人行事曆資料層，但不會出現在 Google Calendar 網頁或 App。

## 2. 這次已完成的範圍

### 2.1 找到正確的正式服務

先前錯把舊 Render service 當成葉小蝸私人 LINE 路由。實際正式路由如下：

| 項目 | 正式值 |
| --- | --- |
| AM Platform Render service | `am-platform` |
| Render service ID | `srv-d97s94utrd3s739lin30` |
| AM Platform production URL | `https://am.hozorental.com` |
| AM Platform GitHub repo | `sevenchen611/AM_Core` |
| Rental Calendar production URL | `https://rental.hozorental.com` |
| Rental GitHub repo | `sevenchen611/rental-management-blueprint` |

舊的 `hozo-am-line-oa-webhook` 不是本次 Calendar 私人指令的正式執行點，不要再把 Calendar secrets 只設定在舊服務。

### 2.2 正式 secrets 已設定

`am-platform` Render Environment 已設定：

- `HOZO_RENTAL_CALENDAR_BASE_URL=https://rental.hozorental.com`
- `HOZO_RENTAL_CALENDAR_MACHINE_TOKEN`：已設定，正式環境驗證長度為 64；值不可寫入文件、Git、log 或回覆。

Rental 端對應使用 `AM_CALENDAR_MACHINE_TOKEN` 驗證 machine request。兩端 token 必須一致。

### 2.3 Seven 的 LINE ↔ Rental 身分綁定已完成

綁定結果：

- tenant：`hozo-am-2-0`
- status：`active`
- display name：`Seven`
- role：`owner`
- Rental `person_id`：存在且可解析
- Rental Portal 顯示：`LINE binding is active.`

正式 `/api/integrations/calendar/identity/resolve` 已驗證可將 Seven 的穩定 LINE 身分解析到唯一、有效的 Rental person。

安全注意：本文件刻意不保存原始 LINE userId、person ID、machine token 或綁定 PIN。下一個 session 不應把這些值補進 AMCore。

### 2.4 Rental Calendar machine APIs 已部署

正式新增的 endpoints：

- `POST /api/integrations/calendar/personal-items/query`
- `POST /api/integrations/calendar/personal-items/create`
- `POST /api/integrations/calendar/personal-items/update`
- `POST /api/integrations/calendar/items/upsert`

既有並持續使用：

- `POST /api/integrations/calendar/line-bindings/consume`
- `POST /api/integrations/calendar/identity/resolve`

重要行為：

- 每次個人 query/write 都以 tenant + 穩定 LINE userId 重新解析 active identity link。
- 個人項目使用 `action_policy=personal_edit`。
- HOZO AM 來源項目使用 `action_policy=view_only`。
- 個人 create/update 強制 `Idempotency-Key`。
- AM source upsert 必須帶來源 URL、來源摘要或 evidence ref，否則拒絕。
- AM source owner 可由 person ID、active LINE binding，或 Rental Portal 裡唯一且完全相符的 display name/username 解析。
- 同名、找不到人、跨 tenant、未授權、已撤銷身分一律 fail closed。

### 2.5 葉小蝸私人 LINE Calendar 指令已部署

正式可用指令：

| 目的 | 指令範例 |
| --- | --- |
| 今天 | `我的今天`、`我的行程` |
| 昨天未完 | `昨天未完` |
| 本週 | `這週` |
| 新增 | `新增工作 明天 10:00 回覆房東` |
| 確認新增 | `確認新增` |
| 放棄新增 | `取消新增` |
| 完成 | 先查詢，再傳 `完成 1` |
| 取消 | 先查詢，再傳 `取消 1` |
| 延到明天 | 先查詢，再傳 `延到明天 1` |
| 指定改期 | 先查詢，再傳 `改期 1 8/10` |
| 提醒資料 | 先查詢，再傳 `提醒我 1 明天 09:00` |

新增命令採兩段確認：第一句只建立 15 分鐘 pending state；收到 `確認新增` 才寫入 Rental Calendar。重送由 idempotency key 保護。

查詢後的編號清單也保留 15 分鐘。這是目前的 MVP 狀態；尚未做跨 process 的持久化編號 session。

### 2.6 HOZO AM 任務自動投影已完成第一段

新建立的 HOZO AM 2.0 task 同時符合下列條件時，會 best-effort upsert 到 Rental Calendar：

1. 有明確 `due` 日期。
2. 有明確 owner。
3. owner 能透過 LINE userId，或 Rental Portal 唯一且完全相符的名字解析。
4. 有 `sourceEvidence`。
5. 任務由 `modules/tasks.createTask` 建立。

投影項目為 `view_only`，避免從 Calendar 直接修改 AM/Notion 原始任務狀態。Calendar sync 失敗不會讓 Notion task 建立失敗，但會寫 warning。

目前只保證「建立時」投影。既有任務回填、Notion 後續狀態／期限／owner 變動同步、刪除／取消 reconciliation 尚未完成。

## 3. 正式部署與 Git 證據

### 3.1 Rental Calendar

| 項目 | 值 |
| --- | --- |
| PR | `https://github.com/sevenchen611/rental-management-blueprint/pull/41` |
| Merge commit | `aae17964334d197afe2a67b589ec5bd2c8d86561` |
| GitHub Actions run | `31157205012` |
| Deploy result | Cloudflare Pages success |

### 3.2 AM Platform

| 項目 | 值 |
| --- | --- |
| 功能 PR | `https://github.com/sevenchen611/AM_Core/pull/11` |
| 功能 merge commit | `680b58bbc11daf51bf10de452368edfd1e238194` |
| Render deploy ID | `dep-d9qof7h5efls73ffqdfg` |
| 狀態文件 PR | `https://github.com/sevenchen611/AM_Core/pull/12` |
| 最新 main commit | `f261d0cddf99a6f0f0485bdbfbe35153a33998a2` |
| 最新 Render deploy ID | `dep-d9qoglgu01pc739lnff0` |
| Deploy result | live |

AMCore package：`AM-IMP-2026.0807.02`，main 上狀態為 `Deployed`。

## 4. 已完成的正式環境驗證

### 4.1 Rental API smoke test

使用 `am-platform` Render Web Shell 裡的正式 env 呼叫 Rental：

- Seven identity query：HTTP 200，display name `Seven`。
- personal query：HTTP 200。
- 建立測試 personal item：HTTP 200，`personal_edit`。
- 取消該 personal item：HTTP 200，狀態 `cancelled`。
- 建立測試 AM source item：HTTP 200，`view_only`。
- 嘗試用 personal update 取消 AM source item：HTTP 403，`This source item is read-only.`。
- 用 source upsert 正常關閉 AM source item：HTTP 200，狀態 `cancelled`。

所有 smoke-test items 都已取消／關閉，沒有留下 active 測試行程。

### 4.2 葉小蝸部署版指令流程

在最新 Render production instance 載入正式 `bootstrap` 與正式 Calendar API，依序執行：

1. `我的今天`
2. `新增工作 今天 09:15 [系統驗證] 葉小蝸 LINE 指令層`
3. `確認新增`
4. `我的今天`
5. `取消 1`

結果：五步全部 handled，回覆內容正確，warnings 為空，測試 item 已取消。

### 4.3 Production health

`https://am.hozorental.com/health` 已確認：

- `ok=true`
- `lineConfigured=true`
- HOZO AM 2.0 `modulesRequested` 包含 `calendar`
- HOZO AM 2.0 `modulesLoaded` 包含 `calendar`

注意：health 的 `build` 字串仍是舊的人工作業標籤，不可只靠該欄判斷部署版本；以 Render live commit、modulesRequested/modulesLoaded 和實機流程為準。

## 5. 已通過的測試

### 5.1 Rental repo

```powershell
node --check _worker.js
node scripts/check-admin-usage-counter.mjs
node scripts/finance-rent-recognition.test.mjs
node scripts/calendar-foundation.test.mjs
node scripts/calendar-foundation.runtime.test.mjs
git diff --check
```

結果：

- Finance regression：118 green / 0 red（rebase 到當時最新 main 後）。
- Calendar contract：12 tables、8 routes、additive schema。
- Calendar runtime：identity、personal CRUD、source upsert、evidence gate、read-only guard、revoke 全部通過。

### 5.2 AM Core repo

```powershell
node --check core/bootstrap.js
node --check modules/calendar/index.js
node tools/check-upgrade-package.js AM-IMP-2026.0807.02
node tools/dryrun-calendar-line-operations.mjs
node tools/dryrun-personal-calendar-binding.mjs
node tools/dryrun-personal-line-routing.mjs
node tools/audit-module-authorization.mjs
node tools/dryrun-core.mjs
node tools/dryrun-tasks.mjs
git diff --check
```

結果：

- upgrade package complete。
- Calendar query／編號 action／確認新增／source read-only guard 通過。
- personal binding 與 direct LINE routing 通過。
- module authorization：15/15。
- core dry-run：14/14。
- tasks dry-run：9/9。

`node tools/audit-alignment.js` 仍整體失敗，原因是既有工具硬編碼 `D:\Codex_project\...` 專案路徑，且舊 HOZO_AM／SEVEN_AM manifests 有大量歷史缺列。這不是 `AM-IMP-2026.0807.02` 新增的 regression；新 package 自身完整性檢查已通過。不要誤稱整個 AM 生態 alignment 已完成。

## 6. 主要程式變更位置

### 6.1 Rental repo

- `_worker.js`
  - personal query/create/update handlers
  - source upsert handler
  - identity/owner resolution
  - read-only policy、evidence gate、audit、idempotency
- `scripts/calendar-foundation.test.mjs`
- `scripts/calendar-foundation.runtime.test.mjs`

### 6.2 AM Core repo

- `core/bootstrap.js`
  - Calendar machine integration methods
- `modules/calendar/commands.js`
  - command detection
- `modules/calendar/index.js`
  - query、confirm-create、numbered actions
- `modules/personal-assistant/index.js`
  - Calendar commands delegation
- `modules/tasks/index.js`
  - evidence-backed task projection
- `tenants/hozo-am-2-0.json`
  - loads `calendar` after `personal-assistant`
- `tools/dryrun-calendar-line-operations.mjs`
- `tools/dryrun-tasks.mjs`
- `tools/audit-module-authorization.mjs`
- `versions/AM-IMP-2026.0807.02/`
- `docs/tenants/hozo-am-2-0/upgrades/AM-IMP-2026.0807.02-personal-calendar-line.md`
- `docs/tenants/hozo-am-2-0/project-improvement-manifest.md`

## 7. Phase 狀態總表

| Phase | 狀態 | 說明 |
| --- | --- | --- |
| Phase 0 | 已完成本次需要的盤點 | 已找到正確正式服務、repo、deploy path 與 secrets 邊界。 |
| Phase 1 | Deployed | Calendar foundation、one-time code consume、identity resolve、Seven active binding 完成。 |
| Phase 2 | 部分完成 | Rental Calendar 資料模型與 personal machine CRUD 已有；完整 Portal 個人 UI、carry-over、公司＋個人統一畫面尚未完成。 |
| Phase 2-G | 未開始 | Google OAuth、secondary calendars、ACL、event projection 尚未做。下一個 session 應從此開始。 |
| Phase 3 | 部分完成 | 新 task 建立時可投影；backfill、update/reconciliation 尚未做。 |
| Phase 4 | 未開始 | Rental 財務／請款／收款等 operational adapters 尚未接 Calendar。 |
| Phase 5 | MVP Deployed | 私人 LINE 查詢、新增、改期、完成、取消已部署。持久化 conversation state 尚未做。 |
| Phase 6 | 未開始 | reminder outbox、lease/send/ack、quiet hours、retry、正式 LINE push 尚未做。`提醒我` 目前只會建立 reminder row，沒有完整送達 worker。 |
| Phase 7 | 未開始 | AM source write-back、optimistic concurrency、conflict UI 尚未做；目前刻意 `view_only`。 |
| Phase 8 | 未開始 | Google 增量同步、push notification、外部變更 reconciliation、其他 provider 尚未做。 |

## 8. 下一個 session 的第一優先：Phase 2-G

### 8.1 目標

以 `hozosince2026@gmail.com` 作為 HOZO Google Calendar 管理帳號，建立：

1. HOZO 公司共用 secondary calendar。
2. Seven 的個人 HOZO secondary calendar。
3. 未來每位 active、已綁定人員各自的 HOZO secondary calendar。
4. Rental Calendar 作為 source of truth，先做單向 Rental → Google projection。

不建議一開始就使用 Gmail primary calendar。secondary calendars 才能清楚分隔公司與每個人的資料、ACL 與 event mapping。

### 8.2 建議執行順序

1. 重新讀本文件、`AGENTS.md`、`docs/HOZO_UNIFIED_CALENDAR_RULES.md`。
2. 從 GitHub 最新 `main` 建新 worktree；不要在 Google Drive 裡的 dirty repo 直接開發。
3. 再次確認 Rental PR #41、AM PR #11/#12 仍在 main，production health 仍載入 `calendar`。
4. 決定 Google OAuth 架構：Authorization Code + offline access + 最小 Calendar scope。
5. 讓使用者在 browser 對 `hozosince2026@gmail.com` 完成 Google consent；不可要求、讀取或保存 Gmail 密碼。
6. refresh token/client secret 只放 production secret storage；不得進 AMCore、Git、console、health response 或 browser-visible payload。
7. 在 Rental Calendar Service 實作 OAuth callback、credential state、token refresh、revoke/failure handling。
8. 使用既有 `calendar_external_calendars`、`calendar_external_event_links`、sync cursor/failure tables；若 schema 不足，只做 additive migration。
9. 建立命名一致的 secondary calendars，例如：
   - `HOZO｜公司行事曆`
   - `HOZO｜Seven 陳聖文`
10. ACL 由 Rental 的 active user/role 決定，不要把私人 Calendar 分享給全公司。
11. 實作 idempotent event upsert/cancel；每個 event 保留 `calendar_item_id`、source version、payload hash 與 external event ID mapping。
12. timed item 使用 `start_at`/`planned_start_at`；只有日期的 item 使用 all-day event；timezone 固定 `Asia/Taipei`。
13. 先用 feature flag 關閉自動全量 projection，完成單一測試 person/calendar/event 後再開啟。
14. 正式 smoke test：create → update/move → cancel；確認 Google 不重複建 event，且關閉 projection 不影響 Rental/LINE。
15. 更新 upgrade package、tenant manifest、deploy proof，再進入 Phase 3 backfill/reconciliation。

### 8.3 Phase 2-G 驗收條件

- `hozosince2026@gmail.com` OAuth refresh 可跨 deploy 使用，且 secrets 未外洩。
- HOZO 公司與 Seven 個人 secondary calendars 已建立並寫入 registry。
- Seven 的 `private` item 只投影到 Seven Calendar，不進公司 Calendar。
- `company` item 只投影到公司 Calendar。
- 同一 Calendar item 重跑十次仍只有一個 Google event。
- 日期、時間、all-day 與 `Asia/Taipei` 正確。
- 更新／改期更新同一 event；取消則 cancel/delete 同一 event。
- Google API 401/403/429/5xx、timeout、token refresh failure 都會進 failure log，且不破壞 Rental source record。
- feature flag 關閉後，LINE 與 Rental Calendar 仍正常。
- 不把 personal note、內部 evidence、原始 LINE userId、token 或 private source payload寫入 Google event description。

## 9. 下一階段仍要補的功能缺口

### 9.1 Task sync

- backfill 既有有日期任務。
- 任務狀態、期限、owner、title 後續變更 reconciliation。
- Notion task 完成／取消同步關閉 Calendar item。
- owner name 改名與同名衝突治理。
- 定期 cursor 與 failure retry。

### 9.2 LINE Calendar

- 將 15 分鐘 pending create/recent list state 移到共享／持久化 storage，避免 Render restart 或多 instance 失去編號清單。
- 正式 reminder delivery worker。
- rename/note 指令（API 已支援，但 LINE parser 尚未公開）。
- 真實使用者端再做一次 `我的今天` 與新增／取消人工驗收。

### 9.3 Rental Portal UI

- 每位人員的個人 Calendar view。
- 公司／個人 Calendar 切換與 visibility UI。
- carry-over 操作與紀錄。
- Google connection、sync status、ACL、retry/failure 管理畫面。

## 10. Repo／worktree 注意事項

本次使用的乾淨工作目錄：

```text
C:\Users\seven\CodexWorktrees\rental-calendar-line
C:\Users\seven\CodexWorktrees\AM_Core-calendar-binding
```

本次結束時兩者都在 `main` 且 clean，已同步到上述 merge commits。

目前 Google Drive AMCore 工作區本身不是 clean：

```text
M  docs/HOZO_UNIFIED_CALENDAR_RULES.md
?? assets/
```

這些是使用者既有變更。下一個 session 不得 reset、checkout、覆蓋、移動或一起 commit。建立新 Phase 2-G worktree 時，從 GitHub `origin/main` 開新 `codex/` branch。

原先 Google Drive 裡的 Rental clone 也曾出現 dirty／不可靠狀態；優先使用乾淨 clone 或重新建立 worktree。

## 11. 安全與資料邊界

- AMCore 只保存共享 code/spec/package，不保存 production secrets、原始 LINE userId、person ID、customer data、task records 或 OAuth refresh token。
- Production Google credentials 屬 Rental project-local secret，不屬 AMCore required shared value。
- Browser 自動化不得讀 cookies、localStorage 或顯示 token。
- 不要在 shell command、GitHub PR body、Render logs、health response 或錯誤訊息輸出 token。
- Google Calendar 不得成為 task source of truth；至少 Phase 2-G 初版維持 Rental Calendar source of truth。
- AM source item 目前必須保持 `view_only`，直到 Phase 7 有 write-back、evidence append 與 conflict control。
- 所有 destructive sync/delete 前先解析 exact calendar/event target，並保留 audit/failure record。

## 12. 建議給下一個 session 的開場指令

```text
請先完整讀取：
1. AGENTS.md
2. docs/HOZO_CALENDAR_PASSDOWN_2026-08-07.md
3. docs/HOZO_UNIFIED_CALENDAR_RULES.md

不要重做 PIN 綁定，也不要再改舊 Render service；Seven 的 Rental Calendar 身分已 active，Rental PR #41 與 AM PR #11/#12 已部署。

請從 Phase 2-G 開始：為 hozosince2026@gmail.com 規劃並實作 Google Calendar OAuth、HOZO 公司／Seven 個人 secondary calendars、ACL 與 Rental → Google 的單向 idempotent event projection。先做 read-only inventory 與 OAuth/secret architecture，再建立乾淨 worktree 和 PR。全程不要輸出或提交任何 token、LINE userId、person ID 或 production secret。
```

## 13. 完成與未完成摘要

### 已完成

- 正確正式服務辨識。
- AM Platform Calendar machine secrets。
- Seven active LINE ↔ Rental identity binding。
- Rental personal query/create/update APIs。
- AM evidence-backed source upsert API。
- 葉小蝸私人 LINE 查詢、新增、改期、完成、取消。
- 新 HOZO task 建立時的第一段 Calendar projection。
- source item read-only guard。
- package、PR、CI、Cloudflare、Render、health、production smoke tests。

### 未完成

- Google OAuth 與 `hozosince2026@gmail.com` 連線。
- 公司／個人 Google secondary calendars 與 ACL。
- Rental → Google event projection。
- task backfill 與後續 update reconciliation。
- Rental operational adapters。
- reminder delivery、retry、quiet hours。
- AM source write-back。
- 完整 Rental Portal personal/company Calendar UI。
- 全生態 alignment audit 的歷史路徑／manifest 修復。
