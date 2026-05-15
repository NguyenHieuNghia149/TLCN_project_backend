# Ban/Unban User Feature Documentation

## Overview

The ban/unban feature allows administrators and owners to suspend user access for policy violations. When a user is banned, they cannot access the platform and receive an email notification.

## Database Schema

### User Table Extensions

The `users` table in `packages/shared/db/schema/user.ts` has been extended with three new columns:

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `ban_reason` | TEXT | ✓ | Reason for banning the user (10-500 characters) |
| `banned_at` | TIMESTAMP | ✓ | Timestamp when user was banned |
| `banned_by_admin_id` | UUID (FK) | ✓ | Reference to admin who performed the ban |

### Indexes for Performance

Two indexes have been created to optimize queries:

1. **`idx_users_status_banned_at`** (status, banned_at DESC)
   - Used by: Admin dashboard for fetching banned users
   - Benefits: Fast pagination of banned users by recency

2. **`idx_users_banned_by_admin_id`** (banned_by_admin_id)
   - Used by: Audit trails for admin activity
   - Benefits: Fast lookup of users banned by specific admin

### Schema Validation

Zod schema for the `User` type has been updated to include:
```typescript
banReason: z.string().nullable(),
bannedAt: z.date().nullable(),
bannedByAdminId: z.string().uuid().nullable(),
```

## API Endpoints

### 1. Ban User

**Endpoint:** `POST /admin/users/:id/ban`

**Authentication:** Required (Admin or Owner role)

**Request Body:**
```json
{
  "reason": "Spam behavior and policy violations"
}
```

**Validation Rules:**
- `reason` length: 10-500 characters
- User ID format: Valid UUID

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "status": "banned",
    "banReason": "Spam behavior and policy violations",
    "bannedAt": "2024-01-15T10:30:00Z",
    "bannedByAdminId": "admin-uuid"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid reason length or UUID format
- `401 Unauthorized`: Missing authentication
- `403 Forbidden`: User role doesn't have permission / attempting to ban self / attempting to ban another admin as non-owner
- `404 Not Found`: User not found
- `409 Conflict`: User already banned

### 2. Unban User

**Endpoint:** `POST /admin/users/:id/unban`

**Authentication:** Required (Admin or Owner role)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "status": "active",
    "banReason": null,
    "bannedAt": null,
    "bannedByAdminId": null
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User not found
- `409 Conflict`: User is not currently banned

### 3. List Banned Users

**Endpoint:** `GET /admin/users/banned?limit=20&offset=0`

**Authentication:** Required (Admin or Owner role)

**Query Parameters:**
- `limit` (optional): Results per page, default 20, max 100
- `offset` (optional): Pagination offset, default 0

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-uuid",
        "email": "user@example.com",
        "name": "User Name",
        "banReason": "Spam behavior",
        "bannedAt": "2024-01-15T10:30:00Z",
        "bannedByAdmin": {
          "id": "admin-uuid",
          "name": "Admin Name"
        }
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0
    }
  }
}
```

### 4. List Active Users

**Endpoint:** `GET /admin/users/active?search=&limit=20&offset=0`

**Authentication:** Required (Admin or Owner role)

**Query Parameters:**
- `search` (optional): Search by name or email
- `limit` (optional): Results per page, default 20
- `offset` (optional): Pagination offset, default 0

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-uuid",
        "email": "user@example.com",
        "name": "User Name",
        "role": "user",
        "createdAt": "2024-01-10T10:00:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 20,
      "offset": 0
    }
  }
}
```

## Authorization Rules

The following authorization hierarchy is enforced:

| Action | Minimum Role | Additional Rules |
|--------|--------------|------------------|
| Ban User | ADMIN | Cannot ban self; Cannot ban another ADMIN (only OWNER can) |
| Unban User | ADMIN | - |
| View Banned Users | ADMIN | - |
| View Active Users | ADMIN | - |

### Ban Prevention Logic

1. **Admin blocking self-ban**: Any role attempting to ban their own account is rejected
2. **Hierarchy protection**: Only OWNER role can ban ADMIN role
3. **Already banned**: Cannot ban a user who is already banned
4. **Non-admin rejection**: Only ADMIN or OWNER roles can perform ban operations

## Email Notifications

### Ban Notification

**Subject:** Account Suspended

**Triggered:** When a user is successfully banned

**Content:**
- Notification of account suspension
- Ban reason (truncated if very long)
- Instructions to contact support

**Security:**
- User name is HTML-escaped to prevent XSS
- Ban reason is HTML-escaped to prevent XSS
- Email sending is asynchronous (non-blocking)
- Failures are logged but don't affect HTTP response

### Unban Notification

**Subject:** Account Restored

**Triggered:** When a user is successfully unbanned

**Content:**
- Confirmation of account restoration
- Instructions to log back in
- Link to platform

**Security:** Same HTML escaping as ban notification

## Authentication & Ban Status

### Token Validation

The `auth.service.validateToken()` method now performs two separate checks:

1. **JWT Verification** (returns 401 if invalid)
   ```typescript
   try {
     const payload = verifyJWT(token);
   } catch {
     return 401 Unauthorized; // Token is invalid/expired
   }
   ```

2. **Ban Status Check** (returns 403 if banned, not 401)
   ```typescript
   if (user.status === 'banned') {
     return 403 Forbidden; // Account is suspended
   }
   ```

### Client Error Handling

This distinction allows clients to differentiate:
- **401 Unauthorized**: "Your session has expired. Please log in again."
- **403 Forbidden**: "Your account has been suspended. Contact support for details."

## Frontend Integration

### Redux State Structure

```typescript
admin: {
  bannedUsers: {
    list: UserData[],         // Array of banned users
    total: number,            // Total banned users count
    limit: number,            // Pagination limit
    offset: number,           // Pagination offset
    loading: boolean,         // Fetch in progress
    error: string | null,     // Error message
  },
  banOperation: {
    loading: boolean,         // Ban/unban in progress
    error: string | null,     // Operation error
    success: boolean,         // Last operation success
  }
}
```

### Available Actions/Thunks

```typescript
// Dispatch these from components:
dispatch(asyncBanUser({ userId, reason }))
dispatch(asyncUnbanUser(userId))
dispatch(asyncFetchBannedUsers({ limit, offset }))
dispatch(clearBanError())
dispatch(setPaginationParams({ limit, offset }))
```

### Components

**BanUserModal.tsx**
- Modal dialog for banning a user
- Validates reason length (10-500 characters)
- Shows character count
- Displays errors and loading state
- Props: `isOpen`, `userId`, `userName`, `onClose`, `onSuccess`

**BannedUsersList.tsx**
- Table of currently banned users
- Shows ban reason, timestamp, banning admin
- Pagination controls
- Unban button for each user
- Displays loading/error states

**UserManagementPage.tsx**
- Main admin page combining both active and banned users
- Tab navigation between Active/Banned users
- Search functionality for active users
- Integrates BanUserModal and BannedUsersList

## Testing

### Unit Tests

Test files located in `tests/unit/`:

1. **`repositories/user.repository.ban.test.ts`**
   - Tests for `banUser()`, `unbanUser()`, `countBannedUsers()`, `getBannedUsers()`
   - Verifies database operations and field updates

2. **`services/adminUser.service.ban.test.ts`**
   - Tests for `banUser()` with validation rules
   - Tests authorization checks (self-ban, role hierarchy, already-banned)
   - Tests `unbanUser()` and `listBannedUsers()`

3. **`services/email.service.ban.test.ts`**
   - Tests HTML escaping of user names and ban reasons
   - Tests error handling for mail failures
   - Verifies XSS prevention (special HTML characters)

4. **`services/auth.service.ban.test.ts`**
   - Tests that banned users get 403, not 401
   - Tests invalid token gets 401
   - Tests ban status logging

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/services/adminUser.service.ban.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Integration Testing

Manual testing checklist:

- [ ] Ban user with valid reason (10-500 chars)
- [ ] Attempt to ban user with too short reason (should fail)
- [ ] Attempt to ban user with too long reason (should fail)
- [ ] Attempt to ban self (should fail)
- [ ] Attempt as non-admin (should fail)
- [ ] Unban user (verify status returns to active)
- [ ] Verify ban notification email sent
- [ ] Verify unban notification email sent
- [ ] Check banned users appear in list with correct pagination
- [ ] Verify banned user gets 403 on API calls
- [ ] Verify active user gets proper response after unban

## Security Considerations

### XSS Prevention
- All user-provided data in email templates is HTML-escaped
- Escaping order: `&` → `<` → `>` → `"` → `'`
- Tested with payloads: `<script>`, `<img onerror>`, JavaScript event handlers

### SQL Injection Prevention
- All database queries use parameterized statements (Drizzle ORM)
- No string concatenation in queries
- UUID validation before database queries

### CSRF Protection
- Standard Express CSRF middleware applies to all endpoints
- POST endpoints require valid CSRF tokens

### Rate Limiting
- Ban/unban endpoints should be rate-limited (configured at middleware)
- Recommended: 10 requests per minute per admin

### Audit Logging
- All ban/unban operations log:
  - Admin ID who performed action
  - Target user ID
  - Timestamp
  - Action type (ban/unban)
  - Ban reason (if applicable)

## Error Codes Reference

| Code | Meaning | Resolution |
|------|---------|-----------|
| 400 | Invalid input | Check reason length (10-500) or UUID format |
| 401 | Authentication failed | Invalid/expired token; refresh credentials |
| 403 | Access denied | Ensure user is ADMIN or OWNER role |
| 404 | User not found | Verify user ID is correct |
| 409 | Conflict state | User already banned/unbanned or self-ban attempt |

## Future Enhancements

- [ ] Temporary ban with auto-unban after X days
- [ ] Ban appeal process with email notifications
- [ ] Detailed audit log dashboard
- [ ] Ban reason templates for consistency
- [ ] Bulk ban/unban operations
- [ ] Ban statistics dashboard

## References

- [Database Schema File](../packages/shared/db/schema/user.ts)
- [Repository Implementation](../apps/api/src/repositories/user.repository.ts)
- [Service Implementation](../apps/api/src/services/admin/adminUser.service.ts)
- [Controller Implementation](../apps/api/src/controllers/admin/adminUser.controller.ts)
