#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux ]]; then
  echo 'This setup is only for Ubuntu GitHub Actions jobs.' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  echo 'Expected an Ubuntu 24.04 runner.' >&2
  exit 1
fi

packages=(libnotify4 libsecret-1-0)
case "${1:-runtime}" in
  runtime) ;;
  packaging) packages+=(fakeroot rpm xvfb) ;;
  *) echo 'Expected runtime or packaging.' >&2; exit 1 ;;
esac

apt_sources="$RUNNER_TEMP/inknote-ubuntu.sources"
# apt downloads as the _apt user, which cannot enter the runner home folder.
apt_mirrors="$(mktemp /tmp/inknote-ubuntu-mirrors.XXXXXX)"
apt_config="$RUNNER_TEMP/inknote-apt.conf"

# Every one of these hosts has failed on the runners at some point, so apt
# tries them in order. Ubuntu's signatures are checked whichever one answers.
# https://manpages.ubuntu.com/manpages/noble/man1/apt-transport-mirror.1.html
# https://documentation.ubuntu.com/security/software-integrity/archive-verification/
# The configuration stays in this job's temporary directory.
cat > "$apt_mirrors" <<'MIRRORS'
https://mirrors.edge.kernel.org/ubuntu/
http://azure.archive.ubuntu.com/ubuntu/
http://archive.ubuntu.com/ubuntu/
MIRRORS
chmod 644 "$apt_mirrors"
cat > "$apt_sources" <<SOURCES
Types: deb
URIs: mirror+file:$apt_mirrors
Suites: noble noble-updates noble-backports noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
SOURCES

cat > "$apt_config" <<CONFIG
Dir::Etc::sourcelist "$apt_sources";
Dir::Etc::sourceparts "-";
Acquire::Retries "5";
# Runners have no IPv6 route, and the mirror publishes an IPv6 address first.
Acquire::ForceIPv4 "true";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
APT::Update::Error-Mode "any";
CONFIG

# -c loads after the runner defaults. Fail on incomplete indexes before making
# installers, and fetch runtime dependencies before the installation smoke test.
# https://manpages.ubuntu.com/manpages/noble/man8/apt-get.8.html
sudo apt-get --config-file "$apt_config" update
sudo apt-get --config-file "$apt_config" install --yes "${packages[@]}"
printf 'INKNOTE_APT_CONFIG=%s\n' "$apt_config" >> "$GITHUB_ENV"
