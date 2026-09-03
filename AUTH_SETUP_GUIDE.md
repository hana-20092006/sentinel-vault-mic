# SentinelVault - Authentication System Quick Start

## ✅ Setup Complete!

Your authentication system is now fully configured and running!

### 🎯 Quick Links

- **Dashboard**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **API Redoc**: http://localhost:8000/redoc

### 🚀 Current Status

- ✅ **FastAPI Backend**: Running on port 8000
  - Database: Connected to Neon PostgreSQL
  - Authentication: Fully functional
  
- ✅ **Next.js Frontend**: Running on port 3000
  - Auth Provider: Configured and active
  - Protected Routes: Dashboard requires login

### 📋 Test the System

1. **Visit the Dashboard**
   - Go to http://localhost:3000
   - You'll be redirected to the login page
   - Click "Sign up here" to create an account

2. **Create an Account**
   - Enter your public key (wallet address)
   - Enter your email
   - Enter password (minimum 6 characters)
   - Confirm password
   - Click "Create Account"

3. **Login**
   - Use the email and password you just created
   - You'll be redirected to the dashboard
   - Your email appears in the sidebar
   - Use the "Logout" button to log out

### 🗄️ Database Information

- **Connection**: Neon PostgreSQL (ap-southeast-1)
- **Table**: `users` table with columns:
  - `id`: Auto-incrementing primary key
  - `public_key`: User's wallet address (unique)
  - `email`: User's email address (unique)
  - `password_hash`: Bcrypt-hashed password
  - `created_at`: Account creation timestamp
  - `updated_at`: Last update timestamp

### 🔒 Security

- Passwords are hashed with bcrypt (never stored in plain text)
- JWT tokens expire after 24 hours
- All communications use HTTPS in production
- Database uses SSL/TLS encryption

### 📁 Files Created

**Backend:**
- `crypto-ml/.env` - Configuration
- `crypto-ml/db_auth.py` - Database operations
- `crypto-ml/auth_routes.py` - Authentication API endpoints

**Frontend:**
- `SentinelVault/lib/auth-context.tsx` - Auth state management
- `SentinelVault/app/signup/page.tsx` - Registration page
- `SentinelVault/app/login/page.tsx` - Login page
- Updated `SentinelVault/app/providers.tsx` - Auth provider wrapper
- Updated `SentinelVault/app/page.tsx` - Protected dashboard
- Updated `SentinelVault/app/components/Sidebar.tsx` - User info & logout

### 🔧 Environment Variables

The `.env` file in `crypto-ml/` contains:
- `DATABASE_URL` - Your Neon PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT signing
- `JWT_ALGORITHM` - Algorithm for JWT (HS256)
- `JWT_EXPIRATION_HOURS` - Token expiration time (24 hours)

**⚠️ Important**: Change `JWT_SECRET` to a strong random value in production!

### 🚨 Troubleshooting

**Port Already in Use?**
```powershell
# Kill process on port 8000 (FastAPI)
netstat -ano | findstr ":8000"
taskkill /PID {PID} /F

# Kill process on port 3000 (Next.js)
netstat -ano | findstr ":3000"
taskkill /PID {PID} /F
```

**Database Connection Error?**
- Verify your internet connection
- Check the DATABASE_URL in `.env`
- Ensure the Neon database is active

**Clearing Cache & Restarting**
```powershell
# Clear browser localStorage
# Open DevTools (F12) → Application → Local Storage → Clear

# Restart servers
# Kill all Python and Node processes
# Run: .\start-dev.bat
```

### 📚 API Usage Examples

**Signup:**
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "public_key": "0x742d35Cc6634C0532925a3b844Bc99e4e2D95fC1",
    "email": "user@example.com",
    "password": "MyPassword123",
    "password_confirm": "MyPassword123"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "MyPassword123"
  }'
```

**Get Current User:**
```bash
curl http://localhost:8000/api/auth/me?token=YOUR_JWT_TOKEN
```

### ✨ Features Implemented

- ✅ User registration with email and password
- ✅ User login with JWT tokens
- ✅ Password confirmation during signup
- ✅ Automatic login after signup
- ✅ Protected dashboard routes
- ✅ User profile display in sidebar
- ✅ Logout functionality
- ✅ Password hashing and security
- ✅ Email validation
- ✅ Token persistence across refresh
- ✅ CORS enabled for frontend-backend communication

### 🎨 UI Features

- Dark theme matching SentinelVault branding
- Responsive design for mobile and desktop
- Real-time validation feedback
- Error messages with helpful hints
- Loading states during API calls
- Smooth redirects after authentication

### 📞 Next Steps

1. Test account creation and login
2. Verify database records in Neon PostgreSQL
3. Deploy to production with proper JWT_SECRET
4. Add password reset functionality (optional)
5. Add two-factor authentication (optional)
6. Add email verification (optional)

---

**All changes made without affecting existing dashboard functionality!** ✨
