// Options page controller. Persists the Firecrawl key + Almond Logic host to
// chrome.storage.local.
//
// SECURITY NOTE (Hard Rule 1): the key is written to storage and read back into
// the password field, but it is NEVER logged. Nothing here console.*'s a value.
//
// `@types/chrome` is the real type source (declared in package.json); in this
// install-less worktree, chrome.* is typed by src/chrome-shim.d.ts.

import { FIRECRAWL_KEY, ALMOND_HOST, normalizeHost } from "../settings";

const hostInput = document.getElementById("host") as HTMLInputElement;
const keyInput = document.getElementById("key") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const saved = document.getElementById("saved") as HTMLSpanElement;

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get([FIRECRAWL_KEY, ALMOND_HOST]);
  hostInput.value = stored[ALMOND_HOST] ?? "";
  keyInput.value = stored[FIRECRAWL_KEY] ?? "";
}

saveButton.addEventListener("click", async () => {
  const host = normalizeHost(hostInput.value);
  hostInput.value = host;
  await chrome.storage.local.set({
    [ALMOND_HOST]: host,
    [FIRECRAWL_KEY]: keyInput.value.trim(),
  });
  saved.textContent = "Saved.";
  setTimeout(() => {
    saved.textContent = "";
  }, 1500);
});

void load();
