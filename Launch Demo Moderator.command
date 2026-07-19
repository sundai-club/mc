#!/bin/zsh

# Finder launches scripts with a smaller PATH than an interactive terminal.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
    [[ -r "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
    [[ -r "$HOME/.zshrc" ]] && source "$HOME/.zshrc"
fi

APP_DIR="${0:A:h}"

close_launcher_terminal() {
    # Terminal may be configured to keep cleanly exited shells open. Close only
    # the tab that ran this launcher, even if another Terminal window is active.
    local launcher_tty close_job_label close_script
    launcher_tty="$(tty 2>/dev/null)"
    [[ "$TERM_PROGRAM" == "Apple_Terminal" && "$launcher_tty" == /dev/* ]] || return 0

    close_script="$APP_DIR/scripts/close-launcher-terminal.applescript"
    close_job_label="club.sundai.demo-moderator.close-terminal.$PPID.$$"

    # Run outside this shell's process group. Terminal can then observe a clean
    # shell exit instead of treating the delayed closer as a process in the tab.
    /bin/launchctl submit -l "$close_job_label" -- \
        /usr/bin/osascript "$close_script" "$launcher_tty" \
        </dev/null >/dev/null 2>&1
}

cd -- "$APP_DIR" || {
    echo "Could not open the Demo Moderator folder."
    read -k 1 "?Press any key to close..."
    exit 1
}

if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js/npm was not found. Install Node.js, then try again."
    read -k 1 "?Press any key to close..."
    exit 1
fi

if [[ ! -d node_modules ]]; then
    echo "Demo Moderator is not set up yet."
    echo "Run 'npm run setup' in this folder, then double-click this file again."
    read -k 1 "?Press any key to close..."
    exit 1
fi

echo "Launching Demo Moderator..."
npm start
status=$?

if (( status != 0 )); then
    echo
    echo "Demo Moderator exited with an error (code $status)."
    read -k 1 "?Press any key to close..."
else
    close_launcher_terminal
fi

exit $status
