# UOF 啟用頁外部瀏覽器

使用者要求啟用頁從手機／裝置的外部瀏覽器開啟，方便切回LINE私訊送配對文字。
依LINE官方公開URL參數，固定按鈕及altText連結改為
`https://uof-line.ghotel.tw/Line/Setup?openExternalBrowser=1`。
提示同步說明回瀏覽器確認本人名稱，無LINE ID／工號／token。

原首次綁定入口、已綁定者傳輸與本人登入配對全部保留，僅AM閘道發布。
health新增browserMode=external，正式commit／marker及手機實機驗收分開記錄。
