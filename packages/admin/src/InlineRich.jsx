import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { extensions } from "./tiptap.js";
import { usePuck, registerOverlayPortal, setDeep } from "@measured/puck";
import TextTools from "./TextTools.jsx";

/* Text edited straight on the page. Puck's fieldTransforms swap the HTML string
   for this component inside the canvas, so what you type is what the page has.
   Styling comes from the site's own CSS — only the focus ring is ours. */

const EDITOR_CSS = `
.pk-inline .ProseMirror{outline:none}
/* Puck marks every block draggable — cursor: grab and user-select: none. Inside
   an editor that reads as "you cannot type here", so put text behaviour back. */
.pk-inline{cursor:text;user-select:text;-webkit-user-select:text}
.pk-inline{border-radius:4px;transition:box-shadow .12s}
.pk-inline:hover{box-shadow:0 0 0 2px rgba(100,116,139,.2)}
.pk-inline:focus-within{box-shadow:0 0 0 2px var(--brand,#2563eb)}
/* One hover indicator is enough: ours. Puck adds a dashed outline of its own. */
.pk-inline-host[data-puck-overlay-portal]:hover{outline:none}
.pk-bub{display:flex;gap:2px;background:#1f2937;border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.32);z-index:9999}
.pk-bub button{background:none;border:0;color:#fff;border-radius:6px;padding:5px 9px;font-size:12.5px;line-height:1.4;cursor:pointer}
.pk-bub button:hover{background:rgba(255,255,255,.18)}
.pk-bub button.on{background:var(--brand,#2563eb);color:#fff}
.pk-bub .sep{width:1px;height:18px;background:rgba(255,255,255,.28);margin:0 4px;align-self:center}
`;

/* This component renders inside Puck's canvas iframe, so styles have to go into
   that document — reached through the element we just mounted. */
function useEditorStyles(ref) {
  useEffect(() => {
    const doc = ref.current && ref.current.ownerDocument;
    if (!doc || doc.getElementById("pk-inline-css")) return;
    const st = doc.createElement("style");
    st.id = "pk-inline-css";
    st.textContent = EDITOR_CSS;
    doc.head.appendChild(st);
  });
}

const Btn = ({ on, active, title, children }) => (
  <button type="button" className={active ? "on" : ""} title={title} aria-label={title}
    onMouseDown={(e) => e.preventDefault()} onClick={on}>{children}</button>
);

export default function InlineRich({ html, componentId, propPath, propName }) {
  const { dispatch, getItemById, getSelectorForId } = usePuck();
  const box = useRef(null);
  useEditorStyles(box);

  // Puck covers the canvas with a drag overlay; without this the editor never
  // receives the click.
  useEffect(() => {
    if (!box.current) return;
    return registerOverlayPortal(box.current);
  }, []);

  const editor = useEditor({
    extensions,
    content: html || "",
    editorProps: { attributes: { class: "pk-inline" } },
    // Commit on blur, not on every keystroke: writing to Puck re-renders the
    // canvas, which would tear down the editor mid-typing.
    onBlur: ({ editor: ed }) => {
      const next = ed.getHTML();
      const item = getItemById(componentId);
      const sel = getSelectorForId(componentId);
      if (!item || !sel) return;
      const path = propPath || propName;
      const props = setDeep(item.props || {}, path, next);
      dispatch({
        type: "replace",
        destinationIndex: sel.index,
        destinationZone: sel.zone,
        data: Object.assign({}, item, { props }),
      });
    },
  });

  // Outside edits (undo, sidebar) have to flow back in without stomping typing.
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    const next = html || "";
    if (next !== cur && !(next === "" && cur === "<p></p>") && !editor.isFocused) {
      editor.commands.setContent(next, false);
    }
  }, [html, editor]);

  const link = () => {
    const win = editor.view.dom.ownerDocument.defaultView;
    const prev = editor.getAttributes("link").href || "";
    const url = win.prompt("リンク先のURL（空欄で解除）", prev);
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  if (!editor) return <div className="pk-inline-host" ref={box} dangerouslySetInnerHTML={{ __html: html || "" }} />;
  return (
    <div className="pk-inline-host" ref={box}>
      <BubbleMenu editor={editor}>
        <div className="pk-bub">
          <Btn title="太字" active={editor.isActive("bold")} on={() => editor.chain().focus().toggleBold().run()}><b>B</b></Btn>
          <Btn title="斜体" active={editor.isActive("italic")} on={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Btn>
          <Btn title="下線" active={editor.isActive("underline")} on={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
          <Btn title="打ち消し" active={editor.isActive("strike")} on={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <span className="sep" />
          <Btn title="小見出し" active={editor.isActive("heading", { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>見出し</Btn>
          <Btn title="箇条書き" active={editor.isActive("bulletList")} on={() => editor.chain().focus().toggleBulletList().run()}>・</Btn>
          <Btn title="番号付きリスト" active={editor.isActive("orderedList")} on={() => editor.chain().focus().toggleOrderedList().run()}>1.</Btn>
          <span className="sep" />
          <TextTools editor={editor} dark />
          <span className="sep" />
          <Btn title="リンク" active={editor.isActive("link")} on={link}>リンク</Btn>
        </div>
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
