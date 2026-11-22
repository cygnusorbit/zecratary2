// Resolves with `fallback` if the promise is slow or rejects, so one stalled
// dependency can never hang an API response.
export function withTimeout<T>(promise: PromiseLike<T> | T, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); }
    );
  });
}
