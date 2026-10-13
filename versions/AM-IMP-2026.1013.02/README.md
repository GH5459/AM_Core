# UOF 啟用頁使用外部瀏覽器

新LINE啟用頁按鈕與altText網址加入`openExternalBrowser=1`，提示同仁在外部瀏覽器
登入、切回原LINE私訊貼啟用文字，再回瀏覽器最後確認本人LINE名稱。
依[LINE官方文件](https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/#opening-url-in-external-browser)。

只安裝Root AM Platform；既有bound查詢、登入及配對／權限／簽核保持。
Ready不代表手機實測，執行中health新增`uofSetupEntry.browserMode=external`便於回讀。
