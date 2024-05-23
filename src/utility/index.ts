export function wait(timeMs: number) {
  return new Promise((r) => {
    setTimeout(() => {
      r(null);
    }, timeMs);
  });
}
