#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

mode=${1:-all}
if [ "$#" -gt 0 ]; then shift; fi
case "$mode" in
  all|unit|canvas|webgl) ;;
  *) printf 'Usage: sh tests/run.sh [all|unit|canvas|webgl]\n' >&2; exit 2 ;;
esac

if ! command -v taskset >/dev/null || ! command -v flock >/dev/null; then
  printf 'Serial testing requires Linux taskset and flock from util-linux.\n' >&2
  exit 2
fi
cpu=$(awk '/^Cpus_allowed_list:/ { split($2, cpus, /[-,]/); print cpus[1] }' "/proc/$$/status")
if [ -z "$cpu" ]; then
  printf 'Could not determine a CPU allowed by the current affinity.\n' >&2
  exit 2
fi

exec 9>"${TMPDIR:-/tmp}/after-hours-tests-$(id -u).lock"
flock 9
printf 'Running tests sequentially on CPU %s\n' "$cpu"
status=0

run_node() {
  taskset -c "$cpu" node --test --test-isolation=none --test-concurrency=1 "$@" || status=1
}

run_unit() {
  if [ "$#" -eq 0 ]; then set -- tests/*.test.js; fi
  for file in "$@"; do
    case "$file" in tests/browser.test.js|tests/background-music-browser.test.js) continue ;; esac
    run_node "$file"
  done
}

run_browser() {
  three=$1
  shift
  for file in "$@"; do
    PACMAN_BROWSER="${PACMAN_BROWSER:-chromium}" PACMAN_TEST_THREE="$three" run_node "$file"
  done
}

case "$mode" in
  all)
    run_unit
    run_browser 0 tests/browser.test.js tests/background-music-browser.test.js
    run_browser 1 tests/browser.test.js
    ;;
  unit) run_unit "$@" ;;
  canvas) run_browser 0 tests/browser.test.js tests/background-music-browser.test.js ;;
  webgl) run_browser 1 tests/browser.test.js ;;
esac
exit "$status"
