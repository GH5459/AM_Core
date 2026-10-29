# 小葉外部動作帳本：隔離原型

本原型尚未接入正式案件、Codex、GitHub 或 Render，也不是可用的安全隔離邊界。它使用 SQLite 記錄操作，只供本機虛構資料測試。不要把此帳本或同一 Codex／runner 自報的資料當作獨立證明。

## 現有原型

- 在任何外部寫入前，保存原事件、原來源版本、固定操作 ID、完整目標，並以資料庫交易保存「已送出或結果不明」標記；標記建立後不以相同操作重新送出。
- 未釐清時，同一 PR 或同一 Render 服務不能靠更換操作 ID、提交版本或來源版本繞過；同一具體動作已存在時也拒絕建立另一筆。
- GitHub 唯讀查詢只有完全吻合的 repository、PR、base、完整 head 與 merge SHA 才可確認目前 PR 已合併。它不證明原操作造成合併；未合併也不能證明原請求絕未送出。
- Render 唯讀查詢需要原回執記錄的 deployment ID，以及相同 workspace、service、完整 commit 和終態。只看到同 SHA 目前 Live，不能確認是哪次操作。
- 任一觀察不完整、權限不足或讀取失敗，都保持不明，不執行原寫入。已確認的失敗也不自動重送；新操作需要獨立的新授權規則，本原型沒有實作。
- 接續條件只允許新的查核，不代表原問題已解決；沒有外部獨立驗證者時預設拒絕。

## 真正上線前仍缺少的邊界

1. 需要由獨立於 Codex 的可信服務建立與銷毀執行環境：限制憑證、檔案、程序和網路，確保所有 GitHub／Render 等外部副作用只能經過該服務，並持久保存從請求至回執的證據。使用 `danger-full-access`、共用 runner 憑證、提示詞、或同一程序自行簽章都不能提供這種保證。
2. 需要可信監督者證明完整程序樹及背景工作已停止，並對每個原事件、原版本產出完整不可更改的操作清冊。清冊必須涵蓋所有外部寫入種類，不能只列 GitHub／Render；缺乏可強制執行的完整邊界時不可聲稱清冊完整。
3. 必須接上獨立可信的驗證者、金鑰管理與回條傳送；本原型的 `verifyBoundaryReceipt` 只是介面，測試中的函式是假資料，不能用於正式環境。先驗證簽章與監督者資格，再核對事件、原版本、完整清冊、各項終態及授權，最後以原子版本檢查接續。
4. 唯讀核對應低頻退避，服務恢復後再查；需要獨立紀錄排程與結果。此原型只提供單次核對，不含持久排程、正式 provider 連線、最小權限憑證、或操作排程器。
5. 若舊事件發生時沒有此受控環境及完整記錄，不能事後假設清冊為空。只有其他可信且足以證明原程序停止與所有副作用的證據存在時，才可接續；否則保留待確認並如實告知原回報人。
6. SQLite 帳本所在目錄、資料庫權限、備份與防竄改須由可信監督者持有，不能讓任意被監督程序寫入；本機測試檔不提供這些環境保證。多主機、磁碟遺失、磁碟備份回滾及平台提供者一致性均未驗證。

執行 `node --test tools/test-xiaoye-controlled-action-journal.cjs` 僅測試隔離假資料與狀態轉換，並非正式環境驗收。

## 本機 Windows 唯讀能力探測（2026-10-29）

執行 `node tools/probe-xiaoye-sandbox-isolated.cjs` 只建立虛構檔案和本機測試 HTTP server，並在結束時刪除該測試資料；不讀取任何正式憑證、不呼叫正式服務、不更動使用者設定。此機器 Codex CLI 0.165.0-alpha.1.2、Windows 11 家用版、本機帳號未以管理員身分執行。一次實測結果：

- 使用臨時 `:root=deny` profile 時，app-server 拒絕執行：elevated Windows sandbox 需要有效的 `:root` read。這只證明當前所選 Windows sandbox 不接受此設定，不代表其他 sandbox 實作一定相同。
- `:root=read` 加一個明確假資料夾 deny、`network.enabled=false`、`shell_environment_policy.inherit=core`：假檔讀取被拒、虛構環境變數未繼承、外網測試被拒；但 127.0.0.1 測試服務仍可連線。`inherit=none` 在此機器造成 Node 無法初始化，不能直接替代。
- profile 的網路規則僅控制受限 shell；[官方權限說明](https://developers.openai.com/codex/permissions/) 指出 MCP、連接器、瀏覽器及電腦操作須另行控制。[官方沙箱安全說明](https://developers.openai.com/api/docs/guides/agents-api/environments/security) 建議把第三方憑證留在環境外，由可信代理提供功能。
- 本機查無 Docker／Podman，WSL 未安裝；現有方案不可視為已具備獨立作業系統或容器邊界。特定 deny 只驗證一個虛構路徑，不能證明 Windows 憑證保管、所有其他檔案、桌面現有 session、命名管道、其他本機服務、所有 MCP／應用或子程序已隔離。

最小可行實作需獨立受限執行身分及獨立 broker，broker 保管正式憑證並持有持久動作帳本；事件憑證只能授權該事件的已確認操作。執行環境必須拒絕其他桌面工具、現有 session、正式憑證與未核准網路／本機服務，並驗證子程序終止。建立隔離身分、ACL、service 或網路規則通常需管理員或既有受管環境；本次未建立帳號、變更 ACL、防火牆或正式服務。現有簡單 deny 設定與 loopback 開放，不足以證明此設計已安全可用。

## 受控 broker 雛形（僅假 provider）

`tools/xiaoye-controlled-broker.cjs` 是可由測試或隔離主控呼叫的 Node 模組，不啟動網路服務，也沒有 GitHub／Render 憑證或正式 API 實作。只允許事先由主控登記的精確 PR 合併或指定服務／commit 發布；不接受任意 URL、方法或轉發。安全依據是主控設定的固定 allowlist 和每個事件獨立 scope，而非模型自行提供的文字。

主控介面：

- `registerEvent({eventId,sourceVersion,generation,leaseId,capability,expiresAt,maxExpiresAt,scopes})`：註冊原事件、執行資格及精確操作範圍。正式能力值必須由安全的隨機來源生成；資料庫只保存雜湊。相同內容可重播，事件一旦撤銷不得再次註冊。
- `renewEvent({eventId,sourceVersion,generation,leaseId,expectedExpiresAt,expiresAt})`：比對原期限、事件代次、lease、未逾期狀態及最大期限；不能復活已逾期或撤銷的事件。主控還須獨立確認真正事件租約，這裡的 SQLite 和原事件服務並非同一交易。
- `revokeEvent({eventId,sourceVersion,generation})`：若事件尚未註冊也持久保存撤銷紀錄，避免晚到註冊復活。撤銷不能取消已交給外部提供者的請求；晚到結果保留，仍須核對。
- 受限端 `dispatch({eventId,sourceVersion,generation,leaseId,capability,operationId,kind,target})`：核對本地事件期限與精確範圍，使用同一 SQLite 交易保存派送保護，再呼叫事先注入的固定 provider 方法。超時、錯誤或未取得有效回執都保留 unknown，禁止重送；同資源 unknown 不能透過更換操作 ID／版本繞過。
- 寫入 provider 的延後 callback 入口會再次核對資格，避免 callback 執行前已撤銷或到期卻仍呼叫 provider；該情形保守保留 unknown。這並非跨程序原子撤銷：另一程序仍可能在最後核對與呼叫間撤銷，而且 adapter 內部可能延後送出。已交給 provider 的請求也不能撤回，必須保留與查核結果，不能重送。
- 查到當前效果只代表目前的觀察，不能證明原請求已結束；若原請求尚未有有效回執，仍鎖住同一資源，對外 `state` 為 `unknown`、`requestTerminal` 為 false，即使 `observation.state` 是 effect-present。下游不可只看 observation；完成判斷還需 `requestTerminal` 為 true、帳本狀態為 observed，及獨立可信邊界證據。GitHub 的晚到回執只有與觀察的合併版本吻合才解除；不吻合、逾時或缺少回執仍持續阻擋。有效回執可靠與否取決於受控 adapter 的真實實作，假資料測試不能證明正式環境。
- 受限端 `reconcile({eventId,sourceVersion,generation,leaseId,capability,operationId})` 只接受仍有效的原事件；主控可在撤銷後用 `reconcilePending(operationId)` 唯讀查原記錄。查核失敗以 SQLite 保存下次時間，5 秒起逐次退避、最高 15 分鐘，外層主控必須依 `retryAt` 繼續排程。此處不自動寫入、不重送原動作。

執行 `node --test tools/test-xiaoye-controlled-broker.cjs tools/test-xiaoye-controlled-action-journal.cjs` 使用虛構來源與模擬 provider，測同資源防重、逾期／代次、撤銷晚到註冊、逾時、重啟及只讀退避。GitHub 觀察只證明目前 PR 狀態，Render 需原 deployment ID；兩者都不能單憑此判定原問題已解決。

**未提供**：實際 OS 隔離、服務端身分與存取控制、跨事件服務一致性、真實 provider 連線／認證、完整外部動作清冊、可驗證程序樹終止、簽章發行與驗證，以及正式長期排程。`registerEvent`／`renewEvent`／`revokeEvent`／`reconcilePending` 必須放在 guest 無法呼叫的可信主控側；目前只是同一 Node 程序的內部方法，不能單靠它們防止不受控程式偽造結果或繞行，不能啟用正式自動解除。
