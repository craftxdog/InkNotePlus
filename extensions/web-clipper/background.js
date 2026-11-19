import { clipTab } from './clipper.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'page',
    title: 'Guardar página en InkNote',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'selection',
    title: 'Guardar selección en InkNote',
    contexts: ['selection'],
  });
});

async function showResult(tabId, ok) {
  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: ok ? '#2e7d32' : '#c62828',
  });
  await chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 4000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  try {
    await clipTab(
      tab.id,
      info.menuItemId === 'selection' ? 'selection' : 'page',
    );
    await showResult(tab.id, true);
  } catch (error) {
    await chrome.action.setTitle({ tabId: tab.id, title: error.message });
    await showResult(tab.id, false);
  }
});

// The automated tests call this from the service worker.
globalThis.inknoteClip = clipTab;
