import { useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useMessages } from "@/hooks/useMessages";
import { SessionList } from "@/components/SessionList";
import { ConversationView } from "@/components/ConversationView";

function App() {
  const { sessions } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { messages } = useMessages(selectedId);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <SessionList
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ConversationView messages={messages} />
    </div>
  );
}

export default App;
