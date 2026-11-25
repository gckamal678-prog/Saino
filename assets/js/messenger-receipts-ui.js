
/*
 * SAINO — MESSAGE DELIVERY & READ RECEIPTS
 * Uses existing message_receipts table and messenger APIs.
 * No database migration is required.
 */
(function (global) {
  "use strict";

  if (global.SainoMessageReceiptsUI) return;

  let activeConversation = null;
  let currentUserId = "";
  let observer = null;
  let scheduled = null;
  let requestToken = 0;

  const messenger = () => global.KSKSupabaseMessages;
  const auth = () => global.KSKSupabaseAuth;
  const isEnglish = () => global.KSKLanguage?.getLanguage?.() === "en";
  const t = (en, ne) => isEnglish() ? en : ne;

  function getHost() {
    return document.querySelector(
      `.saino-conversation [data-saino-messages="${CSS.escape(activeConversation?.id || "")}"]`
    );
  }

  function receiptLabel(state, total) {
    if (activeConversation?.type === "group") {
      if (state === "read") {
        return t(
          `Read by all ${total} members`,
          `सबै ${total} जना सदस्यले पढे`
        );
      }

      if (state === "delivered") {
        return t(
          `Delivered to all ${total} members`,
          `सबै ${total} जना सदस्यसम्म पुग्यो`
        );
      }

      return t("Sent", "पठाइयो");
    }

    if (state === "read") return t("Read", "पढियो");
    if (state === "delivered") return t("Delivered", "पुग्यो");

    return t("Sent", "पठाइयो");
  }

  function getReceiptState(rows, messageId, recipients) {
    const relevant = rows.filter(
      row => row.message_id === messageId
    );

    const byUser = new Map(
      relevant.map(row => [row.user_id, row])
    );

    if (!recipients.length) {
      return {
        state: "sent",
        delivered: 0,
        read: 0,
        total: 0
      };
    }

    let delivered = 0;
    let read = 0;

    recipients.forEach(userId => {
      const receipt = byUser.get(userId);

      if (receipt?.delivered_at || receipt?.read_at) {
        delivered++;
      }

      if (receipt?.read_at) {
        read++;
      }
    });

    if (read === recipients.length) {
      return {
        state: "read",
        delivered,
        read,
        total: recipients.length
      };
    }

    if (delivered === recipients.length) {
      return {
        state: "delivered",
        delivered,
        read,
        total: recipients.length
      };
    }

    return {
      state: "sent",
      delivered,
      read,
      total: recipients.length
    };
  }

  function applyStatus(row, message, state) {
    let element = row.querySelector(
      ":scope .saino-message-status"
    );

    if (!element) {
      element = document.createElement("span");
      element.className = "saino-message-status";
      element.setAttribute("aria-live", "polite");

      row.querySelector(".saino-message-meta")
        ?.appendChild(element);
    }

    if (!element) return;

    element.dataset.state = state.state;
    element.dataset.messageId = message.id;

    element.textContent =
      state.state === "sent" ? "✓" : "✓✓";

    const label = receiptLabel(
      state.state,
      state.total
    );

    const details =
      activeConversation?.type === "group" && state.total
        ? ` · ${state.read}/${state.total} ${t("read", "पढे")}, ${state.delivered}/${state.total} ${t("delivered", "पुगे")}`
        : "";

    element.title = label + details;

    element.setAttribute(
      "aria-label",
      label + details
    );
  }

  async function syncReceipts() {
    const conversation = activeConversation;
    const host = getHost();
    const service = messenger();

    if (
      !conversation?.id ||
      !host ||
      !service?.getMessages
    ) return;

    const token = ++requestToken;

    const result = await service.getMessages(
      conversation.id,
      { limit: 50 }
    );

    if (
      token !== requestToken ||
      !result?.ok ||
      !Array.isArray(result.data)
    ) return;

    const rows = Array.from(
      host.querySelectorAll(".saino-message-row")
    );

    const messages = result.data;

    if (!rows.length || rows.length !== messages.length) {
      return;
    }

    const outgoing = [];

    messages.forEach((message, index) => {
      const row = rows[index];

      if (!row || !message?.id) return;

      row.dataset.messageId = message.id;

      if (message.fromMe) {
        outgoing.push(message);
      } else {
        row.querySelector(
          ".saino-message-status"
        )?.remove();
      }
    });

    if (!outgoing.length) return;

    const client = auth()?.getClient?.();

    if (!client) return;

    const ids = outgoing.map(message => message.id);

    const { data, error } = await client
      .from("message_receipts")
      .select("message_id,user_id,delivered_at,read_at")
      .in("message_id", ids);

    if (token !== requestToken || error) {
      if (error) {
        console.warn(
          "Saino receipt load:",
          error.message
        );
      }

      return;
    }

    const receipts = Array.isArray(data) ? data : [];

    const recipients = (
      conversation.members || []
    )
      .map(member => String(member?.id || ""))
      .filter(id => id && id !== currentUserId);

    outgoing.forEach(message => {
      const row = rows.find(
        item => item.dataset.messageId === message.id
      );

      if (!row) return;

      const state = getReceiptState(
        receipts,
        message.id,
        recipients
      );

      applyStatus(row, message, state);
    });
  }

  function scheduleSync() {
    if (scheduled !== null) {
      global.clearTimeout(scheduled);
    }

    scheduled = global.setTimeout(() => {
      scheduled = null;

      syncReceipts().catch(error => {
        console.warn("Saino receipt UI:", error);
      });
    }, 180);
  }

  function observeMessages() {
    if (observer) {
      observer.disconnect();
    }

    const root = document.getElementById("saino-app");

    if (
      !root ||
      typeof MutationObserver === "undefined"
    ) return;

    observer = new MutationObserver(records => {
      const changed = records.some(record => {
        if (
          record.target?.classList?.contains("saino-messages")
        ) {
          return true;
        }

        return [
          ...record.addedNodes,
          ...record.removedNodes
        ].some(node => {
          if (node.nodeType !== 1) return false;

          return (
            node.matches?.(
              ".saino-message-row, .saino-messages"
            ) ||
            Boolean(
              node.querySelector?.(".saino-message-row")
            )
          );
        });
      });

      if (changed) scheduleSync();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  async function handleRealtimeMessage(event) {
    const detail = event.detail || {};
    const row = detail.message;

    if (
      detail.action !== "realtime-message" ||
      detail.eventType !== "INSERT" ||
      !row?.id ||
      !row?.conversation_id ||
      !currentUserId ||
      row.sender_id === currentUserId
    ) return;

    const service = messenger();

    if (typeof service?.markDelivered !== "function") {
      return;
    }

    const result = await service.markDelivered(row.id);

    if (!result?.ok) {
      console.warn(
        "Saino delivery receipt:",
        result.message
      );
    }
  }

  function onAppReady(event) {
    activeConversation =
      event.detail?.conversation || null;

    currentUserId = String(
      event.detail?.user?.id || ""
    );

    requestToken++;

    observeMessages();
    scheduleSync();
  }

  function start() {
    global.addEventListener(
      "saino:app-ready",
      onAppReady
    );

    global.addEventListener(
      "ksk:auth-change",
      event => {
        if (!event.detail?.user) {
          activeConversation = null;
          currentUserId = "";
          requestToken++;

          if (observer) {
            observer.disconnect();
          }
        }
      }
    );

    global.addEventListener(
      "ksk:messages-cloud-change",
      event => {
        const action = event.detail?.action;

        if (action === "realtime-message") {
          handleRealtimeMessage(event).catch(error => {
            console.warn(
              "Saino delivery receipt:",
              error
            );
          });
        }

        if ([
          "message-sent",
          "message-edited",
          "message-deleted",
          "realtime-message",
          "realtime-receipt",
          "message-delivered",
          "conversation-read"
        ].includes(action)) {
          scheduleSync();
        }
      }
    );

    global.addEventListener(
      "saino:conversation-select",
      scheduleSync
    );
  }

  start();

  global.SainoMessageReceiptsUI = Object.freeze({
    refresh: scheduleSync
  });

})(window);
