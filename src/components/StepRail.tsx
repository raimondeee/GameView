type StepRailProps = {
  enabled: boolean
  stepIndex: number
  stepCount: number
  onSelect: (index: number) => void
  onAdd: () => void
  onRemove: () => void
}

export function StepRail({ enabled, stepIndex, stepCount, onSelect, onAdd, onRemove }: StepRailProps) {
  return (
    <div className={`step-rail${enabled ? '' : ' is-disabled'}`} role="tablist" aria-label="Markup steps">
      {Array.from({ length: stepCount }, (_, index) => (
        <button
          key={index}
          type="button"
          role="tab"
          aria-selected={index === stepIndex}
          className={index === stepIndex ? 'is-active' : ''}
          disabled={!enabled}
          onClick={() => onSelect(index)}
        >
          Step {index + 1}
        </button>
      ))}
      <button type="button" className="ghost" disabled={!enabled} onClick={onAdd}>
        Add step
      </button>
      <button type="button" className="ghost" disabled={!enabled || stepCount <= 1} onClick={onRemove}>
        Remove step
      </button>
    </div>
  )
}
