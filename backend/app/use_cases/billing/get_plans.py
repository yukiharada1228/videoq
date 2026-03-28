from typing import List

from app.domain.billing.entities import PLAN_LIMITS, PLAN_PRICES, PlanType
from app.use_cases.billing.dtos import PlanDTO


class GetPlansUseCase:
    def __init__(self, billing_enabled: bool = True) -> None:
        self._billing_enabled = billing_enabled

    def execute(self) -> List[PlanDTO]:
        if not self._billing_enabled:
            return []
        plans = []
        for plan_type in [PlanType.FREE, PlanType.LITE, PlanType.STANDARD, PlanType.ENTERPRISE]:
            limits = PLAN_LIMITS[plan_type]
            price = PLAN_PRICES[plan_type]
            is_contact_required = plan_type == PlanType.ENTERPRISE
            plans.append(
                PlanDTO(
                    name=plan_type.value.capitalize(),
                    plan_id=plan_type.value,
                    prices=price,
                    storage_gb=limits["storage_gb"],
                    processing_minutes=limits["processing_minutes"],
                    ai_answers=limits["ai_answers"],
                    is_contact_required=is_contact_required,
                )
            )
        return plans
