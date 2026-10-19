## 3. Promises: one error channel

<!-- fetchUser/fetchPosts now return promises. The nesting flattens into a chain. -->

```ts
function loadProfile(id: string): Promise<Profile> {
  return fetchUser(id).then((user) =>
    fetchPosts(user.id).then((posts) => ({ user, posts })),
  );
}
```

```ts
function loadProfile(id: string): Promise<Profile> {
  return fetchUser(id)
    .then((user) => fetchPosts(user.id).then((posts) => ({ user, posts })))
    .catch((err) => {
      throw new ProfileError(id, err);
    });
}
```

## 4. async/await: it reads like synchronous code

<!-- Same behaviour. `.then` becomes `await`, `.catch` becomes try/catch. -->

```ts
async function loadProfile(id: string): Promise<Profile> {
  try {
    const user = await fetchUser(id);
    const posts = await fetchPosts(user.id);
    return { user, posts };
  } catch (err) {
    throw new ProfileError(id, err);
  }
}
```
