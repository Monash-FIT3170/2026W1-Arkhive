const STORAGE_KEY = "arkhive_max_step";

export function getMaxStep(): number {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw !== null ? parseInt(raw, 10) : 0;
}

export function unlockStep(step: number): void {
  const current = getMaxStep();
  if (step > current) {
    sessionStorage.setItem(STORAGE_KEY, String(step));
  }
}

export function resetSteps(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
