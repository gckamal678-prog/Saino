/* =========================================================
   SAINO — CENTRAL MAIN NAVIGATION
   Chats | Friends | Feed | Notifications | Profile
   Navigation UI lives here; app.js only provides the mount.
========================================================= */

(function (global) {
  "use strict";

  if (global.SainoNavigation) return;

  const ROOT = "#saino-app";
  const NAV = ".saino-tabs";

  const app = () => document.querySelector(ROOT);
  const nav = () => app()?.querySelector(NAV) || null;

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en" ||
    document.documentElement.lang === "en";

  const label = (en, ne) => isEnglish() ? en : ne;

  const ICONS = {
    chats: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.2A7.5 7.5 0 1 1 20 11.5Z"/>
        <path d="M8 10h8M8 14h5"/>
      </svg>`,
    friends: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2"/>
        <path d="M2.8 20v-1.3a6.2 6.2 0 0 1 12.4 0V20"/>
        <path d="M16 5.2a3.2 3.2 0 0 1 0 6.2M17 14a5.2 5.2 0 0 1 4.2 5.1V20"/>
      </svg>`,
    feed: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2.5"/>
        <path d="M7 7h10M7 11h10M7 15h6"/>
      </svg>`,
    notifications: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/>
        <path d="M10 21h4"/>
      </svg>`,
    profile: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21a8 8 0 0 1 16 0"/>
      </svg>`
  };

  function getOrCreateButton(selector, dataAttribute, dataValue = "true") {
    const host = nav();
    if (!host) return null;

    let button = host.querySelector(selector);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.setAttribute(dataAttribute, dataValue);
      host.appendChild(button);
    }

    button.classList.add("saino-nav-item");
    return button;
  }

  function paint(button, key, text) {
    if (!button) return;

    let icon = button.querySelector(":scope > .saino-nav-icon");
    let caption = button.querySelector(":scope > .saino-nav-label");

    if (!icon || !caption) {
      button.replaceChildren();

      icon = document.createElement("span");
      icon.className = "saino-nav-icon";
      icon.setAttribute("aria-hidden", "true");

      caption = document.createElement("span");
      caption.className = "saino-nav-label";

      button.append(icon, caption);
    }

    if (icon.dataset.iconName !== key) {
      icon.innerHTML = ICONS[key];
      icon.dataset.iconName = key;
    }

    if (caption.textContent !== text) {
      caption.textContent = text;
    }

    if (button.getAttribute("aria-label") !== text) {
      button.setAttribute("aria-label", text);
    }
    if (button.title !== text) {
      button.title = text;
    }
  }

  function ensureChats() {
    const host = nav();
    if (!host) return null;

    let button = host.querySelector('[data-saino-view="chats"]');

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab saino-nav-item";
      button.dataset.sainoView = "chats";
      host.appendChild(button);
    }

    paint(button, "chats", label("Chats", "च्याट"));
    return button;
  }

  function ensureFriends() {
    const button = getOrCreateButton(
      "[data-saino-friends-tab]",
      "data-saino-friends-tab"
    );
    paint(button, "friends", label("Friends", "साथीहरू"));
    return button;
  }

  function ensureFeed() {
    const button = getOrCreateButton(
      '[data-saino-view="feed"]',
      "data-saino-view",
      "feed"
    );
    if (button) button.dataset.sainoView = "feed";
    paint(button, "feed", label("Feed", "फिड"));
    return button;
  }

  function readUnreadCount() {
    const source = app()?.querySelector(".saino-notification-count");
    if (!source || source.hidden) return "";

    const raw = source.textContent.trim();
    if (!raw || raw === "0") return "";
    return raw.length > 3 ? "99+" : raw;
  }

  function ensureNotifications() {
    const button = getOrCreateButton(
      "[data-saino-notifications-tab]",
      "data-saino-notifications-tab"
    );
    if (!button) return null;

    button.classList.add("saino-nav-notifications");
    paint(button, "notifications", label("Notifications", "सूचना"));

    const icon = button.querySelector(".saino-nav-icon");
    let badge = icon.querySelector(":scope > .saino-nav-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "saino-nav-badge";
      icon.appendChild(badge);
    }

    const count = readUnreadCount();
    if (badge.textContent !== count) badge.textContent = count;

    const hide = !count;
    if (badge.hidden !== hide) badge.hidden = hide;

    return button;
  }

  function ensureProfile() {
    const button = getOrCreateButton(
      "[data-saino-profile-open]",
      "data-saino-profile-open"
    );
    if (!button) return null;

    button.classList.add("saino-nav-profile");
    paint(button, "profile", label("Profile", "प्रोफाइल"));

    const icon = button.querySelector(".saino-nav-icon");
    icon.classList.add("saino-nav-profile-icon");
    return button;
  }

  function moveNavigation() {
    const host = app();
    const element = nav();
    if (!host || !element) return;

    if (element.parentElement !== host) {
      host.appendChild(element);
    }
  }

  function moveNotificationPanel() {
    const host = app();
    const wrap = host?.querySelector(".saino-notification-wrap");
    if (!host || !wrap) return;

    if (wrap.parentElement !== host) {
      host.appendChild(wrap);
    }

    if (!wrap.classList.contains("saino-notification-global")) {
      wrap.classList.add("saino-notification-global");
    }
  }

  function refreshActive() {
    const host = app();
    const element = nav();
    if (!host || !element) return;

    let selector = '[data-saino-view="chats"]';

    if (host.classList.contains("feed-open")) {
      selector = '[data-saino-view="feed"]';
    } else if (host.querySelector(".saino-friends-page")) {
      selector = "[data-saino-friends-tab]";
    } else if (host.querySelector("#saino-profile-overlay:not([hidden])")) {
      selector = "[data-saino-profile-open]";
    }

    element.querySelectorAll(".saino-nav-item").forEach(button => {
      const active = button.matches(selector);
      if (button.classList.contains("active") !== active) {
        button.classList.toggle("active", active);
      }

      const current = active ? "page" : null;
      if (current) {
        if (button.getAttribute("aria-current") !== current) {
          button.setAttribute("aria-current", current);
        }
      } else if (button.hasAttribute("aria-current")) {
        button.removeAttribute("aria-current");
      }
    });
  }

  function arrange() {
    const host = app();
    if (!host || !host.querySelector(".saino-sidebar")) return;

    moveNavigation();
    moveNotificationPanel();

    const element = nav();
    if (!element) return;

    const buttons = [
      ensureChats(),
      ensureFriends(),
      ensureFeed(),
      ensureNotifications(),
      ensureProfile()
    ];

    // Reappend in the intended order; appending existing nodes only moves them.
    buttons.forEach(button => {
      if (button && button.parentElement === element) {
        element.appendChild(button);
      }
    });

    if (!element.classList.contains("saino-navigation-fixed")) {
      element.classList.add("saino-navigation-fixed");
    }

    element.querySelectorAll(
      "[data-saino-settings-open], [data-saino-groups-tab]"
    ).forEach(button => {
      if (!button.classList.contains("saino-nav-hidden")) {
        button.classList.add("saino-nav-hidden");
      }
    });

    refreshActive();
  }

  function openNotifications() {
    const toggle = app()?.querySelector("[data-notification-toggle]");
    if (toggle) toggle.click();
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("[data-saino-notifications-tab]")) {
      event.preventDefault();
      openNotifications();
      return;
    }

    if (
      target.closest(".saino-tabs .saino-nav-item") ||
      target.closest("#saino-profile-overlay")
    ) {
      global.requestAnimationFrame(refreshActive);
    }
  }

  function observe() {
    const host = app();
    if (!host || host.dataset.sainoNavObserver === "true") return;

    host.dataset.sainoNavObserver = "true";

    const observer = new MutationObserver(() => {
      const element = nav();
      if (!element) return;

      const missing =
        !element.querySelector('[data-saino-view="chats"]') ||
        !element.querySelector("[data-saino-friends-tab]") ||
        !element.querySelector('[data-saino-view="feed"]') ||
        !element.querySelector("[data-saino-notifications-tab]") ||
        !element.querySelector("[data-saino-profile-open]");

      if (element.parentElement !== host || missing) {
        arrange();
      }

      moveNotificationPanel();
      ensureNotifications();
      refreshActive();
    });

    observer.observe(host, { childList: true, subtree: true });
  }

  function safeImageURL(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value), global.location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function updateAvatar(profile = {}) {
    const icon = nav()?.querySelector(
      "[data-saino-profile-open] .saino-nav-profile-icon"
    );
    if (!icon) return;

    const url = safeImageURL(
      profile.avatar || profile.avatar_url ||
      profile.photoURL || profile.photo_url
    );

    let image = icon.querySelector("img");

    if (!url) {
      if (image) {
        image.remove();
        icon.innerHTML = ICONS.profile;
      }
      return;
    }

    if (!image) {
      icon.replaceChildren();
      image = document.createElement("img");
      image.className = "saino-nav-avatar";
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      icon.appendChild(image);
    }

    if (image.src !== url) image.src = url;
  }

  async function loadAvatar() {
    const api = global.KSKSupabaseProfile;
    if (typeof api?.getMyProfile !== "function") return;

    try {
      const profile = await api.getMyProfile();
      if (profile) updateAvatar(profile);
    } catch (error) {
      console.warn("Saino navigation profile photo:", error);
    }
  }

  function start() {
    arrange();
    observe();
    loadAvatar();
  }

  document.addEventListener("click", handleClick);
  global.addEventListener("saino:app-ready", start);
  global.addEventListener("saino:language-change", arrange);
  global.addEventListener("ksk:language-change", arrange);
  global.addEventListener("ksk:notification-cloud-change", ensureNotifications);
  global.addEventListener("saino:profile-updated", event => {
    updateAvatar(event.detail?.profile || {});
  });

  global.SainoNavigation = Object.freeze({
    refresh: arrange,
    refreshAvatar: loadAvatar,
    updateAvatar
  });

  if (app()?.querySelector(".saino-sidebar")) start();

})(window);
