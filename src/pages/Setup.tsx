import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle, ExternalLink, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TAMPERMONKEY_SCRIPT = `// ==UserScript==
// @name         GSuite Time Tracker Heartbeat
// @namespace    timetracker
// @version      1.0
// @description  Sends activity heartbeats to your Time Tracker backend
// @match        https://docs.google.com/*
// @match        https://meet.google.com/*
// @match        https://chatgpt.com/*
// @match        https://gemini.google.com/*
// @match        https://docs.google.com/spreadsheets/*
// @match        https://docs.google.com/presentation/*
// @match        https://www.figma.com/file/*
// @match        https://github.com/*
// @match        https://mail.google.com/*
// @grant        GM_xmlhttpRequest
// @connect      *.supabase.co
// @noframes
// ==/UserScript==

(function() {
  'use strict';

  // Skip if running inside an iframe
  if (window.top !== window.self) return;

  // Skip known Google Docs system/background URLs
  const junkPaths = ['/offline/', '/_/', '/robots.txt'];
  if (junkPaths.some(p => window.location.pathname.startsWith(p))) {
    console.log('[TimeTracker] Skipped system URL:', window.location.pathname);
    return;
  }

  // ⚠️ REPLACE THESE WITH YOUR VALUES
  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/log-heartbeat';

  let lastActivity = Date.now();
  let lastSent = 0;
  let selectorCache = null;
  let lastActivityLog = 0;

  const domain = window.location.hostname;

  async function fetchSelector() {
    if (selectorCache) return selectorCache;
    try {
      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: FUNCTION_URL + '?domain=' + domain,
          headers: { 'apikey': SUPABASE_ANON_KEY },
          onload: (r) => resolve(JSON.parse(r.responseText)),
          onerror: reject,
        });
      });
      selectorCache = resp;
      return selectorCache;
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
    if (now - lastSent < 60000) {
      console.log('[TimeTracker] Heartbeat skipped: too soon (' + Math.round((now - lastSent)/1000) + 's ago)');
      return;
    }
    if (now - lastActivity > 120000) {
      console.log('[TimeTracker] Heartbeat skipped: inactivity (' + Math.round((now - lastActivity)/1000) + 's)');
      return;
    }

    const selector = await fetchSelector();
    const doc_identifier = getDocId(selector);
    const title = getTitle(selector);

    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: FUNCTION_URL,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        data: JSON.stringify({ doc_identifier, title, domain, url: window.location.href }),
      });
      lastSent = now;
      console.log('[TimeTracker] Heartbeat sent for', title, '(' + domain + ')');
    } catch(e) { console.error('[TimeTracker] Heartbeat failed', e); }
  }

  function markActive() {
    lastActivity = Date.now();
    const now = Date.now();
    if (now - lastActivityLog > 10000) {
      console.log('[TimeTracker] Activity detected');
      lastActivityLog = now;
    }
  }

  ['mousemove','keydown','click'].forEach(evt => {
    document.addEventListener(evt, markActive, { passive: true });
  });
  document.addEventListener('scroll', markActive, { capture: true, passive: true });
  ['touchstart','touchmove'].forEach(evt => {
    document.addEventListener(evt, markActive, { passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) markActive();
  });

  setInterval(sendHeartbeat, 30000); // Check every 30s
  console.log('[TimeTracker] Heartbeat script loaded for', domain);
})();`;

export default function Setup() {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const { data: selectors = [] } = useQuery({
    queryKey: ["selectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("selectors").select("*").order("domain");
      if (error) throw error;
      return data;
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const readyScript = TAMPERMONKEY_SCRIPT.replace("YOUR_SUPABASE_URL", supabaseUrl || "").replace(
    "YOUR_ANON_KEY",
    anonKey || "",
  );

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Setup Guide</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Install Tampermonkey</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Install the Tampermonkey browser extension for{" "}
              <a
                href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
                target="_blank"
                rel="noopener"
                className="text-primary underline inline-flex items-center gap-1"
              >
                Chrome <ExternalLink className="h-3 w-3" />
              </a>{" "}
              or{" "}
              <a
                href="https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/"
                target="_blank"
                rel="noopener"
                className="text-primary underline inline-flex items-center gap-1"
              >
                Firefox <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Connection Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">API Endpoint</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-2 rounded break-all">
                  {supabaseUrl}/functions/v1/log-heartbeat
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(`${supabaseUrl}/functions/v1/log-heartbeat`, "Endpoint")}
                >
                  {copied === "Endpoint" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Anon Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted p-2 rounded break-all">{anonKey?.slice(0, 20)}…</code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => copyToClipboard(anonKey || "", "Key")}
                >
                  {copied === "Key" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>3. Install the Script</CardTitle>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(readyScript, "Script")}>
              {copied === "Script" ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 mr-1 text-accent" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy Script
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-64">{readyScript}</pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>4. Test Connection</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                try {
                  const res = await fetch(`${supabaseUrl}/functions/v1/log-heartbeat`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: anonKey || "",
                    },
                    body: JSON.stringify({
                      doc_identifier: "test-connection",
                      title: "Test Heartbeat",
                      domain: "setup-page.test",
                    }),
                  });
                  if (!res.ok) throw new Error(`Status ${res.status}`);
                  toast.success("Connection successful! Test heartbeat logged.");
                } catch (e: any) {
                  toast.error(`Connection failed: ${e.message}`);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Testing…</>
              ) : (
                <><Zap className="h-3.5 w-3.5 mr-1" /> Test Connection</>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Send a test heartbeat to verify the backend is reachable and working correctly.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Selectors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectors.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <Badge variant="outline">{s.domain}</Badge>
                  <code className="text-xs text-muted-foreground">{s.title_selector}</code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
