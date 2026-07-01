// Popup UI controller. Sends one "scrape" message to the service worker and
// renders the verdict. Holds NO secrets: the key and cookies never reach the
// popup — only a human-readable verdict comes back (see messages.ts).
//
// `@types/chrome` is the real type source (declared in package.json); in this
// install-less worktree, chrome.* is typed by src/chrome-shim.d.ts.

import {
  SCRAPE_REQUEST,
  type ScrapeRequestMessage,
  type ScrapeResultMessage,
} from "../messages";

const button = document.getElementById("scrape") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLDivElement;
const openOptions = document.getElementById("open-options") as HTMLAnchorElement;

function setStatus(text: string, kind: "" | "ok" | "wall" = ""): void {
  status.textContent = text;
  status.className = kind;
}

button.addEventListener("click", async () => {
  button.disabled = true;
  setStatus("checking…");
  try {
    const message: ScrapeRequestMessage = { type: SCRAPE_REQUEST };
    const result = await chrome.runtime.sendMessage<ScrapeResultMessage>(message);
    if (!result || result.ok !== true) {
      setStatus(result?.error ?? "Probe failed.", "wall");
      return;
    }
    if (result.verdict === "data") {
      setStatus("Your data traveled.", "ok");
    } else {
      setStatus("Hit a login wall.", "wall");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Probe failed.";
    setStatus(msg, "wall");
  } finally {
    button.disabled = false;
  }
});

openOptions.addEventListener("click", (e) => {
  e.preventDefault();
  // chrome.runtime.openOptionsPage exists at runtime; the shim keeps the file
  // install-less so we navigate via getURL instead of declaring that API.
  window.open(chrome.runtime.getURL("options/options.html"), "_blank");
});
