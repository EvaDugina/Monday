import express from 'express';
import { getTasksState, setTasksState } from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/tasks', (_request, response) => {
  response.json(getTasksState());
});

app.put('/api/tasks', (request, response) => {
  const payload = request.body as { tasks?: unknown };

  if (!payload || !Array.isArray(payload.tasks)) {
    response.status(400).json({ error: 'Body must be { tasks: Task[] }' });
    return;
  }

  response.json(setTasksState(payload.tasks));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[MONDAY API] Listening on port ${port}`);
});
