export default function AppShell({
  sidebar,
  topbar,
  children,
  isSidebarOpen,
  onCloseSidebar,
}) {
  return (
    <div className="collectionsShellLayout">
      <aside className="collectionsSidebar" aria-label="Primary">
        {sidebar}
      </aside>

      <div className="collectionsMain">
        {topbar}
        <div className="collectionsContent">{children}</div>
      </div>

      <div
        className={`collectionsSidebarOverlay ${isSidebarOpen ? "isOpen" : ""}`}
        role="presentation"
        onClick={onCloseSidebar}
      />
      <aside
        className={`collectionsSidebarDrawer ${isSidebarOpen ? "isOpen" : ""}`}
        aria-label="Primary"
        aria-hidden={!isSidebarOpen}
      >
        {sidebar}
      </aside>
    </div>
  );
}
