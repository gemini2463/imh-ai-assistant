import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import Config from "./Config";
import ChatFloat from "./components/ChatFloat.jsx";
import { randomBytes } from "crypto";
import { createPortal } from "react-dom";

const SERVER_URL_DEFAULT = Config.floatingConfig.serverURL;
const DEFAULT_FLOAT_SYSTEM_MESSAGE =
  Config.floatingConfig.systemMessage +
  "\n" +
  JSON.stringify(Config.floatingConfig.systemProfile);

function FloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false);

  const [serverURL] = useState(SERVER_URL_DEFAULT);

  const [serverUsername, setServerUsername] = useState(() => {
    const cookieUsername = Cookies.get("fa_serverUsername");
    return cookieUsername ? JSON.parse(cookieUsername) : "";
  });

  const [serverPassphrase, setServerPassphrase] = useState("");

  const [clientJWT, setClientJWT] = useState(() => {
    const cookieJWT = Cookies.get("fa_clientJWT");
    return cookieJWT ? JSON.parse(cookieJWT) : "";
  });

  const [checkedIn, setCheckedIn] = useState(() => {
    const cookieCheckedIn = Cookies.get("fa_checkedIn");
    return cookieCheckedIn ? JSON.parse(cookieCheckedIn) : false;
  });

  const [signInError, setSignInError] = useState(false);

  // NEW: sessionHash, like in Chatter.jsx
  const [sessionHash, setSessionHash] = useState(() => {
    const cookieHash = Cookies.get("fa_sessionHash");
    return cookieHash ? JSON.parse(cookieHash) : "";
  });

  // Ensure we have a sessionHash (generate if missing)
  useEffect(() => {
    if (!sessionHash) {
      const newHash = randomBytes(16).toString("hex");
      setSessionHash(newHash);
      Cookies.set("fa_sessionHash", JSON.stringify(newHash), { expires: 1 });
    }
  }, [sessionHash]);

  // You can hardcode model/settings for the floating assistant:
  const [modelName] = useState("gpt-5.2"); // or from a config
  const [reasoningPick, setReasoningPick] = useState("none");
  const [verbosityPick, setVerbosityPick] = useState("medium");
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [responseTools] = useState(["shell"]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const clearAuth = useCallback(() => {
    Cookies.set("fa_clientJWT", JSON.stringify(""), { expires: 1 });
    Cookies.set("fa_checkedIn", JSON.stringify(false), { expires: 1 });
    Cookies.set("fa_serverUsername", JSON.stringify(""), { expires: 1 });
    // We generally keep sessionHash; if you truly want to reset it on logout:
    // Cookies.set("fa_sessionHash", JSON.stringify(""), { expires: 1 });
    // setSessionHash("");

    setClientJWT("");
    setCheckedIn(false);
    setServerUsername("");
  }, []);

  const logoutUser = useCallback(async () => {
    clearAuth();
  }, [clearAuth]);

  // Check-in: now includes sessionHash
  const clientCheckIn = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      setSignInError(false);

      try {
        // Ensure we have a sessionHash before calling
        let currentHash = sessionHash;
        if (!currentHash) {
          currentHash = randomBytes(16).toString("hex");
          setSessionHash(currentHash);
          Cookies.set("fa_sessionHash", JSON.stringify(currentHash), {
            expires: 1,
          });
        }

        const checkinResp = await axios.post(
          serverURL + "/checkin",
          {
            serverUsername,
            serverPassphrase,
            sessionHash: currentHash, // <-- added
          },
          {
            headers: { "Content-Type": "application/json" },
          }
        );

        const data = checkinResp?.data;
        if (!data || !data.token) {
          throw new Error("No token returned");
        }

        Cookies.set("fa_clientJWT", JSON.stringify(data.token), { expires: 1 });
        setClientJWT(data.token);

        Cookies.set("fa_serverUsername", JSON.stringify(serverUsername), {
          expires: 1,
        });
        Cookies.set("fa_checkedIn", JSON.stringify(true), { expires: 1 });
        setCheckedIn(true);
      } catch (error) {
        console.error("FloatingAssistant /checkin error:", error);
        clearAuth();
        setSignInError(true);
      }
    },
    [serverURL, serverUsername, serverPassphrase, sessionHash, clearAuth]
  );

  // Optional: if JWT disappears from cookies, clear local auth
  useEffect(() => {
    const cookieJWT = Cookies.get("fa_clientJWT");
    if (!cookieJWT && clientJWT) {
      clearAuth();
    }
  }, [clientJWT, clearAuth]);

  // Enter key in password field
  const handleLoginKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      clientCheckIn();
    }
  };

  return createPortal(
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={handleToggle}
        style={{
          position: "fixed",
          right: "1rem",
          bottom: "1rem",
          zIndex: 2147483647,
          width: "76px",
          height: "76px",
        }}
        className="
          flex items-center justify-center
          rounded-2xl
          bg-black
          border border-white/20
          shadow-[0_0_24px_rgba(0,0,0,0.8)]
          overflow-hidden
          relative
          transition
          duration-200
          hover:scale-125 hover:border-white/40
          hover:shadow-[0_0_32px_rgba(255,255,255,0.35)]
          active:scale-95
        "
      >
        <span
          className="
            pointer-events-none
            absolute inset-0
            bg-gradient-to-tr from-white/20 via-white/5 to-transparent
            opacity-40
            group-hover:opacity-60
          "
        />
        <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-black">
          <img
            src="imh-ai-assistant.png"
            alt="AI Assistant"
            className="h-16 w-16 object-contain"
          />
        </span>
      </button>

      {/* Popup panel */}

      <>
        {/* Header */}{" "}
        <div
          className={`
    fixed bottom-24 right-6 z-[2147483647]
    w-[420px] max-w-[95vw]
    rounded-3xl
    bg-black/95
    border border-white/10
    shadow-[0_0_40px_rgba(0,0,0,0.9)]
    text-white
    overflow-hidden
    backdrop-blur-xl
    flex flex-col
    max-h-[70vh]
    transition-transform transition-opacity duration-200
    ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-4"}
  `}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
            <div className="text-xl text-white/70">
              {checkedIn ? (
                `Signed in as ${serverUsername || "unknown"}`
              ) : (
                <form
                  onSubmit={clientCheckIn}
                  className="px-5 pt-4 pb-5 space-y-4 text-xl"
                >
                  <h2 className="text-xl font-semibold tracking-tight">
                    Sign in
                  </h2>

                  <div className="space-y-2">
                    <label className="block text-xl text-white/60 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      autoComplete="username"
                      value={serverUsername}
                      onChange={(e) => setServerUsername(e.target.value)}
                      className="
                    w-full rounded-xl px-3 py-2
                    bg-white/5 border border-white/20
                    text-xl text-white
                    outline-none
                    focus:border-white/40 focus:ring-1 focus:ring-white/30
                  "
                      placeholder="Username"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xl text-white/60 mb-1">
                      Passphrase
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={serverPassphrase}
                      onChange={(e) => setServerPassphrase(e.target.value)}
                      onKeyDown={handleLoginKeyDown}
                      className="
                    w-full rounded-xl px-3 py-2
                    bg-white/5 border border-white/20
                    text-xl text-white
                    outline-none
                    focus:border-white/40 focus:ring-1 focus:ring-white/30
                  "
                      placeholder="Passphrase"
                    />
                  </div>

                  {signInError && (
                    <p className="text-xl text-red-400">
                      Login error. Please check your credentials.
                    </p>
                  )}

                  <button
                    type="submit"
                    className="
                  w-full mt-2
                  rounded-full px-3 py-2
                  bg-white text-black text-xl font-medium
                  hover:bg-white/90 transition
                "
                  >
                    Sign In
                  </button>
                </form>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="
                  h-8 w-8 flex items-center justify-center
                  rounded-full
                  hover:bg-white/10
                  transition
                  text-white/70
                "
                onClick={() => setIsOpen(false)}
              >
                <i className="fas fa-chevron-down text-xl" />
              </button>
            </div>
          </div>
        </div>
        {/* Body: either login form or chat */}
        {checkedIn && (
          <ChatFloat
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            serverURL={serverURL}
            clientJWT={clientJWT}
            model={modelName}
            systemMessage={DEFAULT_FLOAT_SYSTEM_MESSAGE}
            reasoningPick={reasoningPick}
            verbosityPick={verbosityPick}
            streamingEnabled={streamingEnabled}
            pickedTools={responseTools}
            serverUsername={serverUsername}
            checkedIn={checkedIn}
            logoutUser={logoutUser}
          />
        )}
      </>
    </>,
    document.body
  );
}

export default FloatingAssistant;
