import { useEffect, useRef, useState } from "react";
import { BotIcon, CheckIcon, CopyIcon } from "./Icons";
import { MessageImages } from "./MessageImages";
import { MessageText } from "./MessageText";
import { stripEmoji } from "../lib/emoji";

type Props = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  time?: string;
  userLabel?: string;
  botLabel?: string;
  copyable?: boolean;
};

export function MessageItem({
  role,
  content,
  images,
  time,
  userLabel = "我",
  botLabel = "學習助教",
  copyable = true,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(stripEmoji(content));
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (role === "user") {
    return (
      <article className="msg user">
        <div className="msg-body">
          <header className="msg-meta">
            <strong>{userLabel}</strong>
            {time ? <time>{time}</time> : null}
          </header>
          <MessageImages paths={images} />
          <MessageText role="user" content={content} />
        </div>
      </article>
    );
  }

  return (
    <article className="msg assistant">
      <span className="avatar bot" aria-hidden="true">
        <BotIcon size={18} />
      </span>
      <div className="msg-body">
        <header className="msg-meta">
          <strong>{botLabel}</strong>
          {time ? <time>{time}</time> : null}
        </header>
        <MessageText role="assistant" content={content} />
        {copyable ? (
          <footer className="msg-actions">
            <button type="button" className="icon-text-button" onClick={() => void copy()}>
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
              <span>{copied ? "已複製" : "複製回答"}</span>
            </button>
          </footer>
        ) : null}
      </div>
    </article>
  );
}

export function TypingIndicator() {
  return (
    <article className="msg assistant" aria-live="polite">
      <span className="avatar bot" aria-hidden="true">
        <BotIcon size={18} />
      </span>
      <div className="msg-body typing">
        <span className="sr-only">正在回覆</span>
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </article>
  );
}
