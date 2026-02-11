
# Fix: Heartbeat Logging Not Working

## Problem
Two issues are preventing heartbeats from being logged:

1. **The backend function is not deployed** -- it returns a 404 error when called. It needs to be redeployed.
2. **CORS issue in the Tampermonkey script** -- the `fetchSelector()` function uses the standard browser `fetch()` API, which is blocked by CORS in userscripts. It should use `GM_xmlhttpRequest` (which bypasses CORS) consistently for all requests, not just the POST.

## Fix Plan

### Step 1: Redeploy the backend function
- Deploy the `log-heartbeat` function so it's accessible again.

### Step 2: Fix the Tampermonkey script template
Update `src/pages/Setup.tsx` to fix the `fetchSelector` function:
- Replace the `fetch()` call with `GM_xmlhttpRequest` wrapped in a Promise, so both GET (selector fetch) and POST (heartbeat send) use the same CORS-bypassing method.

### Step 3: Verify deployment
- Call the function endpoint to confirm it responds correctly.

---

**After these changes:** You will need to re-copy the updated script from the Setup page and paste it into Tampermonkey again (replacing the old one), then reload the Gemini page and interact with it for ~30 seconds. A heartbeat should then appear in the dashboard.

## Technical Details

The updated `fetchSelector` function in the script template will change from:

```javascript
// OLD (broken due to CORS)
const resp = await fetch(FUNCTION_URL + '?domain=' + domain, {
  headers: { 'apikey': SUPABASE_ANON_KEY }
});
selectorCache = await resp.json();
```

To:

```javascript
// NEW (uses GM_xmlhttpRequest to bypass CORS)
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
```
