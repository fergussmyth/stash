import { Link } from "react-router-dom";
import menuIcon from "../assets/icons/menu.png";

export default function TopBar({
  title,
  subtitle,
  searchValue,
  onSearchChange,
  onToggleSidebar,
  actions,
}) {
  return (
    <header className="collectionsTopbar">
      <div className="collectionsTopbarLeft">
        <button
          className="sidebarToggleBtn"
          type="button"
          aria-label="Open navigation"
          onClick={onToggleSidebar}
        >
          <img className="sidebarToggleIcon" src={menuIcon} alt="" aria-hidden="true" />
        </button>
        <div className="collectionsTopbarTitles">
          <div className="collectionsTopbarTitle">
            <Link className="topbarHomeLink" to="/">
              {title}
            </Link>
          </div>
          {subtitle ? <div className="collectionsTopbarSubtitle">{subtitle}</div> : null}
        </div>
      </div>

      <div className="collectionsTopbarSearch">
        <label className="visuallyHidden" htmlFor="collectionSearch">
          Search collections
        </label>
        <input
          id="collectionSearch"
          className="collectionsSearchInput"
          type="search"
          placeholder="Search collections…"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="collectionsTopbarActions">{actions}</div>
    </header>
  );
}
