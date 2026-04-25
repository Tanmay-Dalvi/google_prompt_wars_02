# Contributing to VoteWise

Thank you for your interest in contributing to VoteWise! 🗳️

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check existing issues before opening a new one
2. Use the issue template and include: steps to reproduce, expected vs actual behavior, browser/OS
3. For security vulnerabilities, see [SECURITY.md](SECURITY.md)

### Suggesting Features

Open an issue with the label `enhancement`. Describe the use case and why it benefits Indian voters.

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Follow the code style (see `.eslintrc.json`)
4. Write JSDoc comments for all new functions
5. Add tests in `tests/votewise.test.js` for new logic
6. Ensure `npm run lint` passes with zero errors
7. Submit PR with a clear description of changes

## Code Style

- ES2022 JavaScript (no TypeScript)
- JSDoc on every exported function
- `const`/`let` only — no `var`
- `requestAnimationFrame` for all DOM mutations
- `escapeHtml()` on all user-controlled content before DOM insertion
- Debounce user input handlers (300ms minimum)
- `gcpLog()` for all significant events

## Testing

Add tests to `tests/votewise.test.js` using the existing `describe`/`it`/`expect` shim.
Aim for 80%+ coverage on new functions. Run in browser via `Ctrl+Shift+T`.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
