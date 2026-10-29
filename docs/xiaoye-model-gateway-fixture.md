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

測試中的授權和執行邊界只存在同一程序；不等於可防範同程序不受信任程式。狀態只存在記憶體，重啟後失去發放、撤銷、用量及防重資料，**不得用於正式環境**。服務沒有 TLS、對端身分驗證、跨系統 lease 同步、持久帳本、分散式並行保護、限流與總費用保護、真正外部模型後端，亦未驗證多行程／網路／密鑰隔離。已交給後端的請求不一定能撤回；模擬器不是完整副作用清冊。

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
