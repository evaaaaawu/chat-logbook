import { useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { useMessages } from "@/hooks/useMessages";
import { FilterPanel } from "@/components/FilterPanel";
import { SessionList } from "@/components/SessionList";
import { ConversationView } from "@/components/ConversationView";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function App() {
  const { sessions } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { messages, error } = useMessages(selectedId);
  const mainSessions = sessions.filter((s) => !s.isDeleted);
  const deletedSessions = sessions.filter((s) => s.isDeleted);
  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="h-screen bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={15} minSize={10}>
          <FilterPanel deletedCount={deletedSessions.length} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={25} minSize={15}>
          <SessionList
            sessions={mainSessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          <ConversationView
            session={selectedSession}
            messages={messages}
            error={error}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default App;
