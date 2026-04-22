import type { Screen } from '../types';

type SyncStatus = 'synced' | 'syncing' | 'offline';

interface HeaderProps {
  screen: Screen;
  syncStatus: SyncStatus;
  syncTooltip: string;
  onNavigate: (screen: Screen) => void;
  onCreate?: () => void;
}

function getSyncLabel(syncStatus: SyncStatus): string {
  switch (syncStatus) {
    case 'syncing':
      return 'Синхронизация';
    case 'offline':
      return 'Офлайн';
    default:
      return 'Синхронно';
  }
}

function Header({ screen, syncStatus, syncTooltip, onNavigate, onCreate }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand-group">
        <div className="header__brand">
          <h1 className="header__title">MONDAY</h1>
        </div>
        <span
          className={`sync-badge sync-badge--${syncStatus}`}
          title={syncTooltip}
          aria-label={syncTooltip}
        >
          <span
            className={`sync-status__dot sync-status__dot--${syncStatus}`}
            aria-hidden="true"
          />
          {syncStatus !== 'synced' && <span className="sync-badge__label">{getSyncLabel(syncStatus)}</span>}
        </span>
      </div>

      <div className="header__actions">
        <nav className="segmented-control" aria-label="Разделы">
          <button
            type="button"
            className={`segmented-control__button${screen === 'active' ? ' segmented-control__button--active' : ''}`}
            aria-current={screen === 'active' ? 'page' : undefined}
            onClick={() => onNavigate('active')}
          >
            Активные
          </button>
          <button
            type="button"
            className={`segmented-control__button${screen === 'archive' ? ' segmented-control__button--active' : ''}`}
            aria-current={screen === 'archive' ? 'page' : undefined}
            onClick={() => onNavigate('archive')}
          >
            Архив
          </button>
        </nav>

        {onCreate && (
          <button type="button" className="button button--primary header__create-button" onClick={onCreate}>
            + Новая задача
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
