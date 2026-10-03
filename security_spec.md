# Security Specification: AI Shorts Maker Firestore Rules

## 1. Data Invariants
1. Users may only read and write their own profile document (`/users/{userId}`). PII (email) is never exposed via blanket reads.
2. Users can only create and manage projects and clips under their own user path (`/users/{userId}/projects/{projectId}`).
3. Users cannot elevate their own role (`role` cannot be modified by standard users). Owner role is restricted to the verified `muhmmadhubaib498@gmail.com` or admin records.
4. Payments created by clients can only have status `PENDING`, and can only be approved/rejected by administrators.
5. All IDs must conform to `^[a-zA-Z0-9_\-]+$` and be $\le 128$ characters.

## 2. Dirty Dozen Payloads & Negative Assertions
1. **Malicious Role Escalation**: User sends `role: 'OWNER'` upon profile update. (Expected: PERMISSION_DENIED)
2. **Ghost Field Poisoning**: User sends an unallowed property `isVerified: true` in user document. (Expected: PERMISSION_DENIED)
3. **Cross-Tenant Project Read**: User A attempts to `get` User B's `/users/{userB}/projects/{project1}`. (Expected: PERMISSION_DENIED)
4. **Unauthenticated List Query**: Anonymous client attempts `list` on `/users`. (Expected: PERMISSION_DENIED)
5. **Self-Approval Payment Scam**: User sets `status: 'APPROVED'` on their own payment creation. (Expected: PERMISSION_DENIED)
6. **Payment Status Tampering**: User attempts to update a payment status from `PENDING` to `APPROVED`. (Expected: PERMISSION_DENIED)
7. **Identity Spoofing**: User A creates a project with `userId: 'userB'`. (Expected: PERMISSION_DENIED)
8. **Clip Orphan Write**: User attempts to write a clip with mismatched `projectId` or `userId`. (Expected: PERMISSION_DENIED)
9. **Large Payload DoS**: Malicious actor injects a 500KB string in project name. (Expected: PERMISSION_DENIED)
10. **ID Traversal Poisoning**: Injecting `../../root` as a path variable. (Expected: PERMISSION_DENIED)
11. **Client Timestamp Spoofing**: Setting `createdAt` into the future. (Expected: PERMISSION_DENIED)
12. **Blanket PII Scrape**: Non-admin querying list of all users. (Expected: PERMISSION_DENIED)
