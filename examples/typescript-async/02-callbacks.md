## 1. Callbacks: errors travel by hand

<!-- Point at the repeated `if (err) return cb(err)` -- that is the tax of this style. -->

```ts
function loadProfile(
  id: string,
  cb: (err: Error | null, profile?: Profile) => void,
) {
  fetchUser(id, (err, user) => {
    if (err) return cb(err);
    fetchPosts(user.id, (err, posts) => {
      if (err) return cb(err);
      cb(null, { user, posts });
    });
  });
}
```

## 2. Pull the callback type out

<!-- Pure refactoring first, no behaviour change. -->

```ts
type Callback<T> = (err: Error | null, value?: T) => void;

function loadProfile(id: string, cb: Callback<Profile>) {
  fetchUser(id, (err, user) => {
    if (err) return cb(err);
    fetchPosts(user.id, (err, posts) => {
      if (err) return cb(err);
      cb(null, { user, posts });
    });
  });
}
```
