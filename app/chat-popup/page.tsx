"use client";

import { useEffect, useState } from "react";
import { getCurrentOrgTeam } from "@/app/_lib/currentOrg";
import { ChatPanel } from "@/app/_components/ChatPanel";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

const supabase = createSupabaseBrowser();

export default function ChatPopupPage() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentName, setCurrentName] = useState("");
  const [currentTeam, setCurrentTeam] = useState("");

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
