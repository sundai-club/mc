#!/bin/zsh

# Finder launches scripts with a smaller PATH than an interactive terminal.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
    [[ -r "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
    [[ -r "$HOME/.zshrc" ]] && source "$HOME/.zshrc"
fi

APP_DIR="${0:A:h}"
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
fi

exit $status
