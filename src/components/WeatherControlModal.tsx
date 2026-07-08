import { useEffect, useId } from 'react';
import type { WeatherControls } from '../types';
import { MANUAL_RAIN_INTENSITIES, RAIN_INTENSITY_LABEL } from '../weatherControls';

interface WeatherControlModalProps {
  controls: WeatherControls;
  editMode: boolean;
  onChange: (patch: Partial<WeatherControls>) => void;
  onEditModeChange: (editMode: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`weather-modal__toggle${checked ? ' weather-modal__toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="weather-modal__toggle-text">
        <span className="weather-modal__toggle-label">{label}</span>
        {hint ? <span className="weather-modal__toggle-hint">{hint}</span> : null}
      </span>
      <span className="weather-modal__switch" aria-hidden="true">
        <span className="weather-modal__switch-thumb" />
      </span>
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const id = useId();

  return (
    <div className={`weather-modal__slider-row${disabled ? ' weather-modal__slider-row--disabled' : ''}`}>
      <label className="weather-modal__slider-head" htmlFor={id}>
        <span>{label}</span>
        <span className="weather-modal__slider-value">{displayValue}</span>
      </label>
      <input
        id={id}
        className="weather-modal__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function WeatherControlModal({
  controls,
  editMode,
  onChange,
  onEditModeChange,
  onReset,
  onClose,
}: WeatherControlModalProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const live = controls.live;
  const rainIntensityIndex = Math.max(0, MANUAL_RAIN_INTENSITIES.indexOf(controls.rainIntensity));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal weather-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <h2 id={titleId}>Управление погодой</h2>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="modal__body weather-modal__body">
          <section className="weather-modal__section">
            <h3 className="weather-modal__section-title">Слои</h3>
            {live ? (
              <p className="weather-modal__note">
                Слои управляются прогнозом. Выключите «погода&nbsp;live» на виджете для ручного управления.
              </p>
            ) : null}
            <div className="weather-modal__toggles">
              <ToggleRow
                label="Дождь"
                checked={controls.rainEnabled}
                disabled={live}
                onChange={(next) => onChange({ rainEnabled: next })}
              />
              <ToggleRow
                label="Небо"
                checked={controls.skyEnabled}
                disabled={live}
                onChange={(next) => onChange({ skyEnabled: next })}
              />
              <ToggleRow
                label="Облака"
                checked={controls.cloudsEnabled}
                disabled={live}
                onChange={(next) => onChange({ cloudsEnabled: next })}
              />
            </div>
          </section>

          <section className="weather-modal__section">
            <h3 className="weather-modal__section-title">Дождь</h3>
            <SliderRow
              label="Интенсивность дождя"
              value={rainIntensityIndex}
              min={0}
              max={MANUAL_RAIN_INTENSITIES.length - 1}
              step={1}
              displayValue={RAIN_INTENSITY_LABEL[MANUAL_RAIN_INTENSITIES[rainIntensityIndex]]}
              disabled={live || !controls.rainEnabled}
              onChange={(index) => onChange({ rainIntensity: MANUAL_RAIN_INTENSITIES[index] })}
            />
          </section>

          <section className="weather-modal__section">
            <h3 className="weather-modal__section-title">Небо</h3>
            <SliderRow
              label="Насыщенность голубого"
              value={controls.skyStrength}
              min={0}
              max={1}
              step={0.05}
              displayValue={formatPercent(controls.skyStrength)}
              onChange={(next) => onChange({ skyStrength: next })}
            />
          </section>

          <section className="weather-modal__section">
            <h3 className="weather-modal__section-title">Облака</h3>
            <SliderRow
              label="Прозрачность облаков"
              value={controls.cloudOpacity}
              min={0.1}
              max={2}
              step={0.05}
              displayValue={formatPercent(controls.cloudOpacity)}
              onChange={(next) => onChange({ cloudOpacity: next })}
            />
            <SliderRow
              label="Сила parallax"
              value={controls.cloudParallax}
              min={0}
              max={3}
              step={0.1}
              displayValue={formatPercent(controls.cloudParallax)}
              onChange={(next) => onChange({ cloudParallax: next })}
            />
            <SliderRow
              label="Скорость движения"
              value={controls.cloudSpeed}
              min={0.2}
              max={3}
              step={0.1}
              displayValue={`${controls.cloudSpeed.toFixed(1)}×`}
              onChange={(next) => onChange({ cloudSpeed: next })}
            />
            <ToggleRow
              label="Режим редактирования"
              hint="Перетаскивайте облака мышью"
              checked={editMode}
              onChange={onEditModeChange}
            />
          </section>
        </div>

        <div className="modal__footer">
          <button type="button" className="button button--ghost" onClick={onReset}>
            Сбросить
          </button>
          <button type="button" className="button" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

export default WeatherControlModal;
