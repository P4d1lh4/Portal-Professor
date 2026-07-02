"""
Atestados médicos por aluno + anexos em PDF.

Os anexos são armazenados no bucket privado `medical-certificates` do
Supabase Storage. O acesso aos arquivos sempre passa pelo backend, que
gera signed URLs com validade curta — nunca expomos o service role.
"""
import logging
import re
import uuid
from datetime import date
from typing import Iterable

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.medical_certificates import (
    ALLOWED_MIME_TYPE,
    MAX_ATTACHMENT_SIZE,
    MedicalCertificate,
    MedicalCertificateAttachment,
    MedicalCertificateCreate,
    MedicalCertificateUpdate,
)
from ..schemas.users import Profile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["atestados"])

# Quem pode gerenciar atestados — mesmas regras dos alunos
_ALLOWED_ROLES = require_role("professor", "coordinator", "admin")

BUCKET = "medical-certificates"
SIGNED_URL_TTL_SECONDS = 60 * 60  # 1 hora

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


# ---------------------------------------------------------------
# Helpers de permissão / acesso
# ---------------------------------------------------------------

def _assert_can_access_student(db, profile: Profile, student_id: str) -> None:
    """Espelha as regras de students.py: admin/coord do período/professor do módulo."""
    if profile.role == "admin":
        return

    student = (
        db.table("students")
        .select("id, academic_period_id")
        .eq("id", student_id)
        .maybe_single()
        .execute()
    )
    if not student.data:
        raise HTTPException(404, "Aluno não encontrado.")

    if profile.role == "coordinator":
        period = (
            db.table("academic_periods")
            .select("id")
            .eq("id", student.data["academic_period_id"])
            .eq("coordinator_id", profile.id)
            .maybe_single()
            .execute()
        )
        if period.data:
            return

    # Professor: aluno precisa estar matriculado em algum módulo dele
    modules = (
        db.table("modules")
        .select("id")
        .eq("professor_id", profile.id)
        .execute()
    )
    module_ids = [m["id"] for m in modules.data]
    if module_ids:
        enrollment = (
            db.table("enrollments")
            .select("id", count="exact")
            .in_("module_id", module_ids)
            .eq("student_id", student_id)
            .execute()
        )
        if (enrollment.count or 0) > 0:
            return

    raise HTTPException(403, "Acesso negado ao aluno.")


def _load_certificate(db, certificate_id: str) -> dict:
    resp = (
        db.table("medical_certificates")
        .select("*")
        .eq("id", certificate_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(404, "Atestado não encontrado.")
    return resp.data


def _sanitize_filename(name: str) -> str:
    """Remove caracteres perigosos; mantém apenas alfa-num, ponto, hífen e underscore."""
    base = (name or "atestado.pdf").strip().split("/")[-1].split("\\")[-1]
    cleaned = _SAFE_FILENAME_RE.sub("_", base)
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    # Evita nomes vazios após sanitização
    if cleaned in (".pdf", "_pdf", "_.pdf"):
        cleaned = "atestado.pdf"
    return cleaned[:200]


def _build_storage_path(certificate_id: str, file_name: str) -> str:
    """Caminho único e previsível dentro do bucket."""
    return f"{certificate_id}/{uuid.uuid4()}_{file_name}"


def _signed_url(db, storage_path: str) -> str:
    """Gera signed URL para download — falha silenciosa retorna string vazia."""
    try:
        resp = db.storage.from_(BUCKET).create_signed_url(
            storage_path, SIGNED_URL_TTL_SECONDS
        )
    except Exception as exc:  # pragma: no cover
        logger.exception("Falha ao gerar signed URL para %s: %s", storage_path, exc)
        return ""

    if isinstance(resp, dict):
        return resp.get("signedURL") or resp.get("signed_url") or ""
    return ""


def _hydrate_attachments(db, rows: Iterable[dict]) -> list[MedicalCertificateAttachment]:
    return [
        MedicalCertificateAttachment(
            id=row["id"],
            certificate_id=row["certificate_id"],
            file_name=row["file_name"],
            file_size=row["file_size"],
            mime_type=row["mime_type"],
            file_url=_signed_url(db, row["storage_path"]),
            uploaded_at=row["uploaded_at"],
            uploaded_by=row.get("uploaded_by"),
        )
        for row in rows
    ]


def _hydrate_certificate(db, cert_row: dict) -> MedicalCertificate:
    attachments_resp = (
        db.table("medical_certificate_attachments")
        .select("*")
        .eq("certificate_id", cert_row["id"])
        .order("uploaded_at", desc=True)
        .execute()
    )
    return MedicalCertificate(
        id=cert_row["id"],
        student_id=cert_row["student_id"],
        reason=cert_row["reason"],
        start_date=cert_row["start_date"],
        end_date=cert_row["end_date"],
        notes=cert_row.get("notes"),
        created_by=cert_row.get("created_by"),
        created_at=cert_row["created_at"],
        updated_at=cert_row["updated_at"],
        attachments=_hydrate_attachments(db, attachments_resp.data or []),
    )


# ---------------------------------------------------------------
# Atestados — CRUD
# ---------------------------------------------------------------

@router.get(
    "/students/{student_id}/medical-certificates",
    response_model=list[MedicalCertificate],
)
def list_certificates(
    student_id: str,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> list[MedicalCertificate]:
    db = get_admin_db()
    _assert_can_access_student(db, current_user, student_id)

    resp = (
        db.table("medical_certificates")
        .select("*")
        .eq("student_id", student_id)
        .order("start_date", desc=True)
        .execute()
    )
    return [_hydrate_certificate(db, row) for row in (resp.data or [])]


@router.post(
    "/students/{student_id}/medical-certificates",
    response_model=MedicalCertificate,
    status_code=status.HTTP_201_CREATED,
)
def create_certificate(
    student_id: str,
    body: MedicalCertificateCreate,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> MedicalCertificate:
    db = get_admin_db()
    _assert_can_access_student(db, current_user, student_id)

    payload = {
        "student_id": student_id,
        "reason": body.reason,
        "start_date": str(body.start_date),
        "end_date": str(body.end_date),
        "notes": body.notes,
        "created_by": current_user.id,
    }
    resp = db.table("medical_certificates").insert(payload).execute()
    return _hydrate_certificate(db, resp.data[0])


@router.get(
    "/medical-certificates/{certificate_id}",
    response_model=MedicalCertificate,
)
def get_certificate(
    certificate_id: str,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> MedicalCertificate:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])
    return _hydrate_certificate(db, cert)


@router.put(
    "/medical-certificates/{certificate_id}",
    response_model=MedicalCertificate,
)
def update_certificate(
    certificate_id: str,
    body: MedicalCertificateUpdate,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> MedicalCertificate:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(422, "Nenhum campo para atualizar.")

    # Validação cruzada caso só uma das datas tenha vindo. Compara como
    # objetos date (não como strings) — robusto e sem depender do formato.
    def _as_date(v) -> date:
        return v if isinstance(v, date) else date.fromisoformat(str(v))

    start = _as_date(update_data.get("start_date", cert["start_date"]))
    end = _as_date(update_data.get("end_date", cert["end_date"]))
    if end < start:
        raise HTTPException(422, "A data final não pode ser anterior à inicial.")

    if "start_date" in update_data:
        update_data["start_date"] = str(update_data["start_date"])
    if "end_date" in update_data:
        update_data["end_date"] = str(update_data["end_date"])

    db.table("medical_certificates").update(update_data).eq("id", certificate_id).execute()
    cert = _load_certificate(db, certificate_id)
    return _hydrate_certificate(db, cert)


@router.delete(
    "/medical-certificates/{certificate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_certificate(
    certificate_id: str,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> None:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])

    # Remove anexos do storage antes de deletar a linha (ON DELETE CASCADE
    # remove os registros, mas não os blobs).
    attachments = (
        db.table("medical_certificate_attachments")
        .select("storage_path")
        .eq("certificate_id", certificate_id)
        .execute()
    )
    paths = [a["storage_path"] for a in (attachments.data or [])]
    if paths:
        try:
            db.storage.from_(BUCKET).remove(paths)
        except Exception as exc:  # pragma: no cover
            logger.warning("Falha ao remover blobs do atestado %s: %s", certificate_id, exc)

    db.table("medical_certificates").delete().eq("id", certificate_id).execute()


# ---------------------------------------------------------------
# Anexos
# ---------------------------------------------------------------

@router.get(
    "/medical-certificates/{certificate_id}/attachments",
    response_model=list[MedicalCertificateAttachment],
)
def list_attachments(
    certificate_id: str,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> list[MedicalCertificateAttachment]:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])

    resp = (
        db.table("medical_certificate_attachments")
        .select("*")
        .eq("certificate_id", certificate_id)
        .order("uploaded_at", desc=True)
        .execute()
    )
    return _hydrate_attachments(db, resp.data or [])


@router.post(
    "/medical-certificates/{certificate_id}/attachments",
    response_model=MedicalCertificateAttachment,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    certificate_id: str,
    file: UploadFile = File(...),
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> MedicalCertificateAttachment:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])

    if file.content_type != ALLOWED_MIME_TYPE:
        raise HTTPException(415, "Apenas arquivos PDF são permitidos.")

    content = await file.read()
    size = len(content)
    if size == 0:
        raise HTTPException(422, "O arquivo está vazio.")
    if size > MAX_ATTACHMENT_SIZE:
        raise HTTPException(413, "O arquivo excede o limite de 10 MB.")

    # Validação extra: cabeçalho %PDF-
    if not content.startswith(b"%PDF-"):
        raise HTTPException(415, "Conteúdo do arquivo não é um PDF válido.")

    safe_name = _sanitize_filename(file.filename or "atestado.pdf")
    storage_path = _build_storage_path(certificate_id, safe_name)

    try:
        db.storage.from_(BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": ALLOWED_MIME_TYPE},
        )
    except Exception as exc:
        logger.exception("Falha ao enviar PDF para o storage: %s", exc)
        raise HTTPException(500, "Falha ao enviar o arquivo.") from exc

    try:
        resp = (
            db.table("medical_certificate_attachments")
            .insert(
                {
                    "certificate_id": certificate_id,
                    "file_name": safe_name,
                    "file_size": size,
                    "mime_type": ALLOWED_MIME_TYPE,
                    "storage_path": storage_path,
                    "uploaded_by": current_user.id,
                }
            )
            .execute()
        )
    except Exception as exc:
        # Rollback do blob se o insert falhar
        try:
            db.storage.from_(BUCKET).remove([storage_path])
        except Exception:  # pragma: no cover
            pass
        logger.exception("Falha ao persistir anexo: %s", exc)
        raise HTTPException(500, "Falha ao registrar o anexo.") from exc

    return _hydrate_attachments(db, [resp.data[0]])[0]


@router.delete(
    "/medical-certificates/{certificate_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_attachment(
    certificate_id: str,
    attachment_id: str,
    current_user: Profile = Depends(_ALLOWED_ROLES),
) -> None:
    db = get_admin_db()
    cert = _load_certificate(db, certificate_id)
    _assert_can_access_student(db, current_user, cert["student_id"])

    attachment = (
        db.table("medical_certificate_attachments")
        .select("*")
        .eq("id", attachment_id)
        .eq("certificate_id", certificate_id)
        .maybe_single()
        .execute()
    )
    if not attachment.data:
        raise HTTPException(404, "Anexo não encontrado.")

    try:
        db.storage.from_(BUCKET).remove([attachment.data["storage_path"]])
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "Falha ao remover blob %s: %s — registro será removido mesmo assim.",
            attachment.data["storage_path"],
            exc,
        )

    db.table("medical_certificate_attachments").delete().eq("id", attachment_id).execute()
