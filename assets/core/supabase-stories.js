"use strict";

/*
 * SAINO — SUPABASE STORIES ADAPTER
 * Version: 1.0.0
 *
 * Features:
 * - Create image/video stories
 * - View own and accepted friends' stories
 * - 24-hour expiry filtering
 * - Edit story caption
 * - Delete story and media
 * - Record story views
 * - View story viewers
 * - Private Storage signed URLs
 *
 * Dependencies:
 * - core/supabase-auth.js
 *
 * Database:
 * - public.stories
 * - public.story_views
 * - public.friendships
 * - public.profiles
 *
 * Storage:
 * - story-media (private)
 */

(function (global) {
  "use strict";

  if (global.KSKSupabaseStories) return;

  const TABLE = {
    stories: "stories",
    views: "story_views",
    friendships: "friendships",
    profiles: "profiles"
  };

  const BUCKET = "story-media";

  const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
  const MAX_CAPTION_LENGTH = 500;

  const SIGNED_URL_SECONDS = 3600;
  const SIGNED_URL_MARGIN = 30000;

  const IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  const VIDEO_TYPES = [
    "video/mp4",
    "video/webm"
  ];

  const STORY_COLUMNS = [
    "id",
    "user_id",
    "media_path",
    "media_type",
    "caption",
    "created_at",
    "edited_at",
    "expires_at"
  ].join(",");

  const signedUrlCache = new Map();

  function makeResult(ok, code, data = null, message = "") {
    return { ok, code, data, message };
  }

  function getErrorMessage(error) {
    const code = error?.code || "";

    const messages = {
      "23505": "यो विवरण पहिले नै सुरक्षित भइसकेको छ।",
      "23503": "सम्बन्धित स्टोरी वा प्रयोगकर्ता भेटिएन।",
      "42501": "यो काम गर्ने अनुमति छैन।",
      "PGRST116": "रेकर्ड भेटिएन।",
      "P0001": error?.message || "यो कार्य पूरा गर्न मिलेन।"
    };

    return messages[code] ||
      error?.message ||
      error?.details ||
      "स्टोरीसम्बन्धी काम पूरा गर्न सकिएन।";
  }

  function dispatchChange(action, detail = {}) {
    try {
      global.dispatchEvent(
        new CustomEvent("ksk:stories-cloud-change", {
          detail: {
            action,
            ...detail
          }
        })
      );
    } catch (_) {}
  }

  function normalizeId(value) {
    if (typeof value !== "string") return "";

    const id = value.trim();

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? id
      : "";
  }

  function createId() {
    return global.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function getContext() {
    const auth = global.KSKSupabaseAuth;

    if (!auth) {
      throw new Error(
        "Supabase Authentication उपलब्ध छैन।"
      );
    }

    if (typeof auth.initialize !== "function") {
      throw new Error(
        "Supabase Auth Initialization उपलब्ध छैन।"
      );
    }

    const initialized = await auth.initialize();

    if (!initialized) {
      throw new Error(
        "Supabase सुरु हुन सकेन। फेरि प्रयास गर्नुहोस्।"
      );
    }

    if (!auth.isAuthenticated?.()) {
      throw new Error(
        "पहिले आफ्नो खातामा लगइन गर्नुहोस्।"
      );
    }

    const client = auth.getClient?.();
    const user = auth.getUser?.();

    if (!client || !user?.id) {
      throw new Error(
        "लगइन Session प्राप्त भएन।"
      );
    }

    return {
      client,
      user,
      userId: normalizeId(user.id)
    };
  }

  function cleanCaption(value) {
    const caption = String(value ?? "").trim();

    if (caption.length > MAX_CAPTION_LENGTH) {
      throw new Error(
        `स्टोरी Caption बढीमा ${MAX_CAPTION_LENGTH} अक्षरको हुनुपर्छ।`
      );
    }

    return caption;
  }

  function getFileExtension(file) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm"
    };

    return extensions[
      String(file?.type || "").toLowerCase()
    ] || "";
  }

  function validateFile(file) {
    if (!(file instanceof Blob)) {
      throw new Error(
        "फोटो वा भिडियो फाइल छान्नुहोस्।"
      );
    }

    const type = String(file.type || "").toLowerCase();

    if (!IMAGE_TYPES.includes(type) &&
        !VIDEO_TYPES.includes(type)) {
      throw new Error(
        "JPEG, PNG, WebP, GIF, MP4 वा WebM फाइल मात्र प्रयोग गर्न सकिन्छ।"
      );
    }

    if (file.size <= 0) {
      throw new Error(
        "छानिएको फाइल खाली छ।"
      );
    }

    const isVideo = VIDEO_TYPES.includes(type);

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      throw new Error(
        "भिडियोको आकार ५० MB भन्दा बढी हुनुहुँदैन।"
      );
    }

    if (!isVideo && file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        "फोटोको आकार १५ MB भन्दा बढी हुनुहुँदैन।"
      );
    }

    return {
      type: isVideo ? "video" : "image",
      extension: getFileExtension(file)
    };
  }

  function clearSignedUrlCache() {
    signedUrlCache.clear();
  }

  async function getSignedMediaUrl(mediaPath, forceRefresh = false) {
    const path = String(mediaPath || "").trim();

    if (!path) {
      throw new Error(
        "स्टोरी Media Path उपलब्ध छैन।"
      );
    }

    const cached = signedUrlCache.get(path);

    if (
      !forceRefresh &&
      cached &&
      cached.expiresAt > Date.now() + SIGNED_URL_MARGIN
    ) {
      return cached.url;
    }

    const { client } = await getContext();

    const { data, error } = await client
      .storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);

    if (error) throw error;

    if (!data?.signedUrl) {
      throw new Error(
        "स्टोरी Media URL बनाउन सकिएन।"
      );
    }

    signedUrlCache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() +
        (SIGNED_URL_SECONDS * 1000)
    });

    return data.signedUrl;
  }

  async function uploadMedia(client, userId, file) {
    const validation = validateFile(file);

    const fileName =
      `${createId()}.${validation.extension}`;

    const path = `${userId}/${fileName}`;

    const { error } = await client
      .storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });

    if (error) throw error;

    return {
      path,
      mediaType: validation.type
    };
  }

  async function getFriendIds(client, userId) {
    const { data, error } = await client
      .from(TABLE.friendships)
      .select("user_a_id,user_b_id")
      .or(
        `user_a_id.eq.${userId},user_b_id.eq.${userId}`
      );

    if (error) throw error;

    const ids = new Set();

    (data || []).forEach(row => {
      const otherId = row.user_a_id === userId
        ? row.user_b_id
        : row.user_a_id;

      const id = normalizeId(otherId);

      if (id && id !== userId) {
        ids.add(id);
      }
    });

    return [...ids];
  }

  async function getProfiles(client, userIds) {
    const ids = [
      ...new Set(
        (userIds || [])
          .map(normalizeId)
          .filter(Boolean)
      )
    ];

    if (!ids.length) return [];

    const { data, error } = await client
      .from(TABLE.profiles)
      .select("id,name,first_name,last_name,avatar_url")
      .in("id", ids);

    if (error) throw error;

    return (data || []).map(profile => ({
      id: profile.id,
      userId: profile.id,
      name:
        profile.name ||
        [
          profile.first_name,
          profile.last_name
        ].filter(Boolean).join(" ") ||
        "Saino User",
      avatarUrl: profile.avatar_url || null
    }));
  }

  function mapStory(story, profile, mediaUrl, viewCount = 0, viewed = false) {
    return {
      id: story.id,
      userId: story.user_id,

      user: profile || {
        id: story.user_id,
        userId: story.user_id,
        name: "Saino User",
        avatarUrl: null
      },

      mediaPath: story.media_path,
      mediaUrl,

      mediaType: story.media_type,
      caption: story.caption || "",

      createdAt: story.created_at,
      editedAt: story.edited_at,
      expiresAt: story.expires_at,

      viewCount,
      viewed,

      isExpired:
        new Date(story.expires_at).getTime() <= Date.now()
    };
  }

  /* =====================================================
     INITIALIZE
  ===================================================== */

  async function initialize() {
    try {
      await getContext();

      return makeResult(
        true,
        "STORIES_READY",
        true,
        "Story सेवा तयार छ।"
      );
    } catch (error) {
      return makeResult(
        false,
        "STORIES_INIT_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     CREATE STORY
  ===================================================== */

  async function createStory(options = {}) {
    let uploadedPath = "";

    try {
      const { client, userId } = await getContext();

      const file = options.file || options.media;

      const caption = cleanCaption(
        options.caption
      );

      if (!file) {
        throw new Error(
          "स्टोरी राख्न फोटो वा भिडियो छान्नुहोस्।"
        );
      }

      const uploaded = await uploadMedia(
        client,
        userId,
        file
      );

      uploadedPath = uploaded.path;

      const { data, error } = await client
        .from(TABLE.stories)
        .insert({
          user_id: userId,
          media_path: uploaded.path,
          media_type: uploaded.mediaType,
          caption
        })
        .select(STORY_COLUMNS)
        .single();

      if (error) throw error;

      signedUrlCache.delete(uploaded.path);

      let mediaUrl = null;

      try {
        mediaUrl = await getSignedMediaUrl(
          uploaded.path
        );
      } catch (_) {}

      const story = mapStory(
        data,
        null,
        mediaUrl,
        0,
        false
      );

      dispatchChange("create", {
        storyId: data.id,
        userId
      });

      return makeResult(
        true,
        "STORY_CREATED",
        story,
        "स्टोरी सफलतापूर्वक राखियो।"
      );

    } catch (error) {
      if (uploadedPath) {
        try {
          const auth = global.KSKSupabaseAuth;
          const client = auth?.getClient?.();

          await client
            ?.storage
            ?.from(BUCKET)
            ?.remove([uploadedPath]);
        } catch (_) {}
      }

      return makeResult(
        false,
        "STORY_CREATE_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     GET STORIES FEED
  ===================================================== */

  async function getStories(options = {}) {
    try {
      const { client, userId } = await getContext();

      const friendIds = await getFriendIds(
        client,
        userId
      );

      const allowedIds = [
        userId,
        ...friendIds
      ];

      const limit = Math.min(
        200,
        Math.max(1, Number(options.limit) || 100)
      );

      const { data, error } = await client
        .from(TABLE.stories)
        .select(STORY_COLUMNS)
        .in("user_id", allowedIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", {
          ascending: true
        })
        .limit(limit);

      if (error) throw error;

      const rows = data || [];

      if (!rows.length) {
        return makeResult(
          true,
          "STORIES_LOADED",
          {
            stories: [],
            groups: [],
            ownStories: [],
            friendStories: []
          },
          "अहिले कुनै सक्रिय स्टोरी छैन।"
        );
      }

      const profiles = await getProfiles(
        client,
        rows.map(row => row.user_id)
      );

      const profileMap = new Map(
        profiles.map(profile => [
          profile.id,
          profile
        ])
      );

      const storyIds = rows.map(row => row.id);

      const [viewsResponse, myViewsResponse] =
        await Promise.all([
          client
            .from(TABLE.views)
            .select("story_id")
            .in("story_id", storyIds),

          client
            .from(TABLE.views)
            .select("story_id")
            .eq("viewer_id", userId)
            .in("story_id", storyIds)
        ]);

      if (viewsResponse.error) {
        throw viewsResponse.error;
      }

      if (myViewsResponse.error) {
        throw myViewsResponse.error;
      }

      const viewCounts = new Map();

      (viewsResponse.data || []).forEach(view => {
        viewCounts.set(
          view.story_id,
          (viewCounts.get(view.story_id) || 0) + 1
        );
      });

      const viewedIds = new Set(
        (myViewsResponse.data || []).map(
          view => view.story_id
        )
      );

      const stories = await Promise.all(
        rows.map(async row => {
          let mediaUrl = null;

          try {
            mediaUrl = await getSignedMediaUrl(
              row.media_path
            );
          } catch (error) {
            console.warn(
              "Story media URL failed:",
              error
            );
          }

          return mapStory(
            row,
            profileMap.get(row.user_id),
            mediaUrl,
            viewCounts.get(row.id) || 0,
            viewedIds.has(row.id)
          );
        })
      );

      const groupsMap = new Map();

      stories.forEach(story => {
        if (!groupsMap.has(story.userId)) {
          groupsMap.set(story.userId, {
            user: story.user,
            userId: story.userId,
            isOwn: story.userId === userId,
            stories: [],
            hasUnviewed: false,
            latestAt: story.createdAt
          });
        }

        const group = groupsMap.get(story.userId);

        group.stories.push(story);

        if (!story.viewed && !group.isOwn) {
          group.hasUnviewed = true;
        }

        group.latestAt = story.createdAt;
      });

      const groups = [...groupsMap.values()];

      groups.sort((a, b) => {
        if (a.isOwn !== b.isOwn) {
          return a.isOwn ? -1 : 1;
        }

        return new Date(b.latestAt) -
          new Date(a.latestAt);
      });

      const ownStories = stories.filter(
        story => story.userId === userId
      );

      const friendStories = stories.filter(
        story => story.userId !== userId
      );

      return makeResult(
        true,
        "STORIES_LOADED",
        {
          stories,
          groups,
          ownStories,
          friendStories
        },
        "स्टोरीहरू प्राप्त भए।"
      );

    } catch (error) {
      return makeResult(
        false,
        "STORIES_LOAD_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     GET MY STORIES
  ===================================================== */

  async function getMyStories() {
    try {
      const { client, userId } = await getContext();

      const { data, error } = await client
        .from(TABLE.stories)
        .select(STORY_COLUMNS)
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", {
          ascending: true
        });

      if (error) throw error;

      const stories = await Promise.all(
        (data || []).map(async row => {
          let mediaUrl = null;

          try {
            mediaUrl = await getSignedMediaUrl(
              row.media_path
            );
          } catch (_) {}

          return mapStory(
            row,
            null,
            mediaUrl
          );
        })
      );

      return makeResult(
        true,
        "MY_STORIES_LOADED",
        stories
      );

    } catch (error) {
      return makeResult(
        false,
        "MY_STORIES_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     RECORD STORY VIEW
  ===================================================== */

  async function recordView(storyId) {
    try {
      const { client, userId } = await getContext();

      const id = normalizeId(storyId);

      if (!id) {
        throw new Error(
          "Story ID सही छैन।"
        );
      }

      const { data: story, error: storyError } =
        await client
          .from(TABLE.stories)
          .select("id,user_id,expires_at")
          .eq("id", id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

      if (storyError) throw storyError;

      if (!story) {
        throw new Error(
          "यो स्टोरी उपलब्ध छैन वा म्याद सकिएको छ।"
        );
      }

      if (story.user_id === userId) {
        return makeResult(
          true,
          "OWN_STORY_VIEW",
          { storyId: id, ownStory: true }
        );
      }

      const { error } = await client
        .from(TABLE.views)
        .insert({
          story_id: id,
          viewer_id: userId
        });

      // एउटै व्यक्तिको एउटै Story View दोहोरिँदा
      // Primary Key Conflict सामान्य रूपमा स्वीकार गर्ने।
      if (error && error.code !== "23505") {
        throw error;
      }

      dispatchChange("view", {
        storyId: id,
        viewerId: userId
      });

      return makeResult(
        true,
        error ? "STORY_ALREADY_VIEWED" : "STORY_VIEWED",
        {
          storyId: id,
          alreadyViewed: Boolean(error)
        }
      );

    } catch (error) {
      return makeResult(
        false,
        "STORY_VIEW_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     GET STORY VIEWERS
  ===================================================== */

  async function getStoryViewers(storyId) {
    try {
      const { client, userId } = await getContext();

      const id = normalizeId(storyId);

      if (!id) {
        throw new Error(
          "Story ID सही छैन।"
        );
      }

      const { data: story, error: storyError } =
        await client
          .from(TABLE.stories)
          .select("id,user_id")
          .eq("id", id)
          .maybeSingle();

      if (storyError) throw storyError;

      if (!story) {
        throw new Error(
          "स्टोरी भेटिएन।"
        );
      }

      if (story.user_id !== userId) {
        throw new Error(
          "स्टोरी हेर्ने व्यक्तिहरूको सूची मालिकले मात्र हेर्न सक्छ।"
        );
      }

      const { data, error } = await client
        .from(TABLE.views)
        .select("viewer_id,viewed_at")
        .eq("story_id", id)
        .order("viewed_at", {
          ascending: false
        });

      if (error) throw error;

      const rows = data || [];

      const profiles = await getProfiles(
        client,
        rows.map(row => row.viewer_id)
      );

      const profileMap = new Map(
        profiles.map(profile => [
          profile.id,
          profile
        ])
      );

      const viewers = rows.map(row => ({
        userId: row.viewer_id,
        viewedAt: row.viewed_at,
        user: profileMap.get(row.viewer_id) || {
          id: row.viewer_id,
          userId: row.viewer_id,
          name: "Saino User",
          avatarUrl: null
        }
      }));

      return makeResult(
        true,
        "STORY_VIEWERS_LOADED",
        {
          storyId: id,
          count: viewers.length,
          viewers
        }
      );

    } catch (error) {
      return makeResult(
        false,
        "STORY_VIEWERS_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     EDIT STORY CAPTION
  ===================================================== */

  async function updateStory(storyId, changes = {}) {
    try {
      const { client, userId } = await getContext();

      const id = normalizeId(storyId);

      if (!id) {
        throw new Error(
          "Story ID सही छैन।"
        );
      }

      const caption = cleanCaption(
        changes.caption
      );

      const { data, error } = await client
        .from(TABLE.stories)
        .update({
          caption,
          edited_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("user_id", userId)
        .select(STORY_COLUMNS)
        .single();

      if (error) throw error;

      dispatchChange("update", {
        storyId: id,
        userId
      });

      return makeResult(
        true,
        "STORY_UPDATED",
        data,
        "स्टोरी Caption परिवर्तन भयो।"
      );

    } catch (error) {
      return makeResult(
        false,
        "STORY_UPDATE_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     DELETE STORY
  ===================================================== */

  async function deleteStory(storyId) {
    try {
      const { client, userId } = await getContext();

      const id = normalizeId(storyId);

      if (!id) {
        throw new Error(
          "Story ID सही छैन।"
        );
      }

      const { data: story, error: findError } =
        await client
          .from(TABLE.stories)
          .select("id,user_id,media_path")
          .eq("id", id)
          .eq("user_id", userId)
          .single();

      if (findError) throw findError;

      const { error: deleteError } = await client
        .from(TABLE.stories)
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      signedUrlCache.delete(story.media_path);

      let mediaDeleted = true;

      try {
        const { error: storageError } = await client
          .storage
          .from(BUCKET)
          .remove([story.media_path]);

        if (storageError) {
          mediaDeleted = false;

          console.warn(
            "Story deleted but media cleanup failed:",
            storageError
          );
        }
      } catch (cleanupError) {
        mediaDeleted = false;

        console.warn(
          "Story media cleanup failed:",
          cleanupError
        );
      }

      dispatchChange("delete", {
        storyId: id,
        userId
      });

      return makeResult(
        true,
        "STORY_DELETED",
        {
          id,
          mediaDeleted
        },
        mediaDeleted
          ? "स्टोरी मेटियो।"
          : "स्टोरी मेटियो, तर Media सफा गर्न बाँकी छ।"
      );

    } catch (error) {
      return makeResult(
        false,
        "STORY_DELETE_FAILED",
        null,
        getErrorMessage(error)
      );
    }
  }

  /* =====================================================
     AUTH CHANGE
  ===================================================== */

  global.addEventListener("ksk:auth-change", () => {
    clearSignedUrlCache();
  });

  global.addEventListener("ksk:auth-ready", () => {
    clearSignedUrlCache();
  });

  /* =====================================================
     PUBLIC API
  ===================================================== */

  global.KSKSupabaseStories = Object.freeze({
    initialize,

    createStory,

    getStories,
    getMyStories,

    recordView,
    getStoryViewers,

    updateStory,
    deleteStory,

    getSignedMediaUrl,
    clearSignedUrlCache
  });

  console.info(
    "Saino Supabase Stories Adapter loaded."
  );

})(window);
