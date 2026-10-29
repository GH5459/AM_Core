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
