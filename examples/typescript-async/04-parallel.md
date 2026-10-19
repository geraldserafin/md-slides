---
layout: side
---

## Independent work should run in parallel

The two requests do not depend on each other, yet `await` serialises them.
`Promise.all` fixes that without restructuring the function.

<!-- Highlight: only two lines change, everything else keeps its position. -->

```ts .left
async function loadDashboard(id: string) {
  const user = await fetchUser(id);
  const stats = await fetchStats(id);
  return { user, stats };
}
```

```ts .left
async function loadDashboard(id: string) {
  const [user, stats] = await Promise.all([
    fetchUser(id),
    fetchStats(id),
  ]);
  return { user, stats };
}
```

```ts .left
async function loadDashboard(
  id: string,
  signal?: AbortSignal,
) {
  const [user, stats] = await Promise.all([
    fetchUser(id, { signal }),
    fetchStats(id, { signal }),
  ]);
  return { user, stats };
}
```
