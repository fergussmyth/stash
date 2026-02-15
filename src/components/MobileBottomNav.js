import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const NAV_ITEMS = [
  { label: "Home", to: "/", icon: "home" },
  { label: "Explore", to: "/explore", icon: "spark" },
  { label: "Collections", to: "/trips", icon: "grid" },
  { label: "Profile", to: "/profile", icon: "user" },
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
  if (name === "list") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "spark") {
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
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 12l9-7 9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MobileBottomNav() {
  const { user, rememberedProfile } = useAuth();
  const avatarUrl =
    rememberedProfile?.avatar_url || user?.user_metadata?.avatar_url || "";
  return (
    <nav className="mobileBottomNav" aria-label="Primary">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `mobileBottomNavItem ${isActive ? "isActive" : ""}`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`mobileBottomNavIcon ${
                  item.icon === "user" && avatarUrl ? "isProfile" : ""
                } ${isActive && item.icon === "user" && avatarUrl ? "isActive" : ""}`}
                aria-hidden="true"
              >
                {item.icon === "user" && avatarUrl ? (
                  <img
                    className="mobileBottomNavAvatar"
                    src={avatarUrl}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <NavIcon name={item.icon} />
                )}
              </span>
              <span className="mobileBottomNavLabel">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
