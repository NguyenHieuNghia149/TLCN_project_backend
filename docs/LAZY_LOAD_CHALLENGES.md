# Lazy Load Challenges API - Frontend Implementation Guide

## Tổng quan

API `/challenges/problems/topic/:topicId` sử dụng **cursor-based pagination** để implement lazy load. Frontend cần lưu cursor từ response và gửi lại trong request tiếp theo để load thêm data.

## Endpoint

```
GET /challenges/problems/topic/:topicId
```

### Query Parameters

| Parameter | Type        | Required | Default | Description                                      |
| --------- | ----------- | -------- | ------- | ------------------------------------------------ |
| `limit`   | number      | No       | 10      | Số lượng challenges muốn load (1-50)             |
| `cursor`  | JSON string | No       | null    | Cursor từ response trước để load trang tiếp theo |

### Request Example

**Lần đầu (không có cursor):**

```
GET /challenges/problems/topic/abc-123-def-456
```

**Lần tiếp theo (có cursor):**

```
GET /challenges/problems/topic/abc-123-def-456?limit=10&cursor={"createdAt":"2025-01-15T10:30:00.000Z","id":"challenge-id-123"}
```

## Response Structure

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "challenge-id-1",
        "title": "Two Sum",
        "description": "Given an array...",
        "difficult": "easy",
        "createdAt": "2025-01-15T10:30:00.000Z",
        "totalPoints": 30,
        "isSolved": false,
        "isFavorite": false
      }
      // ... more items
    ],
    "nextCursor": {
      "createdAt": "2025-01-15T10:30:00.000Z",
      "id": "challenge-id-10"
    }
  }
}
```

### Response Fields

- `items`: Array các challenges (số lượng = `limit` hoặc ít hơn nếu hết data)
- `nextCursor`:
  - Nếu có: Object `{ createdAt: string, id: string }` - dùng cho request tiếp theo
  - Nếu `null`: Không còn data để load

## Frontend Implementation Flow

### 1. Initial Load (Lần đầu)

```typescript
// Không có cursor, load 10 items đầu tiên
const response = await fetch('/challenges/problems/topic/topic-id-123?limit=10');
const data = await response.json();

// Lưu items vào state
setChallenges(data.data.items);

// Lưu cursor để load tiếp
setNextCursor(data.data.nextCursor);
```

### 2. Load More (Khi user scroll đến cuối)

```typescript
// Kiểm tra có cursor không
if (nextCursor) {
  // Encode cursor thành JSON string
  const cursorString = JSON.stringify(nextCursor);

  // Request với cursor
  const response = await fetch(
    `/challenges/problems/topic/topic-id-123?limit=10&cursor=${encodeURIComponent(cursorString)}`
  );
  const data = await response.json();

  // Append items mới vào list hiện tại
  setChallenges(prev => [...prev, ...data.data.items]);

  // Update cursor
  setNextCursor(data.data.nextCursor);
}
```

### 3. Complete Example (React)

```typescript
import { useState, useEffect, useCallback } from 'react';

interface Challenge {
  id: string;
  title: string;
  description: string | null;
  difficult: string;
  createdAt: string;
  totalPoints: number;
  isSolved: boolean;
  isFavorite: boolean;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function useLazyLoadChallenges(topicId: string) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '10',
      });

      // Thêm cursor nếu có
      if (nextCursor) {
        params.append('cursor', JSON.stringify(nextCursor));
      }

      const response = await fetch(
        `/challenges/problems/topic/${topicId}?${params.toString()}`
      );
      const result = await response.json();

      if (result.success) {
        // Append items mới
        setChallenges(prev => [...prev, ...result.data.items]);

        // Update cursor
        setNextCursor(result.data.nextCursor);
        setHasMore(result.data.nextCursor !== null);
      }
    } catch (error) {
      console.error('Error loading challenges:', error);
    } finally {
      setLoading(false);
    }
  }, [topicId, nextCursor, loading, hasMore]);

  // Load initial data
  useEffect(() => {
    setChallenges([]);
    setNextCursor(null);
    setHasMore(true);
    loadMore();
  }, [topicId]);

  return {
    challenges,
    loadMore,
    loading,
    hasMore,
  };
}

// Usage trong component
function ChallengesList({ topicId }: { topicId: string }) {
  const { challenges, loadMore, loading, hasMore } = useLazyLoadChallenges(topicId);

  // Detect scroll to bottom
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100
      ) {
        if (hasMore && !loading) {
          loadMore();
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, loadMore]);

  return (
    <div>
      {challenges.map(challenge => (
        <ChallengeCard key={challenge.id} challenge={challenge} />
      ))}
      {loading && <div>Loading...</div>}
      {!hasMore && <div>No more challenges</div>}
    </div>
  );
}
```

## Important Notes

### 1. Cursor Encoding

- Cursor phải được **encode thành JSON string** và **URL encode** khi gửi trong query params
- Example: `cursor={"createdAt":"2025-01-15T10:30:00.000Z","id":"abc-123"}` → `cursor=%7B%22createdAt%22%3A%222025-01-15T10%3A30%3A00.000Z%22%2C%22id%22%3A%22abc-123%22%7D`

### 2. Limit Validation

- Limit phải từ 1-50
- Nếu không truyền, mặc định là 10
- Nếu truyền > 50, API sẽ trả về error 400

### 3. End of Data

- Khi `nextCursor === null`, nghĩa là đã load hết data
- Không nên gọi API nữa khi `nextCursor === null`

### 4. Error Handling

- Nếu cursor format không đúng, API trả về 400 với code `INVALID_CURSOR`
- Nếu limit không hợp lệ, API trả về 400 với code `INVALID_LIMIT` hoặc `LIMIT_TOO_LARGE`

### 5. Sorting

- Challenges được sort theo `createdAt DESC` (mới nhất trước)
- Nếu cùng `createdAt`, sort theo `id DESC`

## Best Practices

1. **Debounce scroll events** để tránh gọi API quá nhiều
2. **Show loading indicator** khi đang load
3. **Disable load more** khi `hasMore === false`
4. **Reset state** khi `topicId` thay đổi
5. **Handle errors** gracefully với user-friendly messages

## Example API Calls

### Request 1 (Initial)

```http
GET /challenges/problems/topic/topic-123?limit=10
```

### Response 1

```json
{
  "success": true,
  "data": {
    "items": [
      /* 10 challenges */
    ],
    "nextCursor": {
      "createdAt": "2025-01-15T10:30:00.000Z",
      "id": "challenge-10"
    }
  }
}
```

### Request 2 (Load More)

```http
GET /challenges/problems/topic/topic-123?limit=10&cursor=%7B%22createdAt%22%3A%222025-01-15T10%3A30%3A00.000Z%22%2C%22id%22%3A%22challenge-10%22%7D
```

### Response 2

```json
{
  "success": true,
  "data": {
    "items": [
      /* 10 challenges tiếp theo */
    ],
    "nextCursor": {
      "createdAt": "2025-01-15T09:15:00.000Z",
      "id": "challenge-20"
    }
  }
}
```

### Request 3 (Last page)

```http
GET /challenges/problems/topic/topic-123?limit=10&cursor=%7B%22createdAt%22%3A%222025-01-15T09%3A15%3A00.000Z%22%2C%22id%22%3A%22challenge-20%22%7D
```

### Response 3

```json
{
  "success": true,
  "data": {
    "items": [
      /* 5 challenges cuối cùng */
    ],
    "nextCursor": null
  }
}
```

## Summary

- ✅ Sử dụng `nextCursor` từ response để load trang tiếp theo
- ✅ Append items mới vào list hiện tại (không replace)
- ✅ Dừng load khi `nextCursor === null`
- ✅ Validate limit (1-50)
- ✅ Encode cursor đúng cách khi gửi request
