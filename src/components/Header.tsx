import type { CurrentUser, Screen, SyncStatus } from '../types';

interface HeaderProps {
  backupTooltip: string;
  screen: Screen;
  currentUser: CurrentUser | null;
  isBackuping: boolean;
  isLoggingOut?: boolean;
  syncStatus: SyncStatus;
  syncTooltip: string;
  onBackup: () => void;
  onLogout?: () => void;
  onToggleScreen: () => void;
  onCreate?: () => void;
}

function Header({
  backupTooltip,
  screen,
  currentUser,
  isBackuping,
  isLoggingOut = false,
  syncStatus,
  syncTooltip,
  onBackup,
  onLogout,
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
          : syncStatus === 'invalid'
            ? 'Ошибка данных'
            : 'Оффлайн';

  return (
    <header className="header">
      <div className="header__brand">
        <h1 className="header__title">MONDAY</h1>
        <span
          className="sync-status has-tooltip has-tooltip--start"
          data-tooltip={syncTooltip}
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            className={`sync-status__dot sync-status__dot--${syncStatus}`}
            aria-label={backupTooltip}
            title={backupTooltip}
            aria-busy={isBackuping}
            disabled={isBackuping}
            onClick={onBackup}
          />
          <span className="sr-only">
            {syncLabel}. {syncTooltip}
          </span>
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
        {currentUser?.canLogout && onLogout && (
          <button type="button" className="link-button" onClick={onLogout} disabled={isLoggingOut}>
            {isLoggingOut ? 'Выходим…' : 'Выйти'}
          </button>
        )}
      </nav>
    </header>
  );
}

export default Header;
