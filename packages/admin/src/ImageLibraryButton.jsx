import React, { useState } from "react";
import { Library } from "./ImagePicker.jsx";

/* Toolbar button that opens the shared image library and hands back a URL. */
export default function ImageLibraryButton({ onPick, title = "画像を入れる" }) {
  const [open, setOpen] = useState(false);
  return (
    <React.Fragment>
      <button
        type="button" className="rt-b" title={title} aria-label={title}
        onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(true)}
      >画像</button>
      {open ? (
        <Library
          onClose={() => setOpen(false)}
          onPick={(url) => { setOpen(false); onPick(url); }}
        />
      ) : null}
    </React.Fragment>
  );
}
