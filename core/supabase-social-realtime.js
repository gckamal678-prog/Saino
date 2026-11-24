
(function (global) {
  "use strict";

  if (global.KSKSupabaseSocialRealtime) return;

  const TABLES = [
    "friend_requests",
    "friendships",
    "user_follows",
    "user_blocks",
    "chat_preferences"
  ];

  let channel = null;
  let clientRef = null;
  let userIdRef = "";
  let startPromise = null;
  let retryTimer = null;
  let retryDelay = 2000;
  let generation = 0;
  let stopped = false;

  function auth() {
    return global.KSKSupabaseAuth || null;
  }

  function emit(name, detail = {}) {
    global.dispatchEvent(
      new CustomEvent(name, { detail })
    );
  }

  function status(state, extra = {}) {
    emit("ksk:social-realtime-status", {
      state,
      userId: userIdRef || null,
      ...extra
    });
  }

  function clearRetry() {
    if (retryTimer !== null) {
      global.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  async function removeChannel() {
    const oldChannel = channel;
    const oldClient = clientRef;

    channel = null;
    clientRef = null;
    userIdRef = "";

    if (oldChannel && oldClient?.removeChannel) {
      try {
        await oldClient.removeChannel(oldChannel);
      } catch (error) {
        console.warn(
          "Saino social realtime cleanup:",
          error
        );
      }
    }
  }

  function refreshFeature(table, payload) {
    const detail = {
      source: "realtime",
      table,
      eventType: payload?.eventType || "",
      record: payload?.new || payload?.old || null
    };

    if (
      table === "friend_requests" ||
      table === "friendships" ||
      table === "user_follows" ||
      table === "user_blocks"
    ) {
      emit("ksk:friends-cloud-change", detail);
      return;
    }

    if (table === "chat_preferences") {
      Promise.resolve(
        global.SainoChatList?.refresh?.()
      ).catch(error => {
        console.warn(
          "Saino chat preference refresh:",
          error
        );
      });

      emit("ksk:chat-preferences-realtime", detail);
    }
  }

  function scheduleRetry(expectedGeneration) {
    if (
      stopped ||
      retryTimer !== null ||
      global.navigator?.onLine === false
    ) {
      return;
    }

    retryTimer = global.setTimeout(() => {
      retryTimer = null;

      if (
        stopped ||
        expectedGeneration !== generation
      ) {
        return;
      }

      start().catch(error => {
        console.warn(
          "Saino social realtime retry:",
          error
        );
      });
    }, retryDelay);

    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  async function start() {
    if (startPromise) return startPromise;

    stopped = false;
    clearRetry();

    const currentGeneration = ++generation;

    startPromise = (async () => {
      let api;
      let client;
      let user;

      try {
        api = auth();

        if (!api?.initialize) {
          status("unavailable", {
            reason: "AUTH_MODULE_MISSING"
          });

          return false;
        }

        await api.initialize();

        if (!api.isAuthenticated?.()) {
          await removeChannel();
          status("signed_out");
          return false;
        }

        client = api.getClient?.();
        user = api.getUser?.();

        if (!client || !user?.id) {
          status("unavailable", {
            reason: "AUTH_SESSION_MISSING"
          });

          return false;
        }

        if (
          channel &&
          clientRef === client &&
          userIdRef === user.id
        ) {
          return true;
        }

        await removeChannel();

        if (
          stopped ||
          currentGeneration !== generation
        ) {
          return false;
        }

        const nextChannel = client.channel(
          "saino-social-" + user.id
        );

        TABLES.forEach(table => {
          nextChannel.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table
            },
            payload => {
              if (
                stopped ||
                currentGeneration !== generation ||
                channel !== nextChannel
              ) {
                return;
              }

              refreshFeature(table, payload);
            }
          );
        });

        channel = nextChannel;
        clientRef = client;
        userIdRef = user.id;

        const subscribed = await new Promise(resolve => {
          let settled = false;

          const timeout = global.setTimeout(
            () => finish(false),
            15000
          );

          function finish(value) {
            if (settled) return;

            settled = true;
            global.clearTimeout(timeout);
            resolve(value);
          }

          nextChannel.subscribe(state => {
            if (
              stopped ||
              currentGeneration !== generation ||
              channel !== nextChannel
            ) {
              finish(false);
              return;
            }

            if (state === "SUBSCRIBED") {
              retryDelay = 2000;
              status("connected");
              finish(true);
              return;
            }

            if (
              state === "CHANNEL_ERROR" ||
              state === "TIMED_OUT" ||
              state === "CLOSED"
            ) {
              status("disconnected", {
                reason: state
              });

              finish(false);
              scheduleRetry(currentGeneration);
            }
          });
        });

        if (!subscribed) {
          if (channel === nextChannel) {
            await removeChannel();
          }

          scheduleRetry(currentGeneration);
          return false;
        }

        return true;

      } catch (error) {
        console.warn(
          "Saino social realtime:",
          error
        );

        status("error", {
          message: String(
            error?.message ||
            "Realtime connection failed"
          )
        });

        await removeChannel();
        scheduleRetry(currentGeneration);

        return false;
      }
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  async function stop() {
    stopped = true;
    generation += 1;

    clearRetry();

    await removeChannel();
    status("stopped");

    return true;
  }

  global.addEventListener(
    "ksk:auth-ready",
    event => {
      if (event.detail?.user) {
        start();
      } else {
        stop();
      }
    }
  );

  global.addEventListener(
    "ksk:auth-change",
    event => {
      if (event.detail?.user) {
        start();
      } else {
        stop();
      }
    }
  );

  global.addEventListener("online", () => {
    if (auth()?.isAuthenticated?.()) {
      start();
    }
  });

  global.addEventListener("offline", () => {
    status("offline");
  });

  global.addEventListener("pagehide", () => {
    stop();
  });

  global.addEventListener("pageshow", event => {
    if (
      event.persisted &&
      auth()?.isAuthenticated?.()
    ) {
      start();
    }
  });

  global.KSKSupabaseSocialRealtime = Object.freeze({
    start,
    stop,

    getStatus: () => ({
      connected: Boolean(channel),
      userId: userIdRef || null
    })
  });

})(window);
