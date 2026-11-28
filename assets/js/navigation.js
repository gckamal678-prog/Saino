/* Saino — single owner for the five permanent primary navigation items. */
(function (global) {
  "use strict";
  if (global.SainoNavigation) return;

  const APP = "#saino-app";
  const NAV = ".saino-tabs";
  const app = () => document.querySelector(APP);
  const nav = () => app()?.querySelector(NAV) || null;
  const english = () => global.KSKLanguage?.getLanguage?.() === "en";
  const tr = (en, ne) => english() ? en : ne;

  const ITEMS = [
    { id: "chats", label: () => tr("Chat", "च्याट"), icon: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.2A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 10h8M8 14h5"/>' },
    { id: "friends", label: () => tr("Friend", "साथी"), icon: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20v-1.3a6.2 6.2 0 0 1 12.4 0V20M16 5.2a3.2 3.2 0 0 1 0 6.2M17 14a5.2 5.2 0 0 1 4.2 5.1V20"/>' },
    { id: "feed", label: () => tr("Feed", "फिड"), icon: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 7h10M7 11h10M7 15h6"/>' },
    { id: "story", label: () => tr("Story", "स्टोरी"), icon: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>' },
    { id: "profile", label: () => tr("Profile", "प्रोफाइल"), icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' }
  ];

  function ensureNavigation() {
    const host = app();
    if (!host) return null;
    let element = nav();
    if (!element) {
      element = document.createElement("nav");
      element.className = "saino-tabs";
      const sidebar = host.querySelector(".saino-sidebar");
      const chatList = sidebar?.querySelector(".saino-chat-list");
      if (sidebar && chatList) sidebar.insertBefore(element, chatList);
      else if (sidebar) sidebar.appendChild(element);
      else host.appendChild(element);
    }
    if (element.parentElement !== host) host.appendChild(element);
    element.setAttribute("aria-label", tr("Main navigation", "मुख्य नेभिगेसन"));
    element.classList.add("saino-navigation-fixed");

    ITEMS.forEach(item => {
      let button = element.querySelector(`[data-saino-nav="${item.id}"]`);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "saino-tab saino-nav-item";
        button.dataset.sainoNav = item.id;
        button.innerHTML = '<span class="saino-nav-icon" aria-hidden="true"></span><span class="saino-nav-label"></span>';
        element.appendChild(button);
      }
      const icon = button.querySelector(".saino-nav-icon");
      const label = button.querySelector(".saino-nav-label");
      if (icon && icon.dataset.iconName !== item.id) {
        icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">${item.icon}</svg>`;
        icon.dataset.iconName = item.id;
      }
      if (label) label.textContent = item.label();
      button.setAttribute("aria-label", item.label());
      button.title = item.label();
    });

    // Remove legacy navigation buttons created by feature modules.
    element.querySelectorAll(".saino-tab:not([data-saino-nav])").forEach(node => node.remove());
    return element;
  }

  function active(id) {
    const element = nav();
    if (!element) return;
    element.querySelectorAll("[data-saino-nav]").forEach(button => {
      const selected = button.dataset.sainoNav === id;
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function current() {
    const host = app();
    if (!host) return "chats";
    const profileOverlay = document.getElementById("saino-profile-overlay");
    if (profileOverlay && !profileOverlay.hidden) return "profile";
    if (host.querySelector(".saino-story-page")) return "story";
    if (host.querySelector(".saino-friends-page")) return "friends";
    if (host.classList.contains("feed-open")) return "feed";
    return "chats";
  }

  function go(id) {
    const host = app();
    if (!host) return;
    if (id === "chats") {
      global.SainoFriends?.close?.();
      global.SainoFeedUI?.close?.();
      global.SainoStoryUI?.close?.();
      global.SainoApp?.render?.();
      active("chats");
      return;
    }
    if (id === "friends") {
      global.SainoStoryUI?.close?.();
      global.SainoFeedUI?.close?.();
      global.SainoFriends?.open?.();
      active("friends");
      return;
    }
    if (id === "feed") {
      global.SainoStoryUI?.close?.();
      global.SainoFriends?.close?.();
      global.SainoFeedUI?.open?.();
      active("feed");
      return;
    }
    if (id === "story") {
      global.SainoFriends?.close?.();
      global.SainoFeedUI?.close?.();
      global.SainoStoryUI?.open?.();
      active("story");
      return;
    }
    if (id === "profile") {
      global.SainoProfileUI?.open?.();
      active("profile");
    }
  }

  function click(event) {
    const button = event.target.closest("[data-saino-nav]");
    if (!button || !nav()?.contains(button)) return;
    event.preventDefault();
    go(button.dataset.sainoNav);
  }

  function updateAvatar(profile = {}) {
    const icon = nav()?.querySelector('[data-saino-nav="profile"] .saino-nav-icon');
    if (!icon) return;
    const value = profile.avatar || profile.avatar_url || profile.photoURL || profile.photo_url || "";
    let url = "";
    try { const parsed = new URL(String(value), global.location.href); if (parsed.protocol === "https:") url = parsed.href; } catch (_) {}
    let image = icon.querySelector("img");
    if (!url) {
      if (image) image.remove();
      if (!icon.querySelector("svg")) icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ITEMS[4].icon}</svg>`;
      return;
    }
    if (!image) { icon.replaceChildren(); image = document.createElement("img"); image.className = "saino-nav-avatar"; image.alt = ""; image.referrerPolicy = "no-referrer"; icon.appendChild(image); }
    if (image.src !== url) image.src = url;
  }

  async function loadAvatar() {
    try { const profile = await global.KSKSupabaseProfile?.getMyProfile?.(); if (profile) updateAvatar(profile); } catch (error) { console.warn("Saino navigation avatar:", error); }
  }

  function start() {
    if (!app()?.querySelector(".saino-sidebar")) return;
    ensureNavigation();
    active(current());
    loadAvatar();
  }

  document.addEventListener("click", click);
  global.addEventListener("saino:app-ready", start);
  global.addEventListener("saino:language-change", () => { ensureNavigation(); active(current()); });
  global.addEventListener("ksk:language-change", () => { ensureNavigation(); active(current()); });
  global.addEventListener("saino:profile-updated", event => updateAvatar(event.detail?.profile || {}));

  global.SainoNavigation = Object.freeze({ refresh: start, go, setActive: active, updateAvatar, refreshAvatar: loadAvatar });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})(window);
