
/* Saino Profile UI — profile details, photos, birthday privacy, work and study. */
(function (global) {
  "use strict";

  if (global.SainoProfileUI) return;

  const BUCKET = "profile-media";
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const root = () => document.getElementById("saino-profile-overlay");
  const service = () => global.KSKSupabaseProfile;
  const auth = () => global.KSKSupabaseAuth;
  const english = () => global.KSKLanguage?.getLanguage?.() === "en";
  const tr = (en, ne) => english() ? en : ne;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  let profile = null;
  let birthday = { dateOfBirth: "", birthdayVisibility: "only_me", showBirthYear: false };
  let experiences = [];
  let tab = "profile";
  let editingId = "";
  let busy = false;

  function notify(message, type = "success") {
    const text = String(message || "");

    let host = document.querySelector(".saino-toast-container");

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      document.body.appendChild(host);
    }

    const item = document.createElement("div");
    item.className = `saino-toast ${type === "error" ? "error" : "success"}`;
    item.textContent = text;
    host.appendChild(item);

    global.setTimeout(() => item.remove(), 3200);
  }

  function initials(name) {
    return String(name || "S")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(x => Array.from(x)[0] || "")
      .join("")
      .toUpperCase() || "S";
  }

  function profileNames() {
    const parts = String(profile?.name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return {
      firstName: profile?.firstName || parts[0] || "",
      lastName: profile?.lastName || parts.slice(1).join(" ") || ""
    };
  }

  function imageMarkup(url, className, fallback) {
    const safe = String(url || "").trim();

    if (!safe || !/^https:\/\//i.test(safe)) {
      return `<div class="${className} saino-profile-placeholder">${esc(fallback)}</div>`;
    }

    return `
      <div class="${className}">
        <img src="${esc(safe)}" alt="" referrerpolicy="no-referrer">
      </div>`;
  }

  function injectNavigation() {
    const nav = document.querySelector(".saino-tabs");

    if (!nav || nav.querySelector("[data-saino-profile-open]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "saino-tab";
    button.dataset.sainoProfileOpen = "true";
    button.textContent = tr("Profile", "प्रोफाइल");
    button.setAttribute(
      "aria-label",
      tr("Open your profile", "आफ्नो प्रोफाइल खोल्नुहोस्")
    );

    nav.appendChild(button);
  }

  function ensureOverlay() {
    if (root()) return root();

    const overlay = document.createElement("div");

    overlay.id = "saino-profile-overlay";
    overlay.className = "saino-profile-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <section
        class="saino-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saino-profile-title"
      >
        <header class="saino-profile-header">
          <div>
            <p class="saino-profile-eyebrow">SAINO</p>
            <h2 id="saino-profile-title">
              ${tr("Your profile", "तपाईंको प्रोफाइल")}
            </h2>
          </div>

          <button
            type="button"
            class="saino-profile-close"
            data-profile-action="close"
            aria-label="${tr("Close", "बन्द गर्नुहोस्")}"
          >×</button>
        </header>

        <nav class="saino-profile-tabs">
          <button type="button" data-profile-tab="profile">
            ${tr("Profile", "प्रोफाइल")}
          </button>
          <button type="button" data-profile-tab="birthday">
            ${tr("Birthday", "जन्मदिन")}
          </button>
          <button type="button" data-profile-tab="work">
            ${tr("Work", "काम")}
          </button>
          <button type="button" data-profile-tab="study">
            ${tr("Study", "अध्ययन")}
          </button>
        </nav>

        <div
          class="saino-profile-content"
          data-profile-content
          aria-live="polite"
        ></div>
      </section>
    `;

    document.body.appendChild(overlay);

    return overlay;
  }

  async function loadData() {
    const api = service();

    if (!api) {
      throw new Error(
        tr("Profile service is unavailable.", "प्रोफाइल सेवा उपलब्ध छैन।")
      );
    }

    const [p, b, e] = await Promise.all([
      api.getMyProfile(),

      api.getMyBirthdaySettings().catch(error => {
        console.warn("Birthday settings could not be loaded", error);
        return null;
      }),

      api.getMyExperiences()
    ]);

    profile = p || {
      name: "",
      firstName: "",
      lastName: "",
      bio: "",
      location: "",
      avatar: "",
      cover: ""
    };

    birthday = b || {
      dateOfBirth: "",
      birthdayVisibility: "only_me",
      showBirthYear: false
    };

    experiences = Array.isArray(e) ? e : [];
  }

  function open() {
    const overlay = ensureOverlay();

    overlay.hidden = false;
    document.body.classList.add("saino-profile-open");

    tab = "profile";
    editingId = "";

    renderLoading();

    loadData()
      .then(render)
      .catch(error => {
        content().innerHTML = `
          <div class="saino-profile-error">
            ${esc(error.message || tr(
              "Could not load profile.",
              "प्रोफाइल लोड गर्न सकिएन।"
            ))}
          </div>`;
      });
  }

  function close() {
    const overlay = root();

    if (overlay) overlay.hidden = true;

    document.body.classList.remove("saino-profile-open");
    editingId = "";
  }

  function content() {
    return root()?.querySelector("[data-profile-content]");
  }

  function setBusy(value) {
    busy = Boolean(value);

    content()
      ?.querySelectorAll('button[type="submit"]')
      .forEach(button => {
        button.disabled = busy;
      });
  }

  function renderLoading() {
    const node = content();

    if (node) {
      node.innerHTML = `
        <div class="saino-profile-loading">
          ${tr("Loading profile…", "प्रोफाइल लोड हुँदैछ…")}
        </div>`;
    }
  }

  function render() {
    const overlay = root();

    if (!overlay || overlay.hidden || !profile) return;

    overlay.querySelectorAll("[data-profile-tab]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.profileTab === tab
      );

      button.setAttribute(
        "aria-current",
        button.dataset.profileTab === tab ? "page" : "false"
      );
    });

    const node = content();

    if (!node) return;

    if (tab === "profile") {
      renderProfile(node);
    } else if (tab === "birthday") {
      renderBirthday(node);
    } else {
      renderExperiences(node, tab);
    }
  }

  function renderProfile(node) {
    const names = profileNames();

    const name =
      profile.name ||
      [names.firstName, names.lastName].filter(Boolean).join(" ") ||
      auth()?.getUser?.()?.email ||
      "Saino User";

    const email = auth()?.getUser?.()?.email || "";

    node.innerHTML = `
      <div class="saino-profile-hero">

        ${imageMarkup(profile.cover, "saino-profile-cover", "")}

        <label class="saino-profile-cover-change">
          ${tr("Change cover", "कभर बदल्नुहोस्")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            data-profile-file="cover"
          >
        </label>

        <div class="saino-profile-avatar-wrap">

          ${imageMarkup(
            profile.avatar,
            "saino-profile-avatar",
            initials(name)
          )}

          <label
            class="saino-profile-avatar-change"
            title="${tr("Change photo", "फोटो बदल्नुहोस्")}"
          >
            ＋
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              data-profile-file="avatar"
            >
          </label>

        </div>
      </div>

      <div class="saino-profile-identity">
        <h3>${esc(name)}</h3>
        <p>${esc(email)}</p>
      </div>

      <form class="saino-profile-form" data-profile-form>

        <div class="saino-profile-field-grid">

          <label>
            ${tr("First name", "पहिलो नाम")}
            <input
              name="firstName"
              maxlength="60"
              value="${esc(names.firstName)}"
              required
            >
          </label>

          <label>
            ${tr("Last name", "थर")}
            <input
              name="lastName"
              maxlength="60"
              value="${esc(names.lastName)}"
            >
          </label>

        </div>

        <label>
          ${tr("About", "आफ्नो परिचय")}
          <textarea
            name="bio"
            maxlength="240"
            rows="3"
            placeholder="${tr(
              "A little about you…",
              "आफ्नो बारेमा केही लेख्नुहोस्…"
            )}"
          >${esc(profile.bio)}</textarea>
          <small>240 ${tr("characters maximum", "अक्षर अधिकतम")}</small>
        </label>

        <label>
          ${tr("Location", "ठेगाना")}
          <input
            name="location"
            maxlength="100"
            value="${esc(profile.location)}"
            placeholder="${tr("City or area", "सहर वा ठाउँ")}"
          >
        </label>

        <div class="saino-profile-actions">
          <button
            class="saino-profile-primary"
            type="submit"
            ${busy ? "disabled" : ""}
          >
            ${tr("Save profile", "प्रोफाइल सुरक्षित गर्नुहोस्")}
          </button>
        </div>

      </form>
    `;
  }

  function renderBirthday(node) {
    node.innerHTML = `
      <div class="saino-profile-section-intro">
        <h3>${tr("Birthday privacy", "जन्मदिनको गोपनीयता")}</h3>
        <p>
          ${tr(
            "Choose who can see your birthday. Your full date stays private unless you choose otherwise.",
            "तपाईंको जन्मदिन कसले देख्न पाउने भन्ने छान्नुहोस्।"
          )}
        </p>
      </div>

      <form class="saino-profile-form" data-birthday-form>

        <label>
          ${tr("Date of birth", "जन्ममिति")}
          <input
            type="date"
            name="dateOfBirth"
            max="${new Date().toISOString().slice(0, 10)}"
            value="${esc(birthday.dateOfBirth)}"
            required
          >
        </label>

        <label>
          ${tr("Who can see your birthday?", "जन्मदिन कसले देख्न पाउने?")}

          <select name="birthdayVisibility">
            <option
              value="only_me"
              ${birthday.birthdayVisibility === "only_me" ? "selected" : ""}
            >${tr("Only me", "मात्र म")}</option>

            <option
              value="friends"
              ${birthday.birthdayVisibility === "friends" ? "selected" : ""}
            >${tr("Friends", "साथीहरू")}</option>

            <option
              value="public"
              ${birthday.birthdayVisibility === "public" ? "selected" : ""}
            >${tr("Everyone", "सबैले")}</option>
          </select>
        </label>

        <label class="saino-profile-check">
          <input
            type="checkbox"
            name="showBirthYear"
            ${birthday.showBirthYear ? "checked" : ""}
          >
          <span>${tr(
            "Show my birth year",
            "मेरो जन्म वर्ष पनि देखाउनुहोस्"
          )}</span>
        </label>

        <div class="saino-profile-actions">
          <button class="saino-profile-primary" type="submit">
            ${tr("Save birthday settings", "जन्मदिन सेटिङ सुरक्षित गर्नुहोस्")}
          </button>
        </div>

      </form>
    `;
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(
          english() ? "en" : "ne",
          { year: "numeric", month: "short" }
        );
  }

  function renderExperienceForm(item) {
    const current = item || {};
    const isWork = tab === "work";

    return `
      <form class="saino-profile-form saino-experience-form" data-experience-form>

        <h3>
          ${editingId
            ? tr("Edit details", "विवरण सम्पादन")
            : isWork
              ? tr("Add work experience", "कामको अनुभव थप्नुहोस्")
              : tr("Add education", "अध्ययन विवरण थप्नुहोस्")
          }
        </h3>

        <label>
          ${isWork
            ? tr("Company / organization", "कम्पनी / संस्था")
            : tr("School / college", "विद्यालय / कलेज")
          }
          <input
            name="organizationName"
            maxlength="120"
            required
            value="${esc(current.organizationName)}"
          >
        </label>

        <label>
          ${isWork
            ? tr("Job title", "पद")
            : tr("Degree / subject", "तह / विषय")
          }
          <input
            name="roleTitle"
            maxlength="120"
            required
            value="${esc(current.roleTitle)}"
          >
        </label>

        <label>
          ${tr("Description", "विवरण")}
          <textarea
            name="description"
            maxlength="500"
            rows="2"
          >${esc(current.description)}</textarea>
        </label>

        <div class="saino-profile-field-grid">

          <label>
            ${tr("Start date", "सुरु मिति")}
            <input
              type="date"
              name="startDate"
              value="${esc(current.startDate)}"
            >
          </label>

          <label>
            ${tr("End date", "अन्त्य मिति")}
            <input
              type="date"
              name="endDate"
              value="${esc(current.endDate)}"
              ${current.isCurrent ? "disabled" : ""}
            >
          </label>

        </div>

        <label class="saino-profile-check">
          <input
            type="checkbox"
            name="isCurrent"
            ${current.isCurrent ? "checked" : ""}
          >
          <span>
            ${isWork
              ? tr("I currently work here", "म अहिले यहाँ काम गर्छु")
              : tr("I currently study here", "म अहिले यहाँ पढ्छु")
            }
          </span>
        </label>

        <label>
          ${tr("Who can see this?", "यो विवरण कसले देख्न पाउने?")}

          <select name="visibility">
            <option value="only_me" ${(!current.visibility || current.visibility === "only_me") ? "selected" : ""}>
              ${tr("Only me", "मात्र म")}
            </option>

            <option value="friends" ${current.visibility === "friends" ? "selected" : ""}>
              ${tr("Friends", "साथीहरू")}
            </option>

            <option value="public" ${current.visibility === "public" ? "selected" : ""}>
              ${tr("Everyone", "सबैले")}
            </option>
          </select>
        </label>

        <div class="saino-profile-actions">
          <button class="saino-profile-primary" type="submit">
            ${tr("Save", "सुरक्षित गर्नुहोस्")}
          </button>

          ${editingId ? `
            <button
              type="button"
              class="saino-profile-secondary"
              data-profile-action="cancel-edit"
            >
              ${tr("Cancel", "रद्द")}
            </button>
          ` : ""}
        </div>

      </form>
    `;
  }

  function renderExperiences(node, type) {
    const list = experiences.filter(item => item.type === type);

    const title = type === "work"
      ? tr("Work experience", "कामको अनुभव")
      : tr("Education", "शिक्षा");

    const editing = editingId
      ? experiences.find(item => item.id === editingId && item.type === type)
      : null;

    node.innerHTML = `
      <div class="saino-profile-section-intro">
        <h3>${title}</h3>
        <p>
          ${type === "work"
            ? tr(
                "Add the places where you have worked.",
                "तपाईंले काम गरेका संस्था थप्नुहोस्।"
              )
            : tr(
                "Add your school, college or study details.",
                "विद्यालय, कलेज वा अध्ययन विवरण थप्नुहोस्।"
              )
          }
        </p>
      </div>

      ${renderExperienceForm(editing)}

      <div class="saino-experience-list">

        ${list.length ? list.map(item => `
          <article class="saino-experience-card">

            <div class="saino-experience-icon">
              ${type === "work" ? "▣" : "▤"}
            </div>

            <div class="saino-experience-copy">
              <h4>${esc(item.roleTitle)}</h4>
              <p>${esc(item.organizationName)}</p>

              <small>
                ${esc(formatDate(item.startDate))}
                ${item.startDate ? " – " : ""}
                ${item.isCurrent
                  ? tr("Present", "हाल")
                  : esc(formatDate(item.endDate))
                }
                · ${esc(item.visibility)}
              </small>

              ${item.description
                ? `<p class="saino-experience-description">${esc(item.description)}</p>`
                : ""
              }
            </div>

            <div class="saino-experience-actions">
              <button
                type="button"
                data-profile-action="edit-experience"
                data-id="${esc(item.id)}"
              >
                ${tr("Edit", "सम्पादन")}
              </button>

              <button
                type="button"
                class="danger"
                data-profile-action="delete-experience"
                data-id="${esc(item.id)}"
              >
                ${tr("Delete", "हटाउनुहोस्")}
              </button>
            </div>

          </article>
        `).join("") : `
          <p class="saino-profile-empty">
            ${tr("No details added yet.", "अहिलेसम्म कुनै विवरण थपिएको छैन।")}
          </p>
        `}

      </div>
    `;
  }

  async function uploadImage(file, kind) {
    const user = auth()?.getUser?.();
    const client = auth()?.getClient?.();

    if (!user?.id || !client) {
      throw new Error(
        tr("Please sign in again.", "कृपया फेरि लगइन गर्नुहोस्।")
      );
    }

    if (!IMAGE_TYPES.includes(file.type)) {
      throw new Error(
        tr(
          "Choose a JPG, PNG, WebP or GIF image.",
          "JPG, PNG, WebP वा GIF फोटो छान्नुहोस्।"
        )
      );
    }

    const max = kind === "avatar" ? 5 : 8;

    if (file.size > max * 1024 * 1024) {
      throw new Error(
        tr(
          `Image must be under ${max} MB.`,
          `फोटो ${max} MB भन्दा सानो हुनुपर्छ।`
        )
      );
    }

    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    }[file.type];

    const path = `${user.id}/${kind}.${extension}`;

    const { data, error } = await client.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "0",
        upsert: true,
        contentType: file.type
      });

    if (error) throw error;

    const { data: publicData } = client.storage
      .from(BUCKET)
      .getPublicUrl(data.path);

    if (!publicData?.publicUrl) {
      throw new Error(
        tr("Could not create image URL.", "फोटोको URL बनाउन सकिएन।")
      );
    }

    const url =
      `${publicData.publicUrl}?v=${Date.now()}`;

    await service().updateMyProfile(
      kind === "avatar"
        ? { avatar: url }
        : { cover: url }
    );

    profile = { ...profile, [kind]: url };

    notify(
      kind === "avatar"
        ? tr("Profile photo updated.", "प्रोफाइल फोटो परिवर्तन भयो।")
        : tr("Cover photo updated.", "कभर फोटो परिवर्तन भयो।")
    );

    render();
  }

  async function handleSubmit(event) {
    const form = event.target;

    if (form.matches("[data-profile-form]")) {
      event.preventDefault();

      const data = new FormData(form);

      const firstName = String(data.get("firstName") || "").trim();
      const lastName = String(data.get("lastName") || "").trim();

      if (!firstName) {
        return notify(
          tr("First name is required.", "पहिलो नाम आवश्यक छ।"),
          "error"
        );
      }

      if ([firstName, lastName].filter(Boolean).join(" ").length > 60) {
        return notify(
          tr(
            "Your full name must be 60 characters or fewer.",
            "पूरा नाम ६० अक्षरभित्र हुनुपर्छ।"
          ),
          "error"
        );
      }

      setBusy(true);

      try {
        profile = await service().updateMyProfile({
          firstName,
          lastName,
          name: [firstName, lastName].filter(Boolean).join(" "),
          bio: data.get("bio"),
          location: data.get("location")
        });

        notify(tr("Profile saved.", "प्रोफाइल सुरक्षित भयो।"));

        render();

        global.dispatchEvent(
          new CustomEvent("saino:profile-updated", {
            detail: { profile }
          })
        );

      } catch (error) {
        notify(
          error.message || tr(
            "Could not save profile.",
            "प्रोफाइल सुरक्षित भएन।"
          ),
          "error"
        );

      } finally {
        setBusy(false);
      }

      return;
    }

    if (form.matches("[data-birthday-form]")) {
      event.preventDefault();

      const data = new FormData(form);

      setBusy(true);

      try {
        birthday = await service().updateMyBirthdaySettings({
          dateOfBirth: data.get("dateOfBirth"),
          birthdayVisibility: data.get("birthdayVisibility"),
          showBirthYear: data.get("showBirthYear") === "on"
        });

        notify(
          tr("Birthday settings saved.", "जन्मदिन सेटिङ सुरक्षित भयो।")
        );

        render();

      } catch (error) {
        notify(
          error.message || tr(
            "Could not save birthday settings.",
            "जन्मदिन सेटिङ सुरक्षित भएन।"
          ),
          "error"
        );

      } finally {
        setBusy(false);
      }

      return;
    }

    if (form.matches("[data-experience-form]")) {
      event.preventDefault();

      const data = new FormData(form);

      const payload = {
        type: tab,
        organizationName: data.get("organizationName"),
        roleTitle: data.get("roleTitle"),
        description: data.get("description"),
        startDate: data.get("startDate") || null,
        endDate: data.get("endDate") || null,
        isCurrent: data.get("isCurrent") === "on",
        visibility: data.get("visibility")
      };

      setBusy(true);

      try {
        if (editingId) {
          await service().updateMyExperience(editingId, payload);
        } else {
          await service().addMyExperience(payload);
        }

        experiences = await service().getMyExperiences();
        editingId = "";

        notify(tr("Details saved.", "विवरण सुरक्षित भयो।"));

        render();

      } catch (error) {
        notify(
          error.message || tr(
            "Could not save details.",
            "विवरण सुरक्षित भएन।"
          ),
          "error"
        );

      } finally {
        setBusy(false);
      }
    }
  }

  async function handleClick(event) {
    const tabButton = event.target.closest("[data-profile-tab]");

    if (tabButton) {
      tab = tabButton.dataset.profileTab;
      editingId = "";
      render();
      return;
    }

    const actionButton = event.target.closest("[data-profile-action]");

    if (!actionButton) return;

    const action = actionButton.dataset.profileAction;

    if (action === "close") {
      close();
      return;
    }

    if (action === "cancel-edit") {
      editingId = "";
      render();
      return;
    }

    if (action === "edit-experience") {
      editingId = actionButton.dataset.id || "";
      render();
      return;
    }

    if (action === "delete-experience") {
      const id = actionButton.dataset.id || "";

      if (!global.confirm(
        tr("Delete this detail?", "यो विवरण हटाउने हो?")
      )) return;

      actionButton.disabled = true;

      try {
        await service().deleteMyExperience(id);

        experiences = experiences.filter(item => item.id !== id);

        notify(tr("Detail deleted.", "विवरण हटाइयो।"));

        render();

      } catch (error) {
        notify(
          error.message || tr(
            "Could not delete detail.",
            "विवरण हटाउन सकिएन।"
          ),
          "error"
        );

        actionButton.disabled = false;
      }
    }
  }

  async function handleChange(event) {
    const fileInput = event.target.closest("[data-profile-file]");

    if (fileInput?.files?.[0]) {
      const kind = fileInput.dataset.profileFile;

      try {
        fileInput.disabled = true;
        await uploadImage(fileInput.files[0], kind);

      } catch (error) {
        notify(
          error.message || tr(
            "Image upload failed.",
            "फोटो अपलोड भएन।"
          ),
          "error"
        );

      } finally {
        fileInput.disabled = false;
        fileInput.value = "";
      }

      return;
    }

    if (event.target.matches('[name="isCurrent"]')) {
      const end = content()?.querySelector('[name="endDate"]');

      if (end) {
        end.disabled = event.target.checked;

        if (event.target.checked) end.value = "";
      }
    }
  }

  function handleDocumentClick(event) {
    if (event.target.closest("[data-saino-profile-open]")) {
      event.preventDefault();
      open();
    }

    const overlay = root();

    if (overlay && event.target === overlay) close();
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && root() && !root().hidden) {
      close();
    }
  }

  document.addEventListener("click", handleDocumentClick);

  document.addEventListener("click", event => {
    const overlay = root();

    if (overlay && !overlay.hidden && overlay.contains(event.target)) {
      handleClick(event);
    }
  });

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);

  global.addEventListener("saino:app-ready", injectNavigation);

  global.SainoProfileUI = Object.freeze({
    open,
    close,
    refresh: async () => {
      await loadData();
      render();
    }
  });

})(window);
