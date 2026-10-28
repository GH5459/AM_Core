// Inert HTML data, not executable code. Escape markup without changing JSON.
export function meetingBootHtml(value){return '<template id="dailylogMeetingBoot">'+JSON.stringify(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</template>';}
