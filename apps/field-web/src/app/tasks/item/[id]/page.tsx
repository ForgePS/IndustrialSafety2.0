import { TaskItemClient } from "./task-item-client";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function TaskItemPage() {
  return <TaskItemClient />;
}
