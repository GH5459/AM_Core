// Self-contained: also embedded into the existing DailyLog meeting client.
export function meetingRegenerationControls(document){
 if(document.querySelector('#regenerate'))return;
 const controls=document.createElement('div');
 controls.innerHTML='<label class="sharing-option"><input id="confirmSpeakerCount" type="checkbox">我已確認以上實際發言人員，並依首次發言順序排列</label><p class="muted">確認後會把人數送交聲音辨識。未發言的人請勿列入；聲音與姓名仍須在產出後核對。</p><button id="regenerate" type="button" hidden>保留目前結果，重新整理</button><p id="regenerateStatus" role="status" aria-live="polite"></p><button id="checkRegenerate" type="button" class="secondary" hidden>檢查重新整理狀態</button>';
 document.querySelector('#returnReview').before(controls);
 const dialog=document.createElement('dialog');dialog.id='regenerateDialog';dialog.setAttribute('aria-labelledby','regenerateTitle');
 dialog.innerHTML='<h2 id="regenerateTitle">確認人員並重新整理</h2><p id="regenerateSummary" style="white-space:pre-wrap"></p><p>目前的記錄、逐字稿、待辦與人工修改會保留為舊版，可與新結果比較。這次會重新讀取已保存的來源；完成後仍須確認，不會自動發布或派發任務。</p><div class="actions"><button id="confirmRegenerate" type="button">確認人員，開始重新整理</button><button id="cancelRegenerate" type="button" class="secondary">返回修改人員</button></div>';
 // Keep uncertain-request status and its read-only recovery reachable in the
 // modal. Controls behind a modal cannot receive clicks or keyboard focus.
 dialog.append(controls.querySelector('#regenerateStatus'),controls.querySelector('#checkRegenerate'));
 document.querySelector('#setupPanel').append(dialog);
 const panel=document.createElement('details');panel.id='generationCompare';panel.className='edit-section';panel.hidden=true;
 panel.innerHTML='<summary>歷次整理結果與比較</summary><p class="muted">保留的舊版僅供閱讀，開啟比較不會重做或取代內容。</p><button id="loadGenerationVersions" type="button" class="secondary">讀取保留的結果</button><label for="generationVersion">選擇舊版</label><select id="generationVersion"><option value="">請先讀取</option></select><p id="generationCompareStatus" role="status"></p><div class="grid"><section><h3>保留的舊版</h3><p id="oldGenerationMeta"></p><pre id="oldGenerationRecord" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><details><summary>舊版逐字稿與待辦</summary><pre id="oldGenerationDetails" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></section><section><h3>目前結果</h3><pre id="currentGenerationRecord" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><details><summary>目前逐字稿與待辦</summary><pre id="currentGenerationDetails" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details></section></div>';
 document.querySelector('#meetingHeading').after(panel);
}
