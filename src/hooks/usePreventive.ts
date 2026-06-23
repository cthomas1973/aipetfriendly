import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import type { PreventiveFormData, PreventiveTask } from '../types';

export function usePreventive() {
  const { preventiveTasks, setPreventiveTasks } = useAppState();

  const addPreventiveTask = useCallback(
    (data: PreventiveFormData) => {
      const task: PreventiveTask = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...data,
      };
      setPreventiveTasks([task, ...preventiveTasks]);
      return task;
    },
    [preventiveTasks, setPreventiveTasks],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      setPreventiveTasks(
        preventiveTasks.map((task) =>
          task.id === taskId ? { ...task, completed: !task.completed } : task,
        ),
      );
    },
    [preventiveTasks, setPreventiveTasks],
  );

  const pendingTasks = useMemo(
    () => preventiveTasks.filter((task) => !task.completed),
    [preventiveTasks],
  );

  return {
    preventiveTasks,
    pendingTasks,
    addPreventiveTask,
    toggleTask,
  };
}
