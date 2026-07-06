import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className={`search-bar${value ? ' search-bar--active' : ''}`}>
      <Search size={16} className="search-bar__icon" aria-hidden="true" />
      <input
        type="search"
        className="search-bar__input"
        placeholder="Поиск задач"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Поиск задач"
      />
      {value && (
        <button
          type="button"
          className="search-bar__clear"
          aria-label="Очистить поиск"
          onClick={() => onChange('')}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
