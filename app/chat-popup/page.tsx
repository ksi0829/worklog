"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentOrgTeam } from "@/app/_lib/currentOrg";
import { ChatPanel } from "@/app/_components/ChatPanel";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();

export default function ChatPopupPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");

  const reportChatPresence = useCallback(async (visible: boolean) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase.from("chat_presence").upsert(
      {
        user_id: user.id,
        visible,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }, []);

  useEffect(() => {
    const storedName = localStorage.getItem("name") || "";
    const storedTeam = localStorage.getItem("team") || "";

    void Promise.resolve().then(() => {
      setCurrentName(storedName);
      setCurrentTeam(getCurrentOrgTeam(storedName, storedTeam));
      void supabase.auth.getUser().then(({ data }) => {
        setCurrentUserId(data.user?.id || "");
      });
    });
  }, []);

  useEffect(() => {
    const syncPresence = () => {
      void reportChatPresence(
        document.visibilityState === "visible" && document.hasFocus()
      );
    };
    const markHidden = () => {
      void reportChatPresence(false);
    };

    syncPresence();
    const timer = window.setInterval(syncPresence, 20000);
    document.addEventListener("visibilitychange", syncPresence);
    window.addEventListener("focus", syncPresence);
    window.addEventListener("blur", syncPresence);
    window.addEventListener("pagehide", markHidden);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncPresence);
      window.removeEventListener("focus", syncPresence);
      window.removeEventListener("blur", syncPresence);
      window.removeEventListener("pagehide", markHidden);
      void reportChatPresence(false);
    };
  }, [reportChatPresence]);

  return (
    <ChatPanel
      open
      standalone
      currentUserId={currentUserId}
      currentName={currentName}
      currentTeam={currentTeam}
      onOpen={() => undefined}
      onClose={() => window.close()}
      onUnreadChange={() => undefined}
    />
  );
}
