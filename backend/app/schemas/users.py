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


class AccountData(BaseModel):
    """Dados de uma conta nova, criada pelo admin ou pelo convidado.

    Os limites são os do zod do front (features/users/schemas.ts); 72 é o
    limite do bcrypt no Auth.
    """
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    username: str = Field(min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9._-]+$")
    full_name: str = Field(min_length=2, max_length=120)


class UserCreate(AccountData):
    role: UserRole


# Convite de cadastro (registro 69): nunca para admin.
InviteRole = Literal["coordinator", "professor"]


class InviteCreate(BaseModel):
    role: InviteRole


class InviteCreated(BaseModel):
    """O código só aparece nesta resposta: o banco guarda o hash."""
    code: str
    role: InviteRole
    expires_at: datetime


class InviteCode(BaseModel):
    code: str = Field(min_length=1, max_length=32)


class InviteInfo(BaseModel):
    role: InviteRole


class SignupRequest(AccountData):
    code: str = Field(min_length=1, max_length=32)


class UserUpdate(BaseModel):
    username: str | None = None
    full_name: str | None = None
    role: UserRole | None = None
    avatar_url: str | None = None
    is_active: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PasswordReset(BaseModel):
    """Senha nova definida pelo admin (B-S5). 72 é o limite do bcrypt no Auth."""
    new_password: str = Field(min_length=8, max_length=72)
