import type { Screen } from '../types';

type SyncStatus = 'synced' | 'syncing' | 'offline';

interface HeaderProps {
  screen: Screen;
  syncStatus: SyncStatus;
  syncTooltip: string;
  onToggleScreen: () => void;
  onCreate?: () => void;
}

function Header({ screen, syncStatus, syncTooltip, onToggleScreen, onCreate }: HeaderProps) {
  const isArchive = screen === 'archive';

  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">MONDAY</h1>
        <span
          className="sync-status"
          title={syncTooltip}
          aria-label={syncTooltip}
        >
          <span
            className={`sync-status__dot sync-status__dot--${syncStatus}`}
            aria-hidden="true"
          />
        </span>
      </div>

      <nav className="header__actions">
        {!isArchive && onCreate && (
          <button type="button" className="link-button" onClick={onCreate}>
            + Новая задача
          </button>
        )}
        <button type="button" className="link-button" onClick={onToggleScreen}>
          {isArchive ? 'Активные' : 'Архив'}
        </button>
      </nav>
    </header>
  );
}

export default Header;
