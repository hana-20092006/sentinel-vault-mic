from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import os
from dotenv import load_dotenv
import logging
from db_auth import (
    create_user, get_user_by_email, get_user_by_id, user_exists, init_db
)

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "your_super_secret_jwt_key_change_this_in_production_123456789")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

# Password hashing (using argon2 as bcrypt has compatibility issues on some systems)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Create router
router = APIRouter(prefix="/api/auth", tags=["authentication"])

# Pydantic models
class SignUpRequest(BaseModel):
    public_key: str = Field(..., min_length=1, description="User's public key")
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=6, description="User's password (minimum 6 characters)")
    password_confirm: str = Field(..., description="Password confirmation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "public_key": "0x742d35Cc6634C0532925a3b844Bc99e4e2D95fC1",
                "email": "user@example.com",
                "password": "SecurePassword123",
                "password_confirm": "SecurePassword123"
            }
        }

class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., description="User's password")
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "SecurePassword123"
            }
        }

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserResponse(BaseModel):
    id: int
    public_key: str
    email: str
    created_at: datetime

class SignUpResponse(BaseModel):
    message: str
    user: UserResponse

# Utility functions
def hash_password(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[dict]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# Routes
@router.post("/signup", response_model=SignUpResponse, status_code=status.HTTP_201_CREATED)
async def signup(request: SignUpRequest):
    """
    User signup endpoint
    - **public_key**: User's public key/wallet address
    - **email**: User's email address
    - **password**: Password (minimum 6 characters)
    - **password_confirm**: Password confirmation (must match password)
    """
    
    # Validate passwords match
    if request.password != request.password_confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )
    
    # Check if user already exists
    if user_exists(request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash password
    hashed_password = hash_password(request.password)
    
    # Create user
    user = create_user(
        public_key=request.public_key,
        email=request.email,
        password_hash=hashed_password
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create user. Public key might already exist."
        )
    
    logger.info(f"✅ User signed up: {user['email']}")
    
    return SignUpResponse(
        message="User created successfully",
        user=UserResponse(**user)
    )

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """
    User login endpoint
    - **email**: User's email address
    - **password**: User's password
    
    Returns: JWT token and user information
    """
    
    # Get user from database
    user = get_user_by_email(request.email)
    
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Create access token
    access_token = create_access_token(
        data={"sub": str(user["id"]), "email": user["email"]}
    )
    
    logger.info(f"✅ User logged in: {user['email']}")
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "id": user["id"],
            "public_key": user["public_key"],
            "email": user["email"]
        }
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user(token: str):
    """
    Get current user information
    - **token**: JWT token from login
    """
    
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    user = get_user_by_id(int(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(**user)

@router.post("/health")
async def health_check():
    """Check if auth service is running"""
    return {"status": "ok", "message": "Authentication service is running"}

# Initialize database on startup
def init_auth_db():
    """Initialize authentication database"""
    return init_db()
