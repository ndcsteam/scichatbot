import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../firebase";

export function MessageImages({ paths }: { paths?: string[] }) {
  if (!paths || paths.length === 0) return null;
  return (
    <div className="message-images">
      {paths.map((path) => (
        <StoredImage key={path} path={path} />
      ))}
    </div>
  );
}

function StoredImage({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!storage) return;
    let active = true;
    setUrl("");
    setFailed(false);
    getDownloadURL(ref(storage, path))
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (failed) return <span className="image-missing">圖片無法顯示</span>;
  if (!url) return <span className="image-missing">載入圖片…</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="學生上載的圖片" loading="lazy" />
    </a>
  );
}
