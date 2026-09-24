import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { TextStyle, Color, FontSize } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";

/* Shared editor schema. Headings must carry the site's class or the styling is
   lost the first time a block is edited — Tiptap re-serialises the HTML and
   drops attributes it does not know about. */
export const extensions = [
  StarterKit.configure({
    heading: { levels: [3], HTMLAttributes: { class: "mk-reason-h3" } },
    link: false,
    underline: false,
  }),
  Underline,
  /* Colour, size and alignment are set from the toolbar and apply to the
     selection — that is where people look for them, rather than in a
     block-wide setting. */
  TextStyle,
  Color,
  FontSize,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  /* Images live in R2 and are referenced by URL, so the stored HTML is the same
     markup the site renders. */
  Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "mk-rt-img", loading: "lazy" } }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
    HTMLAttributes: { rel: "noopener noreferrer" },
  }),
];
