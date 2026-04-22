import type { Category, Task } from '../types';
import InlineCreator from './InlineCreator';
import TaskItem from './TaskItem';

interface CategorySectionProps {
  category: Category;
  label: string;
  tasks: Task[];
  onCreate: (title: string) => void;
  onTaskOpen: (taskId: string) => void;
  onQuickClose: (taskId: string) => void;
}

function CategorySection({
  category,
  label,
  tasks,
  onCreate,
  onTaskOpen,
  onQuickClose,
}: CategorySectionProps) {
  return (
    <section className="category-section" data-category={category}>
      <div className="category-section__header">
        <h2 className="category-section__title">
          <span className="category-section__dot" aria-hidden="true" />
          {label}
        </h2>
        <span className="category-section__count">{tasks.length}</span>
      </div>

      <div className="task-list">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onOpen={() => onTaskOpen(task.id)}
              onQuickClose={() => onQuickClose(task.id)}
            />
          ))
        ) : (
          <div className="empty-state">Пока пусто. Добавьте первую задачу через поле ниже.</div>
        )}
      </div>

      <InlineCreator placeholder="Название задачи..." onCreate={onCreate} />
    </section>
  );
}

export default CategorySection;
