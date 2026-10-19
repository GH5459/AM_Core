# 三入口共用首次公司身分

AM-IMP-2026.1019.50／ADR-34。使用者明確要求實作並正式部署，且保留所有已確認綁定及各功能權限，不要求同仁重綁。

已Installed／Deployed：AM在原會議LINE Login端點下提供共用確認頁；原三格分別保留目的地。原UOF加密DO讀取舊UOF／native工作身分，查當前原gateway binding並核正反向唯一；身分查核不以UOF簽核開通為條件。新身分須驗原channel的LINE token及當次公司帳密，顯示姓名／遮蔽帳號後明確確認。固定共用紀錄與相容native投影沿原儲存，舊UOF／工作入口也經同一衝突協調。後台個人會議支援原native身分，寫入前再查；會議開關與各功能權限未自動增加。

25項本項與原登入測試、42群組／Calendar回歸、完整DailyLog Worker／實際D1、UOF實際DO加密儲存與兩站named RPC往返、三入口六寬度Chrome、銀行／附件／pause通過。PR367完整CI3m56s成功，受測e9b4f29與合併45b66e4來源樹相同；較新PR369完整CI3m19s後正式e209c29已包含本項，Render Live及兩原origin契約／6入口HTML與受測來源、匿名401／外站403／方法405均核對，無重發舊AM。

UOF d993703d-3d69-4ea1-ac94-33e44d7837bc完整10模組、DailyLog555567d6-002f-47ef-b731-fc31067dc172完整47模組已100%發布。真正基底UOF3ca34195／7與DailyLog eb3e73fb／46，初次248c93af基底保留歷史不發布；UOF原其餘5及DailyLog其餘45模組bytes、Assets／秘密／配置／排程保持。當下0 active approval jobs後切同一受測DO版本，公開policy及原DailyLog→具名UOF共同契約health200回讀。後續5043e3a1完整48及a0340c81完整51模組保留共用模組與接線，沒有回退；並行新版管理上傳也保留共用程式。

原OA default三格已切換並完整定義／原PNG逐byte回讀，保持2500×422高度、區塊及原目的地。最後檢查發現別名origin不等於原LINE Login登記origin，候選已改沿原AMCORE_MEETINGS_LIFF_ENDPOINT_URL後重新validate；原登記origin匿名401通過才切換。不改原登入設定、不批次改個人選單或發訊息。先前Work停用工具的阻礙已解除，可透過Chrome正常讀Render。

原10UOF綁定／23開通／3管理、20native紀錄與211工作version／revision全部保持。1筆原跨來源不同LINE對應兩份都保留並交查核，不代選／合併／重綁。私人完整包、回退與逐筆摘要只留原目標，Git不存實際帳號／LINE ID／token／menu ID；真人首次登入／手機自然驗收獨立，未代真人認領或LINE／任務／簽核測寫。整合中心來源E71，發布中歷史另存，不將真人流程冒稱已代驗收。
