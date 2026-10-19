# 安裝

1. 重新核對 AM main 與原 UOF／DailyLog 當前完整程式、設定、排程及資產。私人保存原始完整包與既有綁定／權限摘要，不從 dirty checkout build 或回灌資料。
2. 依現有會議入口讀取公開 LIFF channel 設定，核對同 OA 的既有本人身分來源。UOF 沿原同一 DO／加密 key，新增私有 SharedAccessService.commonLine；DailyLog 沿原雙向 service bindings 新增 SharedManagementService.commonLineIdentity。原服務範圍不擴大。
3. 使用 tools/build-common-line-workers.cjs 對下載的完整包做精準修改：只改主模組與原會議管理模組、新增共用身分模組；其他模組 bytes、Assets、秘密、服務及排程保持。私有設定模組只包含既有公開 channel ID，不建立新 LINE channel。
4. 完整身分、舊入口、Worker／D1／DO／RPC 與手機驗證通過後先發布 UOF 及 DailyLog，等待正在執行的 DO 新標記及服務 health，而非只看上傳成功。任一基底改變須重新下載、重套及重測。
5. AM 經完整 CI 合併後發布受測 main，兩個正式站都回讀新 commit 及 commonLineIdentity 契約，再切原 OA 共用三格 URI 至 /meetings/review/connect?app=dailylog|meetings|uof；保留原422高度、圖與其他定義。保存私人原 menu 回退；不批次改個人 menu 或發訊息。
6. 匿名邊界、正式執行標記、全部 module／配置、原綁定／權限保持與原有功能讀取相符後，才標 Deployed。真人首次公司登入與 LINE 手機驗收另列，不能代真人綁定或以真人業務測寫。
