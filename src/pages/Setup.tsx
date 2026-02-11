import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Terminal, Globe, Plug } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

  const SUPABASE_URL = '${SUPABASE_URL}';
  const SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';
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
    if (now - lastSent < 60000) return;
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

export default function Setup() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(TAMPERMONKEY_SCRIPT);
    setCopied(true);
    toast({ title: "Copied!", description: "Script copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Setup</h1>

      <div className="space-y-6">
        {/* Step 1 */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">1. Install Tampermonkey</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Install the{" "}
            <a
              href="https://www.tampermonkey.net/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Tampermonkey browser extension
            </a>{" "}
            for Chrome, Firefox, or Edge.
          </CardContent>
        </Card>

        {/* Step 2 */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">2. Connection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              These are pre-filled in the script below — no manual config needed.
            </p>
            <div className="rounded-md bg-muted p-3 font-mono text-xs break-all space-y-1">
              <div>
                <span className="text-muted-foreground">URL:</span>{" "}
                <span className="text-foreground">{SUPABASE_URL}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Key:</span>{" "}
                <span className="text-foreground">{SUPABASE_ANON_KEY?.slice(0, 20)}…</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Terminal className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">3. Install the Script</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Create a new script in Tampermonkey and paste this code:
            </p>
            <div className="relative">
              <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto max-h-64 overflow-y-auto font-mono">
                {TAMPERMONKEY_SCRIPT}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 mr-1" />
                ) : (
                  <Copy className="h-4 w-4 mr-1" />
                )}
                {copied ? "Copied" : "Copy Script"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
