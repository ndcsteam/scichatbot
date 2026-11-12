import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageText({ role, content }: { role: "user" | "assistant"; content: string }) {
  if (role === "user") return <p>{content}</p>;
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
