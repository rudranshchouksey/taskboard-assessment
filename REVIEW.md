1 SQL Injection Vulnerability in Task Search

* File/Line auth/projects/[id]/tasks/route.ts
* Category: Security
* Severity: Critical
* Description: The search functionality utilize $queryRawUnsafe with direct string interpolation of the q parameter. This allows an attacker to break out of the intended query and execute arbitrary SQL, potentially leaking the entire uners table or bypassing project-level permission.
* Recommended Fix: Replace the raw query with Prisma type-safe findMany query builder or use parameterized $queryRow

2 Insecure Direct Object Reference (IDOR) on Task Patching

* File/Line auth/tasks/[id]/route.ts
* Category: Security
* Severity: Critical
* Description: The PATCH endpoint for tasks verifies authentication but fails to verify authorization if does not check if the user is a member of the project the task belongs to, allowing any logged-in user to modify any task by its ID
* Recommended Fix: Fetch the task first to identify its projectId, then verify the user's Membership and role before allowing an update

