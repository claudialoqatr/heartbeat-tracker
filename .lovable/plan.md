

# Fix: Tampermonkey Script Not Detecting Activity

## Problem

The script is installed and the backend works, but **zero requests are reaching the server**. There are two issues in the script template:

1. **Scroll events don't bubble** -- Google Docs and Gemini scroll inside nested containers (iframes, divs with `overflow: scroll`). The current `document.addEventListener('scroll', ...)` never fires because those events don't bubble up to the document level.

2. **No debug logging** -- When a heartbeat is skipped (due to inactivity timeout or rate limiting), nothing is logged to the console, making it impossible to tell if the script is even running.

3. **`lastActivity` starts at 0** -- Even if `mousemove` fires, the very first check at 30s sees `now - 0 > 120000` is false (good), but if the user loaded the page and waited, the inactivity gap could block it. More importantly, if scroll is the *only* interaction, `lastActivity` stays at 0 forever, and the inactivity check blocks all heartbeats.

## Changes

### Update the script template in `src/pages/Setup.tsx`

The `TAMPERMONKEY_SCRIPT` constant will be updated with:

**Activity detection fixes:**
- Add `{ capture: true }` to `scroll` listener so it catches events from nested/child containers
- Add `visibilitychange` listener -- if the tab is visible and focused, that counts as activity
- Add `touchstart` and `touchmove` for trackpad/mobile users
- Initialize `lastActivity = Date.now()` so the script doesn't start in an "inactive" state

**Debug logging:**
- Log when heartbeat is skipped due to rate limit ("too soon")
- Log when heartbeat is skipped due to inactivity timeout
- Log when heartbeat is successfully sent
- Log when activity is detected (throttled to avoid spam)

**No other files change.** The backend function and database are confirmed working.

## After the fix

You will need to:
1. Go to the Setup page and click "Copy Script" to get the updated script
2. Open Tampermonkey and **replace** the existing script with the new one
3. Reload Google Docs or Gemini
4. Open the browser console and look for `[TimeTracker]` messages to confirm activity is detected
5. After 30 seconds of interaction, a heartbeat should fire and appear in the dashboard
