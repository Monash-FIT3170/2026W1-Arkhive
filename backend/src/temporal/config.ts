export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || 'ocr-task-queue';
export const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'default';
