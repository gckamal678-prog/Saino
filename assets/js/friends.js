
"use strict";

/*
 * SAINO — FRIENDS FRONTEND
 * File: assets/js/friends.js
 *
 * Uses:
 * window.KSKSupabaseFriends
 * window.KSKLanguage
 *
 * This module is standalone.
 * It will be connected to index.html later.
 */

(function (global) {
  "use strict";

  if (global.SainoFriends) return;

  const state = {
    host: null,
    tab: "suggestions",
    users: [],
    dashboard: null,
    loading: false,
    searchTerm: "",
    busy: new Set(),
    error: ""
  };

  const service = () => global.KSKSupabaseFriends;
  const language = () => global.KSKLanguage;
  const english = () => language()?.getLanguage?.() === "en";

  function t(key, en, ne) {
    return language()?.t?.(key) || (english() ? en : ne);
  }

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
      const url = new URL(String(value || ""), global.location.href);

      return ["https:", "http:"].includes(url.protocol)
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function showMessage(message, type = "info") {
    if (!state.host) return;

    const box = state.host.querySelector(
      "[data-friends-message]"
    );

    if (!box) return;

    box.textContent = message || "";
    box.dataset.type = type;
    box.hidden = !message;
  }

  function setBusy(key, value) {
    if (value) {
      state.busy.add(key);
    } else {
      state.busy.delete(key);
    }

    render();
  }

  function avatar(user) {
    const name = user?.name || "Saino User";
    const url = safeImageURL(user?.avatarUrl);

    if (url) {
      return `
        <img
          src="${escapeHTML(url)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        >`;
    }

    return escapeHTML(Array.from(name.trim())[0] || "S");
  }

  function button(action, id, label, style = "secondary") {
    const key = `${action}:${id}`;
    const busy = state.busy.has(key);

    return `
      <button
        type="button"
        class="saino-button${style === "primary" ? "" : "-secondary"}"
        data-friends-action="${escapeHTML(action)}"
        data-id="${escapeHTML(id)}"
        ${busy ? "disabled" : ""}
      >
        ${busy ? "…" : escapeHTML(label)}
      </button>`;
  }

  function userCard(user, actions = "") {
    return `
      <article class="saino-friend-card">
        <div class="saino-avatar">
          ${avatar(user)}
        </div>

        <div class="saino-friend-info">
          <strong>${escapeHTML(user.name || "Saino User")}</strong>
        </div>

        <div class="saino-friend-actions">
          ${actions}
        </div>
      </article>`;
  }

  function empty(message) {
    return `
      <div class="saino-empty-state">
        <p>${escapeHTML(message)}</p>
      </div>`;
  }

  function tabs() {
    const items = [
      ["suggestions", t("suggestions", "Suggestions", "सुझाव")],
      ["friends", t("friends", "Friends", "साथीहरू")],
      ["incoming", t("requests", "Requests", "अनुरोधहरू")],
      ["outgoing", t("sentRequests", "Sent", "पठाइएका")]
    ];

    return `
      <nav class="saino-friends-tabs" aria-label="Friends">
        ${items.map(([id, label]) => `
          <button
            type="button"
            class="saino-button-secondary${state.tab === id ? " active" : ""}"
            data-friends-tab="${id}"
            aria-pressed="${state.tab === id}"
          >
            ${escapeHTML(label)}
          </button>
        `).join("")}
      </nav>`;
  }

  function searchBox() {
    return `
      <form class="saino-friends-search" data-friends-search>
        <input
          type="search"
          name="search"
          maxlength="60"
          value="${escapeHTML(state.searchTerm)}"
          placeholder="${escapeHTML(
            t("searchPeople", "Search people...", "मानिस खोज्नुहोस्...")
          )}"
          aria-label="${escapeHTML(
            t("searchPeople", "Search people", "मानिस खोज्नुहोस्")
          )}"
        >

        <button class="saino-button" type="submit">
          ${escapeHTML(t("search", "Search", "खोज्नुहोस्"))}
        </button>
      </form>`;
  }

  function renderUsers() {
    const users = state.users || [];

    if (!users.length) {
      return empty(
        state.searchTerm
          ? t("noResults", "No users found.", "प्रयोगकर्ता भेटिएन।")
          : t("noSuggestions", "No suggestions available.", "अहिले कुनै सुझाव छैन।")
      );
    }

    return users.map(user => {
      const id = user.id || user.userId;

      return userCard(
        user,
        button(
          "send-request",
          id,
          t("addFriend", "Add friend", "साथी बनाउनुहोस्"),
          "primary"
        )
      );
    }).join("");
  }

  function renderFriends() {
    const people = state.dashboard?.friends || [];

    if (!people.length) {
      return empty(
        t("noFriends", "You have no friends yet.", "अहिलेसम्म साथी छैनन्।")
      );
    }

    return people.map(user => userCard(
      user,
      `
        ${button(
          "follow",
          user.id,
          t("follow", "Follow", "फलो गर्नुहोस्")
        )}
        ${button(
          "remove-friend",
          user.id,
          t("removeFriend", "Remove", "हटाउनुहोस्")
        )}
      `
    )).join("");
  }

  function renderIncoming() {
    const requests = state.dashboard?.incoming || [];

    if (!requests.length) {
      return empty(
        t("noRequests", "No pending requests.", "कुनै अनुरोध आएको छैन।")
      );
    }

    return requests.map(request => userCard(
      request.person,
      `
        ${button(
          "accept",
          request.id,
          t("accept", "Accept", "स्वीकार"),
          "primary"
        )}
        ${button(
          "reject",
          request.id,
          t("reject", "Reject", "अस्वीकार")
        )}
      `
    )).join("");
  }

  function renderOutgoing() {
    const requests = state.dashboard?.outgoing || [];

    if (!requests.length) {
      return empty(
        t("noSentRequests", "No sent requests.", "पठाइएको अनुरोध छैन।")
      );
    }

    return requests.map(request => userCard(
      request.person,
      button(
        "cancel-request",
        request.id,
        t("cancel", "Cancel", "रद्द गर्नुहोस्")
      )
    )).join("");
  }

  function renderContent() {
    if (state.loading) {
      return empty(t("loading", "Loading...", "लोड हुँदैछ..."));
    }

    if (state.error) {
      return `
        <div class="saino-empty-state">
          <p>${escapeHTML(state.error)}</p>
          <button
            type="button"
            class="saino-button-secondary"
            data-friends-action="refresh"
          >
            ${escapeHTML(t("retry", "Try again", "फेरि प्रयास गर्नुहोस्"))}
          </button>
        </div>`;
    }

    switch (state.tab) {
      case "friends":
        return renderFriends();

      case "incoming":
        return renderIncoming();

      case "outgoing":
        return renderOutgoing();

      default:
        return renderUsers();
    }
  }

  function render() {
    const host = state.host;

    if (!host) return;

    host.innerHTML = `
      <section class="saino-friends">

        <header class="saino-friends-header">
          <h2>
            ${escapeHTML(t("friends", "Friends", "साथीहरू"))}
          </h2>
        </header>

        ${searchBox()}

        <div
          class="saino-friends-message"
          data-friends-message
          role="status"
          hidden
        ></div>

        ${tabs()}

        <div class="saino-friends-list">
          ${renderContent()}
        </div>

      </section>`;
  }

  async function loadDashboard() {
    const api = service();

    if (!api?.getDashboard) {
      state.error = t(
        "friendsUnavailable",
        "Friends service is unavailable.",
        "साथी सेवा उपलब्ध छैन।"
      );
      return;
    }

    const response = await api.getDashboard();

    if (!response?.ok) {
      state.error = response?.message || t(
        "genericError",
        "Something went wrong.",
        "केही समस्या भयो।"
      );
      return;
    }

    state.dashboard = response.data || {};
    state.error = "";
  }

  async function loadSuggestions() {
    const api = service();

    const response = state.searchTerm
      ? await api.searchUsers(state.searchTerm, { limit: 20 })
      : await api.getSuggestedUsers(8);

    if (!response?.ok) {
      state.error = response?.message || t(
        "genericError",
        "Something went wrong.",
        "केही समस्या भयो।"
      );
      state.users = [];
      return;
    }

    state.users = response.data || [];
    state.error = "";
  }

  async function refresh() {
    if (!state.host) return;

    state.loading = true;
    state.error = "";
    render();

    try {
      await loadDashboard();

      if (!state.error && state.tab === "suggestions") {
        await loadSuggestions();
      }
    } catch (error) {
      state.error = error?.message || t(
        "genericError",
        "Something went wrong.",
        "केही समस्या भयो।"
      );
    }

    state.loading = false;
    render();
  }

  async function runAction(action, id) {
    const api = service();

    if (!api) {
      showMessage(
        t("friendsUnavailable", "Friends service is unavailable.", "साथी सेवा उपलब्ध छैन।"),
        "error"
      );
      return;
    }

    const key = `${action}:${id || ""}`;

    if (state.busy.has(key)) return;

    setBusy(key, true);

    let response;

    try {
      switch (action) {
        case "send-request":
          response = await api.sendFriendRequest(id);
          break;

        case "accept":
          response = await api.respondToFriendRequest(id, "accepted");
          break;

        case "reject":
          response = await api.respondToFriendRequest(id, "rejected");
          break;

        case "cancel-request":
          response = await api.cancelFriendRequest(id);
          break;

        case "remove-friend":
          response = await api.removeFriend(id);
          break;

        case "follow":
          response = await api.followUser(id);
          break;

        case "refresh":
          await refresh();
          return;

        default:
          return;
      }

      if (!response?.ok) {
        showMessage(
          response?.message || t(
            "genericError",
            "Action failed.",
            "कार्य सफल भएन।"
          ),
          "error"
        );
        return;
      }

      showMessage(
        t("updated", "Updated successfully.", "सफलतापूर्वक अपडेट भयो।"),
        "success"
      );

      await refresh();

    } catch (error) {
      showMessage(
        error?.message || t(
          "genericError",
          "Something went wrong.",
          "केही समस्या भयो।"
        ),
        "error"
      );
    } finally {
      state.busy.delete(key);
      render();
    }
  }

  function handleClick(event) {
    const tab = event.target.closest("[data-friends-tab]");

    if (tab) {
      state.tab = tab.dataset.friendsTab;
      state.searchTerm = "";
      refresh();
      return;
    }

    const button = event.target.closest("[data-friends-action]");

    if (button) {
      runAction(
        button.dataset.friendsAction,
        button.dataset.id || ""
      );
    }
  }

  async function handleSearch(event) {
    if (!event.target.matches("[data-friends-search]")) return;

    event.preventDefault();

    const input = event.target.querySelector(
      'input[name="search"]'
    );

    state.searchTerm = String(input?.value || "").trim();
    state.tab = "suggestions";

    if (state.searchTerm.length > 0 &&
        state.searchTerm.length < 2) {
      showMessage(
        t("searchTooShort", "Enter at least 2 characters.", "कम्तीमा २ अक्षर लेख्नुहोस्।"),
        "error"
      );
      return;
    }

    await refresh();
  }

  function mount(host) {
    if (typeof host === "string") {
      host = document.querySelector(host);
    }

    if (!host || !(host instanceof Element)) {
      return {
        ok: false,
        message: "A valid friends container is required."
      };
    }

    unmount();

    state.host = host;
    state.tab = "suggestions";
    state.searchTerm = "";
    state.users = [];
    state.dashboard = null;

    host.addEventListener("click", handleClick);
    host.addEventListener("submit", handleSearch);

    global.addEventListener("ksk:friends-cloud-change", refresh);
    global.addEventListener("ksk:auth-change", refresh);
    global.addEventListener("ksk:language-change", render);

    refresh();

    return {
      ok: true,
      refresh,
      destroy: unmount
    };
  }

  function unmount() {
    if (state.host) {
      state.host.removeEventListener("click", handleClick);
      state.host.removeEventListener("submit", handleSearch);
    }

    global.removeEventListener("ksk:friends-cloud-change", refresh);
    global.removeEventListener("ksk:auth-change", refresh);
    global.removeEventListener("ksk:language-change", render);

    state.host = null;
  }

  global.SainoFriends = Object.freeze({
    mount,
    unmount,
    refresh
  });

})(window);
