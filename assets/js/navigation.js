
/* =========================================================
   SAINO — PERMANENT BOTTOM NAVIGATION
   Chats | Friends | Feed | Notifications | Profile
========================================================= */

(function (global) {
  "use strict";

  if (global.SainoNavigation) return;

  const APP_SELECTOR = "#saino-app .saino-app";
  const NAV_SELECTOR = ".saino-tabs";

  const app = () => document.querySelector(APP_SELECTOR);
  const nav = () => app()?.querySelector(NAV_SELECTOR);

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const label = (en, ne) => isEnglish() ? en : ne;

  const icons = {
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
        <path d="M16 15h1"/>
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

  function safeImageURL(value) {
    if (!value) return "";

    try {
      const url = new URL(String(value), global.location.href);

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }

      return url.href;
    } catch (_) {
      return "";
    }
  }

  function createButton(selector, dataAttribute) {
    const host = nav();
    if (!host) return null;

    let button = host.querySelector(selector);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.setAttribute(dataAttribute, "true");
      host.appendChild(button);
    }

    button.classList.add("saino-nav-item");
    return button;
  }

  function paintButton(button, icon, text, extraClass = "") {
    if (!button) return;

    button.classList.add("saino-nav-item");

    if (extraClass) {
      button.classList.add(extraClass);
    }

    const currentLabel = button.querySelector(".saino-nav-label");
    const currentIcon = button.querySelector(".saino-nav-icon");

    if (!currentLabel || !currentIcon) {
      button.innerHTML = `
        <span class="saino-nav-icon" aria-hidden="true">
          ${icon}
        </span>
        <span class="saino-nav-label"></span>
      `;
    } else if (currentIcon.dataset.icon !== icon) {
      currentIcon.innerHTML = icon;
    }

    const labelNode = button.querySelector(".saino-nav-label");
    const iconNode = button.querySelector(".saino-nav-icon");

    if (iconNode) iconNode.dataset.icon = icon;
    if (labelNode) labelNode.textContent = text;

    button.setAttribute("aria-label", text);
    button.title = text;
  }

  function ensureChats() {
    const host = nav();
    if (!host) return null;

    let button = host.querySelector('[data-saino-view="chats"]');

    if (!button) {
      button = host.querySelector(
        ".saino-tab:not([data-saino-friends-tab]):not([data-saino-view='feed']):not([data-saino-profile-open])"
      );
    }

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      host.appendChild(button);
    }

    button.dataset.sainoView = "chats";
    paintButton(button, icons.chats, label("Chats", "च्याट"));

    return button;
  }

  function ensureFriends() {
    const button = createButton(
      "[data-saino-friends-tab]",
      "data-saino-friends-tab"
    );

    paintButton(button, icons.friends, label("Friends", "साथीहरू"));
    return button;
  }

  function ensureFeed() {
    const button = createButton(
      '[data-saino-view="feed"]',
      "data-saino-view"
    );

    if (button) button.dataset.sainoView = "feed";

    paintButton(button, icons.feed, label("Feed", "फिड"));
    return button;
  }

  function ensureNotifications() {
    const button = createButton(
      "[data-saino-notifications-tab]",
      "data-saino-notifications-tab"
    );

    paintButton(
      button,
      icons.notifications,
      label("Notifications", "सूचना"),
      "saino-nav-notifications"
    );

    if (!button) return null;

    let badge = button.querySelector(".saino-nav-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "saino-nav-badge";
      button.appendChild(badge);
    }

    const count =
      Number(global.SainoNotificationsUI?.getUnreadCount?.()) || 0;

    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count < 1;

    return button;
  }

  function ensureProfile() {
    const button = createButton(
      "[data-saino-profile-open]",
      "data-saino-profile-open"
    );

    if (!button) return null;

    button.classList.add("saino-nav-profile");

    let icon = button.querySelector(".saino-nav-icon");

    if (!icon) {
      button.innerHTML = `
        <span class="saino-nav-icon saino-nav-profile-icon"></span>
        <span class="saino-nav-label"></span>
      `;
      icon = button.querySelector(".saino-nav-icon");
    }

    icon.classList.add("saino-nav-profile-icon");

    const labelNode = button.querySelector(".saino-nav-label");
    if (labelNode) {
      labelNode.textContent = label("Profile", "प्रोफाइल");
    }

    button.setAttribute(
      "aria-label",
      label("Open profile", "प्रोफाइल खोल्नुहोस्")
    );

    button.title = label("Profile", "प्रोफाइल");

    return button;
  }

  function updateAvatar(profile = {}) {
    const button = nav()?.querySelector("[data-saino-profile-open]");
    const icon = button?.querySelector(".saino-nav-profile-icon");

    if (!icon) return;

    const avatar = safeImageURL(
      profile.avatar ||
      profile.avatar_url ||
      profile.photoURL ||
      profile.photo_url
    );

    if (avatar) {
      let image = icon.querySelector("img");

      if (!image) {
        icon.innerHTML = "";
        image = document.createElement("img");
        image.className = "saino-nav-avatar";
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        icon.appendChild(image);
      }

      if (image.src !== avatar) image.src = avatar;
    } else if (!icon.querySelector("svg")) {
      icon.innerHTML = icons.profile;
    }
  }

  async function loadAvatar() {
    const api = global.KSKSupabaseProfile;

    if (typeof api?.getMyProfile !== "function") return;

    try {
      const profile = await api.getMyProfile();
      updateAvatar(profile || {});
    } catch (error) {
      console.warn("Saino navigation avatar:", error);
    }
  }

  function moveNavigationOutsideSidebar() {
    const host = app();
    const sidebar = host?.querySelector(".saino-sidebar");
    const navigation = sidebar?.querySelector(NAV_SELECTOR);

    if (!host || !navigation) return;

    if (navigation.parentElement !== host) {
      host.appendChild(navigation);
    }
  }

  function arrangeNavigation() {
    const host = app();
    if (!host) return;

    moveNavigationOutsideSidebar();

    const navigation = nav();
    if (!navigation) return;

    const chats = ensureChats();
    const friends = ensureFriends();
    const feed = ensureFeed();
    const notifications = ensureNotifications();
    const profile = ensureProfile();

    [
      chats,
      friends,
      feed,
      notifications,
      profile
    ].forEach(button => {
      if (button && button.parentElement === navigation) {
        navigation.appendChild(button);
      }
    });

    navigation.classList.add("saino-navigation-fixed");

    navigation.querySelectorAll(
      "[data-saino-settings-open], [data-saino-groups-tab]"
    ).forEach(button => {
      button.classList.add("saino-nav-hidden");
    });

    refreshActiveState();
  }

  function refreshActiveState() {
    const host = app();
    const navigation = nav();

    if (!host || !navigation) return;

    let activeSelector = '[data-saino-view="chats"]';

    if (host.classList.contains("feed-open")) {
      activeSelector = '[data-saino-view="feed"]';
    } else if (
      host.querySelector(".saino-friends-page")
    ) {
      activeSelector = "[data-saino-friends-tab]";
    }

    navigation.querySelectorAll(".saino-nav-item").forEach(button => {
      const active = button.matches(activeSelector);

      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function openNotifications() {
    const button = document.querySelector(
      "#saino-app [data-notification-toggle]"
    );

    if (button) {
      button.click();
    }
  }

  function handleNavigationClick(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const notificationButton = target.closest(
      "[data-saino-notifications-tab]"
    );

    if (notificationButton) {
      event.preventDefault();
      openNotifications();
      refreshActiveState();
      return;
    }

    const navButton = target.closest(
      ".saino-tabs .saino-nav-item"
    );

    if (!navButton) return;

    global.requestAnimationFrame(refreshActiveState);
  }

  function observeApp() {
    const host = app();
    if (!host || host.dataset.sainoNavObserver === "true") return;

    host.dataset.sainoNavObserver = "true";

    const observer = new MutationObserver(() => {
      if (!nav()) {
        const sidebarNav = host.querySelector(
          ".saino-sidebar .saino-tabs"
        );

        if (sidebarNav) arrangeNavigation();
      }

      refreshActiveState();
    });

    observer.observe(host, {
      childList: true,
      subtree: true
    });
  }

  function start() {
    arrangeNavigation();
    observeApp();
    loadAvatar();
  }

  document.addEventListener("click", handleNavigationClick);

  global.addEventListener("saino:app-ready", start);

  global.addEventListener("saino:language-change", arrangeNavigation);
  global.addEventListener("ksk:language-change", arrangeNavigation);

  global.addEventListener("saino:profile-updated", event => {
    updateAvatar(event.detail?.profile || {});
  });

  global.addEventListener("ksk:notification-cloud-change", ensureNotifications);

  global.SainoNavigation = Object.freeze({
    refresh: arrangeNavigation,
    refreshAvatar: loadAvatar,
    updateAvatar
  });

})(window);
