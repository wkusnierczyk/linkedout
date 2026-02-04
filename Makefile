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
.PHONY: all install install-dependencies lint lint-fix format format-check test test-watch test-coverage check clean help version set-version bump-major bump-minor bump-patch

# ─── Default Target ───────────────────────────────────────────────
all: check

# ─── Dependencies ─────────────────────────────────────────────────
install: install-dependencies

install-dependencies:
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

# ─── Versioning ──────────────────────────────────────────────────
# Get current version from package.json
CURRENT_VERSION := $(shell node -p "require('./package.json').version")

# Print current version (or set if V is provided)
version:
ifdef V
	@$(MAKE) set-version
else
	@echo $(CURRENT_VERSION)
endif

# Set version in all files
set-version:
ifndef V
	$(error Usage: make set-version V=x.y.z)
endif
	@if ! echo "$(V)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$$'; then \
		echo "Error: Invalid semver format. Use x.y.z or x.y.z-prerelease" >&2; \
		exit 1; \
	fi
	@sed -i.bak 's/"version": "$(CURRENT_VERSION)"/"version": "$(V)"/' package.json manifest.json
	@rm -f package.json.bak manifest.json.bak
	$(call log,"Version updated: $(CURRENT_VERSION) -> $(V)")

# Bump major version (x.0.0)
bump-major:
	@$(MAKE) set-version V=$(shell echo $(CURRENT_VERSION) | awk -F. '{print $$1+1".0.0"}')

# Bump minor version (x.y.0)
bump-minor:
	@$(MAKE) set-version V=$(shell echo $(CURRENT_VERSION) | awk -F. '{print $$1"."$$2+1".0"}')

# Bump patch version (x.y.z)
bump-patch:
	@$(MAKE) set-version V=$(shell echo $(CURRENT_VERSION) | awk -F. '{print $$1"."$$2"."$$3+1}')

# ─── Help ─────────────────────────────────────────────────────────
help:
	$(call log,"Available targets:")
	$(call log,"  install        - Install dependencies (alias for install-dependencies)")
	$(call log,"  install-dependencies - Install npm dependencies")
	$(call log,"  lint           - Run ESLint on $(SRC_DIR)/")
	$(call log,"  lint-fix       - Run ESLint with auto-fix")
	$(call log,"  format         - Format code with Prettier")
	$(call log,"  format-check   - Check formatting without changes")
	$(call log,"  test           - Run tests")
	$(call log,"  test-watch     - Run tests in watch mode")
	$(call log,"  test-coverage  - Run tests with coverage")
	$(call log,"  check          - Run all checks (format, lint, test)")
	$(call log,"  clean          - Remove $(NODE_MODULES)/ and $(COVERAGE_DIR)/")
	$(call log,"  version        - Print current version (or set with V=x.y.z)")
	$(call log,"  set-version    - Set version: make set-version V=x.y.z")
	$(call log,"  bump-major     - Bump major version (x.0.0)")
	$(call log,"  bump-minor     - Bump minor version (x.y.0)")
	$(call log,"  bump-patch     - Bump patch version (x.y.z)")
	$(call log,"  help           - Show this help")
	$(call log,"")
	$(call log,"Variables (override with VAR=value):")
	$(call log,"  NPM            - Package manager (default: npm)")
	$(call log,"  SRC_DIR        - Source directory (default: src)")
	$(call log,"  TEST_DIR       - Test directory (default: tests)")
	$(call log,"  COVERAGE_DIR   - Coverage output (default: coverage)")
	$(call log,"  NODE_MODULES   - Dependencies dir (default: node_modules)")
