.PHONY: all install lint lint-fix format format-check test test-watch test-coverage check clean help

# Default target
all: check

# Install dependencies
install:
	npm install

# Linting
lint:
	npm run lint

lint-fix:
	npm run lint:fix

# Formatting
format:
	npm run format

format-check:
	npm run format:check

# Testing
test:
	npm run test

test-watch:
	npm run test:watch

test-coverage:
	npm run test:coverage

# Run all checks (CI equivalent)
check: format-check lint test

# Clean generated files
clean:
	rm -rf node_modules coverage

# Help
help:
	@echo "Available targets:"
	@echo "  install        - Install dependencies"
	@echo "  lint           - Run ESLint"
	@echo "  lint-fix       - Run ESLint with auto-fix"
	@echo "  format         - Format code with Prettier"
	@echo "  format-check   - Check formatting without changes"
	@echo "  test           - Run tests"
	@echo "  test-watch     - Run tests in watch mode"
	@echo "  test-coverage  - Run tests with coverage"
	@echo "  check          - Run all checks (format, lint, test)"
	@echo "  clean          - Remove node_modules and coverage"
	@echo "  help           - Show this help"
