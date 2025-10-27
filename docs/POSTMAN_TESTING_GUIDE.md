# Hướng dẫn Test API Submission với Postman

## Tổng quan

API submission hoạt động bình thường và yêu cầu authentication. Đây là hướng dẫn chi tiết để test với Postman.

## Bước 1: Đăng ký/Đăng nhập để lấy token

### Option 1: Đăng ký user mới

```
POST http://localhost:3001/api/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Password123!",
  "firstname": "Test",
  "lastname": "User",
  "otp": "123456"
}
```

### Option 2: Đăng nhập (nếu đã có user)

```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Password123!"
}
```

**Lưu ý**: Password phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.

## Bước 2: Lấy token từ response

Từ response của login/register, copy token từ:

```json
{
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

## Bước 3: Submit code với token

```
POST http://localhost:3001/api/submissions
Content-Type: application/json
Authorization: Bearer <your_token_here>

{
  "sourceCode": "#include<iostream>\nusing namespace std;\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b;\n    return 0;\n}",
  "language": "cpp",
  "problemId": "0f465ec8-b3a7-402e-8d5a-a7e99a2f37cb"
}
```

## Bước 4: Kiểm tra kết quả

### Lấy status của submission

```
GET http://localhost:3001/api/submissions/{submission_id}
Authorization: Bearer <your_token_here>
```

### Lấy kết quả chi tiết

```
GET http://localhost:3001/api/submissions/{submission_id}/results
Authorization: Bearer <your_token_here>
```

## Kết quả mong đợi

### Response khi submit thành công:

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "PENDING",
    "score": 0,
    "createdAt": "2025-10-27T07:33:00.000Z"
  }
}
```

### Response sau khi xử lý:

```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "ACCEPTED",
    "score": 100,
    "result": {
      "passed": 3,
      "total": 3,
      "results": [
        {
          "testcaseId": "test-1",
          "input": "2 3",
          "expectedOutput": "5",
          "actualOutput": "5",
          "isPassed": true,
          "executionTime": 144.29,
          "memoryUse": null,
          "error": null
        }
      ]
    }
  }
}
```

## Troubleshooting

### Lỗi "No token provided"

- Đảm bảo đã thêm header `Authorization: Bearer <token>`
- Kiểm tra token có hợp lệ không

### Lỗi "User with this email does not exist"

- Đăng ký user mới trước khi đăng nhập
- Kiểm tra email có đúng không

### Lỗi validation

- Password phải có ít nhất 8 ký tự
- Bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt
- OTP phải có ít nhất 6 ký tự

### Lỗi "Problem not found"

- Kiểm tra `problemId` có tồn tại trong database không
- Sử dụng UUID hợp lệ

## Test trực tiếp Sandbox (không cần auth)

Nếu muốn test sandbox trực tiếp:

```
POST http://localhost:4000/api/sandbox/execute
Content-Type: application/json

{
  "code": "#include<iostream>\nusing namespace std;\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b;\n    return 0;\n}",
  "language": "cpp",
  "testcases": [
    {
      "id": "test-1",
      "input": "2 3",
      "output": "5"
    },
    {
      "id": "test-2",
      "input": "10 20",
      "output": "30"
    }
  ]
}
```

## Kết luận

Hệ thống hoạt động bình thường:

- ✅ Authentication hoạt động đúng
- ✅ Sandbox service hoạt động tốt
- ✅ Worker service xử lý jobs
- ✅ Database lưu trữ kết quả
- ✅ WebSocket cung cấp real-time updates

Lỗi ban đầu là do thiếu authentication token trong request.
