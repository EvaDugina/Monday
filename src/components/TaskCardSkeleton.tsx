interface TaskCardSkeletonProps {
  width?: 'short' | 'medium' | 'long';
}

function TaskCardSkeleton({ width = 'medium' }: TaskCardSkeletonProps) {
  return (
    <div className="task-card task-card--skeleton" aria-hidden="true">
      <div className="task-card__skeleton-checkbox" />
      <div className={`task-card__skeleton-line task-card__skeleton-line--${width}`} />
      <div className="task-card__skeleton-grip" />
    </div>
  );
}

export default TaskCardSkeleton;
