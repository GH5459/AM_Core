# 小葉模型 gateway：隔離假資料原型

本原型只在 `127.0.0.1` 開測試用 HTTP server，回應由程式固定生成；不讀模型憑證、不連線 OpenAI、不呼叫真人資料或正式系統。執行：

```sh
node --test tools/test-xiaoye-model-gateway-fixture.cjs
```

與既有受控操作 broker 的假 provider 一起測試：

```sh
node --test tools/test-xiaoye-model-gateway-fixture.cjs tools/test-xiaoye-controlled-broker.cjs tools/test-xiaoye-controlled-action-journal.cjs
```

整合測試用同一虛構事件分別註冊模型 token 與動作 broker，然後逐一撤銷並核對 broker 回執；這是兩個操作，沒有跨服務原子性，不代表正式主控同步已完成。

測試主控簽發短期隨機 token，其資料綁定事件、來源版本、代次、到期及請求次數；server 僅接受固定 `POST /v1/responses`、固定假 model 及嚴格的純文字 input。拒絕其他路徑、查詢參數、URL／tools 欄位、擴充欄位、過大內容、過期或撤銷 token，以及事件代次相同的重複簽發。請求 ID 在同事件代次不能重複；讀取緩慢的請求完成後再次核對 token。回應是假的 SSE，沒有轉發任意網址。

測試中的授權和執行邊界只存在同一程序；不等於可防範同程序不受信任程式。傳入明確 dbPath 時，發放、撤銷、用量與防重紀錄寫入同一 SQLite；預設 `:memory:` 仍不跨重啟。兩種模式均 **不得用於正式環境**。服務沒有 TLS、對端身分驗證、跨系統 lease 同步、持久帳本、分散式並行保護、限流與總費用保護、真正外部模型後端，亦未驗證多行程／網路／密鑰隔離。已交給後端的請求不一定能撤回；模擬器不是完整副作用清冊。

目前的純文字 schema 和簡化 SSE **不相容完整 Codex app-server**：實際所需的歷史、工具呼叫、推理項目、回傳事件與錯誤協議尚未實測。未驗證模型帳號權限、API key、授權、價格、配額或網路。正式串接至少需要獨立服務保管模型憑證及只接受可信主控簽發的短期事件憑證、持久撤銷與用量、限定的模型請求 schema／工具能力、傳輸與身分驗證、可信計費和安全的隔離出口；亦需驗證 Codex 真實對話、超時、續期、事件競態及斷線結果。這些條件完成前，不能說同仁案件已能由此自動處理。

官方資料：[Codex app-server 與 Responses provider](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)；[ChatGPT plan Responses 預覽限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)；[Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。前兩項描述特定 ChatGPT OAuth 路徑，不代表目前帳號已獲授權；也不代表目前假 SSE 相容官方協議。API 實際成本取決於選定模型、使用量及帳號條件，本次未測實際費用。

## 正式接線前待完成清單

以下是可供工程實作與驗收的清單；目前每項均未完成或未驗證。本機 Codex／ChatGPT 已登入，不能據此認定 OpenAI Platform 專案已有 Agents API 權限、模型可用額度或適用的 API 憑證。Agents API 與本文件的假 Responses gateway 是不同接線方案，不能將假 gateway 當成已支援 Agents API。

1. **確認帳號、權限及費用**：確認要使用的 OpenAI Platform 組織與專案、Agents API 和目標模型可用性、實際額度與計費設定。依[官方快速入門](https://developers.openai.com/api/docs/guides/agents-api/quickstart)，應用端 key 需具 `api.agents.read`、`api.agents.write` 與 `api.responses.write`；若另需管理 vault 再依用途設定權限。本次沒有檢查或建立任何 key，費率、帳號可用性及實際費用均未證實。模型、工具及託管沙箱可能各依其規則計費，見[官方 Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)。
2. **隔離兩種憑證**：若選自架環境，依[官方自架環境文件](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted)，應用 key 只放可信服務；另建立受限 environment key，與 session 的組織、專案及使用者或服務帳戶一致，其他權限設為 None，並依官方方式供 executor 連線。執行環境內的程式仍可讀取 environment key；官方文件並未證明它是每案短期 token，不能假定如此。憑證使用安全儲存、輪替及撤銷，不寫入程式、映像或紀錄。GitHub／Render 等第三方憑證仍需留在可信代理，不能放進 sandbox，參考[官方 sandbox security](https://developers.openai.com/api/docs/guides/agents-api/environments/security)。
3. **實作與驗證真正協議**：選定 Agents API 或 Responses provider 後，按其正式 schema 實作 session 建立、輸入、工具呼叫與結果、串流事件、錯誤、續接及結束判斷；使用虛構案件驗證完整對話、工具多輪、斷線、逾時及恢復。現在的假 SSE、純文字 payload 和固定回覆均不能證明真正 Codex 或模型可用。
4. **完成可信服務及傳輸**：將模型呼叫與動作 broker 部署到 sandbox 無法讀其憑證、不能更改程式的可信服務；限定可呼叫的操作及目的地，保護 TLS 與服務端身分，驗證 sandbox 網路出口、程序及既有桌面／MCP 等其他工具不能繞過。不能讓未受限程式直接使用正式 GitHub、Render 或應用 key。
5. **持久化租約、撤銷和副作用證據**：以持久儲存與原案件的事件、版本及代次綁定執行資格、撤銷、用量及已送請求；處理跨服務同步失敗、重啟、併發、延遲回覆和重試。證據不足時維持結果不明與同資源防重；唯讀觀察到效果不等於已證明原請求結束。必須另外驗證執行程序及外部動作邊界，才能安全判斷能否接續。
6. **限制使用量並驗收**：設定每案／每帳戶請求、並行數、輸入輸出、時間及費用上限，確認系統重啟或重新簽發無法重設上限；測試上限、流量攻擊、撤銷中請求及供應商故障。以測試環境確認實際用量及帳單，不依假資料推算費用。

## Responses 串流與工具的受限假轉接

`xiaoye-responses-proxy-fixture.cjs` 增加只連 loopback 的測試轉接器，提供固定的假模型、指定純文字／function call／function output／推理項目子集，以及一個固定的假工具定義。假上游收到的目標值固定為 `https://api.openai.com/v1/responses`，但**沒有實際網路客戶端，也不會連往該網址**；測試以虛構上游逐塊返回 SSE，檢查工具呼叫輸出可在下一次假請求附上、字節不被修改。請求只允許 `POST /v1/responses`，不轉交來路 header、任意 URL 或不允許的工具；還有假事件 token、次數、一次一個請求、輸入字節、輸出 token、輸出字節及總時間限制。異常／撤銷中斷串流且不自動重試，不自行補造完成事件；未收到結束事件的截斷串流視為結果不明，明確失敗事件原樣交還，由呼叫端判斷失敗。

```sh
node --test tools/test-xiaoye-responses-proxy-fixture.cjs tools/test-xiaoye-model-gateway-fixture.cjs tools/test-xiaoye-controlled-broker.cjs tools/test-xiaoye-controlled-action-journal.cjs
```

此處借用 [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling) 的 function call／output 形狀及 [Responses streaming events](https://developers.openai.com/api/reference/resources/responses/streaming-events) 的事件名稱來製作假資料，並非真實 Codex 相容測試。尚未使用真正 Codex app-server 產生協議 trace，假 schema 只接受很小子集；例如更多工具、歷史、圖片、錯誤、推理內容或模型協議都可能被拒絕。沒有證據證明此程式可直接供完整 Codex 使用。

以明確 dbPath 執行的本地測試可保存 token 雜湊與請求數；未指定時仍只在記憶體。它亦無 TLS、真實 upstream、真正 key 的安全保管、完整費用計量、實際身份或隔離。輸入字節上限不能精算 token 用量或費用；串流逾時送出中止信號也不保證上游已停止或不計費。未證實任何模型可用、API 授權或實際費率。真實轉接器必須另行實作只連固定 OpenAI endpoint、不跟隨任意重導、受控外部密鑰、可靠撤銷與用量，以及用真正 Codex 和供應商進行端到端測試；目前沒有這些功能，也不能推送或啟用正式模型連線。

## 本機 Codex 與假上游的限定驗證

`xiaoye-codex-proxy-fixture.cjs` 根據本機 Codex 的虛構 trace 接受限定欄位與固定版本的七個工具定義，關閉 web search 與多代理；工具定義摘要若變動即拒絕。輸出工具事件在名稱、call ID、參數格式及終態對帳通過前緩衝，拒絕額外欄位、未完成或矛盾內容；明確 503 在開始串流前可有限重試相同推論，部分串流或結果不明不自動重送。普通文字串流可能已交付呼叫端，遇錯不可撤回，呼叫端須以終態判斷結果。每個事件及全域上傳數量有假限制，撤權主動中斷等待中的讀取與串流；此中斷不證明真實提供者已停止或不再計費。

在此電腦上以臨時空白 home、虛構 bearer、外層 `network.enabled=false` 測得：透過本機假 gateway 及本機假上游，Codex 完成一次虛構 `exec_command` 與結果回傳；假 503 後純推論重試成功；手動中斷為 interrupted；工具 call 後截斷時為 failed，虛構標記檔未建立。僅證明該版本與這四個虛構情境，並非完整協議或真 API 相容。測試用外層 Windows 權限仍可讀 root、loopback 可用，不能證明所有主機憑證、桌面或網路均已隔離。此假 proxy 插入 `max_output_tokens` 作上限；官方文件所述 ChatGPT OAuth 預覽路徑不接受此欄位，因此不能宣稱可用於該路徑。

工具 schema 僅限制資料形狀，不限制 `exec_command` 可執行的命令或任何副作用，模型工具輸出也不等於可信動作證據。正式需求仍是獨立執行隔離、可信事件與工具授權、受控外部操作 broker、持久資料與費用上限。由於尚未接真 API、密鑰保管、真實憑證／工具或正式案件，此原型不可啟用。

本機 Windows 可由呼叫者明確提供 Codex 程式位置後執行 `tools/test-xiaoye-codex-live-fixture.cjs`；其他環境會跳過，不應將跳過當成通過。CI 另用單一虛構工具政策，透過真實 fixture proxy 的 HTTP handler 與假上游測試 503 重試、工具續回、未知結果不重送及撤權中止，不依賴本機 Codex 或真 API。另可執行 `node --test tools/test-xiaoye-codex-proxy-fixture.cjs tools/test-xiaoye-codex-proxy-handle.cjs tools/test-xiaoye-responses-proxy-fixture.cjs tools/test-xiaoye-model-gateway-fixture.cjs tools/test-xiaoye-controlled-broker.cjs tools/test-xiaoye-controlled-action-journal.cjs`。所有上游均為假資料。


## 單庫持久狀態的隔離補強

假 gateway、Responses 及 Codex 模擬入口現可共用指定的 SQLite。令牌
只保存雜湊，記錄原事件、來源版本、代次、lease ID、期限與用量；
明確注入的假 lease verifier 必須同意且期限不短於令牌。它只是本機
假函式，不是可信的正式 lease 服務。撤銷先於簽發時也會留下永久
墓碑；相同事件無法重新簽發，即使新代次也拒絕。這是保守限制，
尚未完成同一案件跨新代次安全接續。

同一 SQLite 內，簽發、撤銷、請求佔額與防重以交易處理。Codex
子請求以原事件、request ID 及內容雜湊辨識，允許同一 request ID
在下一工具回合配合不同內容使用。只對明確的假 pre-stream 503
允許同一子請求最多兩次嘗試，每次計入用量；回覆不明、逾時或
重啟後仍在執行的狀態不重送，也會保守阻擋其他請求。每次重試
有獨立 attempt ID，遲到的舊回覆不能解除新嘗試的鎖。這可能要求
日後以可信證據處理，不能稱所有案件都能自動恢復。

本地測試包含共享資料庫的多執行緒競爭與重啟，並以虛構上游進行
本機 Codex 四情境驗證；預設 `:memory:` 的測試實例仍不會跨重啟。
這些保證只限所有實例共用同一 SQLite：多節點使用不同資料庫、跨
服務 lease／動作 broker、節點故障、資料回復、真實模型授權或成本
都沒有一致性保證。撤銷後已發往上游的請求可能仍執行、計費；
假 gateway 在上傳及串流期間以可配置的短間隔重新核對同庫撤銷與假 lease，確認無效或不可用時請求中止本程序串流；這是輪詢而非即時通知，事件迴圈或資料庫延遲會使觀察時間超過設定間隔。中止不證明遠端已停止。沒有正式模型
憑證、TLS、可驗證服務身分、可信租約查核、總費用上限或正式接線。
持久 schema 變更尚無自動遷移；不相容資料庫會拒絕並保留原資料。

```sh
node --test tools/test-xiaoye-model-gateway-store-fixture.cjs tools/test-xiaoye-model-gateway-fixture.cjs tools/test-xiaoye-responses-proxy-fixture.cjs tools/test-xiaoye-codex-proxy-fixture.cjs
```


假 lease verifier 使用明確狀態：`revoked`／`stale` 且事件、來源、
代次及 lease ID 完全相符時寫永久撤銷墓碑；`unavailable`、錯置
回覆及查詢錯誤只拒絕當次使用，之後可再次核對。假驗證器和
短間隔輪詢不構成可信服務，也無法跨獨立 SQLite 保證同步。

令牌一旦經本機時鐘觀察到到期，會持久標記撤銷，時鐘回撥或
重啟不會使它復活；尚未觀察到期前的時鐘回撥，仍需要可信時間
來源和跨節點一致時鐘，本模擬尚無法保證。

「已確定尚未送出」另以 reserved 狀態和只在本次執行記憶體中的
隨機 attempt secret 證明；只有同一仍存活的 handler 在呼叫上游之前
可將其標記為 not-sent，並退還未使用的模型請求額度。相同請求
最多三次 not-sent，重試須等持久化退避時間且重新核權；上游交送
前先持久標為 unknown。程序崩潰後的 reserved、已交送或回覆不明
均不可按 not-sent 解鎖。若未接排程或客戶端不重試，這些狀態仍
不會自行繼續。這是同程序假介面，secret 雜湊不構成作業系統隔離。
