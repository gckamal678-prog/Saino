
/* Saino Friends UI — uses the existing KSKSupabaseFriends API. */
(function (global) {
  "use strict";

  if (global.SainoFriends) return;

  const service = () => global.KSKSupabaseFriends;
  const root = () => document.getElementById("saino-app");

  let view = "chats";
  let section = "discover";
  let dashboard = emptyDashboard();
  let suggestions = [];
  let searchResults = [];
  let searchTerm = "";
  let searchTimer = null;
  let searchToken = 0;
  let loadToken = 0;
  let loading = false;
  let message = "";
  let messageType = "info";
  let relationships = {};

  function emptyDashboard() {
    return {
      incoming: [],
      outgoing: [],
      friends: [],
      followers: [],
      following: [],
      blocked: []
    };
  }

  const english = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  function text(en, ne) {
    return english() ? en : ne;
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
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : "";
    } catch (_) {
      return "";
    }
  }

  function notify(messageText, type = "info") {
    message = messageText;
    messageType = type;
    render();
  }

  function ensureNavigation() {
    const nav = root()?.querySelector(".saino-tabs");
    if (!nav) return;

    let button = nav.querySelector("[data-saino-friends-tab]");

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.dataset.sainoFriendsTab = "true";
      nav.appendChild(button);
    }

    button.textContent = text("Friends", "साथीहरू");
    button.setAttribute("aria-label", text("Friends", "साथीहरू"));
  }

  function openChats() {
    view = "chats";

    const app = root();
    if (!app) return;

    app.querySelector(".saino-friends-page")?.remove();
    app.classList.remove("chat-open");

    app.querySelector(".saino-sidebar")?.classList.remove("saino-hidden");
    app.querySelector(".saino-conversation")?.classList.remove("saino-hidden");

    app.querySelector("[data-saino-friends-tab]")?.classList.remove("active");

    app.querySelector(".saino-tabs .saino-tab:not([data-saino-friends-tab])")
      ?.classList.add("active");
  }

  async function openFriends() {
    view = "friends";
    section = "discover";
    searchTerm = "";
    searchResults = [];
    message = "";

    ensureNavigation();
    render();

    await loadData();
  }

  async function loadData() {
    const api = service();

    if (!api?.getDashboard) {
      notify(
        text(
          "Friends service is unavailable.",
          "Friends सेवा उपलब्ध छैन।"
        ),
        "error"
      );
      return;
    }

    const token = ++loadToken;

    loading = true;
    message = "";

    render();

    try {
      const [dashboardResult, suggestionsResult] = await Promise.all([
        api.getDashboard(),
        api.getSuggestedUsers(8)
      ]);

      if (token !== loadToken) return;

      if (!dashboardResult?.ok) {
        dashboard = emptyDashboard();
        suggestions = [];
        loading = false;

        notify(
          dashboardResult?.message ||
            text(
              "Could not load friends.",
              "साथीहरूको विवरण लोड गर्न सकिएन।"
            ),
          "error"
        );

        return;
      }

      dashboard = {
        ...emptyDashboard(),
        ...(dashboardResult.data || {})
      };

      suggestions = suggestionsResult?.ok
        ? (suggestionsResult.data || [])
        : [];

      await loadRelationships(allPeople().map(person => person.id));

      if (token !== loadToken) return;

      loading = false;
      render();

    } catch (error) {
      if (token !== loadToken) return;

      loading = false;

      notify(
        error?.message ||
          text(
            "Could not load friends.",
            "साथीहरूको विवरण लोड गर्न सकिएन।"
          ),
        "error"
      );
    }
  }

  function allPeople() {
    return [
      ...suggestions,
      ...searchResults,
      ...(dashboard.friends || []),
      ...(dashboard.followers || []),
      ...(dashboard.following || []),
      ...(dashboard.blocked || []),
      ...(dashboard.incoming || []).map(item => item.person),
      ...(dashboard.outgoing || []).map(item => item.person)
    ].filter(Boolean);
  }

  async function loadRelationships(ids) {
    const api = service();

    const uniqueIds = [...new Set((ids || []).filter(Boolean))];

    if (!uniqueIds.length || !api?.getRelationshipStatuses) {
      relationships = {};
      return;
    }

    try {
      const result = await api.getRelationshipStatuses(uniqueIds);

      if (result?.ok) {
        relationships = result.data || {};
      }

    } catch (_) {
      relationships = {};
    }
  }

  function actionButton(action, id, label, style = "") {
    if (!id) return "";

    return `
      <button
        type="button"
        class="saino-friend-action ${escapeHTML(style)}"
        data-friends-action="${escapeHTML(action)}"
        data-user-id="${escapeHTML(id)}"
      >
        ${escapeHTML(label)}
      </button>`;
  }

  function defaultActions(person, relation = {}) {
    const id = person.id || person.userId;

    if (!id) return [];

    /*
     * Security:
     * Relationship API can report a block from either direction.
     * Never show Unblock here.
     * Unblock is available only in the current user's own Blocked list.
     */

    if (relation.blocked || relation.state === "blocked") {
      return [];
    }

    let mainAction;

    if (relation.state === "pending_sent") {
      mainAction = actionButton(
        "cancel-request",
        relation.requestId,
        text("Cancel request", "Request रद्द"),
        "secondary"
      );

    } else if (relation.state === "pending_received") {
      mainAction = actionButton(
        "accept-request",
        relation.requestId,
        text("Accept", "स्वीकार"),
        "primary"
      );

    } else if (relation.state === "friend") {
      mainAction = actionButton(
        "remove-friend",
        id,
        text("Remove friend", "साथी हटाउनुहोस्"),
        "secondary"
      );

    } else {
      mainAction = actionButton(
        "send-request",
        id,
        text("Add friend", "साथी बनाउनुहोस्"),
        "primary"
      );
    }

    const followAction = relation.following
      ? actionButton(
          "unfollow",
          id,
          text("Unfollow", "Unfollow"),
          "secondary"
        )
      : actionButton(
          "follow",
          id,
          text("Follow", "Follow"),
          "secondary"
        );

    return [
      mainAction,
      followAction,
      actionButton(
        "block",
        id,
        text("Block", "Block"),
        "danger"
      )
    ].filter(Boolean);
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString(
      english() ? "en" : "ne",
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    );
  }

  function personCard(person, options = {}) {
    if (!person) return "";

    const id = person.id || person.userId || "";
    const name = person.name || text("Saino user", "Saino प्रयोगकर्ता");
    const avatar = safeImageURL(person.avatarUrl);

    const initial = Array.from(String(name).trim())[0] || "S";

    const relation = relationships[id] || {};

    const actions = options.buttons || defaultActions(person, relation);

    const avatarMarkup = avatar
      ? `
        <img
          src="${escapeHTML(avatar)}"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      `
      : escapeHTML(initial);

    return `
      <article class="saino-friend-card">

        <div class="saino-avatar">
          ${avatarMarkup}
        </div>

        <div class="saino-friend-card-info">
          <strong>${escapeHTML(name)}</strong>

          ${
            person.createdAt
              ? `<small>${escapeHTML(formatDate(person.createdAt))}</small>`
              : ""
          }
        </div>

        <div class="saino-friend-actions">
          ${actions.join("")}
        </div>

      </article>`;
  }

  function renderPeople(items, mode = "") {
    if (!items?.length) {
      return `
        <div class="saino-friends-empty">
          ${escapeHTML(
            text("Nothing here yet.", "यहाँ अहिले केही छैन।")
          )}
        </div>`;
    }

    return items.map(person => {

      /*
       * Only people in the current user's own Blocked list
       * receive the Unblock action.
       */

      if (mode === "blocked") {
        return personCard(person, {
          buttons: [
            actionButton(
              "unblock",
              person.id || person.userId,
              text("Unblock", "Unblock गर्नुहोस्"),
              "secondary"
            )
          ]
        });
      }

      return personCard(person);

    }).join("");
  }

  function requestPeople(items, type) {
    if (!items?.length) {
      return `
        <div class="saino-friends-empty">
          ${escapeHTML(text("No requests.", "कुनै Request छैन।"))}
        </div>`;
    }

    return items.map(item => {

      const buttons = type === "incoming"
        ? [
            actionButton(
              "accept-request",
              item.id,
              text("Accept", "स्वीकार"),
              "primary"
            ),
            actionButton(
              "reject-request",
              item.id,
              text("Decline", "अस्वीकार"),
              "secondary"
            )
          ]
        : [
            actionButton(
              "cancel-request",
              item.id,
              text("Cancel", "रद्द"),
              "secondary"
            )
          ];

      return personCard(item.person, { buttons });

    }).join("");
  }

  function sectionLabel(key) {
    const labels = {
      discover: ["Discover", "खोज्नुहोस्"],
      friends: ["My friends", "मेरा साथीहरू"],
      requests: ["Requests", "Request"],
      following: ["Following", "Following"],
      followers: ["Followers", "Followers"],
      blocked: ["Blocked", "Block गरिएका"]
    };

    return text(...labels[key]);
  }

  function currentContent() {

    if (section === "discover") {

      const results = searchTerm.trim()
        ? searchResults
        : suggestions;

      return `
        <div class="saino-friends-search">

          <label for="saino-friends-search">
            ${escapeHTML(text("Find people", "मानिस खोज्नुहोस्"))}
          </label>

          <input
            id="saino-friends-search"
            type="search"
            value="${escapeHTML(searchTerm)}"
            placeholder="${escapeHTML(
              text("Search by name…", "नामबाट खोज्नुहोस्…")
            )}"
            autocomplete="off"
          >

        </div>

        <h2>
          ${escapeHTML(
            searchTerm
              ? text("Search results", "खोज परिणाम")
              : text(
                  "People you may know",
                  "चिनजान हुन सक्ने व्यक्तिहरू"
                )
          )}
        </h2>

        ${
          loading && !results.length
            ? `<p class="saino-friends-empty">${escapeHTML(
                text("Loading…", "लोड हुँदैछ…")
              )}</p>`
            : renderPeople(results)
        }`;
    }

    if (section === "requests") {
      return `
        <h2>${escapeHTML(text("Received", "प्राप्त भएका"))}</h2>

        ${requestPeople(dashboard.incoming, "incoming")}

        <h2>${escapeHTML(text("Sent", "पठाइएका"))}</h2>

        ${requestPeople(dashboard.outgoing, "outgoing")}`;
    }

    const lists = {
      friends: dashboard.friends,
      following: dashboard.following,
      followers: dashboard.followers,
      blocked: dashboard.blocked
    };

    return renderPeople(
      lists[section] || [],
      section === "blocked" ? "blocked" : ""
    );
  }

  function render() {
    const app = root();

    if (!app || view !== "friends") return;

    ensureNavigation();

    app.classList.remove("chat-open");

    app.querySelector(".saino-sidebar")?.classList.add("saino-hidden");
    app.querySelector(".saino-conversation")?.classList.add("saino-hidden");

    app.querySelector("[data-saino-friends-tab]")?.classList.add("active");

    app.querySelector(".saino-tabs .saino-tab:not([data-saino-friends-tab])")
      ?.classList.remove("active");

    let page = app.querySelector(".saino-friends-page");

    if (!page) {
      page = document.createElement("section");
      page.className = "saino-friends-page";
      app.appendChild(page);
    }

    page.setAttribute(
      "aria-label",
      text("Friends", "साथीहरू")
    );

    const sections = [
      "discover",
      "friends",
      "requests",
      "following",
      "followers",
      "blocked"
    ];

    page.innerHTML = `
      <header class="saino-friends-header">

        <button
          type="button"
          class="saino-friends-back"
          data-friends-action="back"
        >
          ‹ ${escapeHTML(text("Chats", "च्याट"))}
        </button>

        <div>
          <h1>${escapeHTML(text("Friends", "साथीहरू"))}</h1>

          <p>
            ${escapeHTML(
              text(
                "Connect with people on Saino.",
                "Saino मा मानिसहरूसँग जोडिनुहोस्।"
              )
            )}
          </p>
        </div>

        <button
          type="button"
          class="saino-friends-reload"
          data-friends-action="reload"
          aria-label="${escapeHTML(
            text("Refresh", "फेरि लोड गर्नुहोस्")
          )}"
        >
          ↻
        </button>

      </header>

      <nav
        class="saino-friends-nav"
        aria-label="${escapeHTML(
          text("Friends sections", "साथीहरूका खण्ड")
        )}"
      >

        ${sections.map(key => `
          <button
            type="button"
            class="${key === section ? "active" : ""}"
            data-friends-section="${key}"
            ${key === section ? 'aria-current="page"' : ""}
          >
            ${escapeHTML(sectionLabel(key))}

            ${
              key === "requests" && dashboard.incoming?.length
                ? `<span class="saino-friends-count">${dashboard.incoming.length}</span>`
                : ""
            }
          </button>
        `).join("")}

      </nav>

      ${
        message
          ? `
            <p
              class="saino-friends-notice ${escapeHTML(messageType)}"
              role="status"
            >
              ${escapeHTML(message)}
            </p>
          `
          : ""
      }

      <main class="saino-friends-content">
        ${currentContent()}
      </main>`;
  }

  async function searchUsers(term) {
    searchTerm = term;
    searchResults = [];

    const token = ++searchToken;

    if (term.trim().length < 2) {
      render();
      return;
    }

    render();

    try {
      const result = await service()?.searchUsers?.(
        term,
        { limit: 20 }
      );

      if (token !== searchToken) return;

      if (!result?.ok) {
        notify(
          result?.message || text(
            "Search failed.",
            "खोज गर्न सकिएन।"
          ),
          "error"
        );
        return;
      }

      searchResults = result.data || [];

      await loadRelationships(
        searchResults.map(person => person.id)
      );

      if (token === searchToken) render();

    } catch (error) {
      if (token !== searchToken) return;

      notify(
        error?.message || text(
          "Search failed.",
          "खोज गर्न सकिएन।"
        ),
        "error"
      );
    }
  }

  async function runAction(button) {
    const action = button.dataset.friendsAction;
    const id = button.dataset.userId;
    const api = service();

    if (action === "back") {
      openChats();
      return;
    }

    if (action === "reload") {
      await loadData();
      return;
    }

    const actions = {
      "send-request": () => api?.sendFriendRequest?.(id),

      "accept-request": () =>
        api?.respondToFriendRequest?.(id, "accepted"),

      "reject-request": () =>
        api?.respondToFriendRequest?.(id, "rejected"),

      "cancel-request": () =>
        api?.cancelFriendRequest?.(id),

      "remove-friend": () =>
        api?.removeFriend?.(id),

      follow: () =>
        api?.followUser?.(id),

      unfollow: () =>
        api?.unfollowUser?.(id),

      block: () =>
        api?.blockUser?.(id),

      unblock: () =>
        api?.unblockUser?.(id)
    };

    const execute = actions[action];

    if (!execute) return;

    const destructive = [
      "remove-friend",
      "block",
      "reject-request"
    ].includes(action);

    if (destructive) {

      const prompt = action === "block"
        ? text(
            "Block this person?",
            "यो व्यक्तिलाई Block गर्ने?"
          )
        : action === "remove-friend"
          ? text(
              "Remove this friend?",
              "यो साथीलाई हटाउने?"
            )
          : text(
              "Decline this request?",
              "यो Request अस्वीकार गर्ने?"
            );

      if (!global.confirm(prompt)) return;
    }

    button.disabled = true;

    try {
      const result = await execute();

      if (!result?.ok) {
        notify(
          result?.message || text(
            "Action failed.",
            "कार्य पूरा हुन सकेन।"
          ),
          "error"
        );
        return;
      }

      message = text("Done.", "पूरा भयो।");
      messageType = "success";

      await loadData();

    } catch (error) {
      notify(
        error?.message || text(
          "Action failed.",
          "कार्य पूरा हुन सकेन।"
        ),
        "error"
      );

    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  document.addEventListener("click", event => {

    const friendsTab = event.target.closest(
      "[data-saino-friends-tab]"
    );

    if (friendsTab) {
      openFriends();
      return;
    }

    const chatsTab = event.target.closest(
      ".saino-tabs .saino-tab:not([data-saino-friends-tab])"
    );

    if (chatsTab) {
      openChats();
      return;
    }

    const sectionButton = event.target.closest(
      "[data-friends-section]"
    );

    if (sectionButton) {
      section = sectionButton.dataset.friendsSection;
      message = "";
      render();
      return;
    }

    const actionButtonElement = event.target.closest(
      "[data-friends-action]"
    );

    if (actionButtonElement) {
      runAction(actionButtonElement);
    }
  });

  document.addEventListener("input", event => {

    if (!event.target.matches("#saino-friends-search")) {
      return;
    }

    searchTerm = event.target.value || "";

    global.clearTimeout(searchTimer);

    searchTimer = global.setTimeout(
      () => searchUsers(searchTerm),
      250
    );
  });

  global.addEventListener("saino:app-ready", () => {
    ensureNavigation();

    if (view === "friends") {
      render();
    }
  });

  global.addEventListener("saino:language-change", () => {
    ensureNavigation();
    render();
  });

  global.addEventListener("ksk:language-change", () => {
    ensureNavigation();
    render();
  });

  global.addEventListener("ksk:friends-cloud-change", () => {
    if (view === "friends") {
      loadData();
    }
  });

  global.SainoFriends = Object.freeze({
    open: openFriends,
    close: openChats,
    refresh: loadData
  });

})(window);
