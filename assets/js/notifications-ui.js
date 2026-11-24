
/* Saino — Realtime Notifications UI */
(function (global) {
  "use strict";

  if (global.SainoNotificationsUI) return;

  const API = () => global.KSKSupabaseNotifications;
  const state = {
    items: [],
    open: false,
    loading: false,
    loaded: false,
    userId: ""
  };

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const t = (en, ne) => isEnglish() ? en : ne;

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function injectStyles() {
    if (document.getElementById("saino-notification-styles")) return;

    const style = document.createElement("style");
    style.id = "saino-notification-styles";
    style.textContent = `
      .saino-notification-wrap {
        position: relative;
        display: inline-flex;
      }
      .saino-notification-button {
        position: relative;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 21px;
      }
      .saino-notification-button:hover {
        background: var(--saino-hover, rgba(127,127,127,.12));
      }
      .saino-notification-count {
        position: absolute;
        top: 1px;
        right: 0;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 12px;
        background: #e53935;
        color: #fff;
        font: 700 10px/17px Arial,sans-serif;
        text-align: center;
      }
      .saino-notification-panel {
        position: absolute;
        z-index: 1000;
        top: 48px;
        right: 0;
        width: min(360px, calc(100vw - 24px));
        max-height: min(520px, 72vh);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--saino-border, #ddd);
        border-radius: 14px;
        background: var(--saino-card, #fff);
        color: var(--saino-text, #222);
        box-shadow: 0 12px 36px rgba(0,0,0,.18);
      }
      .saino-notification-wrap.is-open .saino-notification-panel {
        display: flex;
      }
      .saino-notification-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 14px;
        border-bottom: 1px solid var(--saino-border, #ddd);
      }
      .saino-notification-head strong {
        font-size: 15px;
      }
      .saino-notification-head button,
      .saino-notification-delete {
        border: 0;
        background: transparent;
        color: var(--saino-primary, #087e70);
        cursor: pointer;
        font: inherit;
      }
      .saino-notification-list {
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .saino-notification-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--saino-border, #eee);
        cursor: pointer;
      }
      .saino-notification-item.unread {
        background: var(--saino-hover, rgba(8,126,112,.08));
      }
      .saino-notification-dot {
        flex: 0 0 9px;
        width: 9px;
        height: 9px;
        margin-top: 6px;
        border-radius: 50%;
        background: #0b9b82;
      }
      .saino-notification-item:not(.unread) .saino-notification-dot {
        background: transparent;
      }
      .saino-notification-body {
        min-width: 0;
        flex: 1;
      }
      .saino-notification-text {
        font-size: 13px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .saino-notification-time {
        display: block;
        margin-top: 4px;
        color: var(--saino-text-muted, #777);
        font-size: 11px;
      }
      .saino-notification-delete {
        padding: 3px 0 3px 6px;
        color: var(--saino-text-muted, #777);
        font-size: 17px;
      }
      .saino-notification-empty {
        padding: 28px 16px;
        color: var(--saino-text-muted, #777);
        text-align: center;
        font-size: 13px;
      }
      @media (max-width: 520px) {
        .saino-notification-panel {
          position: fixed;
          top: 66px;
          right: 10px;
          width: calc(100vw - 20px);
          max-height: calc(100dvh - 86px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString(
      isEnglish() ? "en-IN" : "ne-NP",
      { dateStyle: "medium", timeStyle: "short" }
    );
  }

  function unreadCount() {
    return state.items.filter(item => !item.read).length;
  }

  function render() {
    const wrap = document.querySelector(
      "#saino-app .saino-notification-wrap"
    );

    if (!wrap) return;

    const count = unreadCount();
    const badge = wrap.querySelector(
      ".saino-notification-count"
    );

    if (badge) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = count === 0;
    }

    const list = wrap.querySelector(
      ".saino-notification-list"
    );

    if (!list) return;

    if (state.loading && !state.loaded) {
      list.innerHTML = `
        <div class="saino-notification-empty">
          ${t("Loading notifications…", "सूचना लोड हुँदैछ…")}
        </div>`;
      return;
    }

    if (!state.items.length) {
      list.innerHTML = `
        <div class="saino-notification-empty">
          ${t("You have no notifications.", "तपाईंलाई कुनै सूचना छैन।")}
        </div>`;
      return;
    }

    list.innerHTML = state.items.map(item => `
      <div
        class="saino-notification-item ${item.read ? "" : "unread"}"
        data-notification-id="${escapeHTML(item.id)}"
        role="button"
        tabindex="0"
      >
        <span class="saino-notification-dot"></span>
        <div class="saino-notification-body">
          <div class="saino-notification-text">
            ${escapeHTML(item.text || t("New notification", "नयाँ सूचना"))}
          </div>
          <time class="saino-notification-time">
            ${escapeHTML(formatTime(item.createdAt))}
          </time>
        </div>
        <button
          class="saino-notification-delete"
          type="button"
          data-notification-delete="${escapeHTML(item.id)}"
          aria-label="${t("Delete notification", "सूचना हटाउनुहोस्")}"
          title="${t("Delete", "हटाउनुहोस्")}"
        >×</button>
      </div>
    `).join("");
  }

  function mount() {
    const host = document.querySelector(
      "#saino-app .saino-header-actions"
    );

    if (!host) return;

    injectStyles();

    if (host.querySelector(".saino-notification-wrap")) {
      render();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "saino-notification-wrap";

    wrap.innerHTML = `
      <button
        class="saino-notification-button"
        type="button"
        data-notification-toggle
        aria-label="${t("Notifications", "सूचनाहरू")}"
        title="${t("Notifications", "सूचनाहरू")}"
        aria-expanded="false"
      >
        🔔
        <span class="saino-notification-count" hidden>0</span>
      </button>

      <section
        class="saino-notification-panel"
        aria-label="${t("Notifications", "सूचनाहरू")}"
      >
        <header class="saino-notification-head">
          <strong>${t("Notifications", "सूचनाहरू")}</strong>
          <button type="button" data-notification-read-all>
            ${t("Mark all read", "सबै पढिएको बनाउनुहोस्")}
          </button>
        </header>
        <div class="saino-notification-list">
          <div class="saino-notification-empty">
            ${t("Loading notifications…", "सूचना लोड हुँदैछ…")}
          </div>
        </div>
      </section>
    `;

    host.insertBefore(wrap, host.firstChild);
    render();
  }

  async function load() {
    const api = API();
    if (!api?.getNotifications) return;

    if (state.loading) return;

    state.loading = true;
    render();

    const result = await api.getNotifications({ limit: 100 });

    state.loading = false;
    state.loaded = true;

    if (!result?.ok) {
      state.items = [];
      render();
      console.warn("Saino notifications:", result?.message);
      return;
    }

    state.items = Array.isArray(result.data)
      ? result.data
      : [];

    render();
  }

  async function markRead(id) {
    const item = state.items.find(row => row.id === id);
    if (!item || item.read) return;

    const result = await API()?.markAsRead?.(id);

    if (!result?.ok) {
      console.warn("Could not mark notification as read:", result?.message);
      return;
    }

    state.items = state.items.map(row =>
      row.id === id ? { ...row, read: true } : row
    );
    render();
  }

  async function markAllRead() {
    if (!unreadCount()) return;

    const result = await API()?.markAllAsRead?.();

    if (!result?.ok) {
      console.warn("Could not mark all notifications as read:", result?.message);
      return;
    }

    state.items = state.items.map(row => ({
      ...row,
      read: true
    }));
    render();
  }

  async function deleteOne(id) {
    const result = await API()?.deleteNotification?.(id);

    if (!result?.ok) {
      console.warn("Could not delete notification:", result?.message);
      return;
    }

    state.items = state.items.filter(row => row.id !== id);
    render();
  }

  document.addEventListener("click", event => {
    const toggle = event.target.closest("[data-notification-toggle]");

    if (toggle) {
      const wrap = toggle.closest(".saino-notification-wrap");
      state.open = !state.open;
      wrap?.classList.toggle("is-open", state.open);
      toggle.setAttribute("aria-expanded", String(state.open));

      if (state.open && !state.loaded) load();
      return;
    }

    const deleteButton = event.target.closest(
      "[data-notification-delete]"
    );

    if (deleteButton) {
      event.stopPropagation();
      deleteOne(deleteButton.dataset.notificationDelete);
      return;
    }

    const readAll = event.target.closest(
      "[data-notification-read-all]"
    );

    if (readAll) {
      markAllRead();
      return;
    }

    const item = event.target.closest(
      "[data-notification-id]"
    );

    if (item) {
      markRead(item.dataset.notificationId);
      return;
    }

    if (
      state.open &&
      !event.target.closest(".saino-notification-wrap")
    ) {
      state.open = false;
      document.querySelectorAll(".saino-notification-wrap")
        .forEach(wrap => {
          wrap.classList.remove("is-open");
          wrap.querySelector("[data-notification-toggle]")
            ?.setAttribute("aria-expanded", "false");
        });
    }
  });

  document.addEventListener("keydown", event => {
    const item = event.target.closest("[data-notification-id]");
    if (!item || !["Enter", " "].includes(event.key)) return;

    if (event.target.closest("[data-notification-delete]")) return;

    event.preventDefault();
    markRead(item.dataset.notificationId);
  });

  global.addEventListener("saino:app-ready", () => {
    mount();

    const userId = global.KSKSupabaseAuth?.getUser?.()?.id || "";

    if (userId && userId !== state.userId) {
      state.userId = userId;
      state.items = [];
      state.loaded = false;
      load();
    } else if (!state.loaded) {
      load();
    }
  });

  global.addEventListener("ksk:auth-change", event => {
    const userId = event.detail?.user?.id || "";

    if (!userId) {
      state.userId = "";
      state.items = [];
      state.loaded = false;
      state.open = false;
      return;
    }

    if (userId !== state.userId) {
      state.userId = userId;
      state.items = [];
      state.loaded = false;
      load();
    }
  });

  global.addEventListener("ksk:notification-cloud-change", event => {
    const { action, item } = event.detail || {};

    if (action === "add" && item) {
      state.items = [
        item,
        ...state.items.filter(row => row.id !== item.id)
      ];
    } else if (action === "update" && item) {
      state.items = state.items.map(row =>
        row.id === item.id ? item : row
      );
    } else if (action === "read" && item) {
      state.items = state.items.map(row =>
        row.id === item.id ? item : row
      );
    } else if (action === "delete" && item?.id) {
      state.items = state.items.filter(row => row.id !== item.id);
    } else if (action === "mark-all-read") {
      state.items = state.items.map(row => ({
        ...row,
        read: true
      }));
    }

    render();
  });

  global.addEventListener("saino:language-change", () => {
    mount();
    render();
  });

  global.SainoNotificationsUI = Object.freeze({
    load,
    getItems: () => [...state.items],
    getUnreadCount: unreadCount
  });

})(window);
