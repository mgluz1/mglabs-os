"use server";

import { act } from "@/lib/actions/helpers";
import { completeTask, createTask, deleteTask, reopenTask, updateTask, type TaskInput } from "@/lib/services/tasks";

export async function createTaskAction(input: TaskInput) {
  return act((ctx) => createTask(ctx, input));
}
export async function updateTaskAction(id: string, patch: Partial<TaskInput> & { status?: "pendente" | "em_andamento" | "concluida" | "cancelada" }) {
  return act((ctx) => updateTask(ctx, id, patch));
}
export async function completeTaskAction(id: string) {
  return act((ctx) => completeTask(ctx, id));
}
export async function reopenTaskAction(id: string) {
  return act((ctx) => reopenTask(ctx, id));
}
export async function deleteTaskAction(id: string) {
  return act((ctx) => deleteTask(ctx, id));
}
