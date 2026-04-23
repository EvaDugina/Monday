import { FormEvent, useState } from 'react';

interface LoginScreenProps {
  error: string | null;
  isLoading?: boolean;
  isSubmitting?: boolean;
  onLogin: (username: string, password: string) => void | Promise<void>;
}

function LoginScreen({ error, isLoading = false, isSubmitting = false, onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const isBusy = isLoading || isSubmitting;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) {
      return;
    }

    void onLogin(username.trim(), password);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-busy={isBusy}>
        <div className="auth-card__copy">
          <h1 className="auth-card__title">MONDAY</h1>
          <p className="auth-card__description">
            {isLoading ? 'Проверяем доступ к приложению…' : 'Войдите, чтобы открыть доску и синхронизировать задачи.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Логин</span>
            <input
              autoComplete="username"
              className="text-input"
              disabled={isBusy}
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label className="form-field">
            <span className="form-label">Пароль</span>
            <input
              autoComplete="current-password"
              className="text-input"
              disabled={isBusy}
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && (
            <p className="auth-form__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button button--primary auth-form__submit" disabled={isBusy}>
            {isLoading ? 'Проверяем…' : isSubmitting ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginScreen;
