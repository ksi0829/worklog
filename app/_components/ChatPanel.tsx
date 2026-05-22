"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  EXECUTIVE_NAMES,
  ORG_MEMBER_MAP,
  TEAM_ORDER,
  getCurrentOrgTeam,
} from "@/app/_lib/currentOrg";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();

type ChatPanelProps = {
  open: boolean;
  currentUserId: string;
  currentName: string;
  currentTeam: string;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
};

type ProfileRow = {
  id: string;
  name: string | null;
  team: string | null;
  role: string | null;
};

type ChatUser = {
  id: string;
  name: string;
  team: string;
  role: string;
};

type ChatParticipantRow = {
  thread_id: number;
  user_id: string;
  last_read_at: string | null;
};

type ChatMessageRow = {
  id: number;
  thread_id: number;
  sender_id: string;
  sender_name: string;
  sender_team: string | null;
  body: string;
  created_at: string;
};

function getProfileSortValue(profile: ChatUser) {
  const teamIndex = TEAM_ORDER.indexOf(profile.team);
  return `${teamIndex === -1 ? 99 : teamIndex}-${profile.name}`;
}

function isActiveOrgMember(profile: ProfileRow) {
  const name = profile.name || "";
  return Boolean(name && (ORG_MEMBER_MAP.has(name) || EXECUTIVE_NAMES.includes(name)));
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel({
  open,
  currentUserId,
  currentName,
  currentTeam,
  onClose,
  onUnreadChange,
}: ChatPanelProps) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users]
  );

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,name,team,role")
      .order("name", { ascending: true });

    if (error) return;

    const mapped = ((data || []) as ProfileRow[])
      .filter(isActiveOrgMember)
      .filter((profile) => profile.id !== currentUserId)
      .map((profile) => ({
        id: profile.id,
        name: profile.name || "",
        team: getCurrentOrgTeam(profile.name || "", profile.team || ""),
        role: profile.role || "",
      }))
      .sort((a, b) => getProfileSortValue(a).localeCompare(getProfileSortValue(b), "ko"));

    setUsers(mapped);
  }, [currentUserId]);

  const loadUnreadCount = useCallback(async () => {
    if (!currentUserId) {
      onUnreadChange(0);
      return;
    }

    const { data: participantRows, error: participantError } = await supabase
      .from("chat_participants")
      .select("thread_id,user_id,last_read_at")
      .eq("user_id", currentUserId);

    if (participantError) {
      onUnreadChange(0);
      return;
    }

    const participants = (participantRows || []) as ChatParticipantRow[];
    const threadIds = participants.map((participant) => participant.thread_id);

    if (threadIds.length === 0) {
      onUnreadChange(0);
      return;
    }

    const readMap = new Map(
      participants.map((participant) => [participant.thread_id, participant.last_read_at || ""])
    );

    const { data: messageRows, error: messageError } = await supabase
      .from("chat_messages")
      .select("id,thread_id,sender_id,sender_name,sender_team,body,created_at")
      .in("thread_id", threadIds)
      .neq("sender_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (messageError) {
      onUnreadChange(0);
      return;
    }

    const unreadThreadIds = new Set<number>();

    ((messageRows || []) as ChatMessageRow[]).forEach((message) => {
      const lastRead = readMap.get(message.thread_id);
      if (!lastRead || message.created_at > lastRead) {
        unreadThreadIds.add(message.thread_id);
      }
    });

    onUnreadChange(unreadThreadIds.size);
  }, [currentUserId, onUnreadChange]);

  const markThreadRead = useCallback(
    async (targetThreadId: number) => {
      if (!currentUserId) return;

      await supabase
        .from("chat_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("thread_id", targetThreadId)
        .eq("user_id", currentUserId);

      void loadUnreadCount();
    },
    [currentUserId, loadUnreadCount]
  );

  const loadMessages = useCallback(
    async (targetThreadId: number) => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,thread_id,sender_id,sender_name,sender_team,body,created_at")
        .eq("thread_id", targetThreadId)
        .order("created_at", { ascending: true });

      if (error) {
        setSetupError("채팅 테이블이 아직 준비되지 않았습니다. SQL 실행 후 다시 열어주세요.");
        return;
      }

      setMessages((data || []) as ChatMessageRow[]);
      await markThreadRead(targetThreadId);
    },
    [markThreadRead]
  );

  const findOrCreateThread = useCallback(
    async (targetUser: ChatUser) => {
      if (!currentUserId) return null;

      const { data: myParticipants, error: myError } = await supabase
        .from("chat_participants")
        .select("thread_id,user_id,last_read_at")
        .eq("user_id", currentUserId);

      if (myError) {
        setSetupError("채팅 테이블이 아직 준비되지 않았습니다. SQL 실행 후 다시 열어주세요.");
        return null;
      }

      const myThreadIds = ((myParticipants || []) as ChatParticipantRow[]).map(
        (participant) => participant.thread_id
      );

      if (myThreadIds.length > 0) {
        const { data: targetParticipants } = await supabase
          .from("chat_participants")
          .select("thread_id,user_id,last_read_at")
          .eq("user_id", targetUser.id)
          .in("thread_id", myThreadIds);

        const existingThreadId = ((targetParticipants || []) as ChatParticipantRow[])[0]?.thread_id;

        if (existingThreadId) return existingThreadId;
      }

      const { data: threadRow, error: threadError } = await supabase
        .from("chat_threads")
        .insert({ created_by: currentUserId })
        .select("id")
        .single();

      if (threadError || !threadRow) {
        setSetupError("채팅방을 만들지 못했습니다. 권한 또는 테이블을 확인해 주세요.");
        return null;
      }

      const newThreadId = Number(threadRow.id);

      const { error: participantError } = await supabase
        .from("chat_participants")
        .insert([
          {
            thread_id: newThreadId,
            user_id: currentUserId,
            user_name: currentName || "사용자",
            team: currentTeam,
            last_read_at: new Date().toISOString(),
          },
          {
            thread_id: newThreadId,
            user_id: targetUser.id,
            user_name: targetUser.name,
            team: targetUser.team,
            last_read_at: null,
          },
        ]);

      if (participantError) {
        setSetupError("채팅 참여자를 저장하지 못했습니다.");
        return null;
      }

      return newThreadId;
    },
    [currentName, currentTeam, currentUserId]
  );

  const selectUser = useCallback(
    async (targetUser: ChatUser) => {
      setSelectedUserId(targetUser.id);
      setLoading(true);
      setSetupError("");
      const targetThreadId = await findOrCreateThread(targetUser);
      setThreadId(targetThreadId);
      if (targetThreadId) {
        await loadMessages(targetThreadId);
      }
      setLoading(false);
    },
    [findOrCreateThread, loadMessages]
  );

  const sendMessage = useCallback(async () => {
    const body = messageBody.trim();
    if (!body || !selectedUser) return;

    setLoading(true);
    setSetupError("");

    const targetThreadId = threadId || (await findOrCreateThread(selectedUser));

    if (!targetThreadId) {
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: targetThreadId,
        sender_id: currentUserId,
        sender_name: currentName || "사용자",
        sender_team: currentTeam,
        body,
      });

    if (error) {
      setSetupError("메시지를 보내지 못했습니다.");
      setLoading(false);
      return;
    }

    await supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", targetThreadId);

    setMessageBody("");
    setThreadId(targetThreadId);
    await loadMessages(targetThreadId);
    setLoading(false);
  }, [
    currentName,
    currentTeam,
    currentUserId,
    findOrCreateThread,
    loadMessages,
    messageBody,
    selectedUser,
    threadId,
  ]);

  useEffect(() => {
    if (!currentUserId) return;

    const initialTimer = window.setTimeout(() => {
      void loadUsers();
      void loadUnreadCount();
    }, 0);

    const timer = window.setInterval(() => {
      void loadUnreadCount();
      if (open && threadId) {
        void loadMessages(threadId);
      }
    }, 6000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [currentUserId, loadMessages, loadUnreadCount, loadUsers, open, threadId]);

  useEffect(() => {
    if (!open) return;
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <section style={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header style={styles.header}>
          <div>
            <span style={styles.kicker}>업무 채팅</span>
            <h2 style={styles.title}>1:1 메시지</h2>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        </header>

        {setupError && <div style={styles.notice}>{setupError}</div>}

        <div style={styles.body}>
          <aside style={styles.userList}>
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                style={{
                  ...styles.userButton,
                  ...(selectedUserId === user.id ? styles.userButtonActive : {}),
                }}
                onClick={() => void selectUser(user)}
              >
                <strong>{user.name}</strong>
                <span>{user.team}</span>
              </button>
            ))}
          </aside>

          <section style={styles.chatArea}>
            {selectedUser ? (
              <>
                <div style={styles.chatHeader}>
                  <strong>{selectedUser.name}</strong>
                  <span>{selectedUser.team}</span>
                </div>

                <div style={styles.messageList}>
                  {messages.length === 0 ? (
                    <div style={styles.empty}>아직 주고받은 메시지가 없습니다.</div>
                  ) : (
                    messages.map((message) => {
                      const mine = message.sender_id === currentUserId;

                      return (
                        <div
                          key={message.id}
                          style={{
                            ...styles.messageRow,
                            justifyContent: mine ? "flex-end" : "flex-start",
                          }}
                        >
                          <div
                            style={{
                              ...styles.messageBubble,
                              ...(mine ? styles.messageBubbleMine : {}),
                            }}
                          >
                            {!mine && <span style={styles.messageSender}>{message.sender_name}</span>}
                            <p style={styles.messageText}>{message.body}</p>
                            <span style={styles.messageTime}>{formatTime(message.created_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messageEndRef} />
                </div>

                <div style={styles.inputRow}>
                  <input
                    value={messageBody}
                    onChange={(event) => setMessageBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="메시지 입력"
                    style={styles.input}
                  />
                  <button
                    type="button"
                    style={styles.sendButton}
                    disabled={loading || !messageBody.trim()}
                    onClick={() => void sendMessage()}
                  >
                    전송
                  </button>
                </div>
              </>
            ) : (
              <div style={styles.emptyFull}>왼쪽에서 대화할 인원을 선택해 주세요.</div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    background: "rgba(15, 23, 42, 0.22)",
    padding: "22px",
  },
  panel: {
    width: "min(760px, calc(100vw - 44px))",
    height: "min(620px, calc(100dvh - 44px))",
    display: "flex",
    flexDirection: "column",
    borderRadius: "14px",
    border: "1px solid #d8e0ea",
    background: "#ffffff",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.25)",
    overflow: "hidden",
  },
  header: {
    minHeight: "66px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "14px",
    borderBottom: "1px solid #e5eaf0",
    padding: "14px 16px",
  },
  kicker: {
    color: "#0f8a56",
    fontSize: "12px",
    fontWeight: 900,
  },
  title: {
    margin: "4px 0 0",
    color: "#111820",
    fontSize: "19px",
    fontWeight: 900,
  },
  closeButton: {
    height: "34px",
    padding: "0 12px",
    borderRadius: "9px",
    border: "1px solid #cfd6df",
    background: "#ffffff",
    color: "#111827",
    fontSize: "12px",
    fontWeight: 850,
    cursor: "pointer",
  },
  notice: {
    margin: "12px 16px 0",
    border: "1px solid #bfdbfe",
    borderRadius: "10px",
    background: "#eff6ff",
    color: "#1d4ed8",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 800,
  },
  body: {
    minHeight: 0,
    flex: 1,
    display: "grid",
    gridTemplateColumns: "210px minmax(0, 1fr)",
  },
  userList: {
    minHeight: 0,
    overflowY: "auto",
    borderRight: "1px solid #e5eaf0",
    background: "#f8fafc",
    padding: "10px",
  },
  userButton: {
    width: "100%",
    minHeight: "52px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "4px",
    border: "1px solid transparent",
    borderRadius: "10px",
    background: "transparent",
    color: "#111820",
    padding: "8px 10px",
    textAlign: "left",
    cursor: "pointer",
  },
  userButtonActive: {
    borderColor: "#b7e4c7",
    background: "#eef8f2",
    color: "#0f8a56",
  },
  chatArea: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
  },
  chatHeader: {
    minHeight: "52px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderBottom: "1px solid #edf0f3",
    padding: "0 14px",
    color: "#111820",
  },
  messageList: {
    minHeight: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    overflowY: "auto",
    background: "#f8fafc",
    padding: "14px",
  },
  messageRow: {
    display: "flex",
  },
  messageBubble: {
    maxWidth: "74%",
    border: "1px solid #e5eaf0",
    borderRadius: "12px",
    background: "#ffffff",
    color: "#111827",
    padding: "8px 10px",
  },
  messageBubbleMine: {
    borderColor: "#c7ead5",
    background: "#eef8f2",
  },
  messageSender: {
    display: "block",
    marginBottom: "4px",
    color: "#64748b",
    fontSize: "11px",
    fontWeight: 850,
  },
  messageText: {
    margin: 0,
    color: "#111827",
    fontSize: "13px",
    fontWeight: 650,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  messageTime: {
    display: "block",
    marginTop: "5px",
    color: "#94a3b8",
    fontSize: "10px",
    fontWeight: 750,
    textAlign: "right",
  },
  inputRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 72px",
    gap: "8px",
    borderTop: "1px solid #e5eaf0",
    padding: "10px",
  },
  input: {
    height: "40px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#111827",
    padding: "0 12px",
    outline: "none",
    fontSize: "13px",
  },
  sendButton: {
    height: "40px",
    border: "1px solid #111820",
    borderRadius: "10px",
    background: "#111820",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  empty: {
    border: "1px dashed #cbd5e1",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#64748b",
    padding: "18px",
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 750,
  },
  emptyFull: {
    margin: "auto",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 800,
  },
};
