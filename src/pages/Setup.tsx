import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle, ExternalLink, Zap, Loader2, Key, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const TAMPERMONKEY_SCRIPT = `// ==UserScript==
// @name         GSuite Time Tracker Heartbeat
// @namespace    timetracker
// @version      2.0
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
// @match        https://lucid.app/lucidchart/*
// @match        https://notebooklm.google.com/notebook/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @connect      *.supabase.co
// @noframes
// ==/UserScript==

(function() {
  'use strict';

  // Skip if running inside an iframe
  if (window.top !== window.self) return;

  // Skip known system/background URLs
  const junkPaths = ['/offline/', '/_/', '/robots.txt'];
  if (junkPaths.some(p => window.location.pathname.startsWith(p))) {
    console.log('[TimeTracker] Skipped system URL:', window.location.pathname);
    return;
  }

  // ⚠️ REPLACED AUTOMATICALLY — do not edit
  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
  const API_KEY = 'YOUR_API_KEY';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/log-heartbeat';

  let lastActivity = Date.now();
  let lastSent = 0;
  let selectorCache = null;
  let lastActivityLog = 0;

  const domain = window.location.hostname;

  // ── Identity via GM storage (synced from Dashboard) ──
  function getSyncedEmail() {
    return GM_getValue('synced_user_email', null);
  }

  // Listen for identity sync and ping from the Dashboard page
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SYNC_IDENTITY' && event.data.email) {
      GM_setValue('synced_user_email', event.data.email);
      console.log('[TimeTracker] ✅ Identity synced:', event.data.email);
      window.postMessage({ type: 'SYNC_SUCCESS' }, '*');
    }
    if (event.data && event.data.type === 'PING_SCRIPT_REQUEST') {
      window.postMessage({ type: 'PING_SCRIPT_RESPONSE' }, '*');
    }
  });

  // On load, announce presence to the Dashboard
  window.postMessage({ type: 'PING_SCRIPT_RESPONSE' }, '*');

  async function fetchSelector() {
    if (selectorCache) return selectorCache;
    try {
      const resp = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: FUNCTION_URL + '?domain=' + domain,
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'x-api-key': API_KEY,
          },
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

  function buildUrl(selector, docId) {
    if (selector?.url_template) {
      return selector.url_template.replace('{id}', docId);
    }
    return window.location.href;
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

    const email = getSyncedEmail();
    if (!email) {
      console.warn('[TimeTracker] No synced identity. Please open your Dashboard Setup page once to sync your account.');
      GM_notification({
        text: 'Please open your Time Tracker Dashboard once to sync your account.',
        title: 'Time Tracker',
        timeout: 5000,
      });
      return;
    }

    const selector = await fetchSelector();
    const doc_identifier = getDocId(selector);
    const title = getTitle(selector);
    const url = buildUrl(selector, doc_identifier);

    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: FUNCTION_URL,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'x-api-key': API_KEY,
        },
        data: JSON.stringify({ doc_identifier, title, domain, url, email }),
      });
      lastSent = now;
      console.log('[TimeTracker] Heartbeat sent for', title, '(' + domain + ') as', email);
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

  setInterval(sendHeartbeat, 30000);
  console.log('[TimeTracker] Heartbeat script v2.0 loaded for', domain);
  if (getSyncedEmail()) {
    console.log('[TimeTracker] Synced identity:', getSyncedEmail());
  } else {
    console.warn('[TimeTracker] No synced identity yet. Open your Dashboard to sync.');
  }
})();`;

export default function Setup() {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced' | 'error'>('idle');
  const [scriptDetected, setScriptDetected] = useState(false);
  const { user } = useAuth();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("api_key").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: selectors = [] } = useQuery({
    queryKey: ["selectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("selectors").select("*").order("domain");
      if (error) throw error;
      return data;
    },
  });

  // Listen for script responses (sync success + ping)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_SUCCESS') {
        setSyncStatus('synced');
        toast.success("Identity synced successfully with the Tampermonkey script!");
      }
      if (event.data?.type === 'PING_SCRIPT_RESPONSE') {
        setScriptDetected(true);
      }
    };
    window.addEventListener('message', handler);

    // Ping the script to check if it's installed
    window.postMessage({ type: 'PING_SCRIPT_REQUEST' }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  const syncIdentity = () => {
    if (user?.email) {
      window.postMessage({ type: "SYNC_IDENTITY", email: user.email }, "*");
      // If no SYNC_SUCCESS received within 3s, mark error
      const timeout = setTimeout(() => {
        setSyncStatus((prev) => (prev === 'synced' ? prev : 'error'));
      }, 3000);
      // Clear timeout if success arrives
      const successHandler = (event: MessageEvent) => {
        if (event.data?.type === 'SYNC_SUCCESS') {
          clearTimeout(timeout);
          window.removeEventListener('message', successHandler);
        }
      };
      window.addEventListener('message', successHandler);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const readyScript = TAMPERMONKEY_SCRIPT.replace("YOUR_SUPABASE_URL", supabaseUrl || "")
    .replace("YOUR_ANON_KEY", anonKey || "")
    .replace("YOUR_API_KEY", profile?.api_key || "YOUR_API_KEY");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Setup Guide</h1>

      <div className="space-y-6">
        {/* API Key card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Your API Key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This key authenticates your Tampermonkey script. It's already embedded in the script below.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded break-all font-mono">
                {profile?.api_key || "Loading…"}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={!profile?.api_key}
                onClick={() => copyToClipboard(profile?.api_key || "", "API Key")}
              >
                {copied === "API Key" ? (
                  <CheckCircle className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>2. Install the Script</CardTitle>
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

        {/* Sync Identity card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              3. Sync Your Identity
              {scriptDetected && (
                <Badge variant="outline" className="text-xs font-normal border-accent text-accent-foreground">
                  <CheckCircle className="h-3 w-3 mr-1" /> Script Detected
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={!user?.email}
              onClick={syncIdentity}
            >
              {syncStatus === 'synced' ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 mr-1 text-accent" /> Synced
                </>
              ) : syncStatus === 'error' ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-destructive" /> Retry Sync
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync Identity
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {syncStatus === 'error' && (
              <p className="text-sm text-destructive">
                No response from the script. Make sure Tampermonkey is installed and the script is enabled, then try again.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              This broadcasts your email (<code className="text-xs bg-muted px-1 rounded">{user?.email || "…"}</code>) to the Tampermonkey script via <code className="text-xs bg-muted px-1 rounded">GM_setValue</code>. The script confirms receipt automatically.
            </p>
            <p className="text-sm text-muted-foreground">
              Once synced, the script remembers your identity permanently — no site-specific email scraping needed.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>4. Test Connection</CardTitle>
            <Button
              variant="outline"
              size="sm"
              disabled={testing || !profile?.api_key}
              onClick={async () => {
                setTesting(true);
                try {
                  const res = await fetch(`${supabaseUrl}/functions/v1/log-heartbeat`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: anonKey || "",
                      "x-api-key": profile?.api_key || "",
                    },
                    body: JSON.stringify({
                      doc_identifier: "test-connection",
                      title: "Test Heartbeat",
                      domain: "setup-page.test",
                      email: user?.email || "",
                    }),
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `Status ${res.status}`);
                  }
                  toast.success("Connection successful! Test heartbeat logged.");
                } catch (e: any) {
                  toast.error(`Connection failed: ${e.message}`);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Testing…
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 mr-1" /> Test Connection
                </>
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Send a test heartbeat to verify the backend is reachable and your identity matches.
            </p>
          </CardContent>
        </Card>

        {/* Troubleshooting card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Troubleshooting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The tracker uses an <strong>identity handshake</strong> — your email is synced once from this dashboard
              and stored in the script's private memory. Heartbeats are only accepted when this synced email matches
              your account ({user?.email || "your account email"}).
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Common issues:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  You see "No synced identity" in the console — open this Setup page once with Tampermonkey active
                </li>
                <li>
                  You changed your account email — click "Sync Identity" above to update the script
                </li>
                <li>
                  You reinstalled Tampermonkey — script storage was cleared, sync again from here
                </li>
              </ul>
            </div>
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
