
/* =========================================================
   SAINO — PERMANENT MAIN NAVIGATION
   Chats | Friends | Feed | Notifications | Profile
========================================================= */

(function (global) {
  "use strict";

  if (global.SainoNavigation) return;

  const ROOT = "#saino-app";
  const NAV = ".saino-tabs";

  const app = () => document.querySelector(ROOT);
  const navigation = () => app()?.querySelector(NAV);

  const english = () =>
    document.documentElement.lang === "en" ||
    global.KSKLanguage?.getLanguage?.() === "en";

  const tr = (en, ne) => english() ? en : ne;

  const icons = {
    chats: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.2A7.5 7.5 0 1 1 20 11.5Z"/>
        <path d="M8 10h8M8 14h5"/>
      </svg>
    `,

    friends: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2"/>
        <path d="M2.8 20v-1.3a6.2 6.2 0 0 1 12.4 0V20"/>
        <path d="M16 5.2a3.2 3.2 0 0 1 0 6.2M17 14a5.2 5.2 0 0 1 4.2 5.1V20"/>
      </svg>
    `,

    feed: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2.5"/>
        <path d="M7 7h10M7 11h10M7 15h6"/>
      </svg>
    `,

    notifications: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/>
        <path d="M10 21h4"/>
      </svg>
    `,

    profile: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21a8 8 0 0 1 16 0"/>
      </svg>
    `
  };

  function makeButton(selector, attribute) {
    const host = navigation();
    if (!host) return null;

    let button = host.querySelector(selector);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.setAttribute(attribute, "true");
      host.appendChild(button);
    }

    button.classList.add("saino-nav-item");

    return button;
  }

  function paint(button, key, label) {
    if (!button) return;

    button.classList.add("saino-nav-item");

    let icon = button.querySelector(".saino-nav-icon");
    let text = button.querySelector(".saino-nav-label");

    if (!icon || !text) {
      button.innerHTML = `
        <span class="saino-nav-icon" aria-hidden="true"></span>
        <span class="saino-nav-label"></span>
      `;

      icon = button.querySelector(".saino-nav-icon");
      text = button.querySelector(".saino-nav-label");
    }

    if (icon.dataset.iconName !== key) {
      icon.innerHTML = icons[key];
      icon.dataset.iconName = key;
    }

    text.textContent = label;

    button.setAttribute("aria-label", label);
    button.title = label;
  }

  /* CHATS */

  function ensureChats() {
    const host = navigation();
    if (!host) return null;

    let button = host.querySelector(
      '[data-saino-view="chats"]'
    );

    if (!button) {
      button = host.querySelector(
        ".saino-tab:not([data-saino-friends-tab])" +
        ":not([data-saino-view='feed'])" +
        ":not([data-saino-profile-open])" +
        ":not([data-saino-notifications-tab])" +
        ":not([data-saino-settings-open])" +
        ":not([data-saino-groups-tab])"
      );
    }

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      host.appendChild(button);
    }

    button.dataset.sainoView = "chats";

    paint(button, "chats", tr("Chats", "च्याट"));

    return button;
  }

  /* FRIENDS */

  function ensureFriends() {
    const button = makeButton(
      "[data-saino-friends-tab]",
      "data-saino-friends-tab"
    );

    paint(button, "friends", tr("Friends", "साथीहरू"));

    return button;
  }

  /* FEED */

  function ensureFeed() {
    const button = makeButton(
      '[data-saino-view="feed"]',
      "data-saino-view"
    );

    if (button) {
      button.dataset.sainoView = "feed";
    }

    paint(button, "feed", tr("Feed", "फिड"));

    return button;
  }

  /* NOTIFICATIONS */

  function ensureNotifications() {
    const button = makeButton(
      "[data-saino-notifications-tab]",
      "data-saino-notifications-tab"
    );

    if (!button) return null;

    button.classList.add("saino-nav-notifications");

    paint(
      button,
      "notifications",
      tr("Notifications", "सूचना")
    );

    let badge = button.querySelector(
      ".saino-nav-badge"
    );

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "saino-nav-badge";

      button.querySelector(
        ".saino-nav-icon"
      )?.appendChild(badge);
    }

    let count = "";

    const notificationAPI =
      global.SainoNotificationsUI;

    if (
      typeof notificationAPI?.getUnreadCount === "function"
    ) {
      const unread = Number(
        notificationAPI.getUnreadCount()
      );

      count = unread > 0
        ? String(unread > 99 ? "99+" : unread)
        : "";
    } else {
      const source = document.querySelector(
        "#saino-app .saino-notification-count"
      );

      if (source && !source.hidden) {
        count = source.textContent.trim();
      }
    }

    /* अनावश्यक DOM mutation रोक्ने */

    if (badge.textContent !== count) {
      badge.textContent = count;
    }

    const shouldHide = !count || count === "0";

    if (badge.hidden !== shouldHide) {
      badge.hidden = shouldHide;
    }

    return button;
  }

  /* PROFILE */

  function ensureProfile() {
    const button = makeButton(
      "[data-saino-profile-open]",
      "data-saino-profile-open"
    );

    if (!button) return null;

    button.classList.add("saino-nav-profile");

    paint(
      button,
      "profile",
      tr("Profile", "प्रोफाइल")
    );

    button.setAttribute(
      "aria-label",
      tr("Open profile", "प्रोफाइल खोल्नुहोस्")
    );

    button.querySelector(
      ".saino-nav-icon"
    )?.classList.add("saino-nav-profile-icon");

    return button;
  }

  /* PROFILE PHOTO */

  function safeURL(value) {
    if (!value) return "";

    try {
      const url = new URL(
        String(value),
        global.location.href
      );

      return url.protocol === "https:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function updateAvatar(profile = {}) {
    const icon = navigation()?.querySelector(
      "[data-saino-profile-open] .saino-nav-profile-icon"
    );

    if (!icon) return;

    const url = safeURL(
      profile.avatar ||
      profile.avatar_url ||
      profile.photoURL ||
      profile.photo_url
    );

    let image = icon.querySelector("img");

    if (!url) {
      if (image) {
        image.remove();
        icon.innerHTML = icons.profile;
        icon.dataset.iconName = "profile";
      }

      return;
    }

    if (!image) {
      icon.innerHTML = "";

      image = document.createElement("img");
      image.className = "saino-nav-avatar";
      image.alt = "";
      image.referrerPolicy = "no-referrer";

      icon.appendChild(image);
    }

    if (image.src !== url) {
      image.src = url;
    }
  }

  async function loadAvatar() {
    const api = global.KSKSupabaseProfile;

    if (!api?.getMyProfile) return;

    try {
      const profile = await api.getMyProfile();

      updateAvatar(profile || {});
    } catch (error) {
      console.warn(
        "Saino profile avatar:",
        error
      );
    }
  }

  /* MOVE NAVIGATION OUTSIDE SIDEBAR */

  function moveNavigation() {
    const host = app();
    const nav = navigation();

    if (!host || !nav) return;

    if (nav.parentElement !== host) {
      host.appendChild(nav);
    }
  }

  /* MOVE NOTIFICATION PANEL OUTSIDE SIDEBAR */

  function moveNotificationPanel() {
    const host = app();

    const wrap = host?.querySelector(
      ".saino-notification-wrap"
    );

    if (!host || !wrap) return;

    if (wrap.parentElement !== host) {
      host.appendChild(wrap);
    }

    wrap.classList.add("saino-notification-global");
  }

  /* ARRANGE ALL FIVE TABS */

  function arrange() {
    const host = app();

    if (!host || !host.querySelector(".saino-sidebar")) {
      return;
    }

    moveNavigation();
    moveNotificationPanel();

    const nav = navigation();

    if (!nav) return;

    const buttons = [
      ensureChats(),
      ensureFriends(),
      ensureFeed(),
      ensureNotifications(),
      ensureProfile()
    ];

    buttons.forEach(button => {
      if (button && button.parentElement === nav) {
        nav.appendChild(button);
      }
    });

    nav.classList.add("saino-navigation-fixed");

    nav.querySelectorAll(
      "[data-saino-settings-open], [data-saino-groups-tab]"
    ).forEach(button => {
      button.classList.add("saino-nav-hidden");
    });

    refreshActive();
  }

  /* ACTIVE TAB */

  function refreshActive() {
    const host = app();
    const nav = navigation();

    if (!host || !nav) return;

    let active = '[data-saino-view="chats"]';

    if (host.classList.contains("feed-open")) {
      active = '[data-saino-view="feed"]';
    } else if (
      host.querySelector(".saino-friends-page")
    ) {
      active = "[data-saino-friends-tab]";
    } else if (
      host.querySelector(
        "#saino-profile-overlay:not([hidden])"
      )
    ) {
      active = "[data-saino-profile-open]";
    }

    nav.querySelectorAll(".saino-nav-item").forEach(button => {
      const selected = button.matches(active);

      button.classList.toggle("active", selected);

      if (selected) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  /* OPEN NOTIFICATIONS */

  function openNotifications() {
    const button = document.querySelector(
      "#saino-app [data-notification-toggle]"
    );

    button?.click();
  }

  /* CLICK HANDLER */

  function handleClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    if (
      target.closest("[data-saino-notifications-tab]")
    ) {
      event.preventDefault();
      openNotifications();
      return;
    }

    if (
      target.closest(".saino-tabs .saino-nav-item") ||
      target.closest("#saino-profile-overlay")
    ) {
      global.requestAnimationFrame(() => {
        refreshActive();
      });
    }
  }

  /* WATCH APP RE-RENDER */

  function observe() {
    const host = app();

    if (!host || host.dataset.sainoNavObserver === "true") {
      return;
    }

    host.dataset.sainoNavObserver = "true";

    const observer = new MutationObserver(() => {
      const nav = navigation();

      if (!nav) return;

      const missingButtons =
        !nav.querySelector('[data-saino-view="chats"]') ||
        !nav.querySelector("[data-saino-friends-tab]") ||
        !nav.querySelector('[data-saino-view="feed"]') ||
        !nav.querySelector("[data-saino-notifications-tab]") ||
        !nav.querySelector("[data-saino-profile-open]");

      if (
        nav.parentElement !== host ||
        missingButtons
      ) {
        arrange();
      }

      moveNotificationPanel();
      ensureNotifications();
      refreshActive();
    });

    observer.observe(host, {
      childList: true,
      subtree: true
    });
  }

  /* START */

  function start() {
    arrange();
    observe();
    loadAvatar();
  }

  document.addEventListener("click", handleClick);

  global.addEventListener("saino:app-ready", start);

  global.addEventListener(
    "saino:language-change",
    arrange
  );

  global.addEventListener(
    "ksk:language-change",
    arrange
  );

  global.addEventListener(
    "saino:profile-updated",
    event => {
      updateAvatar(event.detail?.profile || {});
    }
  );

  global.addEventListener(
    "ksk:notification-cloud-change",
    ensureNotifications
  );

  global.SainoNavigation = Object.freeze({
    refresh: arrange,
    refreshAvatar: loadAvatar,
    updateAvatar
  });

  /* APP ALREADY OPEN */

  if (app()?.querySelector(".saino-sidebar")) {
    start();
  }

})(window);
