# ─── Configuration ────────────────────────────────────────────────
# Override these variables from the command line if needed:
#   make lint NPM=pnpm
#   make test SRC_DIR=lib

NPM ?= npm
SRC_DIR ?= src
TEST_DIR ?= tests
COVERAGE_DIR ?= coverage
NODE_MODULES ?= node_modules

# ─── Macros ───────────────────────────────────────────────────────
# Print to stderr (diagnostic messages should not pollute stdout)
define log
	@>&2 echo $(1)
endef

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
	$(call log,"Available targets:")
	$(call log,"  install        - Install dependencies")
	$(call log,"  lint           - Run ESLint on $(SRC_DIR)/")
	$(call log,"  lint-fix       - Run ESLint with auto-fix")
	$(call log,"  format         - Format code with Prettier")
	$(call log,"  format-check   - Check formatting without changes")
	$(call log,"  test           - Run tests")
	$(call log,"  test-watch     - Run tests in watch mode")
	$(call log,"  test-coverage  - Run tests with coverage")
	$(call log,"  check          - Run all checks (format, lint, test)")
	$(call log,"  clean          - Remove $(NODE_MODULES)/ and $(COVERAGE_DIR)/")
	$(call log,"  help           - Show this help")
	$(call log,"")
	$(call log,"Variables (override with VAR=value):")
	$(call log,"  NPM            - Package manager (default: npm)")
	$(call log,"  SRC_DIR        - Source directory (default: src)")
	$(call log,"  TEST_DIR       - Test directory (default: tests)")
	$(call log,"  COVERAGE_DIR   - Coverage output (default: coverage)")
	$(call log,"  NODE_MODULES   - Dependencies dir (default: node_modules)")
