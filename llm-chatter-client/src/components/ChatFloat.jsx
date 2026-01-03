import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import Config from "../Config";
import ContentText from "./ContentText";

const REASONING_LEVELS = ["None", "Low", "Medium", "High"];
const VERBOSITY_LEVELS = ["Low", "Medium", "High"];

const Dropdown = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative text-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          flex items-center gap-1
          bg-white/5
          rounded-full
          px-3 pr-6 py-1
          border border-white/15
          focus:outline-none focus:ring-2 focus:ring-white/30
          cursor-pointer
          text-white
          hover:border-gray-800
        "
      >
        <span className="truncate">
          {label}: {value}
        </span>
        <span className="ml-auto text-[10px] text-white/60">▼</span>
      </button>

      {open && (
        <div
          className="
            relative left-0 mt-1 w-max
            min-w-full
            rounded-xl
            bg-black
            border border-gray-800
            shadow-lg
            z-[2147483647]
          "
        >
          <ul className="py-1 text-xl">
            {options.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`
                    w-full text-left px-3 py-1.5
                    hover:bg-white/10 hover:text-white
                    ${
                      opt === value ? "text-white font-medium" : "text-white/80"
                    }
                  `}
                >
                  {label}: {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const ChatFloat = ({
  isOpen,
  onClose,
  serverURL,
  serverUsername,
  model,
  systemMessage,
  clientJWT,
  streamingEnabled,
  reasoningPick: initialReasoning = "none",
  verbosityPick: initialVerbosity = "medium",
  pickedTools,
  checkedIn,
  logoutUser,
}) => {
  const [reasoning, setReasoning] = useState(
    initialReasoning[0].toUpperCase() + initialReasoning.slice(1)
  );
  const [verbosity, setVerbosity] = useState(
    initialVerbosity[0].toUpperCase() + initialVerbosity.slice(1)
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(false);
  const [streamInput, setStreamInput] = useState("");
  const [tempOutput, setTempOutput] = useState("");
  const abortRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Shell-related state
  const [enableShellCmd, setEnableShellCmd] = useState(
    Array.isArray(pickedTools) && pickedTools.includes("shell")
  );
  const [shellCmd, setShellCmd] = useState([]);
  const [autoShellLoop, setAutoShellLoop] = useState(false);

  const handleResetChat = useCallback(() => {
    // Stop any in‑flight request
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (e) {
        console.warn("Abort error in reset:", e);
      }
    }

    setMessages([]);
    setInput("");
    setStreamInput("");
    setTempOutput("");
    setPending(false);
    setShellCmd([]);
    setAutoShellLoop(false);
    // If you want to also reset reasoning/verbosity, uncomment:
    // setReasoning(initialReasoning[0].toUpperCase() + initialReasoning.slice(1));
    // setVerbosity(initialVerbosity[0].toUpperCase() + initialVerbosity.slice(1));
  }, [initialReasoning, initialVerbosity]);

  const mapLevel = (v) => v.toLowerCase();

  const toTextArray = (inputVal) => {
    if (Array.isArray(inputVal)) return inputVal;
    if (typeof inputVal === "string") return [{ type: "text", text: inputVal }];
    return [{ type: "text", text: String(inputVal) }];
  };

  const getContentText = (content) => {
    if (Array.isArray(content)) {
      return content[0]?.text || "";
    }
    return typeof content === "string" ? content : "";
  };

  const fetchShell = useCallback(async (inputText, shellPath) => {
    const sendPacket = { shellCmd: inputText };

    try {
      const response = await axios.post(shellPath, sendPacket, {
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
      });
      return response.data;
    } catch (error) {
      console.error("ChatFloat: error fetching shell command:", error);
      throw error;
    }
  }, []);

  const fetchData = useCallback(
    async (inputText) => {
      const endPath = serverURL + "/openai";

      const baseMsgs =
        messages.length === 0 ||
        messages[0]?.role !== "system" ||
        messages[0]?.content?.[0]?.text !== systemMessage
          ? [
              {
                role: "system",
                content: [{ type: "text", text: systemMessage }],
              },
              ...messages,
            ]
          : messages;

      const msgs = [
        ...baseMsgs,
        { role: "user", content: [{ type: "text", text: inputText }] },
      ];

      const sendPacket = {
        model,
        messages: msgs,
        stream: streamingEnabled,
        reasoning: mapLevel(reasoning),
        verbosity: mapLevel(verbosity),
        responseTools: Array.isArray(pickedTools) ? pickedTools : [],
        thread: [],
        system: systemMessage,
        serverUsername: serverUsername,
        uniqueChatID: "float-" + (serverUsername || "anon"),
        sentOne: messages.some((m) => m.role === "assistant"),
        imgOutput: false,
        imgInput: false,
        prompt: inputText,
      };

      try {
        const startTime = Date.now();
        setPending(true);
        setTempOutput("");

        sendPacket.cmdResults = [];
        if (enableShellCmd && shellCmd.length > 0) {
          const cmdsToRun = shellCmd;
          setShellCmd([]);

          for (const cmd of cmdsToRun) {
            const res = await fetchShell(cmd, Config.shellScriptPath);
            sendPacket.cmdResults.push(res);
          }
        }

        let response;
        let output = "";

        if (streamingEnabled) {
          response = await fetch(endPath, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(clientJWT ? { Authorization: `Bearer ${clientJWT}` } : {}),
            },
            body: JSON.stringify(sendPacket),
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let isStreaming = true;

          const cmdKey = `__cmd_buf_float_${serverUsername || "anon"}`;
          if (!globalThis[cmdKey]) {
            globalThis[cmdKey] = { inCommand: false, buf: "" };
          }
          const cmdState = globalThis[cmdKey];

          while (isStreaming) {
            const { value, done } = await reader.read();
            if (done) {
              isStreaming = false;
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";

            for (const event of events) {
              if (event.startsWith("event: end")) {
                isStreaming = false;
                break;
              }

              const match = event.match(/^data:\s*(.*)$/m);
              if (!match) continue;

              let payload = match[1];
              if (payload === "[DONE]") {
                isStreaming = false;
                break;
              }

              try {
                payload = JSON.parse(payload);
              } catch {
                continue;
              }

              if (
                typeof payload.type === "string" &&
                payload.type.endsWith("delta") &&
                typeof payload.delta === "string"
              ) {
                const piece = payload.delta;
                if (cmdState.inCommand) {
                  cmdState.buf += piece;
                }
                output += piece;
                setTempOutput(output);
              }

              if (payload.type && payload.type.endsWith("command.added")) {
                cmdState.inCommand = true;
                cmdState.buf = "";
              }

              if (payload.type && payload.type.endsWith("command.done")) {
                cmdState.inCommand = false;
                const fullCmd = (cmdState.buf || "").trim();
                if (fullCmd.length > 0) {
                  setShellCmd((prev) => prev.concat(fullCmd));
                }
                cmdState.buf = "";
                output += "\n\n";
                setTempOutput(output);
              }
            }
          }

          setPending(false);
          const durTime = ((Date.now() - startTime) / 1000).toFixed(2);
          return [toTextArray(output || "No response."), durTime];
        } else {
          response = await axios.post(endPath, sendPacket, {
            headers: {
              "Content-Type": "application/json",
              ...(clientJWT ? { Authorization: `Bearer ${clientJWT}` } : {}),
            },
          });

          const durTime = ((Date.now() - startTime) / 1000).toFixed(2);
          const data = response.data;
          let commands = [];
          const outputs = data?.output;
          let outputText = "";

          if (Array.isArray(outputs) && outputs.length > 0) {
            const parts = [];

            for (const out of outputs) {
              if (!out || out.type === "reasoning") continue;

              if (out.type === "message") {
                const msg = out?.content?.[0]?.text;
                if (typeof msg === "string" && msg.trim() !== "") {
                  parts.push(msg);
                }
                continue;
              }

              if (out.type === "shell_call") {
                commands = out?.action?.commands;
                if (Array.isArray(commands) && commands.length > 0) {
                  for (const cmd of commands) {
                    const cmdStr = String(cmd);
                    parts.push(cmdStr);
                    setShellCmd((prev) => prev.concat(cmdStr));
                  }
                }
                continue;
              }

              const fallbackText = out?.content?.[0]?.text || out?.text || "";
              if (typeof fallbackText === "string" && fallbackText.trim()) {
                parts.push(fallbackText);
              }
            }

            if (parts.length > 0) {
              outputText = parts.join("\n\n");
            }
          }

          if (!outputText) {
            outputText =
              data?.output_text ||
              data?.output?.[0]?.content?.[0]?.text ||
              "No response.";
          }

          setPending(false);
          return [toTextArray(outputText), durTime];
        }
      } catch (err) {
        console.error("ChatFloat fetch error:", err);
        setPending(false);
        return [toTextArray("An error occurred."), 0];
      }
    },
    [
      serverURL,
      messages,
      systemMessage,
      model,
      reasoning,
      verbosity,
      streamingEnabled,
      clientJWT,
      pickedTools,
      serverUsername,
      enableShellCmd,
      shellCmd,
      fetchShell,
    ]
  );

  const handleSend = useCallback(
    async ({ fromShellLoop = false } = {}) => {
      const trimmed = fromShellLoop ? "" : input.trim();
      if (!fromShellLoop && (!trimmed || pending)) return;

      if (!fromShellLoop) {
        setStreamInput(trimmed);
        setInput("");

        const userMsg = {
          role: "user",
          content: [{ type: "text", text: trimmed }],
        };
        setMessages((prev) => prev.concat(userMsg));

        const [assistantContentArray] = await fetchData(trimmed);

        const assistantMsg = {
          role: "assistant",
          content: assistantContentArray,
        };

        setMessages((prev) => prev.concat(assistantMsg));
        setTempOutput("");
      } else {
        const [assistantContentArray] = await fetchData("");
        const assistantMsg = {
          role: "assistant",
          content: assistantContentArray,
        };
        setMessages((prev) => prev.concat(assistantMsg));
        setTempOutput("");
      }
    },
    [input, pending, fetchData]
  );

  const handleUserSend = useCallback(() => {
    if (pending) return;
    if (enableShellCmd) {
      setAutoShellLoop(true);
    }
    handleSend({ fromShellLoop: false });
  }, [pending, enableShellCmd, handleSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleUserSend();
      }
    },
    [handleUserSend]
  );

  useEffect(() => {
    if (!autoShellLoop) return;
    if (pending) return;
    if (!enableShellCmd) return;

    if (shellCmd.length > 0) {
      handleSend({ fromShellLoop: true });
    } else {
      setAutoShellLoop(false);
    }
  }, [autoShellLoop, shellCmd, pending, enableShellCmd, handleSend]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Keep latest content in view during streaming and after replies
  useEffect(() => {
    if (messagesEndRef.current) {
      try {
        messagesEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      } catch (_) {
        // no-op
      }
    }
  }, [messages, pending, tempOutput, isOpen]);

  return (
    <div
      className={`
      flex flex-col
      mt-4
      rounded-3xl
      bg-black/95
      border border-white/15
      shadow-[0_0_40px_rgba(0,0,0,0.9)]
      text-white
      overflow-hidden
      backdrop-blur-xl
      flex flex-col
      max-h-[90vh]
      transition-transform transition-opacity duration-200
      ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 pointer-events-none translate-y-4"}
    `}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 bg-gray-600/10">
        <div className="flex gap-2 items-center">
          <Dropdown
            label="Reasoning"
            value={reasoning}
            options={REASONING_LEVELS}
            onChange={setReasoning}
          />
          <Dropdown
            label="Verbosity"
            value={verbosity}
            options={VERBOSITY_LEVELS}
            onChange={setVerbosity}
          />
        </div>

        <div className="flex items-center gap-2">
          {checkedIn && (
            <button
              type="button"
              onClick={logoutUser}
              className="
                    text-xl text-white/60 hover:text-white
                    px-2 py-1 rounded-full hover:bg-white/10
                    transition
                  "
            >
              Log out
            </button>
          )}
          <button
            type="button"
            onClick={handleResetChat}
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            className="
              text-[16px] px-2 py-1
              h-14 w-14 flex items-center justify-center
              rounded-full
              text-black
              hover:bg-gray-200 hover:text-black
              transition
              text-white"
          >
            <i className="fa-solid fa-pen-to-square text-xl mr-1 text-dracula" />
          </button>
          {/*           <button
            type="button"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            className="
                h-14 w-14 flex items-center justify-center
                rounded-full
                hover:bg-gray-200 hover:text-black
                transition
                text-white
                "
            onClick={onClose}
          >
            <i className="fas fa-chevron-down text-xl text-white" />
          </button> */}
        </div>
      </div>

      <div
        className="px-5 pt-3 pb-3 space-y-6 mt-4 overflow-y-auto flex-1 text-xl"
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: "italic",
        }}
      >
        {messages.length === 0 && !pending && (
          <h2
            className="text-4xl font-semibold"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
            }}
          >
            How can I help you today?
          </h2>
        )}

        {messages.map((msg, idx) => {
          const txt = getContentText(msg.content);

          if (msg.role === "assistant") {
            return (
              <div
                key={idx}
                className="max-w-[90%] rounded-2xl px-3 py-2 mt-2 mb-2 mr-auto border border-white/10 bg-nosferatu-300 text-black text-3xl"
                style={{ fontFamily: "inherit", fontStyle: "normal" }}
              >
                <ContentText role="assistant" txt={txt} />
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="max-w-[90%] rounded-2xl px-3 py-2 p-4 mt-2 mb-2 ml-auto bg-cullen-300 text-black text-3xl"
              style={{ fontFamily: "inherit", fontStyle: "normal" }}
            >
              {txt}
            </div>
          );
        })}

        {pending && (
          <div className="max-w-[90%] rounded-2xl px-3 py-2 p-4 mt-2 mb-2 mr-auto border border-white/50 bg-nosferatu-300 text-black text-3xl">
            <ContentText role="assistant" txt={tempOutput || "Thinking..."} />
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-5 pt-2 pb-4 space-y-6 border-t border-white/10">
        <div
          className="
            rounded-2xl
            bg-gray-900
            border border-white/15
            px-4 py-4
            mt-4
            flex items-center gap-2
            focus-within:border-white/30
            focus-within:ring-1
            focus-within:ring-white/25
            transition
          "
        >
          {/*           <button
            type="button"
            className="
              text-white hover:text-white/60
              flex items-center justify-center
              h-12 w-12 rounded-full
              bg-gray-700
              hover:bg-gray-500 hover:text-black
              transition
            "
          >
            <i className="fas fa-paperclip text-2xl text-white" />
          </button> */}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="
              p-4
              flex-1 bg-transparent
              outline-none border-none
              text-2xl placeholder:text-white/70
            "
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            onClick={handleUserSend}
            className={`
              h-12 w-12 flex items-center justify-center
              rounded-full
              transition
              ${
                input.trim()
                  ? "bg-gray-400 text-black hover:bg-gray-500"
                  : "bg-white/40 text-white cursor-default"
              }
            `}
          >
            <i className="fas fa-arrow-up text-xl" />
          </button>
        </div>

        <div className="flex flex-wrap gap-4 pt-2">
          {Config.floatingConfig.quickPrompts.map((label) => (
            <button
              key={label}
              type="button"
              className="
                  inline-flex items-center gap-2
                  rounded-full
                  border border-white/20
                  bg-white/5
                  p-4 py-1.5
                  text-2xl text-white
                  hover:bg-white/10 hover:border-gray-900
                  hover:text-white
                  transition
                "
              onClick={() => setInput(label)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatFloat;
