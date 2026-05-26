"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  standalone?: boolean;
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
  user_name?: string;
  team?: string | null;
  last_read_at: string | null;
};

type ChatThreadRow = {
  id: number;
  created_by: string | null;
  thread_type: "direct" | "group";
  title: string | null;
  updated_at: string;
};

type GroupThread = ChatThreadRow & {
  participants: ChatParticipantRow[];
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

type ActivityLogRow = {
  user_id: string;
  event_type: "login" | "logout" | "activity" | "auto_logout";
  created_at: string;
};

type BrowserNotificationPermission = NotificationPermission | "unsupported" | "loading";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  rect: DOMRect;
};

type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  left: number;
  top: number;
};

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

function isOnlineActivity(log?: ActivityLogRow) {
  if (!log) return false;
  const activeAt = new Date(log.created_at).getTime();
  return (
    Date.now() - activeAt < 15 * 60 * 1000 &&
    log.event_type !== "logout" &&
    log.event_type !== "auto_logout"
  );
}

export function ChatPanel({
  open,
  standalone = false,
  currentUserId,
  currentName,
  currentTeam,
  onOpen,
  onClose,
  onUnreadChange,
}: ChatPanelProps) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedGroupThread, setSelectedGroupThread] = useState<GroupThread | null>(null);
  const [groupThreads, setGroupThreads] = useState<GroupThread[]>([]);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [unreadByUserId, setUnreadByUserId] = useState<Record<string, number>>({});
  const [unreadByThreadId, setUnreadByThreadId] = useState<Record<number, number>>({});
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [participantReadStates, setParticipantReadStates] = useState<ChatParticipantRow[]>([]);
  const [groupEditorMode, setGroupEditorMode] = useState<"create" | "add" | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>("loading");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelDragRef = useRef<DragState | null>(null);
  const panelResizeRef = useRef<ResizeState | null>(null);
  const activeThreadIdRef = useRef<number | null>(null);
  const visibleMessageLimitRef = useRef(MESSAGE_PAGE_SIZE);
  const preservedScrollRef = useRef<{ height: number; top: number } | null>(null);
  const shouldScrollToBottomRef = useRef(false);
  const notifiedMessageIdsRef = useRef<Set<number>>(new Set());
  const unreadSnapshotReadyRef = useRef(false);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(null);

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

  const loadOnlineUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_activity_logs")
      .select("user_id,event_type,created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return;

    const latestByUser = new Map<string, ActivityLogRow>();
    ((data || []) as ActivityLogRow[]).forEach((log) => {
      if (!latestByUser.has(log.user_id)) {
        latestByUser.set(log.user_id, log);
      }
    });

    setOnlineUserIds(
      new Set(
        Array.from(latestByUser.entries())
          .filter(([, log]) => isOnlineActivity(log))
          .map(([userId]) => userId)
      )
    );
  }, []);

  const loadGroupThreads = useCallback(async () => {
    if (!currentUserId) return;

    const { data: ownRows, error: ownError } = await supabase
      .from("chat_participants")
      .select("thread_id")
      .eq("user_id", currentUserId);

    if (ownError) return;

    const ownThreadIds = (ownRows || []).map((row) => Number(row.thread_id));
    if (ownThreadIds.length === 0) {
      setGroupThreads([]);
      return;
    }

    const { data: threadRows, error: threadError } = await supabase
      .from("chat_threads")
      .select("id,created_by,thread_type,title,updated_at")
      .in("id", ownThreadIds)
      .eq("thread_type", "group")
      .order("updated_at", { ascending: false });

    if (threadError) {
      setSetupError("단체 채팅 SQL 적용 후 다시 열어주세요.");
      return;
    }

    const rows = (threadRows || []) as ChatThreadRow[];
    if (rows.length === 0) {
      setGroupThreads([]);
      return;
    }

    const { data: memberRows } = await supabase
      .from("chat_participants")
      .select("thread_id,user_id,user_name,team,last_read_at")
      .in("thread_id", rows.map((row) => row.id));
    const members = (memberRows || []) as ChatParticipantRow[];

    const nextRooms = rows.map((row) => ({
        ...row,
        participants: members.filter((member) => member.thread_id === row.id),
      }));
    setGroupThreads(nextRooms);
    setSelectedGroupThread((selected) =>
      selected ? nextRooms.find((room) => room.id === selected.id) || null : null
    );
  }, [currentUserId]);

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
      setUnreadByThreadId({});
      return;
    }

    const participants = (participantRows || []) as ChatParticipantRow[];
    const threadIds = participants.map((participant) => participant.thread_id);

    if (threadIds.length === 0) {
      onUnreadChange(0);
      setUnreadByUserId({});
      setUnreadByThreadId({});
      unreadSnapshotReadyRef.current = true;
      return;
    }

    const readMap = new Map(
      participants.map((participant) => [participant.thread_id, participant.last_read_at || ""])
    );
    const { data: groupRows } = await supabase
      .from("chat_threads")
      .select("id")
      .in("id", threadIds)
      .eq("thread_type", "group");
    const groupThreadIds = new Set(
      (groupRows || []).map((thread) => Number(thread.id))
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
      setUnreadByThreadId({});
      return;
    }

    const unreadThreadIds = new Set<number>();
    const unreadUserMap: Record<string, number> = {};
    const unreadThreadMap: Record<number, number> = {};
    const unreadMessages: ChatMessageRow[] = [];

    ((messageRows || []) as ChatMessageRow[]).forEach((message) => {
      const lastRead = readMap.get(message.thread_id);
      if (!lastRead || message.created_at > lastRead) {
        unreadMessages.push(message);
        unreadThreadIds.add(message.thread_id);
        unreadThreadMap[message.thread_id] = (unreadThreadMap[message.thread_id] || 0) + 1;
        if (!groupThreadIds.has(message.thread_id)) {
          unreadUserMap[message.sender_id] = (unreadUserMap[message.sender_id] || 0) + 1;
        }
      }
    });

    if (!unreadSnapshotReadyRef.current) {
      unreadMessages.forEach((message) => notifiedMessageIdsRef.current.add(message.id));
      unreadSnapshotReadyRef.current = true;
    } else {
      const newlyArrivedMessages = unreadMessages.filter(
        (message) => !notifiedMessageIdsRef.current.has(message.id)
      );

      newlyArrivedMessages.forEach((message) => notifiedMessageIdsRef.current.add(message.id));

      if (newlyArrivedMessages[0]) {
        showBrowserNotification(newlyArrivedMessages[0]);
      }
    }

    setUnreadByUserId(unreadUserMap);
    setUnreadByThreadId(unreadThreadMap);
    onUnreadChange(unreadThreadIds.size);
  }, [currentUserId, onUnreadChange, showBrowserNotification]);

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

  const loadParticipantReadStates = useCallback(async (targetThreadId: number) => {
    const { data, error } = await supabase
      .from("chat_participants")
      .select("thread_id,user_id,user_name,team,last_read_at")
      .eq("thread_id", targetThreadId);

    if (!error) {
      setParticipantReadStates((data || []) as ChatParticipantRow[]);
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
        const { data: directRows } = await supabase
          .from("chat_threads")
          .select("id")
          .in("id", myThreadIds)
          .eq("thread_type", "direct");
        const directThreadIds = (directRows || []).map((row) => Number(row.id));

        const { data: targetParticipants } =
          directThreadIds.length > 0
            ? await supabase
                .from("chat_participants")
                .select("thread_id,user_id,last_read_at")
                .eq("user_id", targetUser.id)
                .in("thread_id", directThreadIds)
            : { data: [] };

        const existingThreadId = ((targetParticipants || []) as ChatParticipantRow[])[0]?.thread_id;

        if (existingThreadId) return existingThreadId;
      }

      const { data: threadRow, error: threadError } = await supabase
        .from("chat_threads")
        .insert({ created_by: currentUserId, thread_type: "direct" })
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
      setSelectedGroupThread(null);
      setMobileConversationOpen(true);
      setParticipantReadStates([]);
      setLoading(true);
      setSetupError("");
      const targetThreadId = await findOrCreateThread(targetUser);
      setThreadId(targetThreadId);
      if (targetThreadId) {
        await loadMessages(targetThreadId, { reset: true });
        await loadParticipantReadStates(targetThreadId);
      }
      setLoading(false);
    },
    [findOrCreateThread, loadMessages, loadParticipantReadStates]
  );

  const selectGroupThread = useCallback(
    async (targetThread: GroupThread) => {
      setSelectedGroupThread(targetThread);
      setSelectedUserId("");
      setMobileConversationOpen(true);
      setParticipantReadStates([]);
      setThreadId(targetThread.id);
      setLoading(true);
      setSetupError("");
      await loadMessages(targetThread.id, { reset: true });
      await loadParticipantReadStates(targetThread.id);
      setLoading(false);
    },
    [loadMessages, loadParticipantReadStates]
  );

  const openGroupCreator = useCallback(() => {
    setSelectedUserId("");
    setSelectedGroupThread(null);
    setThreadId(null);
    setGroupTitle("");
    setGroupMemberIds([]);
    setGroupEditorMode("create");
    setMobileConversationOpen(true);
  }, []);

  const openGroupMemberManager = useCallback(() => {
    if (!selectedGroupThread) return;
    setGroupTitle(selectedGroupThread.title || "");
    setGroupMemberIds(
      selectedGroupThread.participants
        .filter((participant) => participant.user_id !== currentUserId)
        .map((participant) => participant.user_id)
    );
    setGroupEditorMode("add");
  }, [currentUserId, selectedGroupThread]);

  const saveGroupThread = useCallback(async () => {
    const title = groupTitle.trim();
    if (!title || groupMemberIds.length < 2) {
      setSetupError("단체방 제목과 대화 상대 2명 이상을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setSetupError("");

    if (groupEditorMode === "create") {
      const { data: threadRow, error: threadError } = await supabase
        .from("chat_threads")
        .insert({ created_by: currentUserId, thread_type: "group", title })
        .select("id,created_by,thread_type,title,updated_at")
        .single();

      if (threadError || !threadRow) {
        setSetupError("단체 대화방을 만들지 못했습니다. SQL 적용 여부를 확인해 주세요.");
        setLoading(false);
        return;
      }

      const selectedMembers = users.filter((user) => groupMemberIds.includes(user.id));
      const { error: memberError } = await supabase.from("chat_participants").insert([
        {
          thread_id: threadRow.id,
          user_id: currentUserId,
          user_name: currentName || "사용자",
          team: currentTeam,
          last_read_at: new Date().toISOString(),
        },
        ...selectedMembers.map((user) => ({
          thread_id: threadRow.id,
          user_id: user.id,
          user_name: user.name,
          team: user.team,
          last_read_at: null,
        })),
      ]);

      if (memberError) {
        setSetupError("단체 대화방 참여자를 저장하지 못했습니다.");
        setLoading(false);
        return;
      }

      const createdGroup: GroupThread = {
        ...(threadRow as ChatThreadRow),
        participants: [
          {
            thread_id: Number(threadRow.id),
            user_id: currentUserId,
            user_name: currentName || "사용자",
            team: currentTeam,
            last_read_at: new Date().toISOString(),
          },
          ...selectedMembers.map((user) => ({
            thread_id: Number(threadRow.id),
            user_id: user.id,
            user_name: user.name,
            team: user.team,
            last_read_at: null,
          })),
        ],
      };

      await loadGroupThreads();
      setGroupEditorMode(null);
      await selectGroupThread(createdGroup);
    } else if (selectedGroupThread) {
      const currentMemberIds = new Set(
        selectedGroupThread.participants.map((participant) => participant.user_id)
      );
      const addedMembers = users.filter(
        (user) => groupMemberIds.includes(user.id) && !currentMemberIds.has(user.id)
      );

      if (addedMembers.length > 0) {
        const { error } = await supabase.from("chat_participants").insert(
          addedMembers.map((user) => ({
            thread_id: selectedGroupThread.id,
            user_id: user.id,
            user_name: user.name,
            team: user.team,
            last_read_at: null,
          }))
        );

        if (error) {
          setSetupError("참여자를 추가하지 못했습니다. 권한 또는 테이블을 확인해 주세요.");
          setLoading(false);
          return;
        }
      }

      const nextThread = {
        ...selectedGroupThread,
        participants: [
          ...selectedGroupThread.participants,
          ...addedMembers.map((user) => ({
            thread_id: selectedGroupThread.id,
            user_id: user.id,
            user_name: user.name,
            team: user.team,
            last_read_at: null,
          })),
        ],
      };
      setSelectedGroupThread(nextThread);
      await loadGroupThreads();
      await loadParticipantReadStates(selectedGroupThread.id);
      setGroupEditorMode(null);
    }

    setLoading(false);
  }, [
    currentName,
    currentTeam,
    currentUserId,
    groupEditorMode,
    groupMemberIds,
    groupTitle,
    loadGroupThreads,
    loadParticipantReadStates,
    selectGroupThread,
    selectedGroupThread,
    users,
  ]);

  const deleteGroupThread = useCallback(async () => {
    if (!selectedGroupThread || selectedGroupThread.created_by !== currentUserId) return;
    if (!window.confirm("이 단체방과 대화 내용을 모두 삭제할까요?")) return;

    setLoading(true);
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("id", selectedGroupThread.id);

    if (error) {
      setSetupError("단체방을 삭제하지 못했습니다.");
      setLoading(false);
      return;
    }

    setSelectedGroupThread(null);
    setThreadId(null);
    setMessages([]);
    setMobileConversationOpen(false);
    await loadGroupThreads();
    setLoading(false);
  }, [currentUserId, loadGroupThreads, selectedGroupThread]);

  const leaveGroupThread = useCallback(async () => {
    if (!selectedGroupThread || selectedGroupThread.created_by === currentUserId) return;
    if (!window.confirm("이 단체방에서 나갈까요?")) return;

    setLoading(true);
    const { error } = await supabase
      .from("chat_participants")
      .delete()
      .eq("thread_id", selectedGroupThread.id)
      .eq("user_id", currentUserId);

    if (error) {
      setSetupError("단체방에서 나가지 못했습니다.");
      setLoading(false);
      return;
    }

    setSelectedGroupThread(null);
    setThreadId(null);
    setMessages([]);
    setMobileConversationOpen(false);
    await loadGroupThreads();
    setLoading(false);
  }, [currentUserId, loadGroupThreads, selectedGroupThread]);

  const sendMessage = useCallback(async () => {
    const body = messageBody.trim();
    if (!body || (!selectedUser && !selectedGroupThread)) return;

    setLoading(true);
    setSetupError("");

    const targetThreadId =
      threadId || (selectedUser ? await findOrCreateThread(selectedUser) : null);

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
    selectedGroupThread,
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
    notifiedMessageIdsRef.current.clear();
    unreadSnapshotReadyRef.current = false;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;

    const initialTimer = window.setTimeout(() => {
      void loadUsers();
      void loadGroupThreads();
      void loadOnlineUsers();
      void loadUnreadCount();
    }, 0);

    const timer = window.setInterval(() => {
      void loadUnreadCount();
      void loadGroupThreads();
      void loadOnlineUsers();
      if (open && threadId) {
        void loadMessages(threadId, { preserveScroll: true });
        void loadParticipantReadStates(threadId);
      }
    }, 6000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [
    currentUserId,
    loadGroupThreads,
    loadMessages,
    loadOnlineUsers,
    loadParticipantReadStates,
    loadUnreadCount,
    loadUsers,
    open,
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
          void loadGroupThreads();
          if (open && threadId && Number(insertedMessage.thread_id) === threadId) {
            void loadMessages(threadId);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadGroupThreads, loadMessages, loadUnreadCount, open, threadId]);

  useEffect(() => {
    if (!currentUserId || !threadId) return;

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
          void loadParticipantReadStates(threadId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadParticipantReadStates, threadId]);

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

  function startPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (
      standalone ||
      event.button !== 0 ||
      window.matchMedia("(max-width: 700px)").matches ||
      (event.target as HTMLElement).closest("button")
    ) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;

    panelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: panelOffset.x,
      offsetY: panelOffset.y,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const drag = panelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const margin = 12;
    const candidateX = drag.offsetX + event.clientX - drag.startX;
    const candidateY = drag.offsetY + event.clientY - drag.startY;
    const minX = drag.offsetX + margin - drag.rect.left;
    const maxX = drag.offsetX + window.innerWidth - margin - drag.rect.right;
    const minY = drag.offsetY + margin - drag.rect.top;
    const maxY = drag.offsetY + window.innerHeight - margin - drag.rect.bottom;

    setPanelOffset({
      x: Math.min(Math.max(candidateX, minX), maxX),
      y: Math.min(Math.max(candidateY, minY), maxY),
    });
  }

  function stopPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (panelDragRef.current?.pointerId !== event.pointerId) return;

    panelDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function startPanelResize(event: ReactPointerEvent<HTMLSpanElement>) {
    const rect = panelRef.current?.getBoundingClientRect();
    if (standalone || !rect || window.matchMedia("(max-width: 700px)").matches) return;

    event.preventDefault();
    event.stopPropagation();
    panelResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resizePanel(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    const margin = 12;
    const maxWidth = window.innerWidth - resize.left - margin;
    const maxHeight = window.innerHeight - resize.top - margin;
    const minWidth = Math.min(560, maxWidth);
    const minHeight = Math.min(400, maxHeight);

    setPanelSize({
      width: Math.min(Math.max(resize.width + event.clientX - resize.startX, minWidth), maxWidth),
      height: Math.min(Math.max(resize.height + event.clientY - resize.startY, minHeight), maxHeight),
    });
  }

  function stopPanelResize(event: ReactPointerEvent<HTMLSpanElement>) {
    if (panelResizeRef.current?.pointerId !== event.pointerId) return;

    panelResizeRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function closePanel() {
    setMobileConversationOpen(false);
    onClose();
  }

  return (
    <div
      className={`${chatStyles.backdrop} ${standalone ? chatStyles.popupBackdrop : ""}`}
      style={styles.backdrop}
    >
      <section
        ref={panelRef}
        className={`${chatStyles.panel} ${standalone ? chatStyles.popupPanel : ""}`}
        style={{
          ...styles.panel,
          ...(panelSize || {}),
          transform: `translate(${panelOffset.x}px, ${panelOffset.y}px)`,
        }}
      >
        <header
          className={chatStyles.header}
          style={styles.header}
          onPointerDown={startPanelDrag}
          onPointerMove={movePanel}
          onPointerUp={stopPanelDrag}
          onPointerCancel={stopPanelDrag}
        >
          <div>
            <span style={styles.kicker}>업무 채팅</span>
            <h2 style={styles.title}>메시지</h2>
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
              <strong>단체방</strong>
              <button type="button" className={chatStyles.createRoomButton} onClick={openGroupCreator}>
                만들기
              </button>
            </div>
            <div className={chatStyles.groupRoomList}>
              {groupThreads.length === 0 ? (
                <p className={chatStyles.emptyRooms}>참여 중인 단체방이 없습니다.</p>
              ) : (
                groupThreads.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className={chatStyles.roomButton}
                    style={selectedGroupThread?.id === room.id ? styles.userButtonActive : undefined}
                    onClick={() => void selectGroupThread(room)}
                  >
                    <span>
                      <strong>{room.title || "단체 대화방"}</strong>
                      <small>{room.participants.length}명</small>
                    </span>
                    {unreadByThreadId[room.id] > 0 && (
                      <em style={styles.userUnreadBadge}>{unreadByThreadId[room.id]}</em>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className={chatStyles.listHeading}>
              <strong>1:1 대화</strong>
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
            {groupEditorMode ? (
              <div className={chatStyles.groupEditor}>
                <div className={chatStyles.groupEditorHeader}>
                  <button
                    type="button"
                    className={chatStyles.mobileBack}
                    onClick={() => {
                      setGroupEditorMode(null);
                      setMobileConversationOpen(false);
                    }}
                    aria-label="대화 목록으로 돌아가기"
                  >
                    &lt;
                  </button>
                  <strong>{groupEditorMode === "create" ? "단체방 만들기" : "참여자 추가"}</strong>
                </div>
                {groupEditorMode === "create" && (
                  <label className={chatStyles.roomTitleField}>
                    <span>방 제목</span>
                    <input
                      value={groupTitle}
                      onChange={(event) => setGroupTitle(event.target.value)}
                      placeholder="예: 생산 일정 협의"
                    />
                  </label>
                )}
                <div className={chatStyles.memberPicker}>
                  {groupedUsers.map(([team, members]) => (
                    <section key={team} className={chatStyles.memberTeam}>
                      <h3>{team}</h3>
                      <div>
                        {members.map((user) => (
                          <label key={user.id} className={chatStyles.memberChoice}>
                            <input
                              type="checkbox"
                              checked={groupMemberIds.includes(user.id)}
                              disabled={
                                groupEditorMode === "add" &&
                                Boolean(
                                  selectedGroupThread?.participants.some(
                                    (participant) => participant.user_id === user.id
                                  )
                                )
                              }
                              onChange={(event) => {
                                setGroupMemberIds((current) =>
                                  event.target.checked
                                    ? [...current, user.id]
                                    : current.filter((id) => id !== user.id)
                                );
                              }}
                            />
                            <span>{user.name}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <div className={chatStyles.groupEditorActions}>
                  <button
                    type="button"
                    className={chatStyles.cancelButton}
                    onClick={() => setGroupEditorMode(null)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className={chatStyles.saveRoomButton}
                    disabled={loading}
                    onClick={() => void saveGroupThread()}
                  >
                    {groupEditorMode === "create" ? "단체방 생성" : "참여자 추가"}
                  </button>
                </div>
              </div>
            ) : selectedUser || selectedGroupThread ? (
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
                  <div className={chatStyles.chatHeaderBody}>
                    <div className={chatStyles.chatIdentity}>
                      <strong>{selectedGroupThread?.title || selectedUser?.name}</strong>
                      <span>
                        {selectedGroupThread
                          ? `${selectedGroupThread.participants.length}명 참여`
                          : selectedUser?.team}
                      </span>
                    </div>
                    {selectedGroupThread && (
                      <div className={chatStyles.participantChips}>
                        {selectedGroupThread.participants.map((participant) => (
                          <span key={participant.user_id} className={chatStyles.participantChip}>
                            <i
                              className={
                                onlineUserIds.has(participant.user_id)
                                  ? chatStyles.onlineLamp
                                  : chatStyles.offlineLamp
                              }
                            />
                            {participant.user_name || "사용자"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedGroupThread && (
                    <div className={chatStyles.roomActions}>
                      <button
                        type="button"
                        className={chatStyles.manageMembersButton}
                        onClick={openGroupMemberManager}
                      >
                        참여자 추가
                      </button>
                      {selectedGroupThread.created_by === currentUserId ? (
                        <button
                          type="button"
                          className={chatStyles.deleteRoomButton}
                          onClick={() => void deleteGroupThread()}
                        >
                          방 삭제
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={chatStyles.leaveRoomButton}
                          onClick={() => void leaveGroupThread()}
                        >
                          나가기
                        </button>
                      )}
                    </div>
                  )}
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
                      const unreadRecipientCount = participantReadStates.filter(
                        (participant) =>
                          participant.user_id !== message.sender_id &&
                          (!participant.last_read_at ||
                            message.created_at > participant.last_read_at)
                      ).length;
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
                                {unreadRecipientCount > 0 && (
                                  <span className={chatStyles.unreadMarker} aria-label="아직 읽지 않은 인원 수">
                                    {unreadRecipientCount}
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
                              <div className={chatStyles.incomingMessage}>
                                <div style={styles.messageBubble}>
                                  <span style={styles.messageSender}>{message.sender_name}</span>
                                  <p style={styles.messageText}>{message.body}</p>
                                  <span style={styles.messageTime}>{formatTime(message.created_at)}</span>
                                </div>
                                {unreadRecipientCount > 0 && (
                                  <span className={chatStyles.unreadMarker} aria-label="아직 읽지 않은 인원 수">
                                    {unreadRecipientCount}
                                  </span>
                                )}
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
        {!standalone && (
          <span
            className={chatStyles.resizeHandle}
            aria-hidden="true"
            onPointerDown={startPanelResize}
            onPointerMove={resizePanel}
            onPointerUp={stopPanelResize}
            onPointerCancel={stopPanelResize}
          />
        )}
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 90,
    pointerEvents: "none",
  },
  panel: {
    position: "fixed",
    left: "max(22px, calc(100vw - 942px))",
    top: "max(22px, calc(100dvh - 702px))",
    display: "flex",
    flexDirection: "column",
    borderRadius: "14px",
    border: "1px solid #d8e0ea",
    background: "#ffffff",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.25)",
    overflow: "hidden",
    pointerEvents: "auto",
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
