import type { Deadline } from '../types';
import { getWeekdayLabel } from '../utils/dates';

interface DeadlineEditorProps {
  value: Deadline;
  onChange: (deadline: Deadline) => void;
}

function DeadlineEditor({ value, onChange }: DeadlineEditorProps) {
  function handleKindChange(kind: Deadline['kind']) {
    switch (kind) {
      case 'none':
        onChange({ kind: 'none' });
        break;
      case 'date':
        onChange({ kind: 'date', date: value.kind === 'date' ? value.date : '' });
        break;
      case 'range':
        onChange({
          kind: 'range',
          from: value.kind === 'range' ? value.from : '',
          to: value.kind === 'range' ? value.to : '',
        });
        break;
      case 'recurring':
        onChange({
          kind: 'recurring',
          mode: value.kind === 'recurring' ? value.mode : 'day',
          weekday: value.kind === 'recurring' ? value.weekday : 1,
        });
        break;
    }
  }

  return (
    <div className="deadline-editor">
      <div className="deadline-editor__modes" role="radiogroup" aria-label="Тип срока">
        {[
          { kind: 'none' as const, label: 'Без срока' },
          { kind: 'date' as const, label: 'Дата' },
          { kind: 'range' as const, label: 'Диапазон' },
          { kind: 'recurring' as const, label: 'Повтор' },
        ].map((option) => (
          <label key={option.kind} className="radio-pill">
            <input
              type="radio"
              name="deadline-kind"
              checked={value.kind === option.kind}
              onChange={() => handleKindChange(option.kind)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>

      {value.kind === 'date' && (
        <input
          className="text-input"
          type="date"
          value={value.date}
          onChange={(event) => onChange({ kind: 'date', date: event.target.value })}
        />
      )}

      {value.kind === 'range' && (
        <div className="deadline-editor__grid">
          <label className="form-field">
            <span className="form-label">С</span>
            <input
              className="text-input"
              type="date"
              value={value.from}
              onChange={(event) => onChange({ ...value, from: event.target.value })}
            />
          </label>

          <label className="form-field">
            <span className="form-label">По</span>
            <input
              className="text-input"
              type="date"
              value={value.to}
              onChange={(event) => onChange({ ...value, to: event.target.value })}
            />
          </label>
        </div>
      )}

      {value.kind === 'recurring' && (
        <div className="deadline-editor__grid">
          <label className="form-field">
            <span className="form-label">Период</span>
            <select
              className="text-input"
              value={value.mode}
              onChange={(event) => {
                const mode = event.target.value as 'day' | 'week' | 'month';

                onChange({
                  kind: 'recurring',
                  mode,
                  weekday: mode === 'week' ? value.weekday ?? 1 : undefined,
                });
              }}
            >
              <option value="day">Каждый день</option>
              <option value="week">Каждую неделю</option>
              <option value="month">Каждый месяц</option>
            </select>
          </label>

          {value.mode === 'week' && (
            <label className="form-field">
              <span className="form-label">День недели</span>
              <select
                className="text-input"
                value={value.weekday ?? 1}
                onChange={(event) =>
                  onChange({
                    kind: 'recurring',
                    mode: 'week',
                    weekday: Number(event.target.value),
                  })
                }
              >
                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                  <option key={day} value={day}>
                    {getWeekdayLabel(day)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export default DeadlineEditor;
