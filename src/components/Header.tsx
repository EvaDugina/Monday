import type { CurrentUser, Screen } from '../types';

type SyncStatus = 'synced' | 'syncing' | 'offline' | 'conflict';

interface HeaderProps {
  backupTooltip: string;
  screen: Screen;
  currentUser: CurrentUser | null;
  isBackuping: boolean;
  syncStatus: SyncStatus;
  syncTooltip: string;
  onBackup: () => void;
  onToggleScreen: () => void;
  onCreate?: () => void;
}

function Header({
  backupTooltip,
  screen,
  currentUser,
  isBackuping,
  syncStatus,
  syncTooltip,
  onBackup,
  onToggleScreen,
  onCreate,
}: HeaderProps) {
  const isArchive = screen === 'archive';
  const syncLabel =
    syncStatus === 'synced'
      ? 'Синхронно'
      : syncStatus === 'syncing'
        ? 'Сохраняем'
        : syncStatus === 'conflict'
          ? 'Конфликт'
          : 'Оффлайн';
  const identityLabel = currentUser?.name || currentUser?.email || null;
  const combinedTooltip = `${syncTooltip}\n${backupTooltip}`;

  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">MONDAY</h1>
        <span className="sync-status has-tooltip" data-tooltip={combinedTooltip} aria-label={combinedTooltip}>
          <button
            type="button"
            className={`sync-status__dot sync-status__dot--${syncStatus}`}
            aria-label={backupTooltip}
            aria-busy={isBackuping}
            disabled={isBackuping}
            onClick={onBackup}
          />
          <span className="sync-status__label">{syncLabel}</span>
        </span>
        {identityLabel && <span className="header__identity">{identityLabel}</span>}
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
