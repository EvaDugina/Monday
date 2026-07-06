import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { CurrentUser, Screen, SyncStatus } from '../types';

interface HeaderProps {
  backupTooltip: string;
  screen: Screen;
  currentUser: CurrentUser | null;
  hasBackgroundDecorations?: boolean;
  isBackuping: boolean;
  isCollapsed?: boolean;
  isLoggingOut?: boolean;
  syncStatus: SyncStatus;
  syncTooltip: string;
  onBackgroundFiles?: (files: FileList) => void;
  onBackup: () => void;
  onClearBackground?: () => void;
  onLogout?: () => void;
  onToggleScreen: () => void;
  onCreate?: () => void;
}

function Header({
  backupTooltip,
  screen,
  currentUser,
  hasBackgroundDecorations = false,
  isBackuping,
  isCollapsed = false,
  isLoggingOut = false,
  syncStatus,
  syncTooltip,
  onBackgroundFiles,
  onBackup,
  onClearBackground,
  onLogout,
  onToggleScreen,
  onCreate,
}: HeaderProps) {
  const backgroundInputRef = useRef<HTMLInputElement>(null);
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
  const identityLabel = currentUser?.name || currentUser?.username || null;

  return (
    <header className={`header${isCollapsed ? ' header--collapsed' : ''}`}>
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
        {identityLabel && <span className="header__identity">{identityLabel}</span>}
      </div>

      <nav className="header__actions">
        {onBackgroundFiles && (
          <>
            <input
              ref={backgroundInputRef}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              tabIndex={-1}
              onChange={(event) => {
                if (event.target.files) {
                  onBackgroundFiles(event.target.files);
                }
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="icon-button has-tooltip"
              data-tooltip="Добавить изображение на фон"
              title="Добавить изображение на фон"
              onClick={() => backgroundInputRef.current?.click()}
            >
              <ImagePlus size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">Добавить изображение на фон</span>
            </button>
          </>
        )}
        {hasBackgroundDecorations && onClearBackground && (
          <button
            type="button"
            className="icon-button has-tooltip"
            data-tooltip="Очистить фон"
            title="Очистить фон"
            onClick={onClearBackground}
          >
            <Trash2 size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Очистить фон</span>
          </button>
        )}
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
