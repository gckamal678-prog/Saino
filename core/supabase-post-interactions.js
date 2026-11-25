/* Saino Post Interactions — likes, comments and saved posts. */
(function (global) {
  "use strict";

  if (global.KSKSupabasePostInteractions) return;

  const REACTIONS = "post_reactions";
  const COMMENTS = "post_comments";
  const SAVED = "saved_posts";
  const LIKE_EMOJI = "🌹";
  const MAX_COMMENT_LENGTH = 5000;
  const COMMENT_PAGE_SIZE = 20;

  let realtimeChannel = null;
  let realtimeUserId = "";
  let realtimeStarting = false;

  function result(ok, code, data = null, message = "") {
    return { ok, code, data, message };
  }

  function errorMessage(error) {
    return String(
      error?.message || error?.details || error?.hint ||
      "पोस्टसम्बन्धी काम पूरा गर्न सकिएन।"
    );
  }

  async function getContext() {
    const auth = global.KSKSupabaseAuth;
    if (!auth?.initialize || !auth?.getClient || !auth?.getUser) {
      throw new Error("Supabase Authentication सेवा उपलब्ध छैन।");
    }

    const initialized = await auth.initialize();
    if (!initialized || !auth.isAuthenticated?.()) {
      throw new Error("पहिले आफ्नो खातामा लगइन गर्नुहोस्।");
    }

    const client = auth.getClient();
    const user = auth.getUser();
    if (!client || !user?.id) {
      throw new Error("लगइन Session प्राप्त भएन। फेरि प्रयास गर्नुहोस्।");
    }

    return { client, user };
  }

  function cleanPostIds(postIds) {
    const ids = [...new Set(
      (Array.isArray(postIds) ? postIds : [postIds])
        .map(id => String(id || "").trim())
        .filter(Boolean)
    )];

    if (ids.length > 100) {
      throw new Error("एक पटकमा बढीमा 100 पोस्ट मात्र लोड गर्न सकिन्छ।");
    }

    return ids;
  }

  function normalizeComment(row) {
    if (!row) return null;
    return {
      id: String(row.id || ""),
      postId: String(row.post_id || ""),
      userId: String(row.user_id || ""),
      parentId: row.parent_id || null,
      text: String(row.content || ""),
      author: String(row.author_name || "Saino सदस्य"),
      avatar: String(row.author_avatar_url || ""),
      createdAt: row.created_at || ""
    };
  }

  async function getPostStates(postIds) {
    try {
      const ids = cleanPostIds(postIds);
      if (!ids.length) return result(true, "POST_STATES_LOADED", {});

      const { client, user } = await getContext();
      const states = Object.fromEntries(ids.map(id => [id, {
        likes: 0,
        liked: false,
        saved: false
      }]));

      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await client
          .from(REACTIONS)
          .select("post_id,user_id,emoji")
          .in("post_id", ids)
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];

        rows.forEach(row => {
          const id = String(row.post_id || "");
          if (!states[id]) return;

          states[id].likes += 1;

          if (String(row.user_id || "") === user.id) {
            states[id].liked = true;
          }
        });

        if (rows.length < pageSize) break;
        offset += pageSize;
      }

      const { data: savedRows, error: savedError } = await client
        .from(SAVED)
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", ids);

      if (savedError) throw savedError;

      (savedRows || []).forEach(row => {
        const id = String(row.post_id || "");
        if (states[id]) states[id].saved = true;
      });

      return result(true, "POST_STATES_LOADED", states);

    } catch (error) {
      console.error("Post interaction state load failed:", error);
      return result(false, "POST_STATES_FAILED", null, errorMessage(error));
    }
  }

  async function toggleLike(postId) {
    try {
      const id = String(postId || "").trim();
      if (!id) throw new Error("पोस्ट ID उपलब्ध छैन।");

      const { client, user } = await getContext();

      const { data: existing, error: readError } = await client
        .from(REACTIONS)
        .select("id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (readError) throw readError;

      if (existing) {
        const { error } = await client
          .from(REACTIONS)
          .delete()
          .eq("post_id", id)
          .eq("user_id", user.id);

        if (error) throw error;

      } else {
        const { error } = await client
          .from(REACTIONS)
          .insert({
            post_id: id,
            user_id: user.id,
            emoji: LIKE_EMOJI
          });

        if (error) throw error;
      }

      const refreshed = await getPostStates([id]);
      if (!refreshed.ok) throw new Error(refreshed.message);

      return result(true, "LIKE_UPDATED", refreshed.data[id]);

    } catch (error) {
      console.error("Post like update failed:", error);
      return result(false, "LIKE_UPDATE_FAILED", null, errorMessage(error));
    }
  }

  async function toggleSave(postId) {
    try {
      const id = String(postId || "").trim();
      if (!id) throw new Error("पोस्ट ID उपलब्ध छैन।");

      const { client, user } = await getContext();

      const { data: existing, error: readError } = await client
        .from(SAVED)
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (readError) throw readError;

      if (existing) {
        const { error } = await client
          .from(SAVED)
          .delete()
          .eq("post_id", id)
          .eq("user_id", user.id);

        if (error) throw error;

        return result(true, "POST_UNSAVED", { saved: false });
      }

      const { error } = await client
        .from(SAVED)
        .insert({
          post_id: id,
          user_id: user.id
        });

      if (error) throw error;

      return result(true, "POST_SAVED", { saved: true });

    } catch (error) {
      console.error("Post save update failed:", error);
      return result(false, "POST_SAVE_FAILED", null, errorMessage(error));
    }
  }

  async function getComments(postId, options = {}) {
    try {
      const id = String(postId || "").trim();
      if (!id) throw new Error("पोस्ट ID उपलब्ध छैन।");

      const { client } = await getContext();

      const requested = Number(options.limit || COMMENT_PAGE_SIZE);
      const limit = Math.min(50, Math.max(1,
        Number.isFinite(requested) ? requested : COMMENT_PAGE_SIZE
      ));

      const { data, error } = await client
        .from(COMMENTS)
        .select(
          "id,post_id,user_id,parent_id,content,author_name,author_avatar_url,created_at"
        )
        .eq("post_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const comments = (data || [])
        .map(normalizeComment)
        .filter(Boolean)
        .reverse();

      return result(true, "COMMENTS_LOADED", comments);

    } catch (error) {
      console.error("Post comments load failed:", error);
      return result(false, "COMMENTS_LOAD_FAILED", null, errorMessage(error));
    }
  }

  async function addComment(postId, value) {
    try {
      const id = String(postId || "").trim();
      const content = String(value ?? "").trim();

      if (!id) throw new Error("पोस्ट ID उपलब्ध छैन।");
      if (!content) throw new Error("टिप्पणी लेख्नुहोस्।");

      if (content.length > MAX_COMMENT_LENGTH) {
        throw new Error(
          `टिप्पणी बढीमा ${MAX_COMMENT_LENGTH} अक्षरको हुनुपर्छ।`
        );
      }

      const { client, user } = await getContext();

      const profile =
        await global.KSKSupabaseProfile?.getMyProfile?.();

      const authorName = String(profile?.name || "").trim();

      if (!authorName) {
        throw new Error(
          "टिप्पणी गर्नुअघि प्रोफाइलमा आफ्नो नाम राख्नुहोस्।"
        );
      }

      const { data, error } = await client
        .from(COMMENTS)
        .insert({
          post_id: id,
          user_id: user.id,
          parent_id: null,
          content,
          author_name: authorName.slice(0, 120),
          author_avatar_url: profile?.avatar || null
        })
        .select(
          "id,post_id,user_id,parent_id,content,author_name,author_avatar_url,created_at"
        )
        .single();

      if (error) throw error;

      return result(true, "COMMENT_CREATED", normalizeComment(data));

    } catch (error) {
      console.error("Post comment create failed:", error);
      return result(false, "COMMENT_CREATE_FAILED", null, errorMessage(error));
    }
  }

  async function deleteComment(commentId) {
    try {
      const id = String(commentId || "").trim();
      if (!id) throw new Error("टिप्पणी ID उपलब्ध छैन।");

      const { client, user } = await getContext();

      const { data, error } = await client
        .from(COMMENTS)
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error("टिप्पणी भेटिएन वा हटाउने अनुमति छैन।");
      }

      return result(true, "COMMENT_DELETED", { id });

    } catch (error) {
      console.error("Post comment delete failed:", error);
      return result(false, "COMMENT_DELETE_FAILED", null, errorMessage(error));
    }
  }

  async function stopRealtime() {
    const client = global.KSKSupabaseAuth?.getClient?.();
    const old = realtimeChannel;

    realtimeChannel = null;
    realtimeUserId = "";

    if (old && client?.removeChannel) {
      try {
        await client.removeChannel(old);
      } catch (error) {
        console.warn("Post interaction realtime cleanup failed:", error);
      }
    }

    return true;
  }

  async function startRealtime() {
    if (realtimeStarting) return false;

    let context;

    try {
      context = await getContext();
    } catch (_) {
      await stopRealtime();
      return false;
    }

    const { client, user } = context;

    if (
      realtimeChannel &&
      realtimeUserId === user.id
    ) {
      return true;
    }

    realtimeStarting = true;

    try {
      await stopRealtime();

      const channel = client
        .channel("saino-post-interactions-live")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: REACTIONS
          },
          payload => {
            global.dispatchEvent(
              new CustomEvent("ksk:post-interactions-change", {
                detail: {
                  type: "reaction",
                  postId:
                    payload?.new?.post_id ||
                    payload?.old?.post_id ||
                    ""
                }
              })
            );
          }
        );

      realtimeChannel = channel;
      realtimeUserId = user.id;

      await channel.subscribe(status => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          console.warn("Post interaction realtime status:", status);
        }
      });

      return true;

    } catch (error) {
      console.warn("Post interaction realtime could not start:", error);

      realtimeChannel = null;
      realtimeUserId = "";

      return false;

    } finally {
      realtimeStarting = false;
    }
  }

  global.addEventListener("ksk:auth-change", event => {
    if (event.detail?.user?.id) startRealtime();
    else stopRealtime();
  });

  global.addEventListener("ksk:auth-ready", event => {
    if (event.detail?.user?.id) startRealtime();
    else stopRealtime();
  });

  global.KSKSupabasePostInteractions = Object.freeze({
    initialize: async () => {
      const initialized =
        await global.KSKSupabaseAuth?.initialize?.();

      if (!initialized) return false;

      await startRealtime();
      return true;
    },

    getPostStates,
    toggleLike,
    toggleSave,
    getComments,
    addComment,
    deleteComment,
    startRealtime,
    stopRealtime
  });

  console.info("KSK Supabase Post Interactions loaded.");

})(window);
