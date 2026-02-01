#!/bin/bash

# Script to create GitHub issues from tasks.md
# Feature: Stripe Billing with Usage-Based Limits
# Repository: yukiharada1228/videoq

set -e

REPO="yukiharada1228/videoq"
TASKS_FILE="/Users/yukiharada/dev/videoq/specs/001-stripe-billing/tasks.md"
FEATURE_BRANCH="001-stripe-billing"

echo "========================================="
echo "Creating GitHub Issues for Stripe Billing"
echo "========================================="
echo ""
echo "Repository: $REPO"
echo "Feature Branch: $FEATURE_BRANCH"
echo "Tasks File: $TASKS_FILE"
echo ""

# Check if gh CLI is authenticated
if ! gh auth status >/dev/null 2>&1; then
    echo "❌ Error: GitHub CLI is not authenticated"
    echo "Please run: gh auth login"
    exit 1
fi

echo "✓ GitHub CLI authenticated"
echo ""

# Create labels if they don't exist
echo "Creating labels..."
gh label create "billing" --description "Stripe billing and subscription features" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "backend" --description "Backend (Django) tasks" --color "D93F0B" --repo "$REPO" 2>/dev/null || true
gh label create "frontend" --description "Frontend (React/TypeScript) tasks" --color "1D76DB" --repo "$REPO" 2>/dev/null || true
gh label create "test" --description "Testing tasks" --color "FBCA04" --repo "$REPO" 2>/dev/null || true
gh label create "setup" --description "Setup and configuration" --color "C5DEF5" --repo "$REPO" 2>/dev/null || true
gh label create "foundational" --description "Foundational/blocking tasks" --color "B60205" --repo "$REPO" 2>/dev/null || true
gh label create "P1" --description "Priority 1 (MVP)" --color "D93F0B" --repo "$REPO" 2>/dev/null || true
gh label create "P2" --description "Priority 2 (Enhancement)" --color "FBCA04" --repo "$REPO" 2>/dev/null || true
gh label create "P3" --description "Priority 3 (Nice to have)" --color "C5DEF5" --repo "$REPO" 2>/dev/null || true
gh label create "US1" --description "User Story 1: Free Tier Limits" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "US2" --description "User Story 2: Upgrade to Paid" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "US3" --description "User Story 3: Usage Monitoring" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "US4" --description "User Story 4: Downgrade Flow" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "US5" --description "User Story 5: Admin Custom Plans" --color "0E8A16" --repo "$REPO" 2>/dev/null || true
gh label create "parallel" --description "Can run in parallel" --color "BFD4F2" --repo "$REPO" 2>/dev/null || true

echo "✓ Labels created/verified"
echo ""

# Create milestones
echo "Creating milestones..."
gh api repos/$REPO/milestones -f title="001-stripe-billing: Setup" -f description="Phase 1: Environment setup and dependencies" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: Foundation" -f description="Phase 2: Core models and infrastructure (BLOCKS user stories)" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: US1 (MVP)" -f description="Phase 3: Free Tier Limit Enforcement" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: US2 (MVP)" -f description="Phase 4: Stripe Checkout Integration" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: US3" -f description="Phase 5: Usage Monitoring Dashboard" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: US4" -f description="Phase 6: Subscription Downgrade Flow" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: US5" -f description="Phase 7: Admin Custom Plans" 2>/dev/null || true
gh api repos/$REPO/milestones -f title="001-stripe-billing: Polish" -f description="Phase 8: Production readiness and optimization" 2>/dev/null || true

echo "✓ Milestones created/verified"
echo ""

# Function to determine labels for a task
get_labels() {
    local task="$1"
    local labels="billing"

    # Add parallel label
    if [[ "$task" =~ \[P\] ]]; then
        labels="$labels,parallel"
    fi

    # Add user story labels
    if [[ "$task" =~ \[US1\] ]]; then
        labels="$labels,US1,P1"
    elif [[ "$task" =~ \[US2\] ]]; then
        labels="$labels,US2,P1"
    elif [[ "$task" =~ \[US3\] ]]; then
        labels="$labels,US3,P2"
    elif [[ "$task" =~ \[US4\] ]]; then
        labels="$labels,US4,P2"
    elif [[ "$task" =~ \[US5\] ]]; then
        labels="$labels,US5,P3"
    fi

    # Add component labels based on file path
    if [[ "$task" =~ backend/ ]]; then
        labels="$labels,backend"
    fi
    if [[ "$task" =~ frontend/ ]]; then
        labels="$labels,frontend"
    fi
    if [[ "$task" =~ test ]]; then
        labels="$labels,test"
    fi

    # Add phase labels
    if [[ "$task" =~ ^T00[1-9] ]]; then
        labels="$labels,setup"
    elif [[ "$task" =~ ^T0[12][0-9] ]]; then
        labels="$labels,foundational"
    fi

    echo "$labels"
}

# Function to determine milestone
get_milestone() {
    local task_id="$1"
    local task="$2"

    # Extract numeric ID
    local num=$(echo "$task_id" | sed 's/T0*//')

    if [ "$num" -le 9 ]; then
        echo "001-stripe-billing: Setup"
    elif [ "$num" -le 28 ]; then
        echo "001-stripe-billing: Foundation"
    elif [ "$num" -le 55 ]; then
        echo "001-stripe-billing: US1 (MVP)"
    elif [ "$num" -le 95 ]; then
        echo "001-stripe-billing: US2 (MVP)"
    elif [ "$num" -le 111 ]; then
        echo "001-stripe-billing: US3"
    elif [ "$num" -le 131 ]; then
        echo "001-stripe-billing: US4"
    elif [ "$num" -le 138 ]; then
        echo "001-stripe-billing: US5"
    else
        echo "001-stripe-billing: Polish"
    fi
}

# Create issues from tasks
echo "Creating issues from tasks..."
echo ""

# Read tasks and create issues
while IFS= read -r line; do
    # Skip lines that aren't tasks
    if [[ ! "$line" =~ ^-\ \[\ \]\ T[0-9]+ ]]; then
        continue
    fi

    # Extract task ID and description
    task_id=$(echo "$line" | grep -oE "T[0-9]+" | head -1)
    task_desc=$(echo "$line" | sed -E 's/^- \[ \] T[0-9]+ (\[P\] )?(\[US[0-9]\] )?//')

    # Determine labels and milestone
    labels=$(get_labels "$line")
    milestone=$(get_milestone "$task_id" "$line")

    # Create issue body with context
    body="**Task ID**: $task_id
**Feature**: Stripe Billing with Usage-Based Limits
**Branch**: \`$FEATURE_BRANCH\`

## Description

$task_desc

## Context

This task is part of the Stripe billing implementation. See full documentation:
- [Tasks List](https://github.com/$REPO/blob/$FEATURE_BRANCH/specs/001-stripe-billing/tasks.md)
- [Feature Spec](https://github.com/$REPO/blob/$FEATURE_BRANCH/specs/001-stripe-billing/spec.md)
- [Implementation Plan](https://github.com/$REPO/blob/$FEATURE_BRANCH/specs/001-stripe-billing/plan.md)

## Acceptance Criteria

- [ ] Implementation matches description
- [ ] Code follows VideoQ Constitution standards
- [ ] Tests written and passing (if applicable)
- [ ] Documentation updated (if applicable)
"

    # Create the issue
    echo "Creating issue: $task_id - $(echo "$task_desc" | cut -c1-60)..."

    issue_url=$(gh issue create \
        --repo "$REPO" \
        --title "[$task_id] $task_desc" \
        --body "$body" \
        --label "$labels" \
        --milestone "$milestone" 2>&1)

    if [[ $? -eq 0 ]]; then
        echo "  ✓ Created: $issue_url"
    else
        echo "  ✗ Failed: $issue_url"
    fi

    # Rate limiting: sleep briefly between issue creation
    sleep 0.5

done < "$TASKS_FILE"

echo ""
echo "========================================="
echo "✓ All issues created successfully!"
echo "========================================="
echo ""
echo "View issues: https://github.com/$REPO/issues?q=is%3Aissue+label%3Abilling"
echo "View milestones: https://github.com/$REPO/milestones"
echo ""
