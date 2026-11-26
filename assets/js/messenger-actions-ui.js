
/* Saino Messenger - WhatsApp-style long-press message actions */
(function (global) {
  "use strict";

  if (global.SainoMessengerActions) return;

  const api = () => global.KSKSupabaseMessages;
  const auth = () => global.KSKSupabaseAuth;

  const LONG_PRESS_MS = 520;
  const MOVE_CANCEL_PX = 12;

  let conversationId = "";
  let userId = "";
  let selectedIds = new Set();
  let messageMap = new Map();
  let host = null;
  let toolbar = null;
  let longPressTimer = null;
  let pointerStart = null;
  let suppressClick = false;
  let refreshTimer = null;
  let loadingMessages = false;
  let actionBusy = false;

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const t = (en, ne) => isEnglish() ? en : ne;

  function notify(message) {
    global.alert(message);
  }

  function currentHost() {
    if (!conversationId) return null;

    return document.querySelector(
      `[data-saino-messages="${CSS.escape(conversationId)}"]`
    );
  }

  function rows() {
    return host
      ? [...host.querySelectorAll(".saino-message-row")]
      : [];
  }

  function rowId(row) {
    return row?.dataset.messageId ||
      row?.dataset.sainoMessageId ||
      "";
  }

  function getMessage(id) {
    return messageMap.get(id) || null;
  }

  function selectedRows() {
    return rows().filter(row =>
      selectedIds.has(rowId(row))
    );
  }

  function ensureToolbar() {
    const panel = host?.closest(".saino-conversation");

    if (!panel) return null;

    if (
      toolbar?.isConnected &&
      toolbar.parentElement === panel
    ) {
      return toolbar;
    }

    toolbar?.remove();

    toolbar = document.createElement("div");
    toolbar.className = "saino-selection-toolbar";
    toolbar.hidden = true;
    toolbar.setAttribute("role", "toolbar");

    toolbar.setAttribute(
      "aria-label",
      t("Selected message actions", "छानिएका सन्देशका कार्यहरू")
    );

    toolbar.innerHTML = `
      <button
        type="button"
        data-saino-select-action="cancel"
        class="saino-selection-close"
        aria-label="${t("Cancel selection", "छनोट हटाउनुहोस्")}"
      >×</button>

      <span class="saino-selection-count" aria-live="polite">1</span>

      <span class="saino-selection-spacer"></span>

      <button
        type="button"
        data-saino-select-action="reply"
        aria-label="${t("Reply", "जवाफ")}"
        title="${t("Reply", "जवाफ")}"
      >↩</button>

      <button
        type="button"
        data-saino-select-action="copy"
        aria-label="${t("Copy", "कपी")}"
        title="${t("Copy", "कपी")}"
      >▢</button>

      <button
        type="button"
        data-saino-select-action="forward"
        aria-label="${t("Forward", "फर्वार्ड")}"
        title="${t("Forward", "फर्वार्ड")}"
      >➦</button>

      <button
        type="button"
        data-saino-select-action="edit"
        aria-label="${t("Edit", "सम्पादन")}"
        title="${t("Edit", "सम्पादन")}"
      >✎</button>

      <button
        type="button"
        data-saino-select-action="delete"
        aria-label="${t("Delete", "हटाउनुहोस्")}"
        title="${t("Delete", "हटाउनुहोस्")}"
      >⌫</button>
    `;

    const messages = panel.querySelector(".saino-messages");

    if (messages) {
      panel.insertBefore(toolbar, messages);
    } else {
      panel.insertBefore(toolbar, panel.firstChild);
    }

    return toolbar;
  }

  function updateToolbar() {
    const bar = ensureToolbar();

    if (!bar) return;

    const count = selectedIds.size;

    bar.hidden = count === 0;

    bar.querySelector(
      ".saino-selection-count"
    ).textContent = String(count);

    const selected = selectedRows();

    const first = selected.length === 1
      ? getMessage(rowId(selected[0]))
      : null;

    const enabled = {
      reply: selected.length === 1,

      copy:
        selected.length === 1 &&
        first &&
        (first.type || "text") === "text",

      edit:
        selected.length === 1 &&
        first?.fromMe &&
        (first.type || "text") === "text" &&
        !first.deletedForEveryone,

      forward:
        selected.length === 1 &&
        first &&
        !first.deletedForEveryone,

      delete: selected.length > 0
    };

    bar.querySelectorAll(
      "[data-saino-select-action]"
    ).forEach(button => {
      const action = button.dataset.sainoSelectAction;

      if (action in enabled) {
        button.disabled = !enabled[action] || actionBusy;
      } else {
        button.disabled = actionBusy;
      }
    });

    selected.forEach(row => {
      row.classList.add("saino-message-selected");
    });

    rows()
      .filter(row => !selectedIds.has(rowId(row)))
      .forEach(row => {
        row.classList.remove("saino-message-selected");
      });
  }

  function clearSelection() {
    selectedIds.clear();

    rows().forEach(row => {
      row.classList.remove("saino-message-selected");
    });

    if (toolbar) toolbar.hidden = true;

    updateToolbar();
  }

  function toggleSelection(id) {
    if (!id) return;

    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }

    const row = rows().find(item => rowId(item) === id);

    row?.classList.toggle(
      "saino-message-selected",
      selectedIds.has(id)
    );

    if (!selectedIds.size) {
      if (toolbar) toolbar.hidden = true;
    } else {
      updateToolbar();
    }
  }

  function cancelLongPress() {
    if (longPressTimer !== null) {
      global.clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    pointerStart = null;
  }

  function startLongPress(event) {
    const row = event.target.closest(".saino-message-row");

    if (!row || !host?.contains(row)) return;

    if (
      event.target.closest(
        "button,a,input,textarea,video"
      )
    ) {
      return;
    }

    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    cancelLongPress();

    pointerStart = {
      x: event.clientX,
      y: event.clientY,
      id: rowId(row)
    };

    longPressTimer = global.setTimeout(() => {
      longPressTimer = null;

      if (!pointerStart?.id) return;

      suppressClick = true;

      toggleSelection(pointerStart.id);

      pointerStart = null;
    }, LONG_PRESS_MS);
  }

  function moveLongPress(event) {
    if (!pointerStart) return;

    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;

    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      cancelLongPress();
    }
  }

  function handleContextMenu(event) {
    const row = event.target.closest(".saino-message-row");

    if (!row || !host?.contains(row)) return;

    event.preventDefault();

    cancelLongPress();

    toggleSelection(rowId(row));
  }

  function handleRowClick(event) {
    const row = event.target.closest(".saino-message-row");

    if (!row || !host?.contains(row)) return;

    if (suppressClick) {
      suppressClick = false;

      event.preventDefault();
      event.stopPropagation();

      return;
    }

    if (
      selectedIds.size &&
      !event.target.closest("button,a,video")
    ) {
      event.preventDefault();
      event.stopPropagation();

      toggleSelection(rowId(row));
    }
  }

  async function refreshMessageMap() {
    const current = currentHost();

    if (
      !current ||
      loadingMessages ||
      !api()?.getMessages
    ) {
      return;
    }

    host = current;
    loadingMessages = true;

    const requestedConversation = conversationId;

    try {
      const result = await api().getMessages(
        requestedConversation,
        { limit: 50 }
      );

      if (
        !result?.ok ||
        !Array.isArray(result.data) ||
        requestedConversation !== conversationId ||
        host !== currentHost()
      ) {
        return;
      }

      messageMap = new Map(
        result.data.map(message => [
          message.id,
          message
        ])
      );

      const currentRows = rows();

      /*
       * App.js र Messenger API दुवैले सन्देश
       * पुरानोबाट नयाँ क्रममा राख्छन्।
       */
      if (currentRows.length === result.data.length) {
        currentRows.forEach((row, index) => {
          const message = result.data[index];

          row.dataset.messageId = message.id;
          row.dataset.sainoMessageId = message.id;

          row.dataset.messageFromMe = String(
            Boolean(message.fromMe)
          );

          row.dataset.messageType =
            message.type || "text";
        });
      }

      selectedIds = new Set(
        [...selectedIds].filter(id =>
          messageMap.has(id) ||
          currentRows.some(row => rowId(row) === id)
        )
      );

      updateToolbar();

    } catch (error) {
      console.warn(
        "Saino message actions refresh:",
        error
      );
    } finally {
      loadingMessages = false;
    }
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) {
      global.clearTimeout(refreshTimer);
    }

    refreshTimer = global.setTimeout(() => {
      refreshTimer = null;
      refreshMessageMap();
    }, 180);
  }

  async function copySelected() {
    const selected = selectedRows();

    if (selected.length !== 1) return;

    const id = rowId(selected[0]);
    const message = getMessage(id);

    if (
      !message ||
      (message.type || "text") !== "text"
    ) {
      return;
    }

    const result = await api().copyMessage(id);

    if (!result?.ok) {
      throw new Error(
        result?.message ||
        t("Could not copy message.", "सन्देश कपी गर्न सकिएन।")
      );
    }

    notify(t("Copied", "कपी भयो"));

    clearSelection();
  }

  async function editSelected() {
    const selected = selectedRows();

    if (selected.length !== 1) return;

    const row = selected[0];
    const id = rowId(row);
    const message = getMessage(id);

    if (
      !message?.fromMe ||
      (message.type || "text") !== "text"
    ) {
      return;
    }

    const input = global.prompt(
      t("Edit message", "सन्देश सम्पादन गर्नुहोस्"),
      message.text || ""
    );

    if (input === null) return;

    const content = input.trim();

    if (!content) {
      notify(
        t(
          "Message cannot be empty.",
          "खाली सन्देश राख्न मिल्दैन।"
        )
      );
      return;
    }

    if (content === String(message.text || "").trim()) {
      return clearSelection();
    }

    const result = await api().editMessage(id, content);

    if (!result?.ok) {
      throw new Error(
        result?.message ||
        t("Could not edit message.", "सम्पादन गर्न सकिएन।")
      );
    }

    clearSelection();

    await global.SainoApp?.refreshMessages?.();
  }

  async function forwardSelected() {
    const selected = selectedRows();

    if (selected.length !== 1) return;

    const id = rowId(selected[0]);
    const apiRef = api();

    const result = await apiRef.getConversations();

    if (
      !result?.ok ||
      !Array.isArray(result.data)
    ) {
      throw new Error(
        result?.message ||
        t("Could not load chats.", "च्याट सूची लोड गर्न सकिएन।")
      );
    }

    const targets = result.data.filter(
      item => item.id !== conversationId
    );

    if (!targets.length) {
      return notify(
        t(
          "No other chat is available.",
          "अर्को च्याट उपलब्ध छैन।"
        )
      );
    }

    const labels = targets.map((item, index) =>
      `${index + 1}. ${
        item.title ||
        item.name ||
        (item.type === "group" ? "Group" : "Chat")
      }`
    ).join("\n");

    const answer = global.prompt(
      t(
        "Forward to which chat?\n\n",
        "कुन च्याटमा फर्वार्ड गर्ने?\n\n"
      ) +
      labels +
      t(
        "\n\nEnter number:",
        "\n\nनम्बर लेख्नुहोस्:"
      )
    );

    if (answer === null) return;

    const index = Number(answer) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= targets.length
    ) {
      return notify(
        t("Invalid chat number.", "च्याट नम्बर मिलेन।")
      );
    }

    const forwarded = await apiRef.forwardMessage(
      id,
      targets[index].id
    );

    if (!forwarded?.ok) {
      throw new Error(
        forwarded?.message ||
        t("Could not forward message.", "फर्वार्ड गर्न सकिएन।")
      );
    }

    clearSelection();

    notify(t("Message forwarded.", "सन्देश फर्वार्ड भयो।"));
  }

  function replySelected() {
    const selected = selectedRows();

    if (selected.length !== 1) return;

    const row = selected[0];

    const replyButton = row.querySelector(
      ".saino-message-reply-button"
    );

    if (!replyButton) {
      notify(
        t(
          "Reply is still loading. Try again in a moment.",
          "Reply सुविधा लोड हुँदैछ, केहीबेरपछि फेरि प्रयास गर्नुहोस्।"
        )
      );
      return;
    }

    clearSelection();

    replyButton.click();
  }

  function showDeleteChoices() {
    const selected = selectedRows();

    if (!selected.length) return;

    const firstMessage = selected.length === 1
      ? getMessage(rowId(selected[0]))
      : null;

    const canDeleteEveryone =
      selected.length === 1 &&
      firstMessage?.fromMe;

    const overlay = document.createElement("div");

    overlay.className = "saino-delete-dialog-backdrop";

    overlay.innerHTML = `
      <div
        class="saino-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saino-delete-title"
      >
        <strong id="saino-delete-title">
          ${t("Delete message", "सन्देश हटाउनुहोस्")}
        </strong>

        <p>
          ${t(
            "Choose who this message should be deleted for.",
            "यो सन्देश कसका लागि हटाउने छान्नुहोस्।"
          )}
        </p>

        <button type="button" data-delete-choice="me">
          ${t("Delete for me", "मेरो लागि हटाउनुहोस्")}
        </button>

        ${canDeleteEveryone ? `
          <button
            type="button"
            data-delete-choice="everyone"
            class="is-danger"
          >
            ${t("Delete for everyone", "सबैका लागि हटाउनुहोस्")}
          </button>
        ` : ""}

        <button
          type="button"
          data-delete-choice="cancel"
          class="is-cancel"
        >
          ${t("Cancel", "रद्द गर्नुहोस्")}
        </button>
      </div>
    `;

    overlay.addEventListener("click", async event => {
      if (
        event.target === overlay ||
        event.target.closest('[data-delete-choice="cancel"]')
      ) {
        overlay.remove();
        return;
      }

      const choice = event.target
        .closest("[data-delete-choice]")
        ?.dataset.deleteChoice;

      if (!choice || choice === "cancel") return;

      overlay.remove();

      await deleteSelected(choice);
    });

    document.body.appendChild(overlay);
  }

  async function deleteSelected(choice) {
    const selected = selectedRows();

    if (!selected.length || actionBusy) return;

    actionBusy = true;
    updateToolbar();

    try {
      if (choice === "everyone") {
        if (selected.length !== 1) {
          throw new Error(
            t(
              "Delete for everyone is available for one message at a time.",
              "सबैका लागि एकपटकमा एउटा सन्देश मात्र हटाउन मिल्छ।"
            )
          );
        }

        const id = rowId(selected[0]);

        const result = await api().deleteMessage(id, true);

        if (!result?.ok) {
          throw new Error(
            result?.message ||
            t("Could not delete message.", "सन्देश हटाउन सकिएन।")
          );
        }

      } else {
        const client = auth()?.getClient?.();

        if (!client || !userId) {
          throw new Error(
            t(
              "Login information is unavailable.",
              "लगइन जानकारी उपलब्ध छैन।"
            )
          );
        }

        const records = selected.map(row => ({
          message_id: rowId(row),
          user_id: userId
        }));

        const { error } = await client
          .from("message_user_deletions")
          .upsert(records, {
            onConflict: "user_id,message_id"
          });

        if (error) throw error;
      }

      clearSelection();

      await global.SainoApp?.refreshMessages?.();

    } catch (error) {
      notify(
        error?.message ||
        t("Could not delete message.", "सन्देश हटाउन सकिएन।")
      );

    } finally {
      actionBusy = false;
      updateToolbar();
    }
  }

  async function handleToolbarAction(action) {
    if (action === "cancel") {
      clearSelection();
      return;
    }

    if (actionBusy) return;

    try {
      if (action === "reply") {
        replySelected();
      } else if (action === "copy") {
        await copySelected();
      } else if (action === "forward") {
        await forwardSelected();
      } else if (action === "edit") {
        await editSelected();
      } else if (action === "delete") {
        showDeleteChoices();
      }

    } catch (error) {
      notify(
        error?.message ||
        t("Action failed.", "कार्य पूरा हुन सकेन।")
      );
    }
  }

  function handleDocumentClick(event) {
    const actionButton = event.target.closest(
      "[data-saino-select-action]"
    );

    if (actionButton && toolbar?.contains(actionButton)) {
      event.preventDefault();
      event.stopPropagation();

      handleToolbarAction(
        actionButton.dataset.sainoSelectAction
      );

      return;
    }

    if (!host || !selectedIds.size) return;

    if (event.target.closest(".saino-message-row")) return;

    if (event.target.closest(".saino-selection-toolbar")) return;

    clearSelection();
  }

  function setConversation(detail = {}) {
    conversationId = detail.conversation?.id || "";

    userId =
      detail.user?.id ||
      auth()?.getUser?.()?.id ||
      "";

    selectedIds.clear();
    messageMap.clear();

    host = currentHost();

    toolbar?.remove();
    toolbar = null;

    scheduleRefresh();
  }

  function bindHost(nextHost) {
    if (!nextHost || host === nextHost) return;

    if (host) {
      host.removeEventListener("pointerdown", startLongPress);
      host.removeEventListener("pointermove", moveLongPress);
      host.removeEventListener("pointerup", cancelLongPress);
      host.removeEventListener("pointercancel", cancelLongPress);
      host.removeEventListener("contextmenu", handleContextMenu);
      host.removeEventListener("click", handleRowClick, true);
    }

    host = nextHost;

    host.addEventListener("pointerdown", startLongPress);
    host.addEventListener("pointermove", moveLongPress, {
      passive: true
    });
    host.addEventListener("pointerup", cancelLongPress);
    host.addEventListener("pointercancel", cancelLongPress);
    host.addEventListener("contextmenu", handleContextMenu);
    host.addEventListener("click", handleRowClick, true);

    ensureToolbar();

    scheduleRefresh();
  }

  function observeApp() {
    const root = document.getElementById("saino-app");

    if (!root || typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(records => {
      const nextHost = currentHost();

      if (nextHost && nextHost !== host) {
        bindHost(nextHost);
        return;
      }

      if (nextHost && !toolbar?.isConnected) {
        ensureToolbar();
      }

      const messageRowsChanged = records.some(record => {
        const target = record.target;

        if (target !== host && !host?.contains(target)) {
          return false;
        }

        return [
          ...record.addedNodes,
          ...record.removedNodes
        ].some(node =>
          node.nodeType === 1 && (
            node.matches?.(".saino-message-row") ||
            Boolean(
              node.querySelector?.(".saino-message-row")
            )
          )
        );
      });

      if (messageRowsChanged) {
        scheduleRefresh();
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  global.addEventListener(
    "saino:app-ready",
    event => setConversation(event.detail || {})
  );

  global.addEventListener(
    "saino:conversation-select",
    event => setConversation(event.detail || {})
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

  document.addEventListener("click", handleDocumentClick);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && selectedIds.size) {
      clearSelection();
    }
  });

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
    refresh: scheduleRefresh,
    clearSelection
  });

})(window);
