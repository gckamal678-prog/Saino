
/* =========================================
   SAINO — WHATSAPP STYLE BOTTOM NAVIGATION
   Chats | Friends | Feed | Notifications | Profile
========================================= */

(function (global) {
  "use strict";

  if (global.SainoNavigation) return;

  const root = () => document.getElementById("saino-app");
  const nav = () => root()?.querySelector(".saino-tabs");

  const english = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const label = (en, ne) => english() ? en : ne;

  function safeImageURL(value) {
    try {
      const url = new URL(String(value || ""), global.location.href);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function makeButton(selector, dataName) {
    const host = nav();
    if (!host) return null;

    let button = host.querySelector(selector);

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.setAttribute(dataName, "true");
      host.appendChild(button);
    }

    return button;
  }

  function setButton(button, icon, text, extraClass = "") {
    if (!button) return;

    button.classList.add("saino-nav-item");

    if (extraClass) {
      button.classList.add(extraClass);
    }

    button.innerHTML = `
      <span class="saino-nav-icon" aria-hidden="true">
        ${icon}
      </span>
      <span class="saino-nav-label">${text}</span>
    `;

    button.setAttribute("aria-label", text);
    button.title = text;
  }

  function makeNotificationButton() {
    const button = makeButton(
      "[data-saino-notifications-tab]",
      "data-saino-notifications-tab"
    );

    if (!button) return;

    setButton(
      button,
      "♧",
      label("Notifications", "सूचना"),
      "saino-nav-notifications"
    );

    const count = global.SainoNotificationsUI?.getUnreadCount?.() || 0;

    let badge = button.querySelector(".saino-nav-badge");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "saino-nav-badge";
      button.appendChild(badge);
    }

    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count < 1;
  }

  function makeProfileButton() {
    const button = nav()?.querySelector("[data-saino-profile-open]");
    if (!button) return;

    button.classList.add("saino-nav-item", "saino-nav-profile");

    const image = button.querySelector(".saino-nav-avatar");
    const avatar = image?.getAttribute("src") || "";

    button.innerHTML = `
      <span class="saino-nav-icon saino-nav-profile-icon">
        ${
          avatar
            ? `<img class="saino-nav-avatar" src="${avatar}" alt="">`
            : `<span class="saino-nav-avatar-fallback">👤</span>`
        }
      </span>
      <span class="saino-nav-label">
        ${label("Profile", "प्रोफाइल")}
      </span>
    `;

    button.setAttribute(
      "aria-label",
      label("Open profile", "प्रोफाइल खोल्नुहोस्")
    );
  }

  function updateAvatar(profile) {
    const button = nav()?.querySelector("[data-saino-profile-open]");
    if (!button) return;

    const avatarURL = safeImageURL(profile?.avatar);

    const icon = button.querySelector(".saino-nav-profile-icon");
    if (!icon) return;

    icon.innerHTML = avatarURL
      ? `<img class="saino-nav-avatar" src="${avatarURL}" alt="">`
      : `<span class="saino-nav-avatar-fallback">👤</span>`;
  }

  async function loadAvatar() {
    const api = global.KSKSupabaseProfile;

    if (typeof api?.getMyProfile !== "function") return;

    try {
      const profile = await api.getMyProfile();
      updateAvatar(profile || {});
    } catch (error) {
      console.warn("Saino navigation profile photo:", error);
    }
  }

  function arrangeNavigation() {
    const host = nav();
    if (!host) return;

    const chats = host.querySelector('[data-saino-view="chats"]')
      || host.querySelector(".saino-tab:not([data-saino-friends-tab])");

    const friends = host.querySelector("[data-saino-friends-tab]");
    const feed = host.querySelector('[data-saino-view="feed"]');
    const notifications = host.querySelector("[data-saino-notifications-tab]");
    const profile = host.querySelector("[data-saino-profile-open]");

    if (chats) {
      chats.dataset.sainoView = "chats";
      setButton(chats, "▤", label("Chats", "च्याट"));
    }

    if (friends) {
      setButton(friends, "♧", label("Friends", "साथीहरू"));
    }

    if (feed) {
      setButton(feed, "▧", label("Feed", "फिड"));
    }

    if (notifications) {
      setButton(
        notifications,
        "♧",
        label("Notifications", "सूचना"),
        "saino-nav-notifications"
      );
    }

    makeProfileButton();

    /*
      Keep Settings and Groups available in their existing
      modules, but do not show them in the five-item bottom bar.
    */
    host.querySelectorAll(
      "[data-saino-settings-open], [data-saino-groups-tab]"
    ).forEach(button => {
      button.classList.add("saino-nav-hidden");
    });

    /*
      Arrange the five main options in the requested order.
    */
    [chats, friends, feed, notifications, profile].forEach(button => {
      if (button) host.appendChild(button);
    });

    makeNotificationButton();
    makeProfileButton();
  }

  function openNotifications() {
    const headerButton = root()?.querySelector(
      "[data-notification-toggle]"
    );

    if (headerButton) {
      headerButton.click();
    }
  }

  function handleNavigation(event) {
    const button = event.target.closest(
      "[data-saino-notifications-tab]"
    );

    if (!button) return;

    event.preventDefault();
    openNotifications();
  }

  document.addEventListener("click", handleNavigation);

  global.addEventListener("saino:app-ready", () => {
    arrangeNavigation();
    loadAvatar();
  });

  global.addEventListener("saino:language-change", arrangeNavigation);
  global.addEventListener("ksk:language-change", arrangeNavigation);

  global.addEventListener("saino:profile-updated", event => {
    updateAvatar(event.detail?.profile || {});
  });

  global.addEventListener("ksk:notification-cloud-change", makeNotificationButton);

  global.SainoNavigation = Object.freeze({
    refresh: arrangeNavigation,
    refreshAvatar: loadAvatar
  });

})(window);
