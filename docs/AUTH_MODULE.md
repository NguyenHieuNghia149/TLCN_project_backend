# Auth Module Documentation

## Overview

This is a comprehensive, enterprise-grade authentication module built with Node.js, Express, TypeScript, and PostgreSQL. It provides secure user authentication, authorization, and account management features.

## Features

### 🔐 Core Authentication
- **User Registration** with email verification
- **User Login** with account lockout protection
- **JWT-based Authentication** with access and refresh tokens
- **Password Security** with bcrypt hashing and strength validation
- **Account Lockout** after multiple failed login attempts

### 🛡️ Security Features
- **Rate Limiting** on all endpoints
- **Input Validation** using Zod schemas
- **Password Strength Requirements**
- **Account Lockout Protection**
- **Device Tracking** for security monitoring
- **Token Revocation** capabilities

### 📧 Email Features
- **Email Verification** for new accounts
- **Password Reset** via email
- **Resend Verification** functionality

### 👤 User Management
- **Profile Management** (view/update)
- **Password Change** functionality
- **Account Status Management**
- **Role-based Access Control**

## API Endpoints

### Public Endpoints (No Authentication Required)

#### POST `/api/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "gender": "male",
  "dateOfBirth": "1990-01-01T00:00:00.000Z"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email to verify your account.",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "avatar": null,
      "role": "user",
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt-token",
      "refreshToken": "refresh-token",
      "expiresIn": 900000
    }
  }
}
```

#### POST `/api/auth/login`
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "rememberMe": false
}
```

#### POST `/api/auth/refresh-token`
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

#### POST `/api/auth/forgot-password`
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### POST `/api/auth/reset-password`
Reset password using reset token.

**Request Body:**
```json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123!"
}
```

#### POST `/api/auth/verify-email`
Verify email address.

**Request Body:**
```json
{
  "token": "verification-token"
}
```

#### POST `/api/auth/resend-verification`
Resend email verification.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### Protected Endpoints (Authentication Required)

#### POST `/api/auth/logout`
Logout current session.

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

#### POST `/api/auth/logout-all`
Logout from all devices.

**Headers:**
```
Authorization: Bearer <access-token>
```

#### POST `/api/auth/change-password`
Change user password.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

#### GET `/api/auth/profile`
Get user profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

#### PUT `/api/auth/profile`
Update user profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "gender": "male",
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "avatar": "https://example.com/avatar.jpg"
}
```

## Security Features

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (@$!%*?&)

### Rate Limiting
- **General API**: 100 requests per 15 minutes
- **Auth Endpoints**: 10 requests per 15 minutes
- **Sensitive Operations**: 5 requests per 15 minutes
- **Password Reset**: 3 requests per hour
- **Email Verification**: 5 requests per hour

### Account Lockout
- Account locked after 5 failed login attempts
- Lockout duration: 15 minutes
- Automatic unlock after successful login

### Token Security
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days (or 30 days with "remember me")
- Tokens are revoked on password change
- Device tracking for security monitoring

## Error Handling

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Common Error Codes
- `VALIDATION_ERROR`: Input validation failed
- `AUTHENTICATION_ERROR`: Authentication failed
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `USER_NOT_FOUND`: User not found
- `USER_ALREADY_EXISTS`: User already exists
- `INVALID_CREDENTIALS`: Invalid email or password
- `ACCOUNT_LOCKED`: Account is locked
- `TOKEN_EXPIRED`: Token has expired
- `INVALID_TOKEN`: Invalid token
- `EMAIL_NOT_VERIFIED`: Email not verified
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `PASSWORD_RESET_TOKEN_EXPIRED`: Password reset token expired
- `EMAIL_VERIFICATION_TOKEN_EXPIRED`: Email verification token expired

## Database Schema

### Users Table
- `id`: UUID primary key
- `email`: Unique email address
- `password`: Hashed password
- `firstName`: User's first name
- `lastName`: User's last name
- `avatar`: Profile picture URL
- `phone`: Phone number
- `gender`: User's gender
- `dateOfBirth`: Date of birth
- `status`: Account status (active, inactive, suspended, pending)
- `role`: User role (user, admin, moderator)
- `lastLoginAt`: Last login timestamp
- `passwordChangedAt`: Last password change timestamp
- `createdAt`: Account creation timestamp
- `updatedAt`: Last update timestamp

### Token Tables
- **refresh_tokens**: JWT refresh tokens
- **password_reset_tokens**: Password reset tokens
- **email_verification_tokens**: Email verification tokens
- **login_attempts**: Login attempt tracking

## Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/database_name

# JWT Configuration
JWT_ACCESS_SECRET=your-super-secret-access-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=your-app-name
JWT_AUDIENCE=your-app-users

# Security
BCRYPT_SALT_ROUNDS=12
PASSWORD_MIN_LENGTH=8

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000,http://localhost:3001
```

## Usage Examples

### Frontend Integration

```javascript
// Register a new user
const registerUser = async (userData) => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Store tokens securely
    localStorage.setItem('accessToken', result.data.tokens.accessToken);
    localStorage.setItem('refreshToken', result.data.tokens.refreshToken);
  }
  
  return result;
};

// Login
const loginUser = async (credentials) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
  
  return await response.json();
};

// Make authenticated requests
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('accessToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return await response.json();
};
```

## Best Practices

1. **Token Storage**: Store tokens securely (httpOnly cookies recommended for web)
2. **Token Refresh**: Implement automatic token refresh before expiration
3. **Error Handling**: Always handle authentication errors gracefully
4. **Rate Limiting**: Respect rate limits and implement retry logic
5. **Password Security**: Never store passwords in plain text
6. **Input Validation**: Always validate input on both client and server
7. **HTTPS**: Always use HTTPS in production
8. **Logging**: Log security events for monitoring

## Testing

The module includes comprehensive error handling and validation. Test the following scenarios:

1. **Valid Registration/Login**
2. **Invalid Input Validation**
3. **Rate Limiting**
4. **Account Lockout**
5. **Token Expiration**
6. **Password Strength Requirements**
7. **Email Verification Flow**
8. **Password Reset Flow**

## Future Enhancements

- [ ] Two-Factor Authentication (2FA)
- [ ] Social Login (Google, Facebook, etc.)
- [ ] OAuth2 Integration
- [ ] Session Management Dashboard
- [ ] Advanced Security Analytics
- [ ] Email Templates
- [ ] SMS Verification
- [ ] Biometric Authentication
