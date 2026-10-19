# LINE 群組任務完成回報

完成整項任務後，由實際完成者按「回報原 LINE 群組」，預覽原群組、原交辦人、完成結果及原任務卡，再明確確認。沿用原 OA 和 task-service 加密設定；不增加秘密、排程或任務副本。原群組與交辦人只從已發出任務的來源收據讀取。

# 驗證

執行 node tools/test-line-completion-report.mjs 及原 leaf-tasks / task-edit / group / Calendar 回歸；DailyLog 完整 Worker+D1 與六寬度瀏覽器驗證取消零寫、明確確認、原來源、真正 mention、長文 Unicode、原連結、轉派後原交辦人、權限撤銷、版本衝突、傳送租期、相同 LINE key 重試與已接受 409。匿名入口拒絕；正式僅回讀 health 與空白驗證，不送真訊息。

Current state: isolated validation; formal deployment pending. No real messages or business writes.
