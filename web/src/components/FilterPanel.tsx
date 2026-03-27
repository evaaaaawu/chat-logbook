export function FilterPanel() {
  return (
    <div data-testid="filter-panel" className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2 text-base font-bold text-foreground">
        <div className="h-5 w-5 rounded bg-primary" />
        chat-logbook
      </div>
      <div className="mt-8 text-center text-sm text-muted-foreground">
        Filters coming soon
        <div className="mt-1 text-xs">Projects, tags, search</div>
      </div>
    </div>
  );
}
