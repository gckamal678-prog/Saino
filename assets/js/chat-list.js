
/* =========================================================
   SAINO CHAT LIST
   WhatsApp-inspired UI replacement
   Existing API and event logic preserved
========================================================= */

(function (global) {
  "use strict";

  if (global.SainoChatList) return;

  let conversations = [];
  let loading = false;
  let loadError = "";
  let activeId = "";
  let searchTerm = "";
  let currentHost = null;
  let refreshQueued = false;

  const language = () => global.KSKLanguage;

  const isEnglish = () =>
    language()?.getLanguage?.() === "en";

  const t = (key, en, ne) =>
    language()?.t?.(key) || (isEnglish() ? en : ne);

  /* -------------------------------------------------------
     SAFE HELPERS
  ------------------------------------------------------- */

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function safeImageURL(value) {
    try {
      const url = new URL(
        String(value || ""),
        global.location.href
      );

      return url.protocol === "https:" ||
        url.protocol === "http:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const now = new Date();

    if (
      date.toDateString() === now.toDateString() &&
      language()?.formatTime
    ) {
      return language().formatTime(date);
    }

    if (language()?.formatDate) {
      return language().formatDate(date, {
        day: "numeric",
        month: "short"
      });
    }

    return date.toLocaleDateString();
  }

  function getInitial(name) {
    return Array.from(
      String(name || "S").trim()
    )[0] || "S";
  }

  function getUnreadCount(item) {
    const value = Number(
      item.unreadCount ??
      item.unreadMessages ??
      item.unread ??
      0
    );

    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : 0;
  }

  /* -------------------------------------------------------
     MESSAGE PREVIEW
  ------------------------------------------------------- */

  function previewText(conversation) {
    const message = conversation.lastMessage;

    if (!message) {
      return t(
        "startConversation",
        "Start a conversation",
        "कुराकानी सुरु गर्नुहोस्"
      );
    }

    if (message.deletedAt) {
      return t(
        "messageDeleted",
        "Message deleted",
        "सन्देश हटाइयो"
      );
    }

    if (message.type && message.type !== "text") {
      return message.type === "image"
        ? t("photo", "Photo", "फोटो")
        : t("attachment", "Attachment", "फाइल");
    }

    return message.text || t(
      "noMessages",
      "No messages yet.",
      "अहिलेसम्म कुनै सन्देश छैन।"
    );
  }

  /* -------------------------------------------------------
     SEARCH FILTER
  ------------------------------------------------------- */

  function visibleConversations() {
    const query = searchTerm
      .trim()
      .toLocaleLowerCase();

    return conversations.filter(item => {
      if (item.isArchived) return false;

      if (!query) return true;

      return `${item.name || ""} ${previewText(item)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }

  /* -------------------------------------------------------
     AVATAR UI
  ------------------------------------------------------- */

  function renderAvatar(item) {
    const url = safeImageURL(item.avatar);
    const initial = getInitial(item.name);

    const content = url
      ? `
        <img
          src="${escapeHTML(url)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      `
      : escapeHTML(initial);

    return `
      <div class="saino-avatar">
        ${content}

        ${
          item.isOnline
            ? `<span
                class="saino-online-dot"
                aria-label="${escapeHTML(
                  t("online", "Online", "अनलाइन")
                )}"
              ></span>`
            : ""
        }
      </div>
    `;
  }

  /* -------------------------------------------------------
     CHAT ITEM UI
  ------------------------------------------------------- */

  function renderChatItem(item) {
    const name = item.name ||
      t("conversation", "Conversation", "कुराकानी");

    const unread = getUnreadCount(item);

    const time = formatTime(
      item.lastMessageAt || item.createdAt
    );

    const preview = previewText(item);

    const isActive = item.id === activeId;

    return `
      <div
        class="saino-chat-item${isActive ? " active" : ""}"
        role="button"
        tabindex="0"
        data-conversation-id="${escapeHTML(item.id)}"
        aria-label="${escapeHTML(name)}"
        aria-current="${isActive ? "true" : "false"}"
      >

        ${renderAvatar(item)}

        <div class="saino-chat-info">

          <div class="saino-chat-topline">

            <span class="saino-chat-name">
              ${escapeHTML(name)}
            </span>

            <time class="saino-chat-time">
              ${escapeHTML(time)}
            </time>

          </div>

          <div class="saino-chat-bottomline">

            <span class="saino-chat-preview">
              ${escapeHTML(preview)}
            </span>

            ${
              unread
                ? `
                  <span
                    class="saino-unread-count"
                    aria-label="${escapeHTML(
                      `${unread} ${t(
                        "unreadMessages",
                        "unread messages",
                        "नपढिएका सन्देश"
                      )}`
                    )}"
                  >
                    ${unread > 99 ? "99+" : unread}
                  </span>
                `
                : ""
            }

          </div>

        </div>

      </div>
    `;
  }

  /* -------------------------------------------------------
     LOADING UI
  ------------------------------------------------------- */

  function renderLoading() {
    return `
      <div class="saino-empty-state" role="status">

        <div class="saino-empty-icon" aria-hidden="true">
          S
        </div>

        <p>
          ${escapeHTML(
            t("loading", "Loading chats...", "च्याट लोड हुँदैछ...")
          )}
        </p>

      </div>
    `;
  }

  /* -------------------------------------------------------
     ERROR UI
  ------------------------------------------------------- */

  function renderError() {
    return `
      <div class="saino-empty-state" role="alert">

        <div class="saino-empty-icon" aria-hidden="true">
          !
        </div>

        <p>
          ${escapeHTML(loadError)}
        </p>

        <button
          class="saino-button-secondary"
          type="button"
          data-saino-chat-retry
        >
          ${escapeHTML(
            t("retry", "Try again", "फेरि प्रयास गर्नुहोस्")
          )}
        </button>

      </div>
    `;
  }

  /* -------------------------------------------------------
     EMPTY UI
  ------------------------------------------------------- */

  function renderEmpty() {
    const message = searchTerm
      ? t(
          "noResults",
          "No chats found",
          "कुनै च्याट भेटिएन"
        )
      : t(
          "noChats",
          "No chats yet",
          "अहिलेसम्म कुनै च्याट छैन"
        );

    const description = searchTerm
      ? t(
          "tryAnotherSearch",
          "Try searching with another name or message.",
          "अर्को नाम वा सन्देशबाट खोज्नुहोस्।"
        )
      : t(
          "startConversation",
          "Start a conversation with someone.",
          "कसैसँग कुराकानी सुरु गर्नुहोस्।"
        );

    return `
      <div class="saino-empty-state">

        <div class="saino-empty-icon" aria-hidden="true">
          S
        </div>

        <h2>${escapeHTML(message)}</h2>

        <p>${escapeHTML(description)}</p>

      </div>
    `;
  }

  /* -------------------------------------------------------
     MAIN RENDER
  ------------------------------------------------------- */

  function render() {
    const host = document.querySelector(
      "#saino-app .saino-chat-list"
    );

    if (!host) return;

    currentHost = host;

    if (loading && !conversations.length) {
      host.innerHTML = renderLoading();
      return;
    }

    if (loadError && !conversations.length) {
      host.innerHTML = renderError();
      return;
    }

    const items = visibleConversations();

    if (!items.length) {
      host.innerHTML = renderEmpty();
      return;
    }

    host.innerHTML = items
      .map(renderChatItem)
      .join("");
  }

  /* -------------------------------------------------------
     EXISTING DATA SERVICE — UNCHANGED
  ------------------------------------------------------- */

  async function refresh() {
    const auth = global.KSKSupabaseAuth;
    const messenger = global.KSKSupabaseMessages;

    if (
      !auth?.isAuthenticated?.() ||
      !messenger?.getConversations
    ) {
      conversations = [];
      loading = false;
      render();
      return;
    }

    loading = true;
    loadError = "";

    render();

    const result = await messenger.getConversations();

    loading = false;

    if (!result?.ok) {
      loadError = result?.message || t(
        "genericError",
        "Something went wrong. Please try again.",
        "केही समस्या भयो। फेरि प्रयास गर्नुहोस्।"
      );

      render();
      return;
    }

    conversations = Array.isArray(result.data)
      ? result.data
      : [];

    if (
      activeId &&
      !conversations.some(item => item.id === activeId)
    ) {
      activeId = "";
    }

    render();

    global.dispatchEvent(new CustomEvent(
      "saino:chat-list-updated",
      {
        detail: {
          conversations: conversations.slice()
        }
      }
    ));
  }

  /* -------------------------------------------------------
     REFRESH QUEUE — UNCHANGED
  ------------------------------------------------------- */

  function scheduleRefresh() {
    if (refreshQueued) return;

    refreshQueued = true;

    Promise.resolve().then(() => {
      refreshQueued = false;
      refresh();
    });
  }

  /* -------------------------------------------------------
     CONVERSATION SELECTION — UNCHANGED
  ------------------------------------------------------- */

  function selectConversation(id) {
    const conversation = conversations.find(
      item => item.id === id
    );

    if (!conversation) return;

    activeId = id;

    render();

    global.dispatchEvent(new CustomEvent(
      "saino:conversation-select",
      {
        detail: { conversation }
      }
    ));
  }

  /* -------------------------------------------------------
     CLICK EVENTS
  ------------------------------------------------------- */

  document.addEventListener("click", event => {
    const retry = event.target.closest(
      "[data-saino-chat-retry]"
    );

    if (retry) {
      refresh();
      return;
    }

    const item = event.target.closest(
      "[data-conversation-id]"
    );

    if (item) {
      selectConversation(
        item.dataset.conversationId
      );
    }
  });

  /* -------------------------------------------------------
     KEYBOARD ACCESSIBILITY
  ------------------------------------------------------- */

  document.addEventListener("keydown", event => {
    const item = event.target.closest(
      "[data-conversation-id]"
    );

    if (
      item &&
      (
        event.key === "Enter" ||
        event.key === " "
      )
    ) {
      event.preventDefault();

      selectConversation(
        item.dataset.conversationId
      );
    }
  });

  /* -------------------------------------------------------
     SEARCH — UNCHANGED
  ------------------------------------------------------- */

  document.addEventListener("input", event => {
    if (
      event.target.matches(
        "#saino-app .saino-search input"
      )
    ) {
      searchTerm = event.target.value || "";
      render();
    }
  });

  /* -------------------------------------------------------
     AUTH EVENTS — UNCHANGED
  ------------------------------------------------------- */

  global.addEventListener(
    "ksk:auth-ready",
    event => {
      if (event.detail?.user) refresh();
    }
  );

  global.addEventListener(
    "ksk:auth-change",
    event => {
      if (event.detail?.user) {
        refresh();
      } else {
        conversations = [];
        activeId = "";
        render();
      }
    }
  );

  /* -------------------------------------------------------
     MESSAGE EVENTS — UNCHANGED
  ------------------------------------------------------- */

  global.addEventListener(
    "ksk:messages-cloud-change",
    event => {
      const actions = [
        "message-sent",
        "message-edited",
        "message-deleted",
        "realtime-message",
        "conversation-created",
        "group-created"
      ];

      if (actions.includes(event.detail?.action)) {
        refresh();
      }
    }
  );

  /* -------------------------------------------------------
     LANGUAGE EVENTS — UNCHANGED
  ------------------------------------------------------- */

  global.addEventListener(
    "saino:language-change",
    render
  );

  global.addEventListener(
    "ksk:language-change",
    render
  );

  /* -------------------------------------------------------
     DOM OBSERVER — UNCHANGED
  ------------------------------------------------------- */

  const observer = new MutationObserver(() => {
    const host = document.querySelector(
      "#saino-app .saino-chat-list"
    );

    if (host && host !== currentHost) {
      currentHost = host;

      render();

      if (
        global.KSKSupabaseAuth?.isAuthenticated?.()
      ) {
        scheduleRefresh();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  /* -------------------------------------------------------
     PUBLIC API — UNCHANGED
  ------------------------------------------------------- */

  global.SainoChatList = Object.freeze({
    refresh,

    getConversations: () =>
      conversations.slice(),

    getActiveConversation: () =>
      conversations.find(
        item => item.id === activeId
      ) || null
  });

})(window);
