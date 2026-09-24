import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { extensions } from "./tiptap.js";
import ImageLibraryButton from "./ImageLibraryButton.jsx";
import TextTools from "./TextTools.jsx";

/* Rich text field for Puck. Stores HTML, which is what the site renders, so a
   value written here drops straight into the page. */

const B = ({ on, active, title, children }) => (
  <button type="button" className={"rt-b" + (active ? " on" : "")} title={title} aria-label={title}
    onMouseDown={(e) => e.preventDefault()} onClick={on}>{children}</button>
);

function Toolbar({ editor }) {
  if (!editor) return null;
  const link = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("リンク先のURL（空欄で解除）", prev);
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="rt-bar">
      <B title="太字" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><b>B</b></B>
      <B title="斜体" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><i>I</i></B>
      <B title="下線" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></B>
      <B title="打ち消し" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}><s>S</s></B>
      <span className="rt-sep" />
      <B title="小見出し" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>見出し</B>
      <B title="箇条書き" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}>・リスト</B>
      <B title="番号付きリスト" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}>1. リスト</B>
      <span className="rt-sep" />
      <TextTools editor={editor} />
      <span className="rt-sep" />
      <ImageLibraryButton onPick={(url) => editor.chain().focus().setImage({ src: url }).run()} />
      <B title="リンク" active={editor.isActive("link")} on={link}>リンク</B>
      <B title="書式をクリア" on={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>書式を消す</B>
    </div>
  );
}

export default function RichText({ value, onChange, readOnly, label }) {
  /* What this editor last handed out. The value comes back a beat later —
     Puck feeds it through its own store — and writing that stale copy back
     into the editor would wipe whatever was typed in the meantime. */
  const emitted = useRef(null);

  const editor = useEditor({
    editable: !readOnly,
    extensions,
    content: value || "",
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const out = html === "<p></p>" ? "" : html;
      emitted.current = out;
      onChange(out);
    },
  });

  const applyValue = () => {
    const next = value || "";
    if (next === emitted.current) return;
    const current = editor.getHTML();
    if (next !== current && !(next === "" && current === "<p></p>")) {
      editor.commands.setContent(next, false);
    }
  };

  // Puck can swap the selected block while the editor stays mounted, so an
  // incoming value still has to win — just never while the caret is in here.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    applyValue();
  }, [value, editor]);

  return (
    <div className="rt">
      {label ? <label className="rt-label">{label}</label> : null}
      <Toolbar editor={editor} />
      {editor ? (
        <BubbleMenu editor={editor}>
          <div className="rt-bubble">
            <B title="太字" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><b>B</b></B>
            <B title="斜体" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><i>I</i></B>
            <B title="下線" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></B>
            <TextTools editor={editor} dark />
          </div>
        </BubbleMenu>
      ) : null}
      {/* Anything that arrived while typing is applied once the caret leaves. */}
      <EditorContent className="rt-body" editor={editor} onBlur={() => editor && applyValue()} />
    </div>
  );
}
