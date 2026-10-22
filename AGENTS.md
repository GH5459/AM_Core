2026-10-22，E87／ADR-38／AM-IMP-2026.1022.63葉小蝸專用背景入口與單案唯讀查核已Installed／Deployed。PR439來源7dd0787e完整CI39754050835通過並合併fa7f021f；DailyLog由真正最新42ea7302-8627-47d5-b0a6-d7d8c7bfad9f精準延伸adf7af15-a526-421f-94ac-0c8a52a553d3／100%完整70模組，只換secretary後端、新增兩個查核模組，其餘67模組bytes及原Assets／秘密／設定／bindings／兩cron保持。原338工作均保留，並行自然變動不回灌。沿既有ai-xiaoye服務身分，health／單案inspect／inspection-open不使用本人密碼或真人session；查核頁通行證一次性、最長5分鐘，只限當次事件與案件版本，圖片及該案日誌唯讀。每次讀取重核來源、事件、資格與執行事件的本人當版核准；補充／暫緩／撤回／版本改變／到期／服務停用即拒絕後續讀取。查核憑證不能核准或修改、不能讀他案圖片，存取留證且不記明文憑證。6新增完整Worker-D1、21原流程、2本人核准事件、6單元／閒置及六寬通過，正式服務health／匿名邊界已回讀。原事件runner與prompt已更新、無重啟／重播；ai heartbeat保持PAUSED。AM／UOF／LINE選單未重發，無真人LINE或業務測寫；PR436及真人手機登入根因保持獨立，不擴為雲端AI遷移。私人完整包、回退與回執留DailyLog .dailylog-data/xiaoye-case-inspection-20261022，不build dirty根或重發歷史包。

## 葉小蝸專用背景入口與案件查核頁（E87，實作中）

2026-10-22，本人明確要求依研究建議實作並正式部署，AM-IMP-2026.1022.63／ADR-38。沿既有ai-xiaoye身分補health、單案inspect與短效一次性唯讀查核頁，不使用本人密碼或真人session。每次讀取重核當前事件、案件版本、來源、服務與專案資格；執行仍須本人逐版核准及原lease。授權隔離實作、完整CI／PR合併、私人回退、最新完整包精準發布及原處理器runner／prompt增補，不重播事件、不恢復heartbeat，不真人業務／LINE測寫。PR436與手機登入根因保持獨立，尚未部署，不擴為雲端AI搬遷。

下一步：完成隔離安全與完整Worker-D1／事件驗證、PR審查及正式回讀；正式證據前不得稱Deployed。

2026-10-22，E86／ADR-38／AM-IMP-2026.1022.62 LINE內核准與提供建議已Installed／Deployed。PR437來源d5795cd6完整CI39733971846通過，AM248b2ab6兩站正式回讀；DailyLog由真正最新3e0c0c95-3f55-4af4-b466-b9af4c1cb01f精準延伸42ea7302-8627-47d5-b0a6-d7d8c7bfad9f／100%完整68模組，其他64原模組bytes與原Assets／秘密／bindings／設定／兩cron保持。原332工作均保留，正常並行變更不回灌。方案兩主按鈕為原生postback：本人在原OA私訊點擊即核准精確Work ID／hash，不製造登入session；目前有效工作身分、雙向已確認映射、當版、來源、專案、事件證據及30分鐘核准每次執行重核。一般文字不授權，非本人／群組／錯OA／舊卡／重播不執行。主管建議分段文字／多圖先暫存，30分鐘閒置到期、4000字／10張合計10MB，固定送出／取消鈕綁原草稿；送出才失效舊核准並同卡事件重新提案，取消不改原案。撤回停止，原文／圖片bytes／網頁入口保持，未送出不啟動AI，原ai heartbeat保持PAUSED。23單元、33完整Worker-D1、2真事件流程、六寬與2官方LINE格式通過，無真人核准或業務測寫。私人完整包與回退留DailyLog .dailylog-data/xiaoye-line-owner-actions-20261022；不重發舊包、不build dirty根。

2026-10-22，本人明確要求方案兩主按鈕在LINE內完成，AM-IMP-2026.1022.62／ADR-38／E86實作中。授權隔離實作、CI與PR合併、原目標私人回退、精準發布及回讀。只允許原OA私訊中目前有效且已確認身分的指定本人，精確Work ID／hash postback核准；一般文字不授權。建議文字／多圖先暫存，送出才失效舊核准並重新提案；取消不改原案。原網頁核准、事件／租期守衛、工作與圖片、64原模組及Assets／秘密／bindings／設定／兩cron保持，不恢復heartbeat，不真人LINE或業務測寫。正式回讀前不稱Deployed；保留並行所有改善。

2026-10-22，E85／ADR-38／AM-IMP-2026.1022.61 LINE系統連結外部瀏覽器已Installed／Deployed。PR433來源db21c4a4完整CI39731474510通過，AM92f28067兩站正式回讀；DailyLog由真正最新e6178153-f591-4bbd-a98c-04ec0290a135精準延伸3e0c0c95-3f55-4af4-b466-b9af4c1cb01f／100%完整66模組，其他63原模組bytes、原Assets／秘密／bindings／設定／兩cron保持。原331工作保留，正常並行變更不回灌。方案兩按鈕、查看案件、系統文字網址與URI actions在點擊時帶openExternalBrowser=1；原案件／版次hash／ticket／fragment、登入返回、UTF16 mention位置保持，開啟連結不自動核准。20單元、21完整Worker-D1與六寬通過，未真人LINE或業務測寫。原LINE歷史不改寫；LIFF／MINI App及line://功能沿原用途，電腦版由LINE與裝置設定決定瀏覽器，真人手機自然驗收獨立。保留並行白話方案與事件功能，ai heartbeat保持PAUSED。私人完整包與回退留DailyLog .dailylog-data/line-external-links-20261022，不重發舊版本、不用dirty根發布。

2026-10-22，E84／ADR-38／AM-IMP-2026.1022.54「100字白話處理方案」已Installed／Deployed。PR432完整CI39730899764通過並合併514f8b2b；DailyLog由真正最新efe6f19e完整65模組延伸e6178153-f591-4bbd-a98c-04ec0290a135／100%完整65模組，只換secretary後端、UI、proposal-card，其餘62模組bytes與原Assets／秘密／bindings／設定／兩cron保持。原331工作均保留，方案、建議與核准不遷移或重寫。主畫面及LINE只顯示「處理方案」100字內一段白話，不接步驟；技術安排、測試、發布與回復預設收合。新提案API拒絕過長與步驟格式，不自動截斷；舊長版完整原文在細節保留，原hash與核准保持。待送卡片以原版內容重套新樣式；已送LINE歷史訊息不改寫或重送。原事件prompt只增補文字規則，下一事件讀取，不重啟／重播或恢復heartbeat。23完整Worker-D1、16單元、六寬與兩LINE格式驗證通過，未真人LINE或業務測寫；AM原傳輸沿用不另部署。私人完整包與回退留DailyLog .dailylog-data/xiaoye-brief-plan-20261022。

2026-10-22，本人明確要求實作並正式部署「處理方案100字內白話、技術細節收合」，AM-IMP-2026.1022.54／ADR-38／E84執行中。授權隔離實作、CI與PR合併、原目標私人備份、精準發布與回讀及原事件prompt增補。保留所有案件、建議、原方案與核准紀錄；不改寫真人卡、不重播事件、不恢復heartbeat，正式回讀前不稱Deployed。

2026-10-22，E83／ADR-38／AM-IMP-2026.1022.53回報固定按鈕、圖片檔與提案延後已Installed／Deployed。PR430完整CI39723898282通過，AM20ff55e4兩站與Render Live回讀；DailyLog由真正最新dad102c9完整65模組精準延伸efe6f19e-a3ec-429e-99de-7b59f7c4abd5／100%完整65模組，其他64模組bytes及原Assets／秘密／bindings／設定／兩cron保持。原327工作保留，草稿文件與圖片分塊逐項保持。固定按鈕核對原draftId，舊快捷按鈕只刷新；再次回報問題接續原草稿及數量，不重新建立。PNG／JPEG／WebP照片或檔案沿同卡接收，10MB／內容檢查及失敗明示；回報人仍在填草稿時延後其提案通知，不耗重試，完成／取消／到期後原佇列續送並核最新方案。20完整Worker-D1／15單元／六寬與4官方LINE格式通過，未真人LINE或業務測寫；ai排程維持PAUSED，不持續AI等待。私人完整包與回退留DailyLog .dailylog-data/xiaoye-intake-controls-20261022；不重發舊包、不回灌業務快照。

2026-10-22，本人明確要求三項修正並正式部署：固定草稿按鈕、以檔案傳圖、正在回報時延後該人舊案提案通知。AM-IMP-2026.1022.53／ADR-38／E83執行中；授權隔離實作、CI/PR合併、原目標私人備份、精準發布及回讀。保留當前草稿、案件、原圖與事件處理，不恢復heartbeat，不真人LINE或業務測寫。正式回讀前不稱Deployed。

2026-10-22，E80／ADR-38／AM-IMP-2026.1022.60「有回報才啟動」已Installed／Deployed。PR426完整CI39720738743通過並合併5bad8162；DailyLog由真正最新c0e3aaa3／62完整模組延伸f39d92e0／63，其他60模組bytes及原Assets／秘密／bindings／兩cron保持。後續並行提案卡已進至dad102c9-0659-42fb-949e-d0b1c34f47a2／65完整模組，本輪回讀保留，不重發舊包。PR428完整CI39722438553通過，本機接收器已更新並恢復；分析階段僅私人目錄可寫，當版本人核准才可執行。原327工作均保留，無真人LINE或業務測寫。原ai heartbeat維持PAUSED；完成回報、有效補充、主管建議或本人逐版核准才啟動單次AI，等待回覆或核准即結束。登入自動啟動的隱藏接收器只維持事件連線，無定時AI查件；離線事件保存，重新連線接續，已啟動但結果不明的工作不自動重做。實際釐清／提案／結果沿原服務通知及事實日誌，不能代同仁結案。

2026-10-22，E82／ADR-38／AM-IMP-2026.1022.52提案卡與主管建議已Installed／Deployed。PR425最後來源4f343504完整CI39721083350共166步通過，合併4d559675兩origin及Render41.2秒回讀；DailyLog由真正最新f39d92e0／63完整模組延伸至dad102c9-0659-42fb-949e-d0b1c34f47a2／100%完整65模組，其他60模組bytes含最新private-vault-large與main、原Assets／秘密／bindings／兩cron保持。原327工作均保留，期間1筆自然變更不回灌，身分與設定0變更。四區塊卡片、精確版次核准及主管建議／附圖、舊核准與lease停止、同卡事件重新提案與新版核准已驗；既有1022.60事件功能保持，私有執行prompt已增補主管建議規則，不重啟處理器、不恢復ai heartbeat。真Codex合成建議僅一次啟動產生第2版並結束；未真人LINE／任務／日誌測寫。發布有一筆事實AI日誌，無虛構工時；私人來源與回退留DailyLog .dailylog-data/xiaoye-proposal-card-20261022。舊LINE文字不重送，不將自然釐清中的案件強制提案或結案。

2026-10-22，本人明確要求依提案卡討論實作並正式部署，AM-IMP-2026.1022.52／ADR-38／E82執行中。四區塊與兩個精確版次操作；主管建議獨立保存、附圖及同卡版本防重，送出即失效舊核准與lease，經事件處理整理新版後重新核准。授權本項隔離實作、檢查PR合併、原目標私人備份、精準發布與正式回讀；不得覆蓋並行1022.60事件功能，不恢復原ai heartbeat、不真人LINE／任務／日誌測寫。尚未正式發布，不冒稱Deployed。
2026-10-22，本人已明確要求實作並正式部署「有回報才啟動」，AM-IMP-2026.1022.60／ADR-38／E80執行中，尚未聲稱部署。授權本項隔離實作、CI與PR合併、DailyLog最新完整包必要事件binding／SQLite類別與增量outbox、原本機隱藏事件接收器及正式回讀。原五分鐘automation ai維持PAUSED，不得用另一個定時AI輪詢替代。有正式回報、有效補充或本人對目前版方案核准才處理一次；原逐版核准、同卡、失效守衛、事實日誌及同仁確認保留。沒有事件不啟動AI；連線保活／故障重連不讀問題queue、不啟動AI。不另開API帳號／模型或LINE帳號，不以真人業務測寫。沿真正最新來源、不build dirty根、不重發舊包；保留原Assets／秘密／其他bindings／兩cron與並行資料。

2026-10-22，E78／ADR-38／AM-IMP-2026.1022.50葉小蝸AI秘書試行已正式啟用。PR422／423完整CI39715533473通過，AM95bc2db1兩站及Render Live；DailyLog897134a2-e7ca-4b6a-976a-bdfd8e8074b9／100%完整61模組，由2d16712c／59延伸，其餘58bytes及原Assets／設定／bindings／秘密／兩cron保持。既有OA工作身分ai-xiaoye已接入、未新建LINE帳號、無真人登入／UOF假員工，精確加入四既有專案。原318工作均保留，四會員增量及自然並行變更不回灌。本人逐版核准後每次一件；補充／撤回／暫緩失效舊核准，完成有證據、同仁確認結案及事實日誌。每5分鐘本機heartbeat無進展安靜，私有完整包與回執只留DailyLog .dailylog-data/xiaoye-secretary-pilot-20261022。後續沿真正最新來源完整包，不build dirty根或重發舊包；無真人LINE／任務／日誌／Google／UOF測寫，自然新訊息驗收獨立；OA改名由本人自行操作。

# AMCore Agent Guide

AMCore is the shared core and upgrade-package center for AM-style projects such as HOZO_AM and SevenAM. Its root runtime is also the reviewed source for the current multi-tenant AM Platform service.

This repository stores shared architecture rules, reusable runtime templates, upgrade packages, package templates, alignment tools, and the root AM Platform runtime. Historical package-only guidance does not override the root runtime's production role.

## Main Rule

Use AMCore to design, package, document, and verify shared improvements.

Apply improvements to HOZO_AM and SevenAM separately.

Do not mix project data.

## Ultimate AM Goal

AM exists to help turn real-world conversations into reliable project control.

The most important purpose of AM, SevenAM, HOZO_AM, and AMCore development is:

1. Find meaningful tasks from conversations.
2. Connect every task to a project goal.
3. Use meeting records as both task sources and execution knowledge.
4. Track whether tasks have moved, changed, been blocked, or been completed.
5. Preserve the source evidence behind every task and status change.

Every AMCore shared feature, runtime template, upgrade package, script, schema,
report, and assistant workflow should serve this goal. If a proposed improvement
does not make conversation-to-task extraction, project-goal alignment, meeting
knowledge reuse, or task status tracking clearer and more reliable, treat it as
secondary to this goal.

### 1. Core Task: Extract Action Items

AM must continuously look for reasonable tasks in LINE conversations and other
project conversations.

Rules:

- A LINE group is a context container. It may contain one continuous project
  discussion, or several separate topic threads in the same day.
- Before creating tasks, split a conversation into topic threads by subject,
  participant replies, time continuity, explicit topic changes, and phrases such
  as "another thing" or "insert one more issue".
- Judge tasks at the topic-thread level, not at the single-message level. Several
  messages may together form one task, one status update, or one completed issue.
- If a later message in the same topic thread answers the earlier question,
  provides the requested data, confirms transfer, or closes the loop, update the
  existing task status and evidence instead of creating another task.
- Extract tasks when a conversation implies an action, follow-up, decision,
  unresolved issue, delivery promise, blocker, owner responsibility, or
  completion check.
- Do not extract assistant operation commands as tasks. Messages such as
  "查待辦", "列出今天的待辦", "打開第 2 個任務", "看一下目前任務",
  or similar instructions addressed to Seven Jr., HOZO Jr., AM, or another
  assistant are system operations, not new real-world tasks. Preserve them as
  source messages or command logs when needed, but do not create total-control
  tasks from them unless the same message also contains a separate concrete
  action, owner, delivery, deadline, or external commitment.
- In a project assistant direct chat or small assistant control group, phonetic
  or mistyped assistant addresses such as "謝孟娟" or "謝夢娟" used for
  Seven Junior should be treated as assistant command aliases when the message
  asks to show, list, open, search, or update tasks. Do not reinterpret those
  aliases as real people or task owners.
- Each task should connect back to a project goal. A task without a project goal
  is incomplete context, not a fully understood control item.
- If a conversation reveals a new project goal, first record or propose the
  project goal, then organize the related tasks underneath that goal.
- If a task is useful but the project goal is unclear, keep it as a candidate
  task and mark what needs clarification instead of ignoring it.
- When one conversation contains multiple tasks or multiple goals, split them
  into separate task records where practical.
- The task record should preserve source context: original message, conversation
  or meeting reference, project guess, reason for extraction, and any inferred
  owner, due date, priority, or risk.
- A task must not become a formal project-local task without source evidence in
  its task body or source/evidence fields. The task body must include or link the
  LINE conversation content, meeting record content, report clue, attachment, or
  other source record that caused the task to exist.
- When creating a task from LINE, include the relevant conversation group,
  message time, sender, message content, and media/file reference when present.
  When creating a task from a meeting, include the meeting reference and the
  checkbox item or decision paragraph that caused the task.
- If a useful candidate task is found but no source evidence can be attached,
  keep it as a candidate or pending-confirmation item. Do not treat it as a
  confirmed total-control task until the source is recovered or added.

Project-goal linkage:

- A project goal explains why the task matters and what larger outcome it serves.
- A new project goal may appear as a stated objective, milestone, deadline,
  requested result, recurring concern, or repeated cluster of related tasks.
- Existing project assignment from a project-local conversation master should
  override text guessing when available.
- AMCore may define the shared logic and schema pattern, but each project must
  store its own live goals, tasks, messages, and records locally.

### 2. Meeting Records As Task And Knowledge Sources

Meeting records are a first-class intake source, not a secondary note archive.

Task definition:

- In meeting records, every checkbox item is a task.
- The content immediately after the checkbox is the task content.
- Checkbox-derived meeting tasks do not need extra confirmation that they are
  real tasks because the meeting record already marked them as action items.
- This applies to Notion to-do blocks and Markdown-style checkbox lines such as
  `[ ] item`, `[x] item`, `□ item`, `☐ item`, `☑ item`, and `✅ item`.
- Checkbox tasks should enter the project-local task database with source set to
  meeting. When the task schema has confirmation status, use confirmed status.
- Avoid duplicates by matching the meeting reference plus normalized task text.

Reference-document role:

- Meeting discussion, decisions, progress notes, blockers, and conclusions are
  important knowledge sources for task execution.
- Do not only extract the checkbox text and discard the rest of the meeting.
  Preserve or link the surrounding discussion so the executor can understand why
  the task exists, what was decided, what has already changed, and what risk or
  dependency was mentioned.
- Meeting decisions can explain project-goal changes, task priority changes,
  ownership changes, due-date changes, or completion criteria.
- Meeting records may update project progress reports even when they do not
  create a new task.

### 3. Task Status Tracking And Updates

AM must use later conversations, meeting records, daily reports, and system
suggestions to detect whether a task has been handled, blocked, changed, or
completed.

Rules:

- Track task status from LINE conversations, meeting records, daily reports,
  follow-up confirmations, and system-generated suggestions.
- If a later source indicates a task has moved forward, changed owner, changed
  due date, become blocked, been partially handled, or been completed, update the
  project-local task record.
- Status changes must be grounded in source clues. Do not silently mark a task
  complete based only on optimism or lack of recent discussion.
- Record the status-change evidence inside the task body or source/evidence
  field: where the clue came from, what it said, what status changed, and when it
  was detected.
- Keep the raw source message or meeting reference linked so the project owner
  can audit why the status changed.

Valid evidence sources include:

- System suggestions that identify a likely status change or follow-up result.
- Daily report contents, including morning brief, follow-up reports, and the
  daily control report.
- A later LINE conversation where someone says the item was handled, answered,
  scheduled, sent, paid, reviewed, blocked, cancelled, or completed.
- A meeting record that records a decision, completion, blocker, reassignment,
  or next step for the same task.

Status update behavior:

- If evidence shows completion, move the task toward completed or pending
  completion confirmation depending on risk and confidence.
- If an earlier conversation raised a real operational check, such as whether
  staff, site operations, classes, delivery, service, or scheduling must change,
  and a later reply confirms "normal", "no adjustment needed", "already handled",
  or equivalent, preserve the task as a real task and mark it completed or
  pending completion confirmation. Do not archive it merely because the later
  message is a short status reply.
- If evidence shows waiting on someone, mark that the task is waiting and record
  who or what is being waited on.
- If evidence shows work started but not finished, mark that it is in progress
  and add the current next step.
- If evidence is plausible but uncertain, keep the task pending confirmation and
  write the evidence summary for project-owner review.
- Sensitive, financial, contractual, legal, HR, tax, or external commitment
  items still require project-owner confirmation before final closure or external
  action.

### 4. Hourly LINE Task Reconciliation

From 08:00 through 22:00 in each project-local timezone, AM's hourly LINE check
has one central duty: decide whether each new LINE message is an update to an
existing task or a genuinely new event that needs a new task.

This hourly check exists because the full cause-and-effect chain of a task often
lives inside the LINE group history. A later message may answer an earlier
question, provide requested data, confirm attendance, show that someone joined a
group, prove that a reply was sent, change the owner, reveal a blocker, or close
the loop. AM must therefore reconcile messages against existing tasks before it
creates new tasks.

Hourly reconciliation flow:

1. Load the latest task judgment rules before judging any new message. This is
   mandatory. The hourly run must read AMCore shared rules, the project-local
   judgment rules database, learned calibration rules, and active manual rules
   written from User UI before it classifies messages or updates tasks.
2. Read new LINE messages since the previous hourly run.
3. For each message, review earlier context in the same LINE conversation.
4. Search the project-local total-control task database for related active tasks.
5. If the new message extends, answers, completes, blocks, changes, or clarifies
   an existing task, update that task and record the evidence.
6. If no existing task can absorb the message, decide whether it is a new event.
7. Create a new task only when the new event contains a real action, owner,
   delivery, decision, risk, or follow-up need, and source evidence can be
   written into the task body or source/evidence fields.
8. If the message is background, acknowledgement, duplicate content, test text,
   pure knowledge sharing, or a record with no action, mark it judged without
   creating a task.

Mandatory source-evidence gate:

- Every newly created task must pass the source-evidence gate before it becomes
  a formal total-control task.
- The gate requires at least one project-local source reference: LINE message or
  conversation record, meeting record and checkbox/decision, daily report clue,
  system suggestion trace, attachment/file record, or a linked source page.
- The task body should carry enough source content for a project owner to audit
  why the task exists without relying on memory.
- If the gate fails, the hourly run must either recover the source from the
  project-local records, mark the item as a candidate/pending-confirmation task,
  or refuse creation and log the failure.
- Status changes and next-step changes must also append the new evidence that
  caused the change.

Judgment rule loading requirements:

- The hourly task judgment job must not rely only on hard-coded rules.
- It must load the latest project-local Notion judgment rules from
  `HOZO_JUDGMENT_RULES_DATA_SOURCE_ID`, `SEVEN_JUDGMENT_RULES_DATA_SOURCE_ID`,
  or the project's equivalent `PROJECT_JUDGMENT_RULES_DATA_SOURCE_ID`.
- Loaded rules should be filtered by status, scope, trigger pattern, and
  exception conditions before use.
- Loaded rules must be considered for task extraction, existing-task update vs
  new-task decisions, task merge or suppression, status changes, project
  assignment, next-step updates, and no-task decisions.
- When a loaded rule materially affects the result, record the rule name or id
  in the task evidence, message judgment log, or calibration trace.
- If rules cannot be loaded, record a warning and use the safest fallback
  behavior. Do not silently ignore rule-loading failure.

The task database should remain an event-control system, not a message-to-task
dump. The shared machine-readable contract for this behavior is:

```text
versions/AM-IMP-2026.0608.18/config/hourly-line-task-reconciliation.json
```

## Project Roles

| Project | Role |
| --- | --- |
| AMCore | Shared core source, root multi-tenant AM Platform runtime, upgrade packages, templates, audit tools. |
| HOZO_AM | HOZO production project with its own LINE, Notion, Render, GitHub, and `.env`. |
| SevenAM | Seven production project with its own LINE, Notion, Render, GitHub, and `.env`. |

## Data Boundary

Never store these in AMCore:

- `.env`
- LINE tokens or channel secrets
- Notion tokens
- Render secret values
- GitHub tokens
- Production database IDs as required shared values
- Customer messages
- Task records
- Report records
- Attachment records
- Automation logs

AMCore may store:

- Shared code patterns
- Runtime templates
- Script templates
- Notion schema templates
- JSON package metadata
- Upgrade instructions
- Verification checklists
- Rollback notes
- Non-secret project path configuration

## Standard Workflow

For any shared feature change:

1. Create or update an Upgrade Package in `versions/AM-IMP-YYYY.MMDD.NN/`.
2. Include `README.md`, `upgrade.json`, `INSTALL.md`, `VERIFY.md`, and `ROLLBACK.md`.
3. Add scripts, JSON files, schema files, or reference code when the version needs them.
4. Keep project-specific values out of the package.
5. Install the package into HOZO_AM and SevenAM separately.
6. Update each project's own `docs/project-improvement-manifest.md`.
7. Create each project's own `docs/upgrades/` record.
8. Run the AMCore alignment audit.

## Required Checks

Before calling alignment complete, run:

```text
node D:\Codex_project\AMCore\tools\audit-alignment.js
```

For a single package, run:

```text
node D:\Codex_project\AMCore\tools\check-upgrade-package.js AM-IMP-YYYY.MMDD.NN
```

For version status comparison, run:

```text
node D:\Codex_project\AMCore\tools\compare-project-manifests.js
```

## Runtime Template

The current shared runtime starting point is:

```text
D:\Codex_project\AMCore\core\runtime-template
```

This is not yet a fully generic production runtime. Before turning it into a real shared runtime, remove or adapt project-specific names such as HOZO, Seven, `HOZO_*`, and `SEVEN_*`.

## Production Deployment

The root AM Platform runtime is production source for the multi-tenant service behind
`am.hozorental.com` and `am-platform-2ymf.onrender.com`. Production changes must come
from reviewed commits merged to and pushed on GitHub `main`; never deploy from a local
feature branch, dirty worktree, or stale checkout.

Legacy standalone HOZO_AM and SevenAM services, where still in use, remain separate
deployments from their own repositories. Do not mark a version as `Deployed` unless
the actual target production service has been verified.

## Status Values

Use only these values in manifests and registries:

| Status | Meaning |
| --- | --- |
| Proposed | Idea exists, not ready to install. |
| Ready | Package/spec is ready but not installed in this project. |
| Installed | Applied and verified locally. |
| Deployed | Applied and verified in production. |
| Blocked | Cannot proceed without missing project-local setup or permission. |
| Deprecated | No longer recommended. |

## Working Style

When asked to improve shared behavior, do not only write a note.

Build the package, include the needed scripts/schema/JSON, install it separately into each project when requested, and verify with the audit tool.
