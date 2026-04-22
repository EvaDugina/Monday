import type { Screen } from '../types';

interface HeaderProps {
  screen: Screen;
  onToggleScreen: () => void;
  onCreate?: () => void;
}

function Header({ screen, onToggleScreen, onCreate }: HeaderProps) {
  const isArchive = screen === 'archive';

  return (
    <header className="header">
      <h1 className="header__title">MONDAY</h1>

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
