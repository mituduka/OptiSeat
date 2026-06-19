# Commit Message Convention

This project strictly follows the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification. All commit messages must match this format.

## Format
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]

## Allowed Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (formatting, missing semi-colons, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries

## Rules
1. The description must be in English, lowercase, and written in the imperative mood (e.g., "add light theme", not "added light theme").
2. Do not end the description with a period `.`.
3. For breaking changes, append a `!` after the type/scope (e.g., `feat!: drop support for Node 14`) and include `BREAKING CHANGE:` in the footer.
