
/* Saino Messenger Actions UI */
(function (global) {
  "use strict";

  if (global.SainoMessengerActions) return;

  const messagesApi = () => global.KSKSupabaseMessages;
  const authApi = () => global.KSKSupabaseAuth;

  let activeConversationId = "";
  let activeUserId = "";
  let refreshQueued = false;

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function notify(message) {
    global.alert(message);
  }

  function getHost() {
    if (!activeConversationId) return null;

    return document.querySelector(
      `[data-saino-messages="${CSS.escape(activeConversationId)}"]`
    );
  }

  function closeMenus(except) {
    document.querySelectorAll(".saino-message-actions-menu").forEach(menu => {
      if (menu !== except) menu.hidden = true;
    });
  }

  function menuMarkup(message) {
    const own = message.fromMe === true;
    const textOnly = (message.type || "text") === "text";
    const deleted = Boolean(message.deletedAt || message.deletedForEveryone);

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
            <button type="button" data-message-action="copy">Copy</button>
          ` : ""}

          ${own && textOnly ? `
            <button type="button" data-message-action="edit">Edit</button>
          ` : ""}

          ${textOnly ? `
            <button type="button" data-message-action="forward">Forward</button>
          ` : ""}

          <button type="button" data-message-action="delete-me">
            Delete for me
          </button>

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

  
  async function decorateMessages() {
    const host = getHost();
    const api = messagesApi();

    if (!host || !api?.getMessages || !activeUserId) return;

    const rows = [...host.querySelectorAll(".saino-message-row")];

    if (!rows.length) return;

    const result = await api.getMessages(activeConversationId, {
      limit: 50
    });

    if (!result?.ok || !Array.isArray(result.data)) return;

    const messages = result.data;

    rows.forEach((row, index) => {
      const message = messages[index];
      if (!message) return;

      row.dataset.messageId = message.id;

      const article = row.querySelector(".saino-message");
      if (!article) return;

      const existingMenu = article.querySelector(
        ".saino-message-actions"
      );

      const deleted = Boolean(
        message.deletedAt || message.deletedForEveryone
      );

      if (deleted) {
        existingMenu?.remove();
        return;
      }

      // पहिले नै मेनु छ भने फेरि नबनाउने।
      // यसले MutationObserver को अनावश्यक refresh loop रोक्छ।
      if (!existingMenu) {
        article.insertAdjacentHTML(
          "beforeend",
          menuMarkup(message)
        );
      }
    });

    await applyDeletedForMe(rows);
  }


  async function applyDeletedForMe(rows) {
    const auth = authApi();
    const client = auth?.getClient?.();

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
      console.warn("Saino message deletion lookup failed:", error);
      return;
    }

    const hiddenIds = new Set((data || []).map(item => item.message_id));

    rows.forEach(row => {
      if (hiddenIds.has(row.dataset.messageId)) {
        row.hidden = true;
      }
    });
  }

  function scheduleRefresh() {
    if (refreshQueued) return;

    refreshQueued = true;

    global.setTimeout(() => {
      refreshQueued = false;
      decorateMessages().catch(error => {
        console.error("Saino message actions:", error);
      });
    }, 150);
  }

  async function copyMessage(messageId) {
    const result = await messagesApi().copyMessage(messageId);

    if (!result?.ok) {
      notify(result?.message || "सन्देश Copy गर्न सकिएन।");
      return;
    }

    notify("सन्देश Copy भयो।");
  }

  async function editMessage(messageId, row) {
    const textNode = row.querySelector(".saino-message-text");
    const oldText = textNode?.textContent || "";

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

    const result = await messagesApi().editMessage(messageId, value);

    if (!result?.ok) {
      notify(result?.message || "सन्देश सम्पादन गर्न सकिएन।");
      return;
    }

    global.SainoApp?.refreshMessages?.();
  }

  async function forwardMessage(messageId) {
    const api = messagesApi();

    const result = await api.getConversations();

    if (!result?.ok || !Array.isArray(result.data)) {
      notify(result?.message || "च्याट सूची लोड गर्न सकिएन।");
      return;
    }

    const conversations = result.data.filter(
      item => item.id !== activeConversationId
    );

    if (!conversations.length) {
      notify("Forward गर्न अर्को च्याट उपलब्ध छैन।");
      return;
    }

    const choices = conversations.map((item, index) => {
      const name = item.title ||
        item.name ||
        (item.type === "group" ? "Group chat" : "Direct chat");

      return `${index + 1}. ${name}`;
    }).join("\n");

    const answer = global.prompt(
      "कुन च्याटमा Forward गर्ने?\n\n" +
      choices +
      "\n\nनम्बर लेख्नुहोस्:"
    );

    if (answer === null) return;

    const selectedIndex = Number(answer) - 1;

    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= conversations.length
    ) {
      notify("मान्य च्याट नम्बर छान्नुहोस्।");
      return;
    }

    const target = conversations[selectedIndex];

    const forwarded = await api.forwardMessage(
      messageId,
      target.id
    );

    if (!forwarded?.ok) {
      notify(forwarded?.message || "Forward गर्न सकिएन।");
      return;
    }

    notify("सन्देश Forward भयो।");
  }

  async function deleteForMe(messageId, row) {
    if (!global.confirm("यो सन्देश तपाईंको च्याटबाट हटाउने?")) {
      return;
    }

    const auth = authApi();
    const client = auth?.getClient?.();

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
      notify(error.message || "सन्देश हटाउन सकिएन।");
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
      notify(result?.message || "सन्देश हटाउन सकिएन।");
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

      const menu = trigger.parentElement.querySelector(
        ".saino-message-actions-menu"
      );

      const willOpen = menu.hidden;

      closeMenus(menu);
      menu.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
      return;
    }

    const actionButton = event.target.closest(
      "[data-message-action]"
    );

    if (!actionButton) {
      if (!event.target.closest(".saino-message-actions")) {
        closeMenus();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const row = actionButton.closest(".saino-message-row");
    const messageId = row?.dataset.messageId;
    const action = actionButton.dataset.messageAction;

    closeMenus();

    if (!messageId || !row) return;

    actionButton.disabled = true;

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
      notify(error?.message || "कार्य पूरा गर्न सकिएन।");
    } finally {
      if (actionButton.isConnected) {
        actionButton.disabled = false;
      }
    }
  }

  function setActiveConversation(detail = {}) {
    const conversation = detail.conversation || {};

    activeConversationId = conversation.id || "";
    activeUserId = detail.user?.id ||
      authApi()?.getUser?.()?.id ||
      "";

    scheduleRefresh();
  }

  global.addEventListener("saino:app-ready", event => {
    setActiveConversation(event.detail || {});
  });

  global.addEventListener("ksk:messages-cloud-change", event => {
    const action = event.detail?.action;

    if (
      [
        "message-sent",
        "message-edited",
        "message-deleted",
        "realtime-message"
      ].includes(action)
    ) {
      scheduleRefresh();
    }
  });

  global.addEventListener("saino:conversation-select", event => {
    const conversation = event.detail?.conversation;
    if (!conversation) return;

    activeConversationId = conversation.id || "";
    activeUserId = authApi()?.getUser?.()?.id || "";

    scheduleRefresh();
  });

  document.addEventListener("click", handleClick);

  const observer = new MutationObserver(() => {
    if (getHost()) scheduleRefresh();
  });

  function startObserver() {
    const root = document.querySelector("#saino-app");

    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }

  global.SainoMessengerActions = Object.freeze({
    refresh: decorateMessages
  });

})(window);
