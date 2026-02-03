# ─── Configuration ────────────────────────────────────────────────
# Override these variables from the command line if needed:
#   make lint NPM=pnpm
#   make test SRC_DIR=lib

NPM ?= npm
SRC_DIR ?= src
TEST_DIR ?= tests
COVERAGE_DIR ?= coverage
NODE_MODULES ?= node_modules

# ─── Phony Targets ────────────────────────────────────────────────
.PHONY: all install lint lint-fix format format-check test test-watch test-coverage check clean help

# ─── Default Target ───────────────────────────────────────────────
all: check

# ─── Dependencies ─────────────────────────────────────────────────
install:
	$(NPM) install

# ─── Linting ──────────────────────────────────────────────────────
lint:
	$(NPM) run lint

lint-fix:
	$(NPM) run lint:fix

# ─── Formatting ───────────────────────────────────────────────────
format:
	$(NPM) run format

format-check:
	$(NPM) run format:check

# ─── Testing ──────────────────────────────────────────────────────
test:
	$(NPM) run test

test-watch:
	$(NPM) run test:watch

test-coverage:
	$(NPM) run test:coverage

# ─── Combined Checks ──────────────────────────────────────────────
check: format-check lint test

# ─── Cleanup ──────────────────────────────────────────────────────
clean:
	rm -rf $(NODE_MODULES) $(COVERAGE_DIR)

# ─── Help ─────────────────────────────────────────────────────────
help:
	@echo "Available targets:"
	@echo "  install        - Install dependencies"
	@echo "  lint           - Run ESLint on $(SRC_DIR)/"
	@echo "  lint-fix       - Run ESLint with auto-fix"
	@echo "  format         - Format code with Prettier"
	@echo "  format-check   - Check formatting without changes"
	@echo "  test           - Run tests"
	@echo "  test-watch     - Run tests in watch mode"
	@echo "  test-coverage  - Run tests with coverage"
	@echo "  check          - Run all checks (format, lint, test)"
	@echo "  clean          - Remove $(NODE_MODULES)/ and $(COVERAGE_DIR)/"
	@echo "  help           - Show this help"
	@echo ""
	@echo "Variables (override with VAR=value):"
	@echo "  NPM            - Package manager (default: npm)"
	@echo "  SRC_DIR        - Source directory (default: src)"
	@echo "  TEST_DIR       - Test directory (default: tests)"
	@echo "  COVERAGE_DIR   - Coverage output (default: coverage)"
	@echo "  NODE_MODULES   - Dependencies dir (default: node_modules)"
