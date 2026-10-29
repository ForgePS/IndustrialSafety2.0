# S2F-2 Incident Review — Route Map

| URL                                   | Behavior                                              |
| ------------------------------------- | ----------------------------------------------------- |
| `/review/`                            | Queue; row action → `/incidents/{id}/?section=REVIEW` |
| `/incidents/{id}/?section=REVIEW`     | Officer + specialty review panels                     |
| Browser history / refresh / bookmarks | Unchanged                                             |

No new routes. No `/review/{id}` invented.
