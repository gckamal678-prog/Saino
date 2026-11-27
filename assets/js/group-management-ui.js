
/* Saino Group Management UI
 * WhatsApp-inspired mobile group list, creation and member management.
 * Uses existing KSKSupabaseMessages and KSKSupabaseFriends services.
 */
(function (global) {
  "use strict";

  if (global.SainoGroupManagement) return;

  const appRoot = () => document.getElementById("saino-app");
  const messages = () => global.KSKSupabaseMessages;
  const friendsAPI = () => global.KSKSupabaseFriends;

  let page = "list";
  let groups = [];
  let friends = [];
  let activeGroup = null;
  let selectedFriends = new Set();
  let groupName = "";
  let search = "";
  let loading = false;
  let notice = "";
  let noticeType = "info";
  let busy = false;

  const isEnglish = () =>
    global.KSKLanguage?.getLanguage?.() === "en";

  const t = (en, ne) => isEnglish() ? en : ne;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  function safeURL(value) {
    try {
      const url = new URL(String(value || ""), global.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function avatar(person, fallback = "👤") {
    const url = safeURL(person?.avatar || person?.avatarUrl);
    const name = person?.name || person?.fullName || "";
    return url
      ? `<img src="${esc(url)}" alt="" loading="lazy">`
      : `<span>${esc(name.trim().charAt(0).toUpperCase() || fallback)}</span>`;
  }

  function notify(message, type = "info") {
    notice = message;
    noticeType = type;
    render();
  }

  function ensureNavigation() {
    const nav = appRoot()?.querySelector(".saino-tabs");
    if (!nav) return;

    let button = nav.querySelector("[data-saino-groups-tab]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "saino-tab";
      button.dataset.sainoGroupsTab = "true";
      nav.appendChild(button);
    }

    button.textContent = t("Groups", "समूह");
    button.setAttribute("aria-label", t("Groups", "समूह"));
    button.classList.toggle("active", page !== "closed");
  }

  function closeGroups() {
    page = "closed";
    activeGroup = null;
    appRoot()?.querySelector(".saino-groups-page")?.remove();
    appRoot()?.querySelector("[data-saino-groups-tab]")?.classList.remove("active");
  }

  async function openGroups() {
    page = "list";
    activeGroup = null;
    notice = "";
    ensureNavigation();
    render();
    await loadGroups();
  }

  async function loadGroups() {
    const api = messages();
    if (!api?.getConversations) {
      loading = false;
      notify(t("Messenger service is unavailable.", "Messenger सेवा उपलब्ध छैन।"), "error");
      return;
    }

    loading = true;
    render();

    const result = await api.getConversations();
    loading = false;

    if (!result?.ok) {
      groups = [];
      notify(result?.message || t("Could not load groups.", "समूह लोड गर्न सकिएन।"), "error");
      return;
    }

    groups = (result.data || []).filter(item => item.type === "group");
    render();
  }

  async function loadFriends() {
    const api = friendsAPI();
    if (!api?.getDashboard) {
      friends = [];
      return;
    }

    const result = await api.getDashboard();
    friends = result?.ok ? (result.data?.friends || []) : [];
  }

  function groupRow(group) {
    const members = group.members || [];
    const last = group.lastMessage;
    const preview = last
      ? (last.content || t("Media message", "मिडिया सन्देश"))
      : t("No messages yet", "अहिलेसम्म सन्देश छैन");

    return `
      <button class="saino-group-row"
        type="button"
        data-group-open="${esc(group.id)}">
        <span class="saino-group-avatar">${avatar({name: group.name}, "👥")}</span>
        <span class="saino-group-row-main">
          <span class="saino-group-row-top">
            <strong>${esc(group.name || t("Group", "समूह"))}</strong>
            <time>${esc(formatDate(group.lastMessageAt || group.createdAt))}</time>
          </span>
          <span class="saino-group-row-bottom">
            <span>${esc(preview)}</span>
            <small>${members.length} ${t("members", "सदस्य")}</small>
          </span>
        </span>
      </button>`;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(isEnglish() ? "en-IN" : "ne-NP", {
      day: "numeric",
      month: "short"
    });
  }

  function renderList() {
    const filtered = groups.filter(group =>
      String(group.name || "").toLowerCase().includes(search.toLowerCase())
    );

    return `
      <div class="saino-groups-toolbar">
        <div>
          <h2>${t("Your groups", "तपाईंका समूहहरू")}</h2>
          <p>${t("Stay connected with your people", "आफ्ना मानिसहरूसँग जोडिइरहनुहोस्")}</p>
        </div>
        <button type="button" class="saino-group-create-button" data-group-create>
          <span aria-hidden="true">＋</span>
          ${t("New group", "नयाँ समूह")}
        </button>
      </div>

      <label class="saino-group-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" data-group-search
          value="${esc(search)}"
          placeholder="${t("Search groups", "समूह खोज्नुहोस्")}">
      </label>

      ${loading ? `<div class="saino-group-state">${t("Loading groups…", "समूह लोड हुँदैछ…")}</div>` : ""}
      ${!loading && !filtered.length ? `
        <div class="saino-group-empty">
          <div class="saino-group-empty-icon">👥</div>
          <h3>${t("No groups yet", "अहिलेसम्म कुनै समूह छैन")}</h3>
          <p>${t("Create a group and bring your friends together.", "नयाँ समूह बनाएर साथीहरूलाई एकै ठाउँमा जोड्नुहोस्।")}</p>
          <button type="button" data-group-create>${t("Create your first group", "पहिलो समूह बनाउनुहोस्")}</button>
        </div>` : ""}
      <div class="saino-group-list">
        ${filtered.map(groupRow).join("")}
      </div>`;
  }

  function renderCreate() {
    const filtered = friends.filter(person =>
      String(person.name || "").toLowerCase().includes(search.toLowerCase())
    );

    return `
      <div class="saino-group-subheader">
        <button type="button" class="saino-group-back" data-group-back aria-label="${t("Back", "पछाडि")}">←</button>
        <div>
          <h2>${t("New group", "नयाँ समूह")}</h2>
          <p>${t("Add participants", "सदस्यहरू छान्नुहोस्")}</p>
        </div>
      </div>

      <label class="saino-group-name-field">
        <span>${t("Group name", "समूहको नाम")}</span>
        <input type="text" maxlength="60" data-group-name
          value="${esc(groupName)}"
          placeholder="${t("Enter group name", "समूहको नाम लेख्नुहोस्")}">
      </label>

      <div class="saino-group-selection-count">
        ${selectedFriends.size} ${t("selected", "जना छानिए")}
      </div>

      <label class="saino-group-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" data-group-search
          value="${esc(search)}"
          placeholder="${t("Search friends", "साथी खोज्नुहोस्")}">
      </label>

      ${!filtered.length ? `
        <div class="saino-group-state">
          ${friends.length
            ? t("No matching friends.", "मिल्ने साथी भेटिएन।")
            : t("You need at least two friends to create a group.", "समूह बनाउन कम्तीमा दुई जना साथी चाहिन्छ।")}
        </div>` : ""}

      <div class="saino-group-friend-list">
        ${filtered.map(person => {
          const id = person.id || person.userId;
          const checked = selectedFriends.has(id);
          return `
            <label class="saino-group-friend">
              <span class="saino-group-person-avatar">${avatar(person)}</span>
              <span class="saino-group-person-name">${esc(person.name || t("Friend", "साथी"))}</span>
              <input type="checkbox" data-group-friend="${esc(id)}" ${checked ? "checked" : ""}>
              <span class="saino-group-check" aria-hidden="true">${checked ? "✓" : ""}</span>
            </label>`;
        }).join("")}
      </div>

      <div class="saino-group-create-footer">
        <button type="button" data-group-submit ${busy ? "disabled" : ""}>
          ${busy ? t("Creating…", "बनाउँदै…") : t("Create group", "समूह बनाउनुहोस्")}
        </button>
      </div>`;
  }

  function renderDetails() {
    if (!activeGroup) return renderList();

    const members = activeGroup.members || [];
    const isAdmin = activeGroup.role === "admin" ||
      members.some(m => m.id === activeGroup.currentUserId && m.role === "admin");

    return `
      <div class="saino-group-subheader">
        <button type="button" class="saino-group-back" data-group-back aria-label="${t("Back", "पछाडि")}">←</button>
        <div>
          <h2>${esc(activeGroup.name)}</h2>
          <p>${members.length} ${t("members", "सदस्य")}</p>
        </div>
      </div>

      <section class="saino-group-about">
        <div class="saino-group-about-avatar">${avatar({name: activeGroup.name}, "👥")}</div>
        <h3>${esc(activeGroup.name)}</h3>
        <p>${t("Group conversation", "समूह कुराकानी")}</p>
      </section>

      <div class="saino-group-members-heading">
        <strong>${t("Participants", "सदस्यहरू")} (${members.length})</strong>
        ${isAdmin ? `<button type="button" data-group-add>${t("Add members", "सदस्य थप्नुहोस्")}</button>` : ""}
      </div>

      <div class="saino-group-member-list">
        ${members.map(member => `
          <div class="saino-group-member">
            <span class="saino-group-person-avatar">${avatar(member)}</span>
            <span class="saino-group-person-name">
              ${esc(member.name || t("Member", "सदस्य"))}
              ${member.id === activeGroup.createdBy ? `<small>${t("Group creator", "समूह निर्माता")}</small>` : ""}
            </span>
            <span class="saino-group-role">${member.role === "admin" ? t("Admin", "Admin") : t("Member", "सदस्य")}</span>
            ${isAdmin && member.role !== "admin" ? `
              <button type="button" class="saino-group-more"
                data-group-member-menu="${esc(member.id)}"
                aria-label="${t("Member options", "सदस्य विकल्प")}">⋮</button>` : ""}
          </div>`).join("")}
      </div>

      <div class="saino-group-danger-zone">
        <button type="button" data-group-leave>${t("Exit group", "समूह छोड्नुहोस्")}</button>
      </div>`;
  }

  function render() {
    const root = appRoot();
    if (!root || page === "closed") return;

    ensureNavigation();

    let content = "";
    if (page === "create") content = renderCreate();
    else if (page === "details") content = renderDetails();
    else content = renderList();

    let panel = root.querySelector(".saino-groups-page");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "saino-groups-page";
      panel.setAttribute("aria-label", t("Group management", "समूह व्यवस्थापन"));
      root.appendChild(panel);
    }

    panel.innerHTML = `
      <header class="saino-groups-header">
        <button type="button" class="saino-groups-header-back" data-group-close aria-label="${t("Back to chats", "च्याटमा फर्कनुहोस्")}">←</button>
        <div>
          <h1>${t("Groups", "समूहहरू")}</h1>
          <p>${t("Connect everyone in one place", "सबैलाई एउटै ठाउँमा जोड्नुहोस्")}</p>
        </div>
        <span class="saino-groups-header-icon">👥</span>
      </header>
      ${notice ? `<div class="saino-group-notice ${esc(noticeType)}">${esc(notice)}</div>` : ""}
      <main class="saino-groups-content">${content}</main>`;
  }

  async function startCreate() {
    page = "create";
    selectedFriends = new Set();
    groupName = "";
    search = "";
    notice = "";
    render();
    await loadFriends();
    render();
  }

  async function submitCreate() {
    if (busy) return;

    const name = groupName.trim();
    if (!name) {
      notify(t("Enter a group name.", "समूहको नाम लेख्नुहोस्।"), "error");
      return;
    }
    if (selectedFriends.size < 2) {
      notify(t("Select at least two friends.", "कम्तीमा दुई जना साथी छान्नुहोस्।"), "error");
      return;
    }

    busy = true;
    render();

    const result = await messages().createGroup([...selectedFriends], name);
    busy = false;

    if (!result?.ok) {
      notify(result?.message || t("Could not create group.", "समूह बनाउन सकिएन।"), "error");
      return;
    }

    notice = t("Group created successfully.", "समूह सफलतापूर्वक बन्यो।");
    noticeType = "success";
    page = "list";
    search = "";
    await loadGroups();
  }

  async function openDetails(id) {
    const group = groups.find(item => item.id === id);
    if (!group) return;

    activeGroup = group;
    page = "details";
    notice = "";
    render();
  }

  async function addMembers() {
    if (!activeGroup) return;
    await loadFriends();

    const existing = new Set((activeGroup.members || []).map(m => m.id));
    const available = friends.filter(person => !existing.has(person.id || person.userId));

    if (!available.length) {
      notify(t("No friends available to add.", "थप्न मिल्ने साथी छैनन्।"), "info");
      return;
    }

    const person = available[0];
    const id = person.id || person.userId;
    const confirmed = global.confirm(
      t(`Add ${person.name} to this group?`, `के ${person.name} लाई यो समूहमा थप्ने?`)
    );
    if (!confirmed) return;

    const result = await messages().manageGroupMember(activeGroup.id, "add", id);
    if (!result?.ok) {
      notify(result?.message || t("Could not add member.", "सदस्य थप्न सकिएन।"), "error");
      return;
    }
    await loadGroups();
    activeGroup = groups.find(item => item.id === activeGroup.id) || activeGroup;
    page = "details";
    notify(t("Member added.", "सदस्य थपियो।"), "success");
  }

  async function memberAction(memberId) {
    const member = activeGroup?.members?.find(item => item.id === memberId);
    if (!member) return;

    const action = global.prompt(
      t("Type promote, demote or remove", "promote, demote वा remove लेख्नुहोस्"),
      "promote"
    );
    if (!["promote", "demote", "remove"].includes(String(action || "").toLowerCase())) return;

    const result = await messages().manageGroupMember(
      activeGroup.id,
      String(action).toLowerCase(),
      memberId
    );

    if (!result?.ok) {
      notify(result?.message || t("Action failed.", "कार्य सफल भएन।"), "error");
      return;
    }

    await loadGroups();
    activeGroup = groups.find(item => item.id === activeGroup.id) || activeGroup;
    page = "details";
    notify(t("Group member updated.", "समूह सदस्यको विवरण परिवर्तन भयो।"), "success");
  }

  async function leaveGroup() {
    if (!activeGroup) return;
    if (!global.confirm(t("Are you sure you want to leave this group?", "के तपाईं यो समूह छोड्न चाहनुहुन्छ?"))) return;

    const result = await messages().manageGroupMember(
      activeGroup.id,
      "remove",
      activeGroup.currentUserId || ""
    );

    if (!result?.ok) {
      notify(result?.message || t("Could not leave group.", "समूह छोड्न सकिएन।"), "error");
      return;
    }

    activeGroup = null;
    page = "list";
    await loadGroups();
    notify(t("You left the group.", "तपाईं समूहबाट बाहिरिनुभयो।"), "success");
  }

  document.addEventListener("click", async event => {
    if (event.target.closest("[data-saino-groups-tab]")) {
      closeGroups();
      await openGroups();
      return;
    }

    if (event.target.closest("[data-group-close]")) {
      closeGroups();
      return;
    }

    if (event.target.closest("[data-group-create]")) {
      await startCreate();
      return;
    }

    if (event.target.closest("[data-group-back]")) {
      page = page === "details" ? "list" : "list";
      activeGroup = null;
      notice = "";
      render();
      return;
    }

    const open = event.target.closest("[data-group-open]");
    if (open) {
      openDetails(open.dataset.groupOpen);
      return;
    }

    if (event.target.closest("[data-group-submit]")) {
      await submitCreate();
      return;
    }

    if (event.target.closest("[data-group-add]")) {
      await addMembers();
      return;
    }

    const memberMenu = event.target.closest("[data-group-member-menu]");
    if (memberMenu) {
      await memberAction(memberMenu.dataset.groupMemberMenu);
      return;
    }

    if (event.target.closest("[data-group-leave]")) {
      await leaveGroup();
    }
  });

  document.addEventListener("input", event => {
    if (event.target.matches("[data-group-name]")) {
      groupName = event.target.value;
    }
    if (event.target.matches("[data-group-search]")) {
      search = event.target.value || "";
      const cursor = search.length;
      render();
      const input = appRoot()?.querySelector("[data-group-search]");
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    }
  });

  document.addEventListener("change", event => {
    const checkbox = event.target.closest("[data-group-friend]");
    if (!checkbox) return;

    const id = checkbox.dataset.groupFriend;
    if (checkbox.checked) selectedFriends.add(id);
    else selectedFriends.delete(id);

    render();
  });

  global.addEventListener("saino:app-ready", () => {
    ensureNavigation();
  });

  global.addEventListener("saino:language-change", () => {
    ensureNavigation();
    render();
  });

  global.addEventListener("ksk:language-change", () => {
    ensureNavigation();
    render();
  });

  global.addEventListener("group-created", () => {
    if (page !== "closed") loadGroups();
  });

  global.addEventListener("group-members-changed", () => {
    if (page !== "closed") loadGroups();
  });

  global.SainoGroupManagement = Object.freeze({
    open: openGroups,
    close: closeGroups,
    refresh: loadGroups
  });
})(window);
