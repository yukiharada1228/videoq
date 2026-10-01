"""Budget invariants: allocation, quota affordability and annual billing."""
from dataclasses import replace
import math

import pytest

from scripts.estimate_plan_costs import (
    Assumptions, calculate, chat_storage_per_answer, fixed_costs,
    non_answer_variable_costs, read_catalog,
)


@pytest.fixture(scope="module")
def catalog():
    return read_catalog()


def annual(result):
    return {p["plan"]: p for p in result["plans"] if p["interval"] == "yearly"}


def test_catalog_affordable_at_50_contracts_but_next_hundred_is_not(catalog):
    result = calculate(catalog, Assumptions())
    for row in annual(result).values():
        assert row["monthly_answers"] == row["recommended_answers_rounded_to_100"]
        assert 0 <= row["planning_balance_yen"] < 100 * (
            row["planning_answer_cost_yen"] + result["database_chat_cost_per_monthly_answer_yen"]
        )


def test_shared_costs_allocated_once_independent_of_plan_mix(catalog):
    a = Assumptions()
    result = calculate(catalog, a)
    rows = annual(result)
    total = result["fixed_monthly_total_yen"] + result["free_account_subsidy_monthly_yen"]
    for basic_count in (0, 15, 50):
        allocated = sum(n * (rows[p]["shared_fixed_cost_per_contract_yen"] + rows[p]["free_account_subsidy_per_contract_yen"])
                        for p, n in (("basic", basic_count), ("pro", 50 - basic_count)))
        assert allocated == pytest.approx(total)
    assert sum(fixed_costs(a).values()) == pytest.approx(sum(fixed_costs(replace(a, paid_contracts=100)).values()))


def test_annual_discount_and_fees_reduce_common_quota(catalog):
    result = calculate(catalog, Assumptions())
    rows = annual(result)
    for monthly in [p for p in result["plans"] if p["interval"] == "monthly"]:
        yearly = rows[monthly["plan"]]
        assert yearly["gross_monthly_yen"] * 12 == pytest.approx(catalog[monthly["plan"]]["displayAmountYen"]["yearly"])
        assert yearly["stripe_fees_yen"] == pytest.approx(yearly["gross_monthly_yen"] * .043)
        assert yearly["planning_max_answers"] < monthly["planning_max_answers"]


def test_video_costs_scale_with_entitlements(catalog):
    a = Assumptions()
    basic = non_answer_variable_costs(catalog["basic"], a)
    pro = non_answer_variable_costs(catalog["pro"], a)
    for key, value in basic.items():
        assert pro[key] == pytest.approx(value * 5)
    assert basic["r2_storage"] == pytest.approx(20 * 1024**3 / 1e9 * .015 * 160)
    assert basic["transcription_and_indexing_lambda"] == pytest.approx(
        (1800 * (5 * .0000133334 + 4.5 * .000000037) + 60 * .0000002) * 160
    )


def test_free_subsidy_includes_answers_storage_and_full_video_quota(catalog):
    a = Assumptions()
    result = calculate(catalog, a)
    expected = sum(non_answer_variable_costs(catalog["free"], a).values()) + 30 * (.30 + chat_storage_per_answer(a))
    assert result["free_account_subsidy_monthly_yen"] == pytest.approx(13 * expected)
    unsubsidized = annual(calculate(catalog, replace(a, free_accounts=0)))
    for code, row in annual(result).items():
        assert unsubsidized[code]["answer_budget_yen"] - row["answer_budget_yen"] == pytest.approx(13 * expected / 50)


def test_unaffordable_plan_never_produces_negative_allowance(catalog):
    result = calculate(catalog, Assumptions(human_operations_monthly_yen=1_000_000))
    for row in result["plans"]:
        assert row["planning_max_answers"] == row["recommended_answers_rounded_to_100"] == 0
        assert row["planning_balance_yen"] < 0


def test_more_contracts_help_but_retention_and_higher_fx_hurt(catalog):
    a = Assumptions()
    base = annual(calculate(catalog, a))
    more = annual(calculate(catalog, replace(a, paid_contracts=100)))
    older = annual(calculate(catalog, replace(a, database_horizon_months=24)))
    fx = annual(calculate(catalog, replace(a, usd_jpy=170)))
    for code in base:
        assert more[code]["planning_max_answers"] > base[code]["planning_max_answers"]
        assert older[code]["planning_max_answers"] < base[code]["planning_max_answers"]
        assert fx[code]["planning_max_answers"] < base[code]["planning_max_answers"]


@pytest.mark.parametrize("changes", [
    {"paid_contracts": 0}, {"usd_jpy": 0}, {"free_accounts": -1},
    {"usd_jpy": math.nan}, {"lambda_seconds_per_video_minute": math.inf},
    {"video_minutes_per_upload": 0}, {"neon_active_hours": 1000},
])
def test_invalid_assumptions_rejected(changes):
    with pytest.raises(ValueError):
        replace(Assumptions(), **changes).validate()
