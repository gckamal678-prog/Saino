
/*
 * SAINO — MESSAGE SEARCH UI
 * Searches messages in the currently open conversation using the existing
 * KSKSupabaseMessages.searchMessages API.
 */
(function (global) {
  "use strict";

  if (global.SainoMessageSearchUI) return;

  let conversation = null;
  let searching = false;
  let requestToken = 0;

  const service = () => global.KSKSupabaseMessages;
  const language = () => global.KSKLanguage;
  const isEnglish = () => language()?.getLanguage?.() === "en";
  const t = (en, ne) => isEnglish() ? en : ne;

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  function getConversationRoot() {
    return document.querySelector(".saino-conversation");
  }

  function getPanel() {
    return getConversationRoot()?.querySelector(".saino-search-panel") || null;
  }

  function showNotice(message, isError = false) {
    const panel = getPanel();
    const status = panel?.querySelector("[data-saino-search-status]");
    if (!status) return;
    status.textContent = message;
    status.dataset.error = isError ? "true" : "false";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString(isEnglish() ? "en" : "ne", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function messagePreview(message) {
    if (message?.text) return message.text;
    if (message?.mediaName) {
      return `${t("Attachment", "फाइल")}: ${message.mediaName}`;
    }
    if (message?.type && message.type !== "text") {
      return t("Media message", "मिडिया सन्देश");
    }
    return t("Message", "सन्देश");
  }

  function renderResults(messages) {
    const panel = getPanel();
    const results = panel?.querySelector("[data-saino-search-results]");
    if (!results) return;

    if (!messages.length) {
      results.innerHTML = `<p class="saino-search-empty">${escapeHTML(
        t("No matching messages found.", "मिल्दो सन्देश भेटिएन।")
      )}</p>`;
      return;
    }

    results.innerHTML = messages.map(message => {
      const preview = messagePreview(message);

      return `
        <button
          class="saino-search-result"
          type="button"
          data-saino-search-message="${escapeHTML(message.id)}"
        >
          <span class="saino-search-result-text">${escapeHTML(preview)}</span>
          <time>${escapeHTML(formatDate(message.createdAt))}</time>
        </button>
      `;
    }).join("");
  }

  function closeSearch() {
    requestToken++;
    searching = false;

    const panel = getPanel();
    if (panel) panel.hidden = true;

    const button = getConversationRoot()?.querySelector(
      "[data-saino-search-toggle]"
    );

    button?.setAttribute("aria-expanded", "false");
  }

  function ensureUI() {
    const root = getConversationRoot();
    if (!root || !conversation?.id) return;

    const actions = root.querySelector(".saino-conversation-actions");
    const header = root.querySelector(".saino-conversation-header");

    if (!actions || !header) return;

    if (!actions.querySelector("[data-saino-search-toggle]")) {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "saino-icon-button saino-search-toggle";
      button.dataset.sainoSearchToggle = "true";
      button.setAttribute(
        "aria-label",
        t("Search messages", "सन्देश खोज्नुहोस्")
      );
      button.setAttribute(
        "title",
        t("Search messages", "सन्देश खोज्नुहोस्")
      );
      button.setAttribute("aria-expanded", "false");
      button.textContent = "⌕";

      actions.appendChild(button);
    }

    if (!root.querySelector(".saino-search-panel")) {
      const panel = document.createElement("section");

      panel.className = "saino-search-panel";
      panel.hidden = true;

      panel.innerHTML = `
        <form class="saino-search-form" data-saino-search-form>
          <input
            type="search"
            name="term"
            minlength="2"
            maxlength="120"
            autocomplete="off"
            placeholder="${escapeHTML(
              t("Search in this chat…", "यो च्याटमा खोज्नुहोस्…")
            )}"
            aria-label="${escapeHTML(
              t("Search messages", "सन्देश खोज्नुहोस्")
            )}"
            required
          >

          <button type="submit" class="saino-search-submit">
            ${escapeHTML(t("Search", "खोज्नुहोस्"))}
          </button>

          <button
            type="button"
            class="saino-search-close"
            data-saino-search-close
            aria-label="${escapeHTML(
              t("Close search", "खोज बन्द गर्नुहोस्")
            )}"
          >×</button>
        </form>

        <p
          class="saino-search-status"
          data-saino-search-status
          aria-live="polite"
        ></p>

        <div
          class="saino-search-results"
          data-saino-search-results
        ></div>
      `;

      header.insertAdjacentElement("afterend", panel);
    }
  }

  async function runSearch(term) {
    const query = String(term || "").trim();

    if (query.length < 2) {
      showNotice(
        t("Enter at least 2 characters.", "कम्तीमा २ अक्षर लेख्नुहोस्।"),
        true
      );
      return;
    }

    const api = service();

    if (!api?.searchMessages) {
      showNotice(
        t("Message search is unavailable.", "सन्देश खोज्ने सुविधा उपलब्ध छैन।"),
        true
      );
      return;
    }

    const token = ++requestToken;
    searching = true;

    showNotice(t("Searching…", "खोजिँदैछ…"));

    const results = getPanel()?.querySelector(
      "[data-saino-search-results]"
    );

    if (results) results.innerHTML = "";

    try {
      const response = await api.searchMessages(
        conversation.id,
        query,
        50
      );

      if (token !== requestToken) return;

      if (!response?.ok) {
        throw new Error(
          response?.message || t("Search failed.", "खोज असफल भयो।")
        );
      }

      const messages = Array.isArray(response.data)
        ? response.data
        : [];

      renderResults(messages);

      showNotice(
        isEnglish()
          ? `${messages.length} result${messages.length === 1 ? "" : "s"}`
          : `${messages.length} वटा नतिजा भेटिए।`
      );

    } catch (error) {
      if (token !== requestToken) return;

      showNotice(
        error?.message ||
          t("Could not search messages.", "सन्देश खोज्न सकिएन।"),
        true
      );

    } finally {
      if (token === requestToken) searching = false;
    }
  }

  function handleClick(event) {
    const toggle = event.target.closest(
      "[data-saino-search-toggle]"
    );

    if (toggle) {
      const panel = getPanel();
      if (!panel) return;

      const open = panel.hidden;
      panel.hidden = !open;

      toggle.setAttribute("aria-expanded", open ? "true" : "false");

      if (open) {
        panel.querySelector('input[name="term"]')?.focus();
      } else {
        closeSearch();
      }

      return;
    }

    if (event.target.closest("[data-saino-search-close]")) {
      closeSearch();
      return;
    }

    const resultButton = event.target.closest(
      "[data-saino-search-message]"
    );

    if (resultButton) {
      const messageId = resultButton.dataset.sainoSearchMessage;

      const row = Array.from(
        document.querySelectorAll(".saino-message-row")
      ).find(item => item.dataset.sainoMessageId === messageId);

      if (row) {
        row.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        row.classList.add("saino-search-result-active");

        global.setTimeout(() => {
          row.classList.remove("saino-search-result-active");
        }, 1800);

      } else {
        showNotice(
          t(
            "This message was found but is not in the currently loaded chat history.",
            "सन्देश भेटियो, तर अहिले लोड भएको च्याट सूचीमा छैन।"
          )
        );
      }
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("[data-saino-search-form]");
    if (!form) return;

    event.preventDefault();

    if (searching) return;

    const term = form.querySelector('input[name="term"]')?.value || "";
    runSearch(term);
  }

  function handleAppReady(event) {
    const nextConversation = event.detail?.conversation || null;
    const nextId = nextConversation?.id || "";
    const previousId = conversation?.id || "";

    conversation = nextConversation;

    if (nextId !== previousId) {
      requestToken++;
      searching = false;
    }

    if (conversation?.id) ensureUI();
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit, true);

  global.addEventListener(
    "saino:app-ready",
    handleAppReady
  );

  global.SainoMessageSearchUI = Object.freeze({
    close: closeSearch
  });

})(window);
