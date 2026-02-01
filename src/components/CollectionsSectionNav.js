const CATEGORY_ITEMS = [
  { value: "general", label: "General", icon: "spark" },
  { value: "travel", label: "Travel", icon: "map" },
  { value: "fashion", label: "Fashion", icon: "tag" },
];

function CategoryIcon({ name }) {
  if (name === "map") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M10 4v14M14 6v14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "tag") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M20 10l-8 8-8-8V4h6l10 6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3l2.2 4.4L19 8l-3.5 3.4L16.4 16 12 13.6 7.6 16l.9-4.6L5 8l4.8-.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatCount(count) {
  if (!count) return "No collections";
  if (count === 1) return "1 collection";
  return `${count} collections`;
}

function SectionNavItem({ item, count, isActive, onSelect }) {
  return (
    <button
      className={`collectionsNavItem ${isActive ? "isActive" : ""}`}
      type="button"
      aria-current={isActive ? "page" : undefined}
      onClick={() => onSelect(item.value)}
    >
      <span className="collectionsNavAccent" aria-hidden="true" />
      <span className="collectionsNavIcon" aria-hidden="true">
        <CategoryIcon name={item.icon} />
      </span>
      <span className="collectionsNavText">
        <span className="collectionsNavLabel">{item.label}</span>
        <span className="collectionsNavMeta">{formatCount(count)}</span>
      </span>
    </button>
  );
}

export default function CollectionsSectionNav({ activeCategory, categoryCounts, onSelect }) {
  return (
    <>
      <aside className="collectionsNav collectionsNavSidebar" aria-label="Sections">
        <div className="collectionsNavTitle">Sections</div>
        <div className="collectionsNavList">
          {CATEGORY_ITEMS.map((item) => (
            <SectionNavItem
              key={item.value}
              item={item}
              count={categoryCounts?.[item.value] || 0}
              isActive={activeCategory === item.value}
              onSelect={onSelect}
            />
          ))}
        </div>
      </aside>

      <nav className="collectionsNav collectionsNavMobile" aria-label="Sections">
        <div className="collectionsNavList horizontal">
          {CATEGORY_ITEMS.map((item) => (
            <SectionNavItem
              key={item.value}
              item={item}
              count={categoryCounts?.[item.value] || 0}
              isActive={activeCategory === item.value}
              onSelect={onSelect}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
