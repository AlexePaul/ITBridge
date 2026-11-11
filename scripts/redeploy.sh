#!/usr/bin/env bash
#
# Re-run a deploy from here, without pushing anything.
#
# This is the deploy job of `.github/workflows/deploy.yml` with the runner taken out: the same two
# SSM commands, as the same two users, followed by the same `/ready` check. Use it when the push
# that should have deployed is already on the branch and the deploy itself needs running again -
# a fix made on the instance, a transient SSM failure, a deploy somebody cancelled. The
# alternative people reach for is an empty commit to kick the workflow, which puts a commit that
# changes nothing in the history of a branch whose history is the record of what was deployed.
#
# Two things it deliberately does NOT do.
#
# It does not deploy your working tree. `deploy.sh` on the instance does `git fetch` and
# `git reset --hard origin/<branch>`, so what gets deployed is whatever is on origin - which is
# why this script prints that commit and makes you look at it before it sends anything. An
# uncommitted fix on your laptop reaches the instance by being pushed, never by this.
#
# It does not run the checks. The workflow's guarantee is that the deploy job cannot start on a
# red commit, because `verify` is a job it needs; running the deploy by hand is stepping around
# exactly that. So when `gh` is available the commit's checks are read and a failing one stops
# the script, and when it is not, the prompt says the checks are unknown. Neither is the gate the
# workflow has - it is a reminder that you took the gate off.
#
#   ./scripts/redeploy.sh                 # stage
#   ./scripts/redeploy.sh prod            # production, which also needs the typed environment name
#   ./scripts/redeploy.sh --yes           # no prompt, for a loop or a second terminal
#
# Needs: the AWS CLI with credentials that may call ssm:SendCommand and ssm:GetCommandInvocation on
# the instance, and the instance id in ITBRIDGE_INSTANCE_ID_STAGE (or ITBRIDGE_INSTANCE_ID_PROD).
# Put those in your shell profile; an instance id is not a secret, but it is not in this repository
# either, and a script that hardcodes one deploys to it after the machine is replaced.

set -euo pipefail

ENV=stage
ASSUME_YES=false
FORCE=false

for arg in "$@"; do
    case "$arg" in
        stage | prod) ENV=$arg ;;
        -y | --yes) ASSUME_YES=true ;;
        --force) FORCE=true ;;
        -h | --help)
            sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//;$d'
            exit 0
            ;;
        *)
            echo "unknown argument: $arg (try --help)" >&2
            exit 2
            ;;
    esac
done

REGION=${AWS_REGION:-eu-north-1}
BRANCH=release/$ENV

if [ "$ENV" = "prod" ]; then
    INSTANCE=${ITBRIDGE_INSTANCE_ID_PROD:-}
    HOST=api.itbridgeschool.com
    ID_VAR=ITBRIDGE_INSTANCE_ID_PROD
else
    INSTANCE=${ITBRIDGE_INSTANCE_ID_STAGE:-${ITBRIDGE_INSTANCE_ID:-}}
    HOST=api-stage.itbridgeschool.com
    ID_VAR=ITBRIDGE_INSTANCE_ID_STAGE
fi

command -v aws > /dev/null || {
    echo "the AWS CLI is not on PATH" >&2
    exit 1
}

if [ -z "$INSTANCE" ]; then
    echo "no instance id for $ENV: set $ID_VAR" >&2
    echo "it is the i-... of the backend instance, and the same value the workflow holds as a secret" >&2
    exit 1
fi

# Fail on the credentials here rather than inside the send, where the message is about a command
# nobody sent. Also prints which identity is about to deploy, which matters on a laptop with
# several profiles in its environment.
WHO=$(aws sts get-caller-identity --query Arn --output text --region "$REGION") || {
    echo "no usable AWS credentials for $REGION" >&2
    exit 1
}

cd "$(git rev-parse --show-toplevel)"
git fetch --quiet origin "$BRANCH"
SHA=$(git rev-parse "origin/$BRANCH")

echo "deploy $ENV from $BRANCH"
echo
git --no-pager log -1 --format='  %h  %s%n  %an, %ad' --date=format:'%d %b %Y %H:%M' "$SHA"
echo
echo "  instance  $INSTANCE in $REGION"
echo "  as        $WHO"

# `deploy.sh` resets to origin, so a local HEAD that is not this commit is the most likely way to
# deploy something other than what you are looking at.
HEAD_SHA=$(git rev-parse HEAD)
if [ "$HEAD_SHA" != "$SHA" ]; then
    echo "  note      your HEAD is $(git rev-parse --short HEAD), not this commit - the instance takes origin's"
fi

CHECKS="unknown (gh not available)"
if command -v gh > /dev/null; then
    # --jq over a filter so a commit with no checks at all reads as empty rather than as an error.
    CONCLUSIONS=$(gh api "repos/{owner}/{repo}/commits/$SHA/check-runs" \
        --jq '.check_runs[] | select(.status == "completed") | .conclusion' 2> /dev/null || echo "")
    if [ -z "$CONCLUSIONS" ]; then
        CHECKS="none recorded on this commit"
    elif echo "$CONCLUSIONS" | grep -qvE '^(success|neutral|skipped)$'; then
        CHECKS="FAILING"
    else
        CHECKS="green ($(echo "$CONCLUSIONS" | wc -l | tr -d ' ') checks)"
    fi
fi
echo "  checks    $CHECKS"
echo

if [ "$CHECKS" = "FAILING" ] && [ "$FORCE" != true ]; then
    echo "a check failed on this commit. Fix it, or pass --force if you know why it does not apply." >&2
    exit 1
fi

if [ "$ASSUME_YES" != true ]; then
    # Opening the device, not testing its mode: a terminal can be readable and still refuse to
    # open, which is what a container without a controlling terminal does.
    if { true < /dev/tty; } 2> /dev/null; then
        if [ "$ENV" = "prod" ]; then
            printf 'This is production. Type the word prod to deploy it: '
            read -r reply < /dev/tty
            [ "$reply" = "prod" ] || {
                echo "nothing sent."
                exit 1
            }
        else
            printf 'Deploy this? [y/N] '
            read -r reply < /dev/tty
            case "$reply" in
                y | Y | yes) ;;
                *)
                    echo "nothing sent."
                    exit 1
                    ;;
            esac
        fi
    else
        echo "no terminal to confirm on: pass --yes" >&2
        exit 1
    fi
fi

# The two commands, in this order and as these users, exactly as the workflow sends them.
# `fetch-env.sh` regenerates /etc/itbridge/$ENV.env from Parameter Store and must run as root,
# because /etc/itbridge is 750. `deploy.sh` then runs as `admin`, the login user that owns the
# checkout: SSM runs commands as root, and a root-owned node_modules or a second PM2 daemon under
# root breaks every later deploy while this one reports success.
COMMAND_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE" \
    --document-name AWS-RunShellScript \
    --comment "redeploy $ENV ${SHA:0:7} by hand" \
    --timeout-seconds 1800 \
    --parameters "commands=/srv/itbridge/fetch-env.sh $ENV && sudo -iu admin /srv/itbridge/deploy.sh $ENV" \
    --query Command.CommandId --output text --region "$REGION")

echo "SSM command: $COMMAND_ID"

# `aws ssm wait command-executed` gives up after 100 seconds, far short of an install plus a
# build, so it reports failure on a deploy that is going fine. Poll, and say so while waiting:
# this one is watched by a person, not by a runner.
STATUS=Pending
for _ in $(seq 1 120); do
    STATUS=$(aws ssm get-command-invocation \
        --command-id "$COMMAND_ID" --instance-id "$INSTANCE" \
        --query Status --output text --region "$REGION" 2> /dev/null || echo Pending)
    case "$STATUS" in
        Success | Failed | Cancelled | TimedOut) break ;;
    esac
    printf '.'
    sleep 10
done
echo

echo "--- stdout ---"
aws ssm get-command-invocation --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE" --query StandardOutputContent --output text --region "$REGION"
echo "--- stderr ---"
aws ssm get-command-invocation --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE" --query StandardErrorContent --output text --region "$REGION"

echo "status: $STATUS"
[ "$STATUS" = "Success" ] || exit 1

# `/ready` rather than `/health`: it touches Postgres and S3, so it fails on a process that
# started against a database the migration never reached.
echo
printf 'checking https://%s/ready ' "$HOST"
for _ in $(seq 1 10); do
    if curl -fsS --max-time 10 "https://$HOST/ready" > /dev/null 2>&1; then
        echo
        curl -fsS "https://$HOST/ready"
        echo
        echo "$ENV is serving ${SHA:0:7}."
        exit 0
    fi
    printf '.'
    sleep 6
done

echo
echo "the deploy reported success but https://$HOST/ready does not answer." >&2
echo "docs/runbook.md section 1 is the next step." >&2
exit 1
