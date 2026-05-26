"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  EXECUTIVE_NAMES,
  ORG_MEMBER_MAP,
  TEAM_ORDER,
  getCurrentOrgTeam,
} from "@/app/_lib/currentOrg";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import chatStyles from "./ChatPanel.module.css";

const supabase = createSupabaseBrowser();
const MESSAGE_PAGE_SIZE = 50;
const DIVISION_HEAD_NAMES = ["정대용", "서중석", "장동철"];
const CHAT_TEAM_ORDER = [
  "재무/인사",
  "구매/총무",
  "국내영업",
  "해외영업",
  "신사업",
  "R&D/QA",
  "기술 1팀",
  "기술 2팀",
  "기술 3팀",
];
const CHAT_TEAM_LABELS: Record<string, string> = {
  국내영업부: "국내영업",
  해외영업부: "해외영업",
  신사업부: "신사업",
  "R&D/QA부": "R&D/QA",
};

type ChatPanelProps = {
  open: boolean;
  currentUserId: string;
  currentName: string;
  currentTeam: string;
  onOpen: () => void;
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

type RecipientReadState = {
  threadId: number;
  recipientId: string;
  lastReadAt: string | null;
};

type BrowserNotificationPermission = NotificationPermission | "unsupported" | "loading";

function getProfileSortValue(profile: ChatUser) {
  const teamIndex = TEAM_ORDER.indexOf(profile.team);
  return `${teamIndex === -1 ? 99 : teamIndex}-${profile.name}`;
}

function getChatGroup(name: string, team: string) {
  if (EXECUTIVE_NAMES.includes(name)) return "경영진";
  if (DIVISION_HEAD_NAMES.includes(name)) return "본부장";

  return CHAT_TEAM_LABELS[team] || team;
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

function formatChatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function isSameChatDate(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}

export function ChatPanel({
  open,
  currentUserId,
  currentName,
  currentTeam,
  onOpen,
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
  const [unreadByUserId, setUnreadByUserId] = useState<Record<string, number>>({});
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [recipientReadState, setRecipientReadState] = useState<RecipientReadState | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>("loading");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const activeThreadIdRef = useRef<number | null>(null);
  const visibleMessageLimitRef = useRef(MESSAGE_PAGE_SIZE);
  const preservedScrollRef = useRef<{ height: number; top: number } | null>(null);
  const shouldScrollToBottomRef = useRef(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users]
  );

  const groupedUsers = useMemo(() => {
    const groups = new Map<string, ChatUser[]>();

    users.forEach((user) => {
      const team = getChatGroup(user.name, user.team) || "기타";
      const group = groups.get(team) || [];
      group.push(user);
      groups.set(team, group);
    });

    const ownGroup = getChatGroup(currentName, currentTeam);
    if (CHAT_TEAM_ORDER.includes(ownGroup) && !groups.has(ownGroup)) {
      groups.set(ownGroup, []);
    }

    const orderedTeams = ["경영진", "본부장", ...CHAT_TEAM_ORDER];

    return Array.from(groups.entries()).sort(([left], [right]) => {
      const leftIndex = orderedTeams.indexOf(left);
      const rightIndex = orderedTeams.indexOf(right);
      return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
    });
  }, [currentName, currentTeam, users]);

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
      setUnreadByUserId({});
      return;
    }

    const participants = (participantRows || []) as ChatParticipantRow[];
    const threadIds = participants.map((participant) => participant.thread_id);

    if (threadIds.length === 0) {
      onUnreadChange(0);
      setUnreadByUserId({});
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
      setUnreadByUserId({});
      return;
    }

    const unreadThreadIds = new Set<number>();
    const unreadUserMap: Record<string, number> = {};

    ((messageRows || []) as ChatMessageRow[]).forEach((message) => {
      const lastRead = readMap.get(message.thread_id);
      if (!lastRead || message.created_at > lastRead) {
        unreadThreadIds.add(message.thread_id);
        unreadUserMap[message.sender_id] = (unreadUserMap[message.sender_id] || 0) + 1;
      }
    });

    setUnreadByUserId(unreadUserMap);
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

  const loadRecipientReadAt = useCallback(async (targetThreadId: number, recipientId: string) => {
    const { data, error } = await supabase
      .from("chat_participants")
      .select("last_read_at")
      .eq("thread_id", targetThreadId)
      .eq("user_id", recipientId)
      .maybeSingle();

    if (!error) {
      setRecipientReadState({
        threadId: targetThreadId,
        recipientId,
        lastReadAt: (data as Pick<ChatParticipantRow, "last_read_at"> | null)?.last_read_at || null,
      });
    }
  }, []);

  const loadMessages = useCallback(
    async (
      targetThreadId: number,
      options?: { reset?: boolean; preserveScroll?: boolean }
    ) => {
      if (options?.reset || activeThreadIdRef.current !== targetThreadId) {
        activeThreadIdRef.current = targetThreadId;
        visibleMessageLimitRef.current = MESSAGE_PAGE_SIZE;
      }

      const visibleLimit = visibleMessageLimitRef.current;
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,thread_id,sender_id,sender_name,sender_team,body,created_at")
        .eq("thread_id", targetThreadId)
        .order("created_at", { ascending: false })
        .limit(visibleLimit + 1);

      if (error) {
        setSetupError("채팅 테이블이 아직 준비되지 않았습니다. SQL 실행 후 다시 열어주세요.");
        return false;
      }

      const messageList = messageListRef.current;
      const readingOlderMessages =
        options?.preserveScroll &&
        messageList &&
        messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight > 28;

      if (readingOlderMessages && messageList) {
        preservedScrollRef.current = {
          height: messageList.scrollHeight,
          top: messageList.scrollTop,
        };
        shouldScrollToBottomRef.current = false;
      } else {
        shouldScrollToBottomRef.current = true;
      }

      const recentMessages = (data || []) as ChatMessageRow[];
      setHasOlderMessages(recentMessages.length > visibleLimit);
      setMessages(recentMessages.slice(0, visibleLimit).reverse());
      await markThreadRead(targetThreadId);
      return true;
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
      setMobileConversationOpen(true);
      setRecipientReadState(null);
      setLoading(true);
      setSetupError("");
      const targetThreadId = await findOrCreateThread(targetUser);
      setThreadId(targetThreadId);
      if (targetThreadId) {
        await Promise.all([
          loadMessages(targetThreadId, { reset: true }),
          loadRecipientReadAt(targetThreadId, targetUser.id),
        ]);
      }
      setLoading(false);
    },
    [findOrCreateThread, loadMessages, loadRecipientReadAt]
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

  const loadOlderMessages = useCallback(async () => {
    if (!threadId || !hasOlderMessages || loadingOlderMessages) return;

    setLoadingOlderMessages(true);
    visibleMessageLimitRef.current += MESSAGE_PAGE_SIZE;
    const loaded = await loadMessages(threadId, { preserveScroll: true });
    if (!loaded) {
      visibleMessageLimitRef.current -= MESSAGE_PAGE_SIZE;
    }
    setLoadingOlderMessages(false);
  }, [hasOlderMessages, loadMessages, loadingOlderMessages, threadId]);

  const requestBrowserNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }, []);

  const showBrowserNotification = useCallback(
    (message: ChatMessageRow) => {
      if (
        message.sender_id === currentUserId ||
        notificationPermission !== "granted" ||
        !("Notification" in window)
      ) {
        return;
      }

      try {
        const body =
          message.body.length > 72 ? `${message.body.slice(0, 72)}...` : message.body;
        const notification = new Notification(`${message.sender_name}님의 새 메시지`, {
          body,
          icon: "/icon.png",
          tag: `chat-message-${message.id}`,
        });

        notification.onclick = () => {
          window.focus();
          onOpen();
          notification.close();
        };
      } catch {
        setNotificationPermission(Notification.permission);
      }
    },
    [currentUserId, notificationPermission, onOpen]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNotificationPermission(
        "Notification" in window ? Notification.permission : "unsupported"
      );
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const initialTimer = window.setTimeout(() => {
      void loadUsers();
      void loadUnreadCount();
    }, 0);

    const timer = window.setInterval(() => {
      void loadUnreadCount();
      if (open && threadId) {
        void loadMessages(threadId, { preserveScroll: true });
        if (selectedUserId) {
          void loadRecipientReadAt(threadId, selectedUserId);
        }
      }
    }, 6000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [
    currentUserId,
    loadMessages,
    loadRecipientReadAt,
    loadUnreadCount,
    loadUsers,
    open,
    selectedUserId,
    threadId,
  ]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`chat-messages-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const insertedMessage = payload.new as ChatMessageRow;
          void loadUnreadCount();
          showBrowserNotification(insertedMessage);
          if (open && threadId && Number(insertedMessage.thread_id) === threadId) {
            void loadMessages(threadId);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadMessages, loadUnreadCount, open, showBrowserNotification, threadId]);

  useEffect(() => {
    if (!currentUserId || !threadId || !selectedUserId) return;

    const channel = supabase
      .channel(`chat-read-${currentUserId}-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_participants",
          filter: `thread_id=eq.${threadId}`,
        },
        () => {
          void loadRecipientReadAt(threadId, selectedUserId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadRecipientReadAt, selectedUserId, threadId]);

  useEffect(() => {
    if (!open) return;

    if (preservedScrollRef.current && messageListRef.current) {
      const previous = preservedScrollRef.current;
      messageListRef.current.scrollTop =
        messageListRef.current.scrollHeight - previous.height + previous.top;
      preservedScrollRef.current = null;
      return;
    }

    if (shouldScrollToBottomRef.current) {
      messageEndRef.current?.scrollIntoView({ block: "end" });
      shouldScrollToBottomRef.current = false;
    }
  }, [messages, open]);

  if (!open) return null;

  function closePanel() {
    setMobileConversationOpen(false);
    onClose();
  }

  return (
    <div className={chatStyles.backdrop} style={styles.backdrop} onClick={closePanel}>
      <section className={chatStyles.panel} style={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={chatStyles.header} style={styles.header}>
          <div>
            <span style={styles.kicker}>업무 채팅</span>
            <h2 style={styles.title}>1:1 메시지</h2>
          </div>
          <div className={chatStyles.headerActions}>
            {notificationPermission === "default" && (
              <button
                type="button"
                className={chatStyles.notificationButton}
                onClick={() => void requestBrowserNotifications()}
              >
                알림 켜기
              </button>
            )}
            {notificationPermission === "granted" && (
              <span className={chatStyles.notificationEnabled}>알림 켜짐</span>
            )}
            {notificationPermission === "denied" && (
              <span className={chatStyles.notificationBlocked}>알림 차단됨</span>
            )}
            <button type="button" style={styles.closeButton} onClick={closePanel}>
              닫기
            </button>
          </div>
        </header>

        {setupError && <div style={styles.notice}>{setupError}</div>}

        <div
          className={`${chatStyles.body} ${mobileConversationOpen ? chatStyles.conversationView : ""}`}
          style={styles.body}
        >
          <aside className={chatStyles.userList} style={styles.userList}>
            <div className={chatStyles.listHeading}>
              <strong>대화 상대</strong>
              <span>팀별 목록</span>
            </div>
            {groupedUsers.map(([team, members], index) => {
              const unreadCount = members.reduce(
                (total, member) => total + (unreadByUserId[member.id] || 0),
                0
              );
              const teamOpen =
                expandedTeams[team] ??
                (index === 0 ||
                  members.some(
                    (member) =>
                      member.id === selectedUserId || unreadByUserId[member.id] > 0
                  ));

              return (
                <details
                  key={team}
                  className={chatStyles.teamGroup}
                  open={teamOpen}
                  onToggle={(event) => {
                    const openState = event.currentTarget.open;
                    setExpandedTeams((current) => ({ ...current, [team]: openState }));
                  }}
                >
                  <summary className={chatStyles.teamHeader}>
                    <strong>{team}</strong>
                    <span className={chatStyles.teamMeta}>
                      {unreadCount > 0 && <em>{unreadCount}</em>}
                      {members.length}명
                    </span>
                  </summary>
                  <div className={chatStyles.teamMembers}>
                    {members.length === 0 ? (
                      <p className={chatStyles.emptyTeam}>현재 대화 가능한 인원이 없습니다.</p>
                    ) : (
                      members.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className={chatStyles.userButton}
                          style={selectedUserId === user.id ? styles.userButtonActive : undefined}
                          onClick={() => void selectUser(user)}
                        >
                          <strong>{user.name}</strong>
                          {unreadByUserId[user.id] > 0 && (
                            <em style={styles.userUnreadBadge}>{unreadByUserId[user.id]}</em>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </details>
              );
            })}
          </aside>

          <section className={chatStyles.chatArea} style={styles.chatArea}>
            {selectedUser ? (
              <>
                <div className={chatStyles.chatHeader} style={styles.chatHeader}>
                  <button
                    type="button"
                    className={chatStyles.mobileBack}
                    onClick={() => setMobileConversationOpen(false)}
                    aria-label="대화 상대 목록으로 돌아가기"
                  >
                    &lt;
                  </button>
                  <div className={chatStyles.chatIdentity}>
                    <strong>{selectedUser.name}</strong>
                    <span>{selectedUser.team}</span>
                  </div>
                </div>

                <div ref={messageListRef} className={chatStyles.messageList} style={styles.messageList}>
                  {messages.length === 0 ? (
                    <div style={styles.empty}>아직 주고받은 메시지가 없습니다.</div>
                  ) : (
                    <>
                      {hasOlderMessages && (
                        <div className={chatStyles.historyControls}>
                          <button
                            type="button"
                            className={chatStyles.loadOlderButton}
                            disabled={loadingOlderMessages}
                            onClick={() => void loadOlderMessages()}
                          >
                            {loadingOlderMessages ? "불러오는 중..." : "이전 대화 불러오기"}
                          </button>
                        </div>
                      )}
                      {messages.map((message, index) => {
                      const mine = message.sender_id === currentUserId;
                      const recipientLastReadAt =
                        recipientReadState?.threadId === threadId &&
                        recipientReadState.recipientId === selectedUserId
                          ? recipientReadState.lastReadAt
                          : undefined;
                      const awaitingRead =
                        mine &&
                        recipientLastReadAt !== undefined &&
                        (!recipientLastReadAt || message.created_at > recipientLastReadAt);
                      const showDate =
                        index === 0 ||
                        !isSameChatDate(messages[index - 1].created_at, message.created_at);

                      return (
                        <Fragment key={message.id}>
                          {showDate && (
                            <div className={chatStyles.dateDivider}>
                              <span>{formatChatDate(message.created_at)}</span>
                            </div>
                          )}
                          <div
                            style={{
                              ...styles.messageRow,
                              justifyContent: mine ? "flex-end" : "flex-start",
                            }}
                          >
                            {mine ? (
                              <div className={chatStyles.outgoingMessage}>
                                {awaitingRead && (
                                  <span className={chatStyles.unreadMarker} aria-label="상대방이 아직 읽지 않음">
                                    1
                                  </span>
                                )}
                                <div
                                  style={{
                                    ...styles.messageBubble,
                                    ...styles.messageBubbleMine,
                                  }}
                                >
                                  <p style={styles.messageText}>{message.body}</p>
                                  <span style={styles.messageTime}>{formatTime(message.created_at)}</span>
                                </div>
                              </div>
                            ) : (
                              <div style={styles.messageBubble}>
                                <span style={styles.messageSender}>{message.sender_name}</span>
                                <p style={styles.messageText}>{message.body}</p>
                                <span style={styles.messageTime}>{formatTime(message.created_at)}</span>
                              </div>
                            )}
                          </div>
                        </Fragment>
                      );
                      })}
                    </>
                  )}
                  <div ref={messageEndRef} />
                </div>

                <div className={chatStyles.inputRow} style={styles.inputRow}>
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
              <div style={styles.emptyFull}>대화할 인원을 선택해 주세요.</div>
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
    width: "min(920px, calc(100vw - 44px))",
    height: "min(680px, calc(100dvh - 44px))",
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
    gridTemplateColumns: "260px minmax(0, 1fr)",
  },
  userList: {
    minHeight: 0,
    overflowY: "auto",
    borderRight: "1px solid #e5eaf0",
    background: "#f8fafc",
    padding: "10px",
  },
  userButtonActive: {
    borderColor: "#b7e4c7",
    background: "#eef8f2",
    color: "#0f8a56",
  },
  userUnreadBadge: {
    minWidth: "18px",
    height: "18px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: "#ef4444",
    color: "#ffffff",
    fontSize: "11px",
    fontStyle: "normal",
    fontWeight: 900,
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
