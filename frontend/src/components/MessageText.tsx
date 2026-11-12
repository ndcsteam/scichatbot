import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stripEmoji } from "../lib/emoji";

export function MessageText({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") return content ? <p>{content}</p> : null;
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => (
            <a href={props.href} target="_blank" rel="noopener noreferrer">
              {props.children}
            </a>
          ),
        }}
      >
        {stripEmoji(content)}
      </ReactMarkdown>
    </div>
  );
}
