# 群組 mention 會議與任務

Status: Deployed

群組邀約由發起人確認，逐人使用既有 Google 連線建立；未登入與未連線待處理自動接續。任務沿用受派待辦、交辦人可見及原來源證據，新增未確認身分回補。9 個群組 SQL／signed webhook 測試，加上個人活動、任務、登入、來源檔案與暫停入口回歸。

Root OA 本次安裝；DailyLog 服務與獨立 HOZO_AM、SevenAM 未部署。全域對齊 audit 既有錯誤另行記錄，不能宣稱完成。生產已核對，結果如下。

套件完整性檢查通過。audit-alignment：113 個既有錯誤、34 個警告；compare-project-manifests 顯示獨立 HOZO_AM／SevenAM 缺少本機 checkout 與 manifest，未宣稱那些專案 Installed 或 Deployed。

## Root production verification

2026-10-13: PR290 final head acfe3c6 completed CI successfully. Render main 699d76d8628c362d44c506f2ef948ce7ab5e435b verified on both production origins with uncached health. lineGroupMentions enabled, contract line-group-mention-meetings-tasks-v1, mode organizer-confirmation-per-person, retention 30 days; archive ready.

Synthetic group Flex passed LINE validate/push with HTTP 200 and exactly 建立／取消邀約; validation did not send test messages. Two specifically selected authoritative originals entered the durable dispatch, without replaying business routing or altering source time/mentions. One work task issued with recipient, requester and source trace linked; notified=1. One invitation reached confirmation with promptedRevision current and confirmation absent, so no calendar write was authorized. One participant requires own work login. No calendar-completion claim before organizer confirmation or participant Google setup.

63 local checks and three webhook simulations passed. Independent Calendar copies do not synchronize later edits/RSVP. Root tenant service configuration, OAuth scopes and business group routing preserved; DailyLog was not deployed.
