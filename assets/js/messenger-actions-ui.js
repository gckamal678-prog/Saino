
/* Saino Messenger Actions UI */
(function (global) {
  "use strict";

  if (global.SainoMessengerActions) return;

  const messagesApi = () => global.KSKSupabaseMessages;
  const authApi = () => global.KSKSupabaseAuth;

  let activeConversationId = "";
  let activeUserId = "";
  let refreshTimer = null;
  let decorating = false;
  let observer = null;

  function notify(message) {
    global.alert(message);
  }

  function getHost() {
    if (!activeConversationId) return null;

    return document.querySelector(
      `.saino-messages[data-saino-messages="${CSS.escape(activeConversationId)}"]`
    );
  }

  function closeMenus(except) {
    document.querySelectorAll(
      ".saino-message-actions-menu"
    ).forEach(menu => {
      if (menu !== except) {
        menu.hidden = true;

        menu.parentElement
          ?.querySelector(".saino-message-actions-trigger")
          ?.setAttribute("aria-expanded", "false");
      }
    });
  }

  function menuMarkup(message) {
    const own = message.fromMe === true;

    const textOnly =
      (message.type || "text") === "text";

    const deleted = Boolean(
      message.deletedAt ||
      message.deletedForEveryone
    );

    if (deleted) return "";

    return `
      <div class="saino-message-actions">

        <button
          type="button"
          class="saino-message-actions-trigger"
          aria-label="Message actions"
          title="Message actions"
          aria-expanded="false"
        >⋮</button>

        <div class="saino-message-actions-menu" hidden>

          ${textOnly ? `
            <button
              type="button"
              data-message-action="copy"
            >Copy</button>
          ` : ""}

          ${own && textOnly ? `
            <button
              type="button"
              data-message-action="edit"
            >Edit</button>
          ` : ""}

          ${textOnly ? `
            <button
              type="button"
              data-message-action="forward"
            >Forward</button>
          ` : ""}

          <button
            type="button"
            data-message-action="delete-me"
          >Delete for me</button>

          ${own && textOnly ? `
            <button
              type="button"
              class="is-danger"
              data-message-action="delete-everyone"
            >Delete for everyone</button>
          ` : ""}

        </div>
      </div>
    `;
  }

  function applyMessageMetadata(row, message) {
    row.dataset.messageId = message.id;
    row.dataset.sainoMessageId = message.id;

    row.dataset.messageFromMe = String(
      Boolean(message.fromMe)
    );

    row.dataset.messageType =
      message.type || "text";

    row.dataset.messageDeleted = String(
      Boolean(
        message.deletedAt ||
        message.deletedForEveryone
      )
    );
  }

  async function applyDeletedForMe(rows) {
    const client = authApi()?.getClient?.();

    if (!client || !activeUserId) return;

    const ids = rows
      .map(row => row.dataset.messageId)
      .filter(Boolean);

    if (!ids.length) return;

    const { data, error } = await client
      .from("message_user_deletions")
      .select("message_id")
      .eq("user_id", activeUserId)
      .in("message_id", ids);

    if (error) {
      console.warn(
        "Saino message deletion lookup failed:",
        error
      );
      return;
    }

    const hiddenIds = new Set(
      (data || []).map(item => item.message_id)
    );

    rows.forEach(row => {
      if (hiddenIds.has(row.dataset.messageId)) {
        row.hidden = true;
      }
    });
  }

  async function decorateMessages() {
    if (decorating) return;

    const host = getHost();
    const api = messagesApi();

    if (
      !host ||
      !api?.getMessages ||
      !activeUserId
    ) {
      return;
    }

    const rows = [
      ...host.querySelectorAll(":scope > .saino-message-row")
    ];

    if (!rows.length) return;

    decorating = true;

    try {
      const unassigned = rows.filter(
        row => !row.dataset.messageId
      );

      /*
       * Positional mapping only when every row is unmapped.
       * This prevents old paginated messages being attached
       * to the wrong latest message.
       */
      if (unassigned.length === rows.length) {
        const result = await api.getMessages(
          activeConversationId,
          { limit: 50 }
        );

        if (
          !result?.ok ||
          !Array.isArray(result.data) ||
          result.data.length !== rows.length ||
          host !== getHost()
        ) {
          return;
        }

        rows.forEach((row, index) => {
          applyMessageMetadata(
            row,
            result.data[index]
          );
        });
      }

      rows.forEach(row => {
        const article = row.querySelector(
          ".saino-message"
        );

        if (!article) return;

        const deleted =
          row.dataset.messageDeleted === "true";

        if (deleted) {
          article.querySelector(
            ".saino-message-actions"
          )?.remove();

          return;
        }

        if (
          article.querySelector(
            ".saino-message-actions"
          )
        ) {
          return;
        }

        /*
         * History Pagination module ले पुराना messages का
         * metadata पहिल्यै राखेको हुन्छ।
         */
        if (
          !row.dataset.messageId ||
          !row.dataset.messageType
        ) {
          return;
        }

        article.insertAdjacentHTML(
          "beforeend",
          menuMarkup({
            fromMe:
              row.dataset.messageFromMe === "true",

            type: row.dataset.messageType
          })
        );
      });

      await applyDeletedForMe(rows);

    } catch (error) {
      console.error(
        "Saino message actions:",
        error
      );
    } finally {
      decorating = false;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) {
      global.clearTimeout(refreshTimer);
    }

    refreshTimer = global.setTimeout(() => {
      refreshTimer = null;
      decorateMessages();
    }, 180);
  }

  async function copyMessage(messageId) {
    const result = await messagesApi().copyMessage(
      messageId
    );

    if (!result?.ok) {
      notify(
        result?.message ||
        "सन्देश Copy गर्न सकिएन।"
      );
      return;
    }

    notify("सन्देश Copy भयो।");
  }

  async function editMessage(messageId, row) {
    const oldText =
      row.querySelector(".saino-message-text")
        ?.textContent || "";

    const updated = global.prompt(
      "सन्देश सम्पादन गर्नुहोस्:",
      oldText
    );

    if (updated === null) return;

    const value = updated.trim();

    if (!value) {
      notify("खाली सन्देश राख्न मिल्दैन।");
      return;
    }

    if (value === oldText.trim()) return;

    const result = await messagesApi().editMessage(
      messageId,
      value
    );

    if (!result?.ok) {
      notify(
        result?.message ||
        "सन्देश सम्पादन गर्न सकिएन।"
      );
      return;
    }

    global.SainoApp?.refreshMessages?.();
  }

  async function forwardMessage(messageId) {
    const api = messagesApi();

    const result = await api.getConversations();

    if (
      !result?.ok ||
      !Array.isArray(result.data)
    ) {
      notify(
        result?.message ||
        "च्याट सूची लोड गर्न सकिएन।"
      );
      return;
    }

    const conversations = result.data.filter(
      item => item.id !== activeConversationId
    );

    if (!conversations.length) {
      notify("Forward गर्न अर्को च्याट उपलब्ध छैन।");
      return;
    }

    const choices = conversations.map(
      (item, index) => {
        const name =
          item.name ||
          item.title ||
          "च्याट";

        return `${index + 1}. ${name}`;
      }
    ).join("\n");

    const answer = global.prompt(
      "कुन च्याटमा Forward गर्ने?\n\n" +
      choices +
      "\n\nनम्बर लेख्नुहोस्:"
    );

    if (answer === null) return;

    const index = Number(answer) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= conversations.length
    ) {
      notify("मान्य च्याट नम्बर छान्नुहोस्।");
      return;
    }

    const target = conversations[index];

    const forwarded = await api.forwardMessage(
      messageId,
      target.id
    );

    if (!forwarded?.ok) {
      notify(
        forwarded?.message ||
        "Forward गर्न सकिएन।"
      );
      return;
    }

    notify("सन्देश Forward भयो।");
  }

  async function deleteForMe(messageId, row) {
    if (!global.confirm(
      "यो सन्देश तपाईंको च्याटबाट हटाउने?"
    )) {
      return;
    }

    const client = authApi()?.getClient?.();

    if (!client || !activeUserId) {
      notify("लगइन जानकारी प्राप्त भएन।");
      return;
    }

    const { error } = await client
      .from("message_user_deletions")
      .upsert({
        message_id: messageId,
        user_id: activeUserId
      }, {
        onConflict: "user_id,message_id"
      });

    if (error) {
      notify(
        error.message ||
        "सन्देश हटाउन सकिएन।"
      );
      return;
    }

    row.hidden = true;
  }

  async function deleteForEveryone(messageId) {
    if (!global.confirm(
      "यो सन्देश सबैका लागि हटाउने? यो कार्य फिर्ता गर्न मिल्दैन।"
    )) {
      return;
    }

    const result = await messagesApi().deleteMessage(
      messageId,
      true
    );

    if (!result?.ok) {
      notify(
        result?.message ||
        "सन्देश हटाउन सकिएन।"
      );
      return;
    }

    global.SainoApp?.refreshMessages?.();
  }

  async function handleClick(event) {
    const trigger = event.target.closest(
      ".saino-message-actions-trigger"
    );

    if (trigger) {
      event.preventDefault();
      event.stopPropagation();

      const menu = trigger.parentElement?.querySelector(
        ".saino-message-actions-menu"
      );

      if (!menu) return;

      const willOpen = menu.hidden;

      closeMenus(menu);

      menu.hidden = !willOpen;

      trigger.setAttribute(
        "aria-expanded",
        String(willOpen)
      );

      return;
    }

    const button = event.target.closest(
      "[data-message-action]"
    );

    if (!button) {
      if (!event.target.closest(
        ".saino-message-actions"
      )) {
        closeMenus();
      }

      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const row = button.closest(
      ".saino-message-row"
    );

    const messageId = row?.dataset.messageId;
    const action = button.dataset.messageAction;

    closeMenus();

    if (!messageId || !row) return;

    button.disabled = true;

    try {
      if (action === "copy") {
        await copyMessage(messageId);
      } else if (action === "edit") {
        await editMessage(messageId, row);
      } else if (action === "forward") {
        await forwardMessage(messageId);
      } else if (action === "delete-me") {
        await deleteForMe(messageId, row);
      } else if (action === "delete-everyone") {
        await deleteForEveryone(messageId);
      }
    } catch (error) {
      notify(
        error?.message ||
        "कार्य पूरा गर्न सकिएन।"
      );
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  function setActiveConversation(detail = {}) {
    activeConversationId =
      detail.conversation?.id || "";

    activeUserId =
      detail.user?.id ||
      authApi()?.getUser?.()?.id ||
      "";

    scheduleRefresh();
  }

  global.addEventListener(
    "saino:app-ready",
    event => {
      setActiveConversation(event.detail || {});
    }
  );

  global.addEventListener(
    "saino:conversation-select",
    event => {
      const conversation =
        event.detail?.conversation;

      if (!conversation) return;

      activeConversationId = conversation.id || "";

      activeUserId =
        authApi()?.getUser?.()?.id || "";

      scheduleRefresh();
    }
  );

  global.addEventListener(
    "ksk:messages-cloud-change",
    event => {
      const action = event.detail?.action;

      if ([
        "message-sent",
        "message-edited",
        "message-deleted",
        "realtime-message"
      ].includes(action)) {
        scheduleRefresh();
      }
    }
  );

  document.addEventListener(
    "click",
    handleClick
  );

  function observeApp() {
    const root = document.getElementById(
      "saino-app"
    );

    if (!root || observer) return;

    observer = new MutationObserver(records => {
      const rowAdded = records.some(record =>
        [...record.addedNodes].some(node => {
          if (node.nodeType !== 1) return false;

          return (
            node.matches?.(".saino-message-row") ||
            Boolean(
              node.querySelector?.(".saino-message-row")
            )
          );
        })
      );

      if (rowAdded) {
        scheduleRefresh();
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      observeApp,
      { once: true }
    );
  } else {
    observeApp();
  }

  global.SainoMessengerActions = Object.freeze({
    refresh: decorateMessages
  });

})(window);
