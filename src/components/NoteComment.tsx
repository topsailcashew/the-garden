import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Note, UserSession } from "../types";
import ReactionPicker from "./ReactionPicker";
import { MessageCircle, Send, Trash2, SmilePlus } from "lucide-react";

interface NoteCommentProps {
  note: Note;
  session: UserSession;
  skinToneMod: string;
  avatars?: { boy: string; girl: string };
}

// A single shared comment on a love note. Either partner may leave the one
// comment; both partners can each drop one emoji reaction on it.
export default function NoteCommentBox({ note, session, skinToneMod, avatars }: NoteCommentProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const noteRef = () => doc(db, "rooms", session.roomId, "notes", note.id);
  const myRole = session.role;
  const comment = note.comment;
  const reactions = note.commentReactions || {};
  const myReaction = reactions[myRole];

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!input.trim()) return;
    setSaving(true);
    try {
      await updateDoc(noteRef(), {
        comment: { author: myRole, text: input.trim(), createdAt: new Date().toISOString() }
      });
      setInput("");
    } catch (err) {
      console.error("Error adding comment:", err);
    } finally {
      setSaving(false);
    }
  };

  const deleteComment = async () => {
    try {
      await updateDoc(noteRef(), { comment: null, commentReactions: {} });
    } catch (err) {
      console.error("Error deleting comment:", err);
    }
  };

  const reactToComment = async (emoji: string) => {
    try {
      const next: { boy?: string; girl?: string } = { ...reactions };
      if (next[myRole] === emoji) delete next[myRole];
      else next[myRole] = emoji;
      await updateDoc(noteRef(), { commentReactions: next });
    } catch (err) {
      console.error("Error reacting to comment:", err);
    }
  };

  const authorName = comment ? (comment.author === myRole ? "You" : session.partnerName) : "";
  const authorAvatar = comment ? (comment.author === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩") : "";

  return (
    <div className="mt-3 pt-3 border-t border-stone-200/20 not-italic font-sans" onClick={(e) => e.stopPropagation()}>
      {!comment ? (
        <form onSubmit={addComment} className="flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
          <input
            id={`comment-input-${note.id}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a comment..."
            maxLength={280}
            className="flex-1 min-w-0 bg-white/60 border border-stone-200/60 rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-natural-olive/30 placeholder:text-stone-400"
          />
          {input.trim() && (
            <button
              id={`comment-submit-${note.id}`}
              type="submit"
              disabled={saving}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-natural-olive hover:bg-natural-olive-hover text-white flex items-center justify-center cursor-pointer transition-all"
              title="Post comment"
            >
              <Send className="w-3 h-3" />
            </button>
          )}
        </form>
      ) : (
        <div className="bg-white/55 border border-stone-200/50 rounded-xl p-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0 text-[10px] font-bold uppercase tracking-wide text-stone-400">
              <span className="text-sm not-italic">{authorAvatar}</span>
              {authorName}
            </span>
            {comment.author === myRole && (
              <button
                id={`comment-delete-${note.id}`}
                onClick={deleteComment}
                className="text-stone-300 hover:text-natural-terracotta transition-all cursor-pointer flex-shrink-0"
                title="Delete your comment"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-xs text-stone-600 mt-1 leading-relaxed break-words">{comment.text}</p>

          <div className="flex items-center gap-1.5 mt-2">
            {reactions.boy && <span className="text-sm" title="reaction">{reactions.boy}</span>}
            {reactions.girl && <span className="text-sm" title="reaction">{reactions.girl}</span>}
            <button
              id={`comment-react-${note.id}`}
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1 text-[10px] text-stone-500 bg-white/70 hover:bg-white border border-stone-200/60 rounded-full px-2 py-0.5 cursor-pointer transition-all"
              title="React to this comment"
            >
              <SmilePlus className="w-3 h-3" /> {myReaction ? "Change" : "React"}
            </button>
          </div>
        </div>
      )}

      <ReactionPicker
        open={pickerOpen}
        skinToneMod={skinToneMod}
        currentReaction={myReaction}
        onSelect={(emoji) => {
          reactToComment(emoji);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
        onClear={myReaction ? () => { reactToComment(myReaction); setPickerOpen(false); } : undefined}
      />
    </div>
  );
}
