# 安裝

從最新main套用會議audio-stream、hub及workspace與限定音檔請求的身分查詢重用。先以私有設定執行node tools/migrate-meeting-audio-stream.mjs <envFile> <adminFile>，只新增收據表並核對原runtime角色權限。再經PR完整CI合併main，部署原AM服務精確提交。無DailyLog／UOF或獨立專案部署。既有未完成上傳自動保留legacy流程，新上傳走v2。瀏覽器重新載入才能使用新介面，勿清除裝置暫存。
