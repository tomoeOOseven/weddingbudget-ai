# Contributing

Thanks for your interest in contributing to WeddingBudget.ai.

## Workflow

1. Fork the repo and create a feature branch from `main`.
2. Keep pull requests focused and small.
3. Add or update tests when changing behavior.
4. Ensure local checks pass before opening a pull request.

## Development Setup

- Frontend: `cd frontend && npm install && npm run dev`
- Backend: `cd backend && npm install && npm run dev`
- ML service: `cd ml_service && pip install -r requirements.txt`

## Commit and PR Guidance

- Use clear commit messages with one intent per commit.
- In pull requests, include:
  - Summary of changes
  - Screenshots for UI updates
  - Steps to test
  - Any migration or configuration notes

## Code Style

- Keep naming consistent with existing modules.
- Avoid large unrelated refactors in feature PRs.
- Document any new environment variables in README.
