# Aplicação Professor — Portal

Sistema acadêmico para gestão de alunos, módulos/disciplinas, notas e faltas, com 3 perfis de acesso: **admin**, **coordenador** e **professor**.

> Recriação moderna do sistema original (Flask + SQLite + Bootstrap 5) usando React + FastAPI + Supabase.

---

## Stack

| Camada | Tecnologias |
|--------|-------------|
| **Frontend** | React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · TanStack Query v5 · React Hook Form + Zod · Recharts · Zustand |
| **Backend** | FastAPI 0.115 · Pydantic v2 · supabase-py 2.8 · python-jose (JWT HS256) |
| **Banco** | Supabase (PostgreSQL) · Supabase Auth · Row Level Security |
| **Testes** | pytest 8.3 · 33 testes unitários |

---

## Estrutura do monorepo

```
.
├── frontend/               # React + Vite
│   └── src/
│       ├── features/       # módulos de domínio (grades, students, modules…)
│       ├── components/     # ui/ + layout/ + shared/
│       ├── hooks/          # useAuth, etc.
│       └── routes/         # React Router (lazy + ProtectedRoute)
├── backend/
│   ├── app/
│   │   ├── routers/        # users, periods, modules, students, grades,
│   │   │                   # import_csv, sheets, dashboard
│   │   ├── schemas/        # Pydantic models
│   │   ├── deps.py         # get_current_user, require_role
│   │   └── main.py
│   ├── scripts/seed.py     # seed idempotente via Supabase Admin API
│   └── tests/              # 33 testes pytest
├── supabase/migrations/
│   ├── 0001_initial_schema.sql   # schema + triggers + RLS temp
│   └── 0002_rls_granular.sql     # políticas RLS por papel
└── docker-compose.yml
```

---

## Pré-requisitos

- Node.js 20+
- Python 3.11+
- Conta no [Supabase](https://supabase.com) (plano gratuito é suficiente)
- Docker (opcional)

---

## Setup

### 1. Clonar e instalar dependências

```bash
git clone <url>
cd Portal

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && pip install -r requirements.txt && cd ..
```

### 2. Variáveis de ambiente

**`frontend/.env`**
```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_API_BASE_URL=http://localhost:8000
```

**`backend/.env`**
```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # nunca expor no frontend
SUPABASE_JWT_SECRET=<jwt_secret>               # Settings → API → JWT Secret
CORS_ORIGINS=http://localhost:5173
```

### 3. Aplicar migrations

No **SQL Editor** do Supabase, execute em ordem:

```
supabase/migrations/0001_initial_schema.sql
supabase/migrations/0002_rls_granular.sql
```

> **Atenção**: `0002` remove as policies temporárias e ativa as policies granulares por papel. Execute apenas quando o sistema estiver em uso real.

### 4. Seed de dados de exemplo

```bash
# Definir senhas no .env do backend
SEED_ADMIN_PASSWORD=admin123
SEED_DEFAULT_PASSWORD=senha123

python backend/scripts/seed.py
```

Cria: 1 admin + 2 coordenadores + 4 professores + 2 períodos + 8 módulos + 20 alunos com notas realistas.

### 5. Rodar localmente

**Com Docker Compose:**
```bash
docker-compose up
```

**Ou separadamente:**
```bash
# Backend (porta 8000)
cd backend && uvicorn app.main:app --reload

# Frontend (porta 5173)
cd frontend && npm run dev
```

---

## Contas de exemplo (após seed)

| Papel        | Email                  | Senha             |
|--------------|------------------------|-------------------|
| Admin        | admin@escola.com       | `SEED_ADMIN_PASSWORD` |
| Coordenador  | coord1@escola.com      | `SEED_DEFAULT_PASSWORD` |
| Coordenador  | coord2@escola.com      | `SEED_DEFAULT_PASSWORD` |
| Professor    | prof1@escola.com       | `SEED_DEFAULT_PASSWORD` |
| Professor    | prof2@escola.com       | `SEED_DEFAULT_PASSWORD` |

---

## Funcionalidades por papel

| Funcionalidade | Admin | Coordenador | Professor |
|----------------|:-----:|:-----------:|:---------:|
| Ver dashboard com métricas | ✓ | ✓ | ✓ |
| Gerenciar usuários | ✓ | — | — |
| CRUD de períodos acadêmicos | ✓ | — | — |
| Ver/editar módulos do período | ✓ | ✓ | — |
| Ver módulos próprios | — | — | ✓ |
| Cadastrar e gerenciar alunos | ✓ | ✓ | ✓* |
| Lançar notas e faltas (inline) | ✓ | ✓ | ✓ |
| Importar alunos via CSV | ✓ | ✓ | — |
| Sincronizar com Google Sheets | ✓ | ✓ | — |

*Professor cria alunos com auto-matrícula nos seus módulos ativos.

---

## API

Documentação interativa disponível em:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

### Endpoints principais

```
GET    /api/healthz
GET    /api/me
GET    /api/dashboard?period_id=

GET    /api/periods
POST   /api/periods
PUT    /api/periods/{id}
DELETE /api/periods/{id}
PUT    /api/periods/{id}/sync-url
POST   /api/periods/{id}/sync-sheets
POST   /api/periods/{id}/students/import?dry_run=true|false

GET    /api/modules
POST   /api/modules
GET    /api/modules/{id}/students
PUT    /api/modules/{id}
DELETE /api/modules/{id}

GET    /api/periods/{id}/students
POST   /api/periods/{id}/students
GET    /api/professor/students
POST   /api/professor/students
PUT    /api/professor/students/{id}
DELETE /api/professor/students/{id}

GET    /api/grades/{enrollment_id}
PUT    /api/grades/{enrollment_id}
```

---

## Testes

```bash
cd backend
pytest tests/ -v
# 33 passed
```

Cobrem:
- Cálculo de nota final (`_recalc_final`)
- Validators Pydantic (clamp, arredondamento)
- Parser CSV (BOM, semicolons, Latin-1, colunas obrigatórias)
- Autenticação (sem token → 403, token inválido → 401)

---

## Segurança

- JWT validado server-side via `python-jose` (HS256) em cada request
- `SUPABASE_SERVICE_ROLE_KEY` usado **apenas** no backend (nunca exposto ao frontend)
- Row Level Security ativa em todas as tabelas (`0002_rls_granular.sql`)
- Professor só acessa alunos e notas dos seus próprios módulos (2 camadas: dep FastAPI + RLS)

---

## Licença

Privado — uso interno da instituição.
