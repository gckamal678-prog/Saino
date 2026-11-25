/* Saino Feed Interactions UI — decorates the existing feed cards. */
(function (global) {
  "use strict";

  if (global.SainoFeedInteractions) return;

  const service = () => global.KSKSupabasePostInteractions;
  const isEnglish = () => global.KSKLanguage?.getLanguage?.() === "en";
  const text = (en, ne) => isEnglish() ? en : ne;

  const states = new Map();
  const commentsCache = new Map();
  const openComments = new Set();
  const pending = new Set();

  let observer = null;
  let scheduled = false;
  let currentUserId = "";

  const escapeHTML = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  function toast(message, type = "success") {
    const value = String(message || "").trim();
    if (!value) return;

    let host = document.querySelector(".saino-toast-container");

    if (!host) {
      host = document.createElement("div");
      host.className = "saino-toast-container";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }

    const item = document.createElement("div");

    item.className =
      `saino-toast ${type === "error" ? "error" : "success"}`;

    item.textContent = value;
    host.appendChild(item);

    global.setTimeout(() => {
      item.remove();

      if (!host.childElementCount) {
        host.remove();
      }
    }, 3000);
  }

  function getPostsMap() {
    const posts = global.SainoFeedUI?.getPosts?.() || [];

    return new Map(
      posts.map(post => [String(post.id), post])
    );
  }

  function updateCard(article, post) {
    const state = states.get(String(post.id)) || {
      likes: 0,
      liked: false,
      saved: false
    };

    const like = article.querySelector(
      '[data-interaction="like"]'
    );

    const save = article.querySelector(
      '[data-interaction="save"]'
    );

    const comment = article.querySelector(
      '[data-interaction="comments"]'
    );

    if (like) {
      like.innerHTML =
        `🌹 ${text("Like", "मन पर्यो")} ` +
        `<span>${Number(state.likes || 0)}</span>`;

      like.classList.toggle(
        "is-active",
        Boolean(state.liked)
      );

      like.setAttribute(
        "aria-pressed",
        String(Boolean(state.liked))
      );
    }

    if (save) {
      save.textContent = state.saved
        ? `🔖 ${text("Saved", "सुरक्षित भयो")}`
        : `🔖 ${text("Save", "सुरक्षित गर्नुहोस्")}`;

      save.classList.toggle(
        "is-active",
        Boolean(state.saved)
      );

      save.setAttribute(
        "aria-pressed",
        String(Boolean(state.saved))
      );
    }

    if (comment) {
      comment.innerHTML =
        `💬 ${text("Comment", "टिप्पणी")} ` +
        `<span>${Number(post.commentCount || 0)}</span>`;
    }
  }

  function renderComments(article, postId, comments) {
    const host = article.querySelector(
      "[data-interaction-comments-list]"
    );

    if (!host) return;

    if (!comments.length) {
      host.innerHTML = `
        <p class="saino-feed-comments-empty">
          ${text("No comments yet.", "अहिलेसम्म टिप्पणी छैन।")}
        </p>
      `;
      return;
    }

    host.innerHTML = comments.map(comment => {
      const own =
        String(comment.userId) === currentUserId;

      return `
        <div
          class="saino-feed-comment"
          data-comment-id="${escapeHTML(comment.id)}"
        >

          <div class="saino-feed-comment-body">
            <strong>
              ${escapeHTML(
                comment.author ||
                text("Saino member", "Saino सदस्य")
              )}
            </strong>

            <p>
              ${escapeHTML(comment.text).replace(/\n/g, "<br>")}
            </p>
          </div>

          ${
            own
              ? `<button
                  type="button"
                  class="saino-feed-comment-delete"
                  data-interaction="delete-comment"
                  data-comment-id="${escapeHTML(comment.id)}"
                  data-post-id="${escapeHTML(postId)}"
                  aria-label="${text(
                    "Delete comment",
                    "टिप्पणी मेटाउनुहोस्"
                  )}"
                >×</button>`
              : ""
          }

        </div>
      `;
    }).join("");
  }

  async function loadComments(article, postId, force = false) {
    if (!force && commentsCache.has(postId)) {
      renderComments(
        article,
        postId,
        commentsCache.get(postId)
      );
      return;
    }

    const api = service();

    if (!api?.getComments) return;

    const result = await api.getComments(
      postId,
      { limit: 20 }
    );

    if (!result?.ok) {
      throw new Error(
        result?.message ||
        text(
          "Could not load comments.",
          "टिप्पणी लोड गर्न सकिएन।"
        )
      );
    }

    commentsCache.set(postId, result.data || []);

    renderComments(
      article,
      postId,
      result.data || []
    );
  }

  function decorate(article, post) {
    if (article.dataset.interactionsReady === "true") {
      updateCard(article, post);
      return;
    }

    const actions = document.createElement("div");

    actions.className = "saino-feed-interactions";

    actions.innerHTML = `
      <button
        type="button"
        data-interaction="like"
        data-post-id="${escapeHTML(post.id)}"
        aria-pressed="false"
      >
        🌹 ${text("Like", "मन पर्यो")} <span>0</span>
      </button>

      <button
        type="button"
        data-interaction="comments"
        data-post-id="${escapeHTML(post.id)}"
      >
        💬 ${text("Comment", "टिप्पणी")}
        <span>${Number(post.commentCount || 0)}</span>
      </button>

      <button
        type="button"
        data-interaction="save"
        data-post-id="${escapeHTML(post.id)}"
        aria-pressed="false"
      >
        🔖 ${text("Save", "सुरक्षित गर्नुहोस्")}
      </button>
    `;

    const panel = document.createElement("section");

    panel.className = "saino-feed-comments-panel";
    panel.dataset.interactionCommentsPanel = post.id;
    panel.hidden = true;

    panel.innerHTML = `
      <div
        class="saino-feed-comments-list"
        data-interaction-comments-list
      ></div>

      <form
        class="saino-feed-comment-form"
        data-interaction-comment-form
        data-post-id="${escapeHTML(post.id)}"
      >

        <textarea
          name="comment"
          rows="2"
          maxlength="5000"
          required
          placeholder="${text(
            "Write a comment…",
            "टिप्पणी लेख्नुहोस्…"
          )}"
        ></textarea>

        <button type="submit">
          ${text("Send", "पठाउनुहोस्")}
        </button>

      </form>
    `;

    article.append(actions, panel);

    article.dataset.interactionsReady = "true";

    updateCard(article, post);
  }

  async function hydrate() {
    scheduled = false;

    const list = document.querySelector(".saino-feed-list");

    if (!list || !service()?.getPostStates) return;

    const posts = getPostsMap();

    const articles = [
      ...list.querySelectorAll(
        ".saino-feed-post[data-post-id]"
      )
    ];

    const missing = articles.filter(
      article =>
        article.dataset.interactionsReady !== "true"
    );

    if (!missing.length) {
      articles.forEach(article => {
        const post = posts.get(article.dataset.postId);
        if (post) updateCard(article, post);
      });

      return;
    }

    const ids = missing.map(
      article => article.dataset.postId
    );

    const result = await service().getPostStates(ids);

    if (!result?.ok) {
      missing.forEach(article => {
        const post = posts.get(article.dataset.postId);
        if (post) decorate(article, post);
      });

      toast(
        result?.message ||
        text(
          "Interactions could not be loaded.",
          "प्रतिक्रिया लोड गर्न सकिएन।"
        ),
        "error"
      );

      return;
    }

    Object.entries(result.data || {}).forEach(
      ([id, state]) => states.set(id, state)
    );

    missing.forEach(article => {
      const post = posts.get(article.dataset.postId);
      if (post) decorate(article, post);
    });
  }

  function scheduleHydrate() {
    if (scheduled) return;

    scheduled = true;

    global.setTimeout(hydrate, 60);
  }

  async function runAction(key, button, action) {
    if (pending.has(key)) return;

    pending.add(key);
    button.disabled = true;

    try {
      await action();

    } catch (error) {
      toast(
        error?.message ||
        text("Action failed.", "काम पूरा हुन सकेन।"),
        "error"
      );

    } finally {
      pending.delete(key);

      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }

  /* LIKE / COMMENT / SAVE / DELETE COMMENT */

  document.addEventListener("click", event => {
    const button = event.target.closest(
      "[data-interaction]"
    );

    if (!button) return;

    const type = button.dataset.interaction;
    const postId = String(button.dataset.postId || "");
    const article = button.closest(".saino-feed-post");

    if (!article || !postId) return;

    if (type === "like") {
      event.preventDefault();

      runAction(`like:${postId}`, button, async () => {
        const result = await service().toggleLike(postId);

        if (!result?.ok) {
          throw new Error(result.message);
        }

        states.set(postId, result.data);

        const post = getPostsMap().get(postId);

        if (post) updateCard(article, post);
      });
    }

    if (type === "save") {
      event.preventDefault();

      runAction(`save:${postId}`, button, async () => {
        const result = await service().toggleSave(postId);

        if (!result?.ok) {
          throw new Error(result.message);
        }

        const previous = states.get(postId) || {
          likes: 0,
          liked: false
        };

        states.set(postId, {
          ...previous,
          saved: Boolean(result.data.saved)
        });

        const post = getPostsMap().get(postId);

        if (post) updateCard(article, post);

        toast(
          result.data.saved
            ? text("Post saved.", "पोस्ट सुरक्षित भयो।")
            : text(
                "Post removed from saved.",
                "सुरक्षित सूचीबाट हटाइयो।"
              )
        );
      });
    }

    if (type === "comments") {
      event.preventDefault();

      const panel = article.querySelector(
        "[data-interaction-comments-panel]"
      );

      if (!panel) return;

      const opening = panel.hidden;

      panel.hidden = !opening;

      if (opening) {
        openComments.add(postId);

        runAction(
          `comments:${postId}`,
          button,
          () => loadComments(article, postId, true)
        );

      } else {
        openComments.delete(postId);
      }
    }

    if (type === "delete-comment") {
      event.preventDefault();

      const commentId = button.dataset.commentId;

      runAction(
        `delete-comment:${commentId}`,
        button,
        async () => {
          if (!global.confirm(
            text(
              "Delete this comment?",
              "यो टिप्पणी मेटाउने हो?"
            )
          )) {
            return;
          }

          const result =
            await service().deleteComment(commentId);

          if (!result?.ok) {
            throw new Error(result.message);
          }

          commentsCache.delete(postId);

          await loadComments(article, postId, true);

          const post = getPostsMap().get(postId);

          if (post) {
            post.commentCount = Math.max(
              0,
              Number(post.commentCount || 0) - 1
            );
          }

          if (post) updateCard(article, post);

          toast(
            text("Comment deleted.", "टिप्पणी मेटियो।")
          );
        }
      );
    }
  });

  /* ADD COMMENT */

  document.addEventListener("submit", event => {
    const form = event.target.closest(
      "[data-interaction-comment-form]"
    );

    if (!form) return;

    event.preventDefault();

    const postId = String(form.dataset.postId || "");
    const article = form.closest(".saino-feed-post");
    const field = form.elements.comment;

    const content = String(field?.value || "").trim();

    if (!content || !article) return;

    const submit = form.querySelector(
      'button[type="submit"]'
    );

    runAction(`comment:${postId}`, submit, async () => {
      const result =
        await service().addComment(postId, content);

      if (!result?.ok) {
        throw new Error(result.message);
      }

      const list = commentsCache.get(postId) || [];

      list.push(result.data);

      commentsCache.set(postId, list.slice(-20));

      renderComments(
        article,
        postId,
        commentsCache.get(postId)
      );

      field.value = "";

      const post = getPostsMap().get(postId);

      if (post) {
        post.commentCount =
          Number(post.commentCount || 0) + 1;
      }

      if (post) updateCard(article, post);

      toast(
        text("Comment added.", "टिप्पणी थपियो।")
      );
    });
  });

  /* LIVE REACTION UPDATES */

  global.addEventListener(
    "ksk:post-interactions-change",
    event => {
      const changedId = String(
        event.detail?.postId || ""
      );

      const visibleIds = changedId
        ? [changedId]
        : [
            ...document.querySelectorAll(
              ".saino-feed-post[data-post-id]"
            )
          ].map(article => article.dataset.postId);

      if (!visibleIds.length) return;

      service().getPostStates(visibleIds).then(result => {
        if (!result?.ok) return;

        const posts = getPostsMap();

        Object.entries(result.data || {}).forEach(
          ([id, state]) => {
            states.set(id, state);

            const article = document.querySelector(
              `.saino-feed-post[data-post-id="${CSS.escape(id)}"]`
            );

            const post = posts.get(id);

            if (article && post) {
              updateCard(article, post);
            }
          }
        );
      });
    }
  );

  /* LIVE COMMENT UPDATES */

  global.addEventListener(
    "ksk:posts-cloud-change",
    event => {
      if (event.detail?.action !== "comment-realtime") {
        return;
      }

      const postId = String(
        event.detail?.postId || ""
      );

      if (!postId || !openComments.has(postId)) {
        return;
      }

      const article = document.querySelector(
        `.saino-feed-post[data-post-id="${CSS.escape(postId)}"]`
      );

      if (article) {
        commentsCache.delete(postId);

        loadComments(article, postId, true)
          .catch(error => console.warn(error));
      }
    }
  );

  /* APP EVENTS */

  global.addEventListener("saino:app-ready", event => {
    currentUserId = String(
      event.detail?.user?.id ||
      global.KSKSupabaseAuth?.getUser?.()?.id ||
      ""
    );

    scheduleHydrate();
  });

  global.addEventListener("saino:language-change", () => {
    commentsCache.clear();
    scheduleHydrate();
  });

  /* WATCH THE FEED WITHOUT REACTING TO OUR OWN BUTTON UPDATES */

  function startObserver() {
    if (!document.body || observer) return;

    observer = new MutationObserver(records => {
      const relevant = records.some(record =>
        [...record.addedNodes].some(node => {
          if (!(node instanceof Element)) return false;

          return node.matches(
            ".saino-feed-list, .saino-feed-post"
          ) || Boolean(
            node.querySelector(
              ".saino-feed-list, .saino-feed-post"
            )
          );
        })
      );

      if (relevant) scheduleHydrate();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    scheduleHydrate();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startObserver,
      { once: true }
    );

  } else {
    startObserver();
  }

  global.SainoFeedInteractions = Object.freeze({
    refresh: scheduleHydrate
  });

})(window);
