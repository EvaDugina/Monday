import { useState } from 'react';
import { MAX_TITLE_LENGTH } from '../types';

interface InlineCreatorProps {
  placeholder: string;
  onCreate: (title: string) => void;
}

function InlineCreator({ placeholder, onCreate }: InlineCreatorProps) {
  const [title, setTitle] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    onCreate(trimmed);
    setTitle('');
  }

  return (
    <form className="inline-creator" onSubmit={handleSubmit}>
      <input
        className="text-input"
        type="text"
        value={title}
        maxLength={MAX_TITLE_LENGTH}
        placeholder={placeholder}
        onChange={(event) => setTitle(event.target.value)}
      />
    </form>
  );
}

export default InlineCreator;
