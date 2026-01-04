import { useState, useCallback, useEffect, useRef } from "react";
import Hyphenated from "react-hyphen";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";

const ContentText = ({ txt, role, shellRuns = [] }) => {
  const [isExpanded, setIsExpanded] = useState(role !== "user");

  // Per-shell-block "show full output" toggle state (only used when output > 10 lines)
  const [openOutputs, setOpenOutputs] = useState(() => new Set());

  // Used to assign an increasing index to each encountered ```shell code block
  const shellBlockCounterRef = useRef(0);

  useEffect(() => {
    shellBlockCounterRef.current = 0;
    setOpenOutputs(new Set());
  }, [txt]);

  const handleToggle = useCallback(() => {
    setIsExpanded((v) => !v);
  }, []);

  const toggleOutputForIndex = useCallback((idx) => {
    setOpenOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const normalizeChildrenText = (children) => {
    // react-markdown gives children as array; we want a string
    const raw = Array.isArray(children) ? children.join("") : String(children);
    return raw.replace(/\n$/, ""); // strip trailing newline often present
  };

  const formatResultText = (res) => {
    if (!res) return "";

    if (res.success !== true) {
      const err = res?.error ? String(res.error) : "Command failed.";
      return err;
    }

    const received = res.received || {};
    const stdout = received.stdout ?? "";
    const stderr = received.stderr ?? "";
    const exitCode = received.exitCode;

    let out = "";
    if (stdout) out += stdout;
    if (stderr) {
      if (out && !out.endsWith("\n")) out += "\n";
      out += `\n[stderr]\n${stderr}`;
    }
    if (exitCode !== undefined && exitCode !== null) {
      if (out && !out.endsWith("\n")) out += "\n";
      out += `\n[exitCode] ${exitCode}\n`;
    }
    return out.trimEnd();
  };

  const renderTruncatedLines = (fullText, maxLines, isOpen) => {
    const safe = typeof fullText === "string" ? fullText : "";
    const lines = safe.split("\n");
    const tooLong = lines.length > maxLines;

    const shown =
      isOpen || !tooLong ? safe : lines.slice(0, maxLines).join("\n");

    return {
      shown,
      tooLong,
      lineCount: lines.length,
    };
  };

  const CodeBlock = useCallback(
    ({ inline, className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1] || "";
      const isShellBlock = !inline && lang.toLowerCase() === "shell";

      if (isShellBlock) {
        const idx = shellBlockCounterRef.current++;
        const cmdText = normalizeChildrenText(children).trim();

        // Prefer mapping by position (idx), fall back to matching cmd text
        const run =
          shellRuns?.[idx] ||
          shellRuns?.find((r) => (r?.cmd || "").trim() === cmdText);

        const resultText = formatResultText(run?.result);
        const hasAnyResult = run?.result !== null && run?.result !== undefined;

        const isOpen = openOutputs.has(idx);
        const { shown, tooLong, lineCount } = renderTruncatedLines(
          resultText || "",
          10,
          isOpen
        );

        return (
          <div className="border rounded bg-nosferatu-200 text-black overflow-hidden mb-4">
            <div className="flex items-center justify-between px-4 py-2 border-b border-black/10">
              <div className="font-semibold text-lg">Shell command</div>

              {/*               {tooLong && (
                <button
                  type="button"
                  onClick={() => toggleOutputForIndex(idx)}
                  className="text-lg px-3 py-1 rounded bg-black/10 hover:bg-black/20 transition"
                  title={isOpen ? "Show less output" : "Show full output"}
                >
                   {isOpen ? "Show less" : "Show more"}
                </button> 
              )} */}
            </div>

            <pre className="p-4 overflow-auto">
              <code
                {...props}
                className={`${className || ""} whitespace-pre-wrap break-all`}
              >
                {cmdText}
              </code>
            </pre>

            {/* Always show output area (nested under the command) */}
            <div className="border-t border-black/10">
              <div className="px-4 py-2 font-semibold text-lg">
                System output
                {tooLong && (
                  <span className="ml-2 text-sm font-normal text-black/60">
                    ({lineCount} lines, showing first 10)
                  </span>
                )}
              </div>

              <pre className="px-4 pb-4 overflow-auto">
                <code className="whitespace-pre-wrap break-all">
                  {!hasAnyResult
                    ? "No output captured."
                    : shown || "No output captured."}
                </code>
              </pre>

              {/* Ellipsis when truncated */}
              {tooLong && !isOpen && (
                <div className="px-4 pb-4 text-black/70 select-none">…</div>
              )}
            </div>
          </div>
        );
      }

      // Normal fenced code blocks (non-shell)
      return !inline && match ? (
        <pre
          className={`border p-4 rounded bg-nosferatu-200 text-black text-xl language-${match[1]} ${className} overflow-auto`}
        >
          <code
            {...props}
            className={`${className} whitespace-pre-wrap break-all`}
          >
            {children}
          </code>
        </pre>
      ) : (
        <code
          className={`${className} bg-nosferatu-200 text-black rounded p-1 text-xl whitespace-pre-wrap break-all`}
          {...props}
        >
          {children}
        </code>
      );
    },
    [openOutputs, shellRuns, toggleOutputForIndex]
  );

  const lines = typeof txt === "string" ? txt.split("\n") : [];
  const displayedLines = isExpanded ? lines : lines.slice(0, 5);
  const contentToDisplay = displayedLines.join("\n");

  return (
    <div className="text-2xl">
      <Hyphenated>
        {role === "user" ? (
          <div className="break-all">{contentToDisplay}</div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ code: CodeBlock }}
            className="markdown text-black"
          >
            {contentToDisplay}
          </ReactMarkdown>
        )}
      </Hyphenated>

      {/*       {lines.length > 5 && (
        <div className="text-center cursor-pointer mt-2" onClick={handleToggle}>
          <i
            className={
              isExpanded
                ? "fa-solid fa-ellipsis text-3xl text-dracula-900 hover:text-dracula-500"
                : "fa-solid fa-ellipsis text-3xl text-blade-100 hover:text-blade-500"
            }
            title={isExpanded ? "Show less" : "Show more"}
          />
        </div>
      )} */}
    </div>
  );
};

export default ContentText;
