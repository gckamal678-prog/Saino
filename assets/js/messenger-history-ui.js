
/* Saino Messenger - Older Message History Pagination */
(function (global) {
  "use strict";

  if (global.SainoMessengerHistory) return;

  const api = () => global.KSKSupabaseMessages;
  const states = new WeakMap();
  const observedHosts = new WeakSet();

  const PAGE_SIZE = 50;
  const TOP_THRESHOLD = 60;

  let activeConversationId = "";

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function formatTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getHost() {
    if (!activeConversationId) return null;

    return document.querySelector(
      `[data-saino-messages="${CSS.escape(activeConversationId)}"]`
    );
  }

  function createMessageRow(message) {
    const outgoing = Boolean(message.fromMe);

    const deleted = Boolean(
      message.deletedAt || message.deletedForEveryone
    );

    const content = deleted
      ? "सन्देश हटाइयो"
      : message.text || "";

    const edited = message.editedAt && !deleted
      ? '<span>सम्पादन गरिएको</span>'
      : "";

    const row = document.createElement("div");

    row.className =
      "saino-message-row " +
      (outgoing ? "outgoing" : "incoming");

    row.dataset.messageId = message.id;

    row.innerHTML = `
      <article class="saino-message">
        <div class="saino-message-text">${escapeHTML(content)}</div>

        <div class="saino-message-meta">
          ${edited}
          <time>${escapeHTML(formatTime(message.createdAt))}</time>
        </div>
      </article>
    `;

    return row;
  }

  function createLoader() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "saino-history-load-button";
    button.textContent = "पुराना सन्देश लोड गर्नुहोस्";

    button.addEventListener("click", () => {
      const host = getHost();
      const state = host && states.get(host);

      if (host && state) {
        loadOlder(host, state);
      }
    });

    return button;
  }

  function setButtonState(state, loading) {
    if (!state.button) return;

    state.button.disabled = loading;

    state.button.textContent = loading
      ? "पुराना सन्देश लोड हुँदैछन्…"
      : "पुराना सन्देश लोड गर्नुहोस्";
  }

  async function initializeHost(host) {
    const conversationId = host.dataset.sainoMessages;

    if (!conversationId || conversationId !== activeConversationId) {
      return;
    }

    const rows = [
      ...host.querySelectorAll(".saino-message-row")
    ];

    if (!rows.length) return;

    const existing = states.get(host);

    // App ले सन्देश फेरि render गरेको छ भने state reset गर्ने।
    if (
      existing &&
      existing.lastRow === rows[rows.length - 1]
    ) {
      return;
    }

    if (existing?.initializing) return;

    const state = {
      initializing: true,
      loading: false,
      hasMore: true,
      oldest: null,
      lastRow: rows[rows.length - 1],
      button: null
    };

    states.set(host, state);

    const result = await api().getMessages(
      conversationId,
      { limit: PAGE_SIZE }
    );

    if (
      states.get(host) !== state ||
      conversationId !== activeConversationId
    ) {
      return;
    }

    if (!result?.ok || !Array.isArray(result.data)) {
      state.initializing = false;
      return;
    }

    const messages = result.data;

    // हाल देखिएका सन्देशलाई तिनको वास्तविक ID सँग जोड्ने।
    rows.forEach((row, index) => {
      const message = messages[index];

      if (message) {
        row.dataset.messageId = message.id;
      }
    });

    state.oldest = messages[0] || null;
    state.lastRow = rows[rows.length - 1];
    state.hasMore = messages.length >= PAGE_SIZE;
    state.initializing = false;

    state.button = createLoader();

    if (state.hasMore && state.oldest) {
      host.insertBefore(state.button, rows[0]);
    }

    if (!state.hasMore) {
      state.button.hidden = true;
    }

    if (!observedHosts.has(host)) {
      observedHosts.add(host);

      host.addEventListener("scroll", () => {
        const current = states.get(host);

        if (
          current &&
          host.scrollTop <= TOP_THRESHOLD &&
          current.hasMore &&
          !current.loading
        ) {
          loadOlder(host, current);
        }
      }, { passive: true });
    }
  }

  async function loadOlder(host, state) {
    if (
      state.loading ||
      !state.hasMore ||
      !state.oldest
    ) {
      return;
    }

    const conversationId = host.dataset.sainoMessages;

    if (conversationId !== activeConversationId) return;

    state.loading = true;
    setButtonState(state, true);

    const oldHeight = host.scrollHeight;
    const oldTop = host.scrollTop;

    try {
      const result = await api().getOlderMessages(
        conversationId,
        {
          id: state.oldest.id,
          createdAt: state.oldest.createdAt
        },
        PAGE_SIZE
      );

      if (
        states.get(host) !== state ||
        conversationId !== activeConversationId
      ) {
        return;
      }

      if (!result?.ok || !Array.isArray(result.data)) {
        throw new Error(
          result?.message || "पुराना सन्देश लोड गर्न सकिएन।"
        );
      }

      const existingIds = new Set(
        [...host.querySelectorAll(".saino-message-row")]
          .map(row => row.dataset.messageId)
          .filter(Boolean)
      );

      const olderMessages = result.data.filter(
        message => !existingIds.has(message.id)
      );

      if (!olderMessages.length) {
        state.hasMore = false;
        state.button.hidden = true;
        return;
      }

      const fragment = document.createDocumentFragment();

      olderMessages.forEach(message => {
        fragment.appendChild(createMessageRow(message));
      });

      const firstRow = host.querySelector(".saino-message-row");

      if (firstRow) {
        host.insertBefore(fragment, firstRow);
      }

      state.oldest = olderMessages[0];

      state.hasMore = result.data.length >= PAGE_SIZE;

      if (!state.hasMore) {
        state.button.hidden = true;
      }

      // पुराना सन्देश थपिँदा स्क्रिनको पढिरहेको स्थान जोगाउने।
      const newHeight = host.scrollHeight;
      host.scrollTop = oldTop + (newHeight - oldHeight);

    } catch (error) {
      console.error("Saino history pagination:", error);

      if (state.button) {
        state.button.textContent = "फेरि प्रयास गर्नुहोस्";
      }

    } finally {
      state.loading = false;

      if (state.hasMore) {
        setButtonState(state, false);
      }
    }
  }

  function syncHost() {
    const host = getHost();

    if (!host) return;

    initializeHost(host).catch(error => {
      console.error("Saino history initialization:", error);
    });
  }

  global.addEventListener("saino:app-ready", event => {
    activeConversationId =
      event.detail?.conversation?.id || "";

    syncHost();
  });

  global.addEventListener("saino:conversation-select", event => {
    activeConversationId =
      event.detail?.conversation?.id || "";

    syncHost();
  });

  const observer = new MutationObserver(() => {
    syncHost();
  });

  function start() {
    const root = document.getElementById("saino-app");

    if (!root) return;

    observer.observe(root, {
      childList: true,
      subtree: true
    });

    syncHost();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {
      once: true
    });
  } else {
    start();
  }

  global.SainoMessengerHistory = Object.freeze({
    refresh: syncHost
  });

})(window);
