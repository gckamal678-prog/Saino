
/* Saino Group Management — audited against existing Supabase APIs. */
(function (global) {
  "use strict";
  if (global.SainoGroupManagement) return;

  const messages = () => global.KSKSupabaseMessages;
  const friendsAPI = () => global.KSKSupabaseFriends;
  const root = () => document.getElementById("saino-app");
  const lang = () => global.KSKLanguage?.getLanguage?.() || "ne";
  const t = (en, ne) => lang() === "en" ? en : ne;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
  const safeImage = value => {
    try {
      const u = new URL(String(value || ""), global.location.href);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "";
    } catch (_) { return ""; }
  };
  const personAvatar = (person, fallback = "👤") => {
    const src = safeImage(person?.avatar || person?.avatarUrl);
    const initial = String(person?.name || person?.fullName || "")
      .trim().charAt(0).toUpperCase() || fallback;
    return src
      ? `<img src="${esc(src)}" alt="" loading="lazy">`
      : `<span>${esc(initial)}</span>`;
  };

  let view = "list", groups = [], friends = [], activeGroup = null;
  let selected = new Set(), groupName = "", search = "", busy = false;
  let notice = "", noticeKind = "info", memberMenu = "";

  function currentUserId() {
    return String(friendsAPI()?.getCurrentUserId?.() || "");
  }

  function setNotice(message, kind = "info") {
    notice = message;
    noticeKind = kind;
    render();
  }

  function ensureTab() {
    const nav = root()?.querySelector(".saino-tabs");
    if (!nav) return;

    let tab = nav.querySelector("[data-saino-groups-tab]");
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button";
      tab.className = "saino-tab";
      tab.dataset.sainoGroupsTab = "true";
      nav.appendChild(tab);
    }

    tab.textContent = t("Groups", "समूह");
    tab.setAttribute("aria-label", t("Groups", "समूह"));
  }

  function close() {
    document.querySelector(".saino-groups-overlay")?.remove();
    root()?.querySelector("[data-saino-groups-tab]")?.classList.remove("active");
    view = "list";
    activeGroup = null;
    memberMenu = "";
  }

  async function open() {
    if (!root()) return;
    view = "list";
    activeGroup = null;
    notice = "";
    search = "";
    root().querySelector("[data-saino-groups-tab]")?.classList.add("active");
    render();
    await loadGroups();
  }

  async function loadGroups() {
    const api = messages();

    if (typeof api?.getConversations !== "function") {
      setNotice(t("Messenger service is unavailable.", "Messenger सेवा उपलब्ध छैन।"), "error");
      return;
    }

    const result = await api.getConversations();

    if (!result?.ok) {
      groups = [];
      setNotice(result?.message || t("Could not load groups.", "समूह लोड गर्न सकिएन।"), "error");
      return;
    }

    groups = (Array.isArray(result.data) ? result.data : [])
      .filter(x => x.type === "group");
    render();
  }

  async function loadFriends() {
    const api = friendsAPI();

    if (typeof api?.getDashboard !== "function") {
      friends = [];
      return;
    }

    const result = await api.getDashboard();
    friends = result?.ok && Array.isArray(result.data?.friends)
      ? result.data.friends
      : [];
  }

  function dateLabel(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(lang() === "en" ? "en-IN" : "ne-NP", {
      day: "numeric",
      month: "short"
    });
  }

  function groupRow(g) {
    const preview = g.lastMessage?.content ||
      (g.lastMessage
        ? t("Media message", "मिडिया सन्देश")
        : t("No messages yet", "अहिलेसम्म सन्देश छैन"));

    return `
      <button type="button" class="saino-group-row" data-group-open="${esc(g.id)}">
        <span class="saino-group-avatar">${personAvatar({name:g.name}, "👥")}</span>
        <span class="saino-group-row-main">
          <span class="saino-group-row-top">
            <strong>${esc(g.name || t("Group", "समूह"))}</strong>
            <time>${esc(dateLabel(g.lastMessageAt || g.createdAt))}</time>
          </span>
          <span class="saino-group-row-bottom">
            <span>${esc(preview)}</span>
            <small>${(g.members || []).length} ${t("members", "सदस्य")}</small>
          </span>
        </span>
      </button>`;
  }

  function searchBox(placeholder) {
    return `
      <label class="saino-group-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" data-group-search
          value="${esc(search)}" placeholder="${esc(placeholder)}">
      </label>`;
  }

  function renderList() {
    const items = groups.filter(g =>
      String(g.name || "").toLowerCase().includes(search.toLowerCase())
    );

    return `
      <div class="saino-groups-toolbar">
        <div>
          <h2>${t("Your groups", "तपाईंका समूहहरू")}</h2>
          <p>${t("Your group conversations", "तपाईंका समूह कुराकानीहरू")}</p>
        </div>
        <button type="button" class="saino-group-create-button" data-group-create>
          ＋ ${t("New group", "नयाँ समूह")}
        </button>
      </div>
      ${searchBox(t("Search groups", "समूह खोज्नुहोस्"))}
      ${!items.length ? `
        <div class="saino-group-empty">
          <div class="saino-group-empty-icon">👥</div>
          <h3>${t("No groups yet", "अहिलेसम्म समूह छैन")}</h3>
          <p>${t("Create a group to chat with several friends.", "धेरै साथीहरूसँग कुराकानी गर्न समूह बनाउनुहोस्।")}</p>
          <button type="button" data-group-create>${t("Create group", "समूह बनाउनुहोस्")}</button>
        </div>` : `
        <div class="saino-group-list">${items.map(groupRow).join("")}</div>`}`;
  }

  function renderPicker(mode) {
    const existing = new Set((activeGroup?.members || []).map(m => String(m.id)));

    const people = friends.filter(p => {
      const id = String(p.id || p.userId || "");
      return id && !existing.has(id) &&
        String(p.name || "").toLowerCase().includes(search.toLowerCase());
    });

    return `
      <div class="saino-group-subheader">
        <button type="button" class="saino-group-back" data-group-back>←</button>
        <div>
          <h2>${mode === "add" ? t("Add participants", "सदस्य थप्नुहोस्") : t("New group", "नयाँ समूह")}</h2>
          <p>${t("Choose friends", "साथीहरू छान्नुहोस्")}</p>
        </div>
      </div>
      ${mode === "create" ? `
        <label class="saino-group-name-field">
          <span>${t("Group name", "समूहको नाम")}</span>
          <input maxlength="60" data-group-name value="${esc(groupName)}"
            placeholder="${t("Enter group name", "समूहको नाम लेख्नुहोस्")}">
        </label>` : ""}
      <p class="saino-group-selection-count">
        ${selected.size} ${t("selected", "जना छानिए")}
      </p>
      ${searchBox(t("Search friends", "साथी खोज्नुहोस्"))}
      ${!people.length ? `
        <div class="saino-group-state">
          ${friends.length
            ? t("No available friends found.", "थप्न मिल्ने साथी भेटिएनन्।")
            : t("Your friends list is empty.", "तपाईंको साथी सूची खाली छ।")}
        </div>` : ""}
      <div class="saino-group-friend-list">
        ${people.map(p => {
          const id = String(p.id || p.userId);
          const checked = selected.has(id);
          return `
            <label class="saino-group-friend">
              <span class="saino-group-person-avatar">${personAvatar(p)}</span>
              <span class="saino-group-person-name">${esc(p.name || t("Friend", "साथी"))}</span>
              <input type="checkbox" data-group-friend="${esc(id)}" ${checked ? "checked" : ""}>
              <span class="saino-group-check">${checked ? "✓" : ""}</span>
            </label>`;
        }).join("")}
      </div>
      <div class="saino-group-create-footer">
        <button type="button" data-group-picker-submit ${busy ? "disabled" : ""}>
          ${busy
            ? t("Please wait…", "कृपया पर्खनुहोस्…")
            : mode === "add"
              ? t("Add selected", "छानिएका थप्नुहोस्")
              : t("Create group", "समूह बनाउनुहोस्")}
        </button>
      </div>`;
  }

  function renderDetails() {
    if (!activeGroup) return renderList();

    const members = activeGroup.members || [];
    const admin = activeGroup.role === "admin";

    return `
      <div class="saino-group-subheader">
        <button type="button" class="saino-group-back" data-group-back>←</button>
        <div>
          <h2>${esc(activeGroup.name)}</h2>
          <p>${members.length} ${t("members", "सदस्य")}</p>
        </div>
      </div>
      <section class="saino-group-about">
        <div class="saino-group-about-avatar">${personAvatar({name:activeGroup.name}, "👥")}</div>
        <h3>${esc(activeGroup.name)}</h3>
        <p>${t("Group conversation", "समूह कुराकानी")}</p>
      </section>
      <div class="saino-group-members-heading">
        <strong>${t("Participants", "सदस्यहरू")} (${members.length})</strong>
        ${admin ? `<button type="button" data-group-add>${t("Add members", "सदस्य थप्नुहोस्")}</button>` : ""}
      </div>
      <div class="saino-group-member-list">
        ${members.map(m => `
          <div class="saino-group-member">
            <span class="saino-group-person-avatar">${personAvatar(m)}</span>
            <span class="saino-group-person-name">
              ${esc(m.name || t("Member", "सदस्य"))}
              ${m.id === activeGroup.createdBy ? `<small>${t("Group creator", "समूह निर्माता")}</small>` : ""}
            </span>
            <span class="saino-group-role">${m.role === "admin" ? "Admin" : t("Member", "सदस्य")}</span>
            ${admin && String(m.id) !== currentUserId()
              ? `<button type="button" class="saino-group-more" data-member-menu="${esc(m.id)}">⋮</button>`
              : ""}
          </div>
          ${memberMenu === String(m.id) ? `
            <div class="saino-member-actions">
              <button data-member-action="promote" data-member-id="${esc(m.id)}">${t("Make admin", "Admin बनाउनुहोस्")}</button>
              <button data-member-action="demote" data-member-id="${esc(m.id)}">${t("Remove admin", "Admin हटाउनुहोस्")}</button>
              <button data-member-action="remove" data-member-id="${esc(m.id)}">${t("Remove member", "सदस्य हटाउनुहोस्")}</button>
            </div>` : ""}
        `).join("")}
      </div>
      <div class="saino-group-danger-zone">
        <button type="button" data-group-leave>${t("Exit group", "समूह छोड्नुहोस्")}</button>
      </div>`;
  }

  function render() {
    let overlay = document.querySelector(".saino-groups-overlay");

    if (!overlay) {
      overlay = document.createElement("section");
      overlay.className = "saino-groups-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", t("Groups", "समूहहरू"));
      document.body.appendChild(overlay);
    }

    const content = view === "create"
      ? renderPicker("create")
      : view === "add"
        ? renderPicker("add")
        : view === "details"
          ? renderDetails()
          : renderList();

    overlay.innerHTML = `
      <header class="saino-groups-header">
        <button type="button" data-group-close aria-label="${t("Close", "बन्द गर्नुहोस्")}">←</button>
        <div>
          <h1>${t("Groups", "समूहहरू")}</h1>
          <p>${t("Stay connected", "समूहमा जोडिइरहनुहोस्")}</p>
        </div>
        <span class="saino-groups-header-icon">👥</span>
      </header>
      ${notice ? `<div class="saino-group-notice ${esc(noticeKind)}">${esc(notice)}</div>` : ""}
      <main class="saino-groups-content">${content}</main>`;
  }

  async function startCreate() {
    view = "create";
    selected = new Set();
    groupName = "";
    search = "";
    notice = "";
    await loadFriends();
    render();
  }

  async function startAdd() {
    view = "add";
    selected = new Set();
    search = "";
    notice = "";
    await loadFriends();
    render();
  }

  async function submitPicker() {
    if (busy) return;

    if (!selected.size) {
      setNotice(t("Select at least one friend.", "कम्तीमा एक जना साथी छान्नुहोस्।"), "error");
      return;
    }

    busy = true;
    render();

    try {
      if (view === "create") {
        if (!groupName.trim()) {
          busy = false;
          setNotice(t("Enter a group name.", "समूहको नाम लेख्नुहोस्।"), "error");
          return;
        }

        if (selected.size < 2) {
          busy = false;
          setNotice(t("Select at least two friends.", "कम्तीमा दुई जना साथी छान्नुहोस्।"), "error");
          return;
        }

        const result = await messages().createGroup([...selected], groupName.trim());
        if (!result?.ok) throw new Error(result?.message || t("Group creation failed.", "समूह बनाउन सकिएन।"));

        view = "list";
        notice = t("Group created.", "समूह बन्यो।");
        noticeKind = "success";
        await loadGroups();
      } else {
        for (const id of selected) {
          const result = await messages().manageGroupMember(activeGroup.id, "add", id);
          if (!result?.ok) throw new Error(result?.message || t("Could not add a member.", "सदस्य थप्न सकिएन।"));
        }

        const id = activeGroup.id;
        await loadGroups();
        activeGroup = groups.find(g => g.id === id) || activeGroup;
        view = "details";
        notice = t("Selected members added.", "छानिएका सदस्य थपिए।");
        noticeKind = "success";
      }
    } catch (e) {
      notice = e.message || t("Something went wrong.", "केही समस्या भयो।");
      noticeKind = "error";
    } finally {
      busy = false;
      render();
    }
  }

  async function openDetails(id) {
    activeGroup = groups.find(g => String(g.id) === String(id)) || null;
    if (!activeGroup) return;
    view = "details";
    memberMenu = "";
    render();
  }

  async function memberAction(action, id) {
    if (!activeGroup || !["promote", "demote", "remove"].includes(action)) return;

    if (action === "remove" &&
        !global.confirm(t("Remove this member from the group?", "यो सदस्यलाई समूहबाट हटाउने?"))) return;

    const result = await messages().manageGroupMember(activeGroup.id, action, id);

    if (!result?.ok) {
      setNotice(result?.message || t("Could not update member.", "सदस्य परिवर्तन गर्न सकिएन।"), "error");
      return;
    }

    const groupId = activeGroup.id;
    memberMenu = "";
    await loadGroups();
    activeGroup = groups.find(g => g.id === groupId) || activeGroup;
    view = "details";
    notice = t("Group updated.", "समूह अपडेट भयो।");
    noticeKind = "success";
    render();
  }

  async function leaveGroup() {
    const userId = currentUserId();

    if (!activeGroup || !userId) {
      setNotice(t("Your signed-in user could not be identified.", "लगइन भएको प्रयोगकर्ता पहिचान भएन।"), "error");
      return;
    }

    if (!global.confirm(t("Are you sure you want to leave this group?", "के तपाईं यो समूह छोड्न चाहनुहुन्छ?"))) return;

    const result = await messages().manageGroupMember(activeGroup.id, "remove", userId);

    if (!result?.ok) {
      setNotice(result?.message || t("Could not leave the group.", "समूह छोड्न सकिएन।"), "error");
      return;
    }

    activeGroup = null;
    view = "list";
    notice = t("You left the group.", "तपाईं समूहबाट बाहिरिनुभयो।");
    noticeKind = "success";
    await loadGroups();
  }

  document.addEventListener("click", async e => {
    if (e.target.closest("[data-saino-groups-tab]")) {
      e.preventDefault();
      await open();
      return;
    }
    if (e.target.closest("[data-group-close]")) { close(); return; }
    if (e.target.closest("[data-group-create]")) { await startCreate(); return; }
    if (e.target.closest("[data-group-back]")) {
      view = "list";
      activeGroup = null;
      memberMenu = "";
      notice = "";
      render();
      return;
    }

    const row = e.target.closest("[data-group-open]");
    if (row) { await openDetails(row.dataset.groupOpen); return; }

    if (e.target.closest("[data-group-picker-submit]")) { await submitPicker(); return; }
    if (e.target.closest("[data-group-add]")) { await startAdd(); return; }

    const menu = e.target.closest("[data-member-menu]");
    if (menu) {
      memberMenu = memberMenu === menu.dataset.memberMenu ? "" : menu.dataset.memberMenu;
      render();
      return;
    }

    const action = e.target.closest("[data-member-action]");
    if (action) {
      await memberAction(action.dataset.memberAction, action.dataset.memberId);
      return;
    }

    if (e.target.closest("[data-group-leave]")) await leaveGroup();
  });

  document.addEventListener("input", e => {
    if (e.target.matches("[data-group-name]")) {
      groupName = e.target.value;
      return;
    }

    if (e.target.matches("[data-group-search]")) {
      search = e.target.value || "";
      const pos = search.length;
      render();
      const input = document.querySelector(".saino-groups-overlay [data-group-search]");
      input?.focus();
      input?.setSelectionRange(pos, pos);
    }
  });

  document.addEventListener("change", e => {
    const cb = e.target.closest("[data-group-friend]");
    if (!cb) return;

    if (cb.checked) selected.add(cb.dataset.groupFriend);
    else selected.delete(cb.dataset.groupFriend);

    render();
  });

  global.addEventListener("saino:app-ready", ensureTab);
  global.addEventListener("saino:language-change", () => {
    ensureTab();
    if (document.querySelector(".saino-groups-overlay")) render();
  });

  global.addEventListener("ksk:messages-cloud-change", e => {
    const action = e.detail?.action;
    if (action === "group-created" || action === "group-members-changed") {
      if (document.querySelector(".saino-groups-overlay")) loadGroups();
    }
  });

  global.SainoGroupManagement = Object.freeze({
    open,
    close,
    refresh: loadGroups
  });
})(window);
