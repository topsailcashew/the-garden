import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserSession, NoteComment } from "../types";
import ReactionPicker from "./ReactionPicker";
import { MessageCircle, Send, Trash2, SmilePlus, Pencil, Check } from "lucide-react";

interface ItemData {
  reactions?: { boy?: string; girl?: string };
  comment?: NoteComment | null;
  commentReactions?: { boy?: string; girl?: string };
}

interface ItemInteractionsProps {
  roomId: string;
  collectionName: string; // e.g. "letters" | "prayers"
  docId: string;
  data: ItemData;
  session: UserSession;
  avatars?: { boy: string; girl: string };
  skinToneMod?: string;
}

// Reusable "react + one shared comment" strip for any room subcollection doc.
// Both partners can each drop one emoji reaction on the item, one shared comment
// can be left/edited/deleted, and the comment itself can be reacted to.
export default function ItemInteractions({ roomId, collectionName, docId, data, session, avatars, skinToneMod = "" }: ItemInteractionsProps) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [commentPickerOpen, setCommentPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const ref = () => doc(db, "rooms", roomId, collectionName, docId);
  const myRole = session.role;
  const reactions = data.reactions || {};
  const comment = data.comment;
  const commentReactions = data.commentReactions || {};

  const toggle = (map: { boy?: string; girl?: string }, emoji: string) => {
    const next = { ...map };
    if (next[myRole] === emoji) delete next[myRole];
    else next[myRole] = emoji;
    return next;
  };

  const reactItem = async (emoji: string) => {
    try { await updateDoc(ref(), { reactions: toggle(reactions, emoji) }); } catch (e) { console.error("react item", e); }
  };
  const reactComment = async (emoji: string) => {
    try { await updateDoc(ref(), { commentReactions: toggle(commentReactions, emoji) }); } catch (e) { console.error("react comment", e); }
  };
  const addComment = async (e: React.FormEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!input.trim()) return;
    setSaving(true);
    try { await updateDoc(ref(), { comment: { author: myRole, text: input.trim(), createdAt: new Date().toISOString() } }); setInput(""); }
    catch (e) { console.error("add comment", e); } finally { setSaving(false); }
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment || !editText.trim()) return;
    setSaving(true);
    try { await updateDoc(ref(), { comment: { author: comment.author, text: editText.trim(), createdAt: comment.createdAt } }); setEditing(false); }
    catch (e) { console.error("edit comment", e); } finally { setSaving(false); }
  };
  const deleteComment = async () => {
    try { await updateDoc(ref(), { comment: null, commentReactions: {} }); } catch (e) { console.error("delete comment", e); }
  };

  const authorName = comment ? (comment.author === myRole ? "You" : session.partnerName) : "";
  const authorAvatar = comment ? (comment.author === "boy" ? avatars?.boy || "🧑" : avatars?.girl || "👩") : "";

  return (
    <div className="mt-3 pt-3 border-t border-natural-border/60 not-italic font-sans" onClick={(e) => e.stopPropagation()}>
      {/* Item-level reactions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {reactions.boy && <span className="text-base" title="reaction">{reactions.boy}</span>}
        {reactions.girl && <span className="text-base" title="reaction">{reactions.girl}</span>}
        <button
          id={`item-react-${docId}`}
          onClick={() => setItemPickerOpen(true)}
          className="flex items-center gap-1 text-[11px] text-natural-text/60 bg-white hover:bg-natural-card border border-natural-border rounded-full px-2.5 py-1 cursor-pointer transition-all"
        >
          <SmilePlus className="w-3.5 h-3.5" /> {reactions[myRole] ? "Change" : "React"}
        </button>
      </div>

      {/* Single shared comment */}
      <div className="mt-2">
        {!comment ? (
          <form onSubmit={addComment} className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-natural-text/40 flex-shrink-0" />
            <input
              id={`item-comment-input-${docId}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add a comment..."
              maxLength={280}
              className="flex-1 min-w-0 bg-white border border-natural-border rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-natural-olive/30 placeholder:text-natural-text/40"
            />
            {input.trim() && (
              <button type="submit" disabled={saving} className="flex-shrink-0 w-6 h-6 rounded-full bg-natural-olive hover:bg-natural-olive-hover text-white flex items-center justify-center cursor-pointer transition-all" title="Post comment">
                <Send className="w-3 h-3" />
              </button>
            )}
          </form>
        ) : (
          <div className="bg-white border border-natural-border rounded-xl p-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-natural-text/40">
                <span className="text-sm">{authorAvatar}</span> {authorName}
              </span>
              {comment.author === myRole && !editing && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setEditText(comment.text); setEditing(true); }} className="text-natural-text/30 hover:text-natural-olive cursor-pointer transition-all" title="Edit"><Pencil className="w-3 h-3" /></button>
                  <button onClick={deleteComment} className="text-natural-text/30 hover:text-natural-terracotta cursor-pointer transition-all" title="Delete"><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
            {editing ? (
              <form onSubmit={saveEdit} className="mt-1.5 flex items-center gap-1.5">
                <input value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={280} autoFocus className="flex-1 min-w-0 bg-white border border-natural-border rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-natural-olive/30" />
                <button type="submit" disabled={saving || !editText.trim()} className="flex-shrink-0 w-6 h-6 rounded-full bg-natural-olive text-white flex items-center justify-center cursor-pointer disabled:opacity-40" title="Save"><Check className="w-3 h-3" /></button>
                <button type="button" onClick={() => setEditing(false)} className="text-[10px] text-natural-text/40 hover:text-natural-text px-1 cursor-pointer" title="Cancel">Cancel</button>
              </form>
            ) : (
              <p className="text-xs text-natural-text/70 mt-1 leading-relaxed break-words">{comment.text}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              {commentReactions.boy && <span className="text-sm">{commentReactions.boy}</span>}
              {commentReactions.girl && <span className="text-sm">{commentReactions.girl}</span>}
              <button onClick={() => setCommentPickerOpen(true)} className="flex items-center gap-1 text-[10px] text-natural-text/50 bg-white hover:bg-natural-card border border-natural-border rounded-full px-2 py-0.5 cursor-pointer transition-all">
                <SmilePlus className="w-3 h-3" /> {commentReactions[myRole] ? "Change" : "React"}
              </button>
            </div>
          </div>
        )}
      </div>

      <ReactionPicker
        open={itemPickerOpen}
        skinToneMod={skinToneMod}
        currentReaction={reactions[myRole]}
        onSelect={(e) => { reactItem(e); setItemPickerOpen(false); }}
        onClose={() => setItemPickerOpen(false)}
        onClear={reactions[myRole] ? () => { reactItem(reactions[myRole]!); setItemPickerOpen(false); } : undefined}
      />
      <ReactionPicker
        open={commentPickerOpen}
        skinToneMod={skinToneMod}
        currentReaction={commentReactions[myRole]}
        onSelect={(e) => { reactComment(e); setCommentPickerOpen(false); }}
        onClose={() => setCommentPickerOpen(false)}
        onClear={commentReactions[myRole] ? () => { reactComment(commentReactions[myRole]!); setCommentPickerOpen(false); } : undefined}
      />
    </div>
  );
}
