#!/usr/bin/env bash
#
# Read, edit and write back one environment's secrets in SSM Parameter Store.
#
# Runs on a laptop, with an AWS profile that may write the prefix - never on the
# instance, which has a read-only instance role. The console can do this too, but one
# parameter per screen and a click to decrypt each: for thirty variables that is the
# reason this exists.
#
#   scripts/secrets.sh stage
#
# What it does NOT do: reach the running application. `fetch-env.sh` reads Parameter
# Store at deploy time, so a secret changed here takes effect at the next deploy. The
# last line of output says so, because everybody forgets it once.
#
# Plaintext never touches the terminal: values are only ever in the editor and in a
# 0700 directory removed on every exit path. What is printed is key names.
set -euo pipefail

ENV=${1:-}
case "$ENV" in
    prod | stage) ;;
    *)
        echo "usage: scripts/secrets.sh prod|stage" >&2
        exit 64
        ;;
esac

REGION=${AWS_REGION:-eu-north-1}
# Override when the parameters live under a different path. Confirm the real shape with
# `aws ssm describe-parameters --query 'Parameters[].Name'`, which returns no values.
PREFIX=${ITBRIDGE_SSM_PREFIX:-/itbridge/$ENV/}

# "not installed" was the wrong sentence and it cost an hour: on Windows this script runs under Git
# Bash, which has its own PATH, so a CLI that answers `aws --version` in PowerShell can be absent
# here. Say which shell is asking, and leave the reader a command whose output distinguishes the two.
for tool in aws jq; do
    command -v "$tool" > /dev/null || {
        echo "$tool is not on the PATH of this shell ($(uname -s))" >&2
        echo "it may still be installed: compare \`command -v $tool\` here with \`where.exe $tool\`" >&2
        echo "in the shell you installed it from, and add the directory it names to PATH" >&2
        exit 69
    }
done

WORK=$(mktemp -d)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
RAW="$WORK/raw.json"
BEFORE="$WORK/before"
AFTER="$WORK/after"
TYPES="$WORK/types"

aws ssm get-parameters-by-path \
    --path "$PREFIX" --recursive --with-decryption --region "$REGION" > "$RAW"

COUNT=$(jq '.Parameters | length' "$RAW")
[ "$COUNT" -gt 0 ] || {
    echo "no parameters under $PREFIX in $REGION" >&2
    exit 1
}

jq -r '.Parameters[] | "\(.Name | split("/") | last)=\(.Value)"' "$RAW" | sort > "$BEFORE"
jq -r '.Parameters[] | "\(.Name | split("/") | last) \(.Type)"' "$RAW" | sort > "$TYPES"

# A value containing a newline cannot survive the round trip through KEY=value, and a
# truncated secret is worse than a refusal: it would be written back silently.
[ "$(wc -l < "$BEFORE")" -eq "$COUNT" ] || {
    echo "a parameter has a newline in its value - edit that one in the console" >&2
    exit 1
}

cp "$BEFORE" "$AFTER"
"${EDITOR:-vi}" "$AFTER"

if diff -q "$BEFORE" "$AFTER" > /dev/null; then
    echo "nothing changed"
    exit 0
fi

WROTE=0
while IFS= read -r line; do
    case "$line" in '' | '#'*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    [ "$key" = "$line" ] && {
        echo "skipped a line without '=': ${key:0:20}..." >&2
        continue
    }
    printf '%s' "$key" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$' || {
        echo "skipped an invalid key name: $key" >&2
        continue
    }

    old=$(grep -m1 -- "^$key=" "$BEFORE" | cut -d= -f2- || true)
    [ "$value" = "$old" ] && continue

    # Keep the type it already had; a new key defaults to SecureString, because the
    # safe default for something typed into this file is "encrypted".
    type=$(awk -v k="$key" '$1 == k { print $2 }' "$TYPES")
    aws ssm put-parameter --name "$PREFIX$key" --value "$value" \
        --type "${type:-SecureString}" --overwrite --region "$REGION" > /dev/null
    echo "wrote: $key"
    WROTE=$((WROTE + 1))
done < "$AFTER"

# A key removed from the file is a deletion, and deletions are confirmed one by one:
# an accidentally emptied line should not take a secret with it. Without a terminal to
# ask - a pipe, a CI runner - they are listed instead of guessed at, and the writes
# above still stand.
GONE=$(comm -23 <(cut -d= -f1 "$BEFORE" | sort) <(cut -d= -f1 "$AFTER" | sort))
if [ -n "$GONE" ]; then
    # Testing with `-r` is not enough: the device node can be readable by the file
    # mode and still refuse to open, which is what a container without a controlling
    # terminal does. Try opening it.
    if { true < /dev/tty; } 2> /dev/null; then
        while read -r key; do
            [ -z "$key" ] && continue
            read -rp "delete $PREFIX$key? [y/N] " answer < /dev/tty
            [ "$answer" = "y" ] || continue
            aws ssm delete-parameter --name "$PREFIX$key" --region "$REGION"
            echo "deleted: $key"
            WROTE=$((WROTE + 1))
        done <<< "$GONE"
    else
        echo "no terminal to confirm deletions; these keys left the file and were kept:" >&2
        echo "$GONE" | sed 's/^/  /' >&2
    fi
fi

[ "$WROTE" -eq 0 ] && exit 0

echo
echo "$WROTE parameter(s) changed. The application still runs on the old values:"
echo "fetch-env.sh reads Parameter Store at deploy time only."
echo "GitHub -> Actions -> Deploy -> Re-run jobs."
