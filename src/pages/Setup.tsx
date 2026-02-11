// Inside src/pages/Setup.tsx, update the TAMPERMONKEY_SCRIPT constant
const TAMPERMONKEY_SCRIPT = `// ==UserScript==
// @name         GSuite Time Tracker Heartbeat
// @namespace    timetracker
// @version      1.1
// @description  Sends activity heartbeats to your Time Tracker backend
// @match        https://docs.google.com/*
// @match        https://meet.google.com/*
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      *.supabase.co
// ==/UserScript==

(function() {
  'use strict';

  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/log-heartbeat';

  let lastActivity = Date.now();
  let lastSent = 0;
  let selectorCache = null;
  const domain = window.location.hostname;

  async function fetchSelector() {
    if (selectorCache) return selectorCache;
    try {
      return await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: FUNCTION_URL + '?domain=' + domain,
          headers: { 'apikey': SUPABASE_ANON_KEY },
          onload: (r) => {
             const data = JSON.parse(r.responseText);
             selectorCache = data;
             resolve(data);
          },
          onerror: reject,
        });
      });
    } catch(e) { console.error('[TimeTracker] Selector fetch failed', e); return null; }
  }

  function getDocId(selector) {
    if (!selector?.doc_id_pattern) return window.location.pathname;
    const match = window.location.href.match(new RegExp(selector.doc_id_pattern));
    return match ? match[1] : window.location.pathname;
  }

  function getTitle(selector) {
    if (!selector?.title_selector) return document.title;
    const el = document.querySelector(selector.title_selector);
    return el?.textContent?.trim() || document.title;
  }

  async function sendHeartbeat() {
    const now = Date.now();
    if (now - lastSent < 60000) return; // Limit to 1/min
    if (now - lastActivity > 120000) {
      console.log('[TimeTracker] Idle - skipping heartbeat');
      return;
    }

    const selector = await fetchSelector();
    const doc_identifier = getDocId(selector);
    const title = getTitle(selector);

    GM_xmlhttpRequest({
      method: 'POST',
      url: FUNCTION_URL,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      data: JSON.stringify({ doc_identifier, title, domain }),
      onload: (r) => {
        if (r.status >= 200 && r.status < 300) {
          console.log('[TimeTracker] Heartbeat logged for:', title);
          lastSent = now;
        }
      },
      onerror: (e) => console.error('[TimeTracker] Post failed', e)
    });
  }

  ['mousemove','keydown','click','scroll'].forEach(evt => {
    document.addEventListener(evt, () => { lastActivity = Date.now(); }, { passive: true });
  });

  setInterval(sendHeartbeat, 30000); 
  console.log('[TimeTracker] Collector active on', domain);
})();`;
