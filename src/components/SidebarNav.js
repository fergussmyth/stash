import { Link, NavLink } from "react-router-dom";

const PRIMARY_NAV = [
  { label: "Home", to: "/", icon: "home" },
  { label: "Collections", to: "/trips", icon: "grid" },
  { label: "Review", to: "/review", icon: "check" },
  { label: "Profile", to: "/profile", icon: "user" },
];

const SECTION_ITEMS = [
  { value: "general", label: "General", icon: "spark" },
  { value: "travel", label: "Travel", icon: "map" },
  { value: "fashion", label: "Fashion", icon: "tag" },
];

function NavIcon({ name }) {
  if (name === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M5 12l4 4 10-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M4 20c2-4 14-4 16 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 12h16M12 4v16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SectionIcon({ name }) {
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

export default function SidebarNav({
  brandIcon,
  activeSection,
  categoryCounts,
  onSelectSection,
  onNavigate,
}) {
  return (
    <div className="sidebarNav">
      <Link className="sidebarBrand" to="/" onClick={onNavigate} aria-label="Stash home">
        {brandIcon}
        <span>Stash</span>
      </Link>

      <nav className="sidebarNavList" aria-label="Primary navigation">
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebarNavItem ${isActive ? "isActive" : ""}`
            }
            onClick={onNavigate}
          >
            <span className="sidebarNavAccent" aria-hidden="true" />
            <span className="sidebarNavIcon" aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
            <span className="sidebarNavLabel">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {onSelectSection && (
        <div className="sidebarSections">
        <div className="sidebarSectionTitle">Stashes</div>
          <div className="sidebarSectionList">
            {SECTION_ITEMS.map((item) => (
              <button
                key={item.value}
                className={`sidebarSectionItem ${
                  activeSection === item.value ? "isActive" : ""
                }`}
                type="button"
                onClick={() => onSelectSection(item.value)}
              >
                <span className="sidebarNavAccent" aria-hidden="true" />
                <span className="sidebarNavIcon" aria-hidden="true">
                  <SectionIcon name={item.icon} />
                </span>
                <span className="sidebarSectionText">
                  <span className="sidebarNavLabel">{item.label}</span>
                  <span className="sidebarNavMeta">
                    {formatCount(categoryCounts?.[item.value] || 0)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
