from fastapi import APIRouter, Depends

from ..schemas import CertificateStatus
from ..security import CurrentUser, get_current_user
from ..services.certificate_service import CertificateService

router = APIRouter()
certificate_service = CertificateService()


@router.get("", response_model=CertificateStatus)
def get_certificate(user: CurrentUser = Depends(get_current_user)) -> dict:
    return certificate_service.status(user.id, user.name)
