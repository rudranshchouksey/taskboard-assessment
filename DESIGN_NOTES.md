# DESIGN_NOTES.md

## Activity write failure policy

Activity logging does not roll back the original task/comment change.
The product action (creating a task, changing status, assigning work, adding a comment) is the primary business operation, while the activity feed is a secondary audit surface. If the feed write fails, the user’s change should still succeed; the failure is logged server-side so it can be monitored and fixed without making the core workflow unreliable.