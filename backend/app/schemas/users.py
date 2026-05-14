from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr

UserRole = Literal["admin", "coordinator", "professor"]


class Profile(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    role: UserRole
    avatar_url: str | None = None
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
    password: str
    username: str
    full_name: str
    role: UserRole


class UserUpdate(BaseModel):
    username: str | None = None
    full_name: str | None = None
    role: UserRole | None = None
    avatar_url: str | None = None
