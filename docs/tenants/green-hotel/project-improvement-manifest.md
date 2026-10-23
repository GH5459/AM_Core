# Green Hotel AM improvement manifest

| Version | Status | Scope | Verified | Notes |
| --- | --- | --- | --- | --- |
| AM-IMP-2026.1023.68 | Deployed | 單案原會議證據、實際日期診斷與同案白話結果 | PR450／451完整CI；AM 743212e2；DailyLog 77模組及最新79模組回讀 | 原6項／4既有任務／2待指派，無重複；原核准與結案保持；不重播或恢復heartbeat。 |
| AM-IMP-2026.1020.30 | Deployed | 儲存並回報 LINE 個人；直接交辦與會議待辦、組織明選一位同仁 | PR400／401完整CI，AM1dc3d0f兩站，DailyLog f107d650完整54模組100%，正式選人取消通過 | 27AM／4Worker-D1／六寬度；240原工作逐項與246最新工作／22身分保持，並行會議編修保留，未真人測寫。 |
| AM-IMP-2026.1019.02 | Deployed | 群組@bot本人任務與明確會議入口 | PR329完整CI2m32s／兩站8bc1d71與原target契約 | DailyLog50156c2e完整36模組、其他34bytes及原Assets／配置排程保持；原交辦／Calendar／身份與資料保持，真人自然驗收獨立。 |
| AM-IMP-2026.1018.01 | Deployed | 發布確認視窗內進度／錯誤及新待辦預設建立當天 | 完整 CI、合成瀏覽器、台灣午夜日期及正式原會議保持 | PR323；AM 77b1f68 兩入口確認，原會議與收據保持；本人連線仍須各自完成，未代發布或建任務。 |
| AM-IMP-2026.1017.03 | Deployed | 修正會議工作頁 LINE 登入入口與回傳 | 完整 CI、共用回傳入口、原連結本人登入後工作頁及正式設定只讀比對 | PR320／321；AM 0ccefe0 兩入口確認，已從原連結登入並開啟同一場設定頁；109 對話設定保持，未改內容或開始辨識／發布。 |
| AM-IMP-2026.1017.02 | Deployed | 會議工作頁、共同編輯、主持人發布及同連結唯讀 | PostgreSQL、完整 Worker/D1、錄音串流與內建瀏覽器隔離驗證 | PR317 CI 通過，AM 55478c1、兩端 Worker 100% 回讀；109 對話／77 開關及保存對應保持；真人新錄音另行驗收。 |
| AM-IMP-2026.1013.04 | Installed | Recurring activities and 禮拜 weekday aliases | 33 isolated root checks and 15 DailyLog checks | Production pending; original owner confirmation required. |
| AM-IMP-2026.1011.02 | Deployed | Confirmed timing with optional calendar details | 33 local tests, full CI, live main 44ae19c on both origins, LINE format and actual saved-event evidence | One requested original owner click recovered; venue preserved, success notification accepted, no other confirmation replayed. |
| AM-IMP-2026.1011.01 | Deployed | Natural timed appointment intake | 30 local tests, full CI, live main ff62d40 on both origins and accepted original-source card | One original event replayed with unchanged source identity/time; ambiguous venue still requires clarification and owner confirmation. |
| AM-IMP-2026.1010.02 | Deployed | Text-first calendar supplementation and two-action cards | 29 tests, full CI, live main 71226fd, LINE format validation and original-card acceptance | One pending legacy card refreshed; exactly 建立/不參加 with red notes; owner confirmation remains required. |
| AM-IMP-2026.1010.01 | Deployed | Shared LINE JSON archive comparison and calendar preview recovery | 44 local tests, full PR CI, live main aedbf53 and actual preview acceptance | One original unprompted preview resumed; LINE accepted it and archive completed. Owner confirmation remains required. |
| AM-IMP-2026.1007.03 | Deployed | OA-owned per-conversation central LINE evidence archive; tenant business sources retained | Real PostgreSQL, source isolation, full text, Drive-only binaries, retry recovery and signed webhook checks | Production main f1f68d5 verified live on 2026-10-07 with capture enabled, verified legacy file references and bounded batches. Historical availability and completion are tracked in the target-local owner archive. |
| AM-IMP-2026.1006.07 | Deployed | Confirm private LINE activity before Google Calendar creation | Reviewed main 19accd0, forced RLS schema, encrypted shared service setup and live configured tenant | Uses existing verified UOF direct bindings and DailyLog Google/calendar settings; no event created by deployment verification. |
| AM-IMP-2026.1004.07 | Deployed | Retrieve archived LINE attachments | Exact quote or complete filename in the same conversation; verified Drive link | Main e92dc4c live; retrieval contract and tenant archive readiness verified; real LINE delivery remains user acceptance. |
| AM-IMP-2026.1004.06 | Deployed | Drive originals; Notion links only | Production schema, runtime, exact 40 MB canary and completed available-source migration | Code 129dc97 verified; 474 saved indexes with digests, 0 Notion binary references, 8 historical sources need re-upload. |
| AM-IMP-2026.1004.04 | Deployed | Durable attachment preservation | Group/room originals, retries, verified Drive storage and failure notices | Main commit b99dd8c, live ready health and independent 40,647,423-byte tenant storage canary verified; SHA256/MD5 match. Provider redelivery setting awaits login. |
| AM-IMP-2026.0718.01 | Deployed | Shadow operational memory | Source database inventory, PostgreSQL migration, runtime-role separation, forced RLS isolation and Render deployment | Green Hotel uses the shared production PostgreSQL service with its own tenant UUID and restricted runtime role. The previous free test database contained no operational-memory rows, so no business records required copying. |
| AM-IMP-2026.0929.01 | Deployed | Scoped LINE input/output gateway | Render Live main commit, LINE webhook test, authenticated endpoints, unauthorized/group denial, accepted push and duplicate replay | Enabled in production for the configured transport group and fixed user; live user-message input canary remains pending. |
| AM-IMP-2026.0929.02 | Deployed | Per-request LINE @recipient | Main SHA and API 1.1.0 health, explicit recipient push/replay, recipient conflict, invalid/nonmember rejection, old receipt replay | Optional notifyUserId overrides the configured default; null disables @. |
| AM-IMP-2026.0929.03 | Installed | Group/member selector directory | Local PostgreSQL and API isolation checks | Production schema and explicit read-only operator configuration remain pending; no full-inventory claim. |

## Tenant boundary

- Tenant key: `green-hotel`
- Tenant UUID: `6c421e02-7ef7-4f98-8acb-758224689b58`
- PostgreSQL is shared at the service level only. Every Green Hotel row remains isolated by `tenant_id`, forced RLS and a tenant-specific runtime role.
- Shadow mode creates only candidate operational-memory records. Formal tasks, reminders and automatic external replies remain disabled.

| AM-IMP-2026.1008.01 | Deployed | Quoted photo resend and signed original download | 32 retrieval/delivery, 42 retention/archive tests; 19 core checks; webhook and signature route checks | Production main b40cb41 and signed endpoint verified; actual LINE device display remains an acceptance check. |
| AM-IMP-2026.1008.02 | Deployed | Explicit quoted conversation-archive retrieval | 84 attachment/archive tests; server webhook/private pause checks; 19 core checks | Production main 4c0f048 and native recovery/download/delivery verified. Explicit manual archive requests are independent of project activation; source/member gates remain required. |

| AM-IMP-2026.1008.03 | Deployed | MIME-aware video/audio download filenames | 88 attachment/archive tests, server webhook, 19 core checks | Production main f8b9e7b, old-link MIME/extension and original byte equality verified. Existing valid links retain exact original bytes and receive correct extensions. |


