from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["admin", "coordinator", "professor"]


class Profile(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    role: UserRole
    avatar_url: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class ProfilePublic(BaseModel):
    """Versão reduzida do perfil para dropdowns e referências."""
    id: str
    username: str
    full_name: str
    role: UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str
    full_name: str
    role: UserRole


class UserUpdate(BaseModel):
    username: str | None = None
    full_name: str | None = None
    role: UserRole | None = None
    avatar_url: str | None = None
    is_active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
